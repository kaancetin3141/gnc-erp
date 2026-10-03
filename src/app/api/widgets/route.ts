import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, getVisibilityFilter } from '@/lib/api-utils'

// ─────────────────────────────────────────────────────────────────
// Dashboard widget verileri — GERÇEK ücretsiz + anahtarsız API'ler
//  • Hava durumu : Open-Meteo (forecast + geocoding)      — 30 dk cache
//  • Döviz       : open.er-api.com + frankfurter.dev(ECB) — 60 dk cache
//  • Haberler    : TRT Haber RSS → AA RSS → mock özet     —  1 sa cache
// Hepsi sunucu tarafı modül-scope Map ile cache'lenir; API erişilemezse
// son düşüm mock veriye yapılır ve { source: 'offline' } ile işaretlenir.
// ─────────────────────────────────────────────────────────────────

const WEATHER_TTL_MS = 30 * 60 * 1000
const CURRENCY_TTL_MS = 60 * 60 * 1000
const NEWS_TTL_MS = 60 * 60 * 1000
const EXTERNAL_TIMEOUT_MS = 8000

// ── Result tipleri (client tarafı aynası: widgets/types.ts) ──────
interface WeatherDailyItem {
  date: string
  icon: string
  min: number
  max: number
}
interface WeatherResult {
  city: string
  temp: number
  condition: string
  icon: string
  humidity: number
  wind: number
  date: string
  high: number
  low: number
  source: 'open-meteo' | 'offline'
  daily: WeatherDailyItem[]
}
interface CurrencyRateItem {
  code: 'USD' | 'EUR' | 'GBP'
  rate: number
  prev: number
  change: number
  changePct: number
  up: boolean
}
interface CurrencyResult {
  items: CurrencyRateItem[]
  source: 'er-api' | 'frankfurter' | 'offline'
  updatedAt: string
}
interface NewsItemResult {
  id: string
  title: string
  source: string
  time: string
  category: string
  link?: string
}
interface NewsResult {
  items: NewsItemResult[]
  source: 'rss' | 'mock'
  label: string
}

// ── Cache altyapısı (modül scope) ────────────────────────────────
type CacheEntry<T> = { data: T; ts: number }
const weatherCache = new Map<string, CacheEntry<WeatherResult>>()
const currencyCache = new Map<string, CacheEntry<CurrencyResult>>()
const newsCache = new Map<string, CacheEntry<NewsResult>>()

async function cached<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = map.get(key)
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data
  const data = await fetcher()
  map.set(key, { data, ts: Date.now() })
  return data
}

async function fetchJson<T>(url: string, timeoutMs = EXTERNAL_TIMEOUT_MS): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return (await res.json()) as T
}

// GET /api/widgets — dashboard widget verileri (hava durumu, son mesajlar, haber, döviz, streak)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const city = url.searchParams.get('city')?.trim() || 'İstanbul'

  const visFilter = await getVisibilityFilter(user!)
  const tenantId = user!.tenantId

  // ── 1. Hava durumu (Open-Meteo — gerçek) ──
  const weather = await getWeather(city)

  // ── 2. Son mesaj atan müşteriler (WhatsApp / email aktivitesi) ──
  const recentActivities = await db.activity.findMany({
    where: {
      tenantId,
      type: { in: ['whatsapp', 'email'] },
      ...(visFilter.ownerId ? { userId: visFilter.ownerId } : {}),
    },
    include: {
      customer: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { date: 'desc' },
    take: 5,
  })
  const recentMessages = recentActivities.map((a) => ({
    id: a.id,
    customerId: a.customer?.id ?? null,
    customerName: a.customer?.name ?? 'Bilinmiyor',
    type: a.type,
    subject: a.subject,
    detail: a.detail,
    time: a.date.toISOString(),
    userName: a.user?.name ?? '—',
  }))

  // ── 3. Haberler (TRT RSS — gerçek, erişilemezse mock özet) ──
  const news = await getNews()

  // ── 4. Döviz kurları (er-api + frankfurter — gerçek) ──
  const currency = await getCurrency()

  // ── 5. Aktivite streak (üst üste aktivite gün sayısı) ──
  const last30 = new Date()
  last30.setDate(last30.getDate() - 30)
  const userActivities = await db.activity.findMany({
    where: {
      tenantId,
      userId: user!.id,
      date: { gte: last30 },
    },
    select: { date: true },
  })

  // Son 30 günün aktivite gün seti
  const activeDays = new Set<string>()
  for (const a of userActivities) {
    activeDays.add(a.date.toISOString().slice(0, 10))
  }

  // Bugünden geriye doğru streak say
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 30; i++) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    if (activeDays.has(key)) {
      streak++
    } else if (i === 0) {
      // Bugün yoksa dün başla
      continue
    } else {
      break
    }
  }

  const todayKey = today.toISOString().slice(0, 10)
  const todayCount = userActivities.filter(
    (a) => a.date.toISOString().slice(0, 10) === todayKey,
  ).length

  return ok({
    weather,
    recentMessages,
    news,
    currency,
    streak: {
      days: streak,
      todayCount,
      activeDaysCount: activeDays.size,
      total30d: userActivities.length,
    },
  })
}

// ════════════════════════════════════════════════════════════════
// HAVA DURUMU — Open-Meteo (anahtarsız)
// ════════════════════════════════════════════════════════════════

interface GeoPlace {
  name: string
  latitude: number
  longitude: number
  admin1?: string
  country?: string
}

// Popüler şehir koordinatları — geocoding API'sine gitmeden anında çözülür
const POPULAR_CITY_COORDS: Record<string, { name: string; latitude: number; longitude: number }> = {
  'istanbul': { name: 'İstanbul', latitude: 41.0082, longitude: 28.9784 },
  'ankara': { name: 'Ankara', latitude: 39.9334, longitude: 32.8597 },
  'izmir': { name: 'İzmir', latitude: 38.4237, longitude: 27.1428 },
  'bursa': { name: 'Bursa', latitude: 40.1885, longitude: 29.061 },
  'antalya': { name: 'Antalya', latitude: 36.8969, longitude: 30.7133 },
  'adana': { name: 'Adana', latitude: 37.0, longitude: 35.3213 },
  'konya': { name: 'Konya', latitude: 37.8746, longitude: 32.4932 },
  'trabzon': { name: 'Trabzon', latitude: 41.0015, longitude: 39.7178 },
}

// Geocoder zinciri: hazır koordinat → Open-Meteo geocoding → Nominatim (OSM)
async function geocodeCity(city: string): Promise<GeoPlace> {
  const local = POPULAR_CITY_COORDS[city.toLocaleLowerCase('tr-TR')]
  if (local) return local

  // 1) Open-Meteo geocoding (Türkçe)
  try {
    const geo = await fetchJson<{ results?: GeoPlace[] }>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=tr&format=json`,
      4000,
    )
    const p = geo.results?.[0]
    if (p) return p
  } catch {
    // Nominatim'e düş
  }

  // 2) Nominatim (OpenStreetMap) — User-Agent zorunlu
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&accept-language=tr`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
      headers: { 'User-Agent': 'GNC-CRM/1.0 (dashboard weather widget)' },
    },
  )
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`)
  const list = (await res.json()) as { name?: string; display_name?: string; lat: string; lon: string }[]
  const hit = list[0]
  if (!hit) throw new Error(`Şehir bulunamadı: ${city}`)
  return {
    name: hit.name || (hit.display_name || city).split(',')[0],
    latitude: Number(hit.lat),
    longitude: Number(hit.lon),
  }
}

interface OpenMeteoForecast {
  timezone?: string
  current: {
    temperature_2m: number
    relative_humidity_2m: number
    weather_code: number
    wind_speed_10m: number
  }
  daily: {
    time: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    weather_code: number[]
  }
}

// WMO weather code → Türkçe durum + emoji
function wmoInfo(code: number): { label: string; icon: string } {
  if (code === 0) return { label: 'Güneşli', icon: '☀️' }
  if (code === 1) return { label: 'Az Bulutlu', icon: '🌤️' }
  if (code === 2) return { label: 'Parçalı Bulutlu', icon: '⛅' }
  if (code === 3) return { label: 'Bulutlu', icon: '☁️' }
  if (code === 45 || code === 48) return { label: 'Puslu', icon: '🌫️' }
  if (code >= 51 && code <= 57) return { label: 'Çisenti', icon: '🌦️' }
  if (code >= 61 && code <= 67) return { label: 'Yağmurlu', icon: '🌧️' }
  if (code >= 71 && code <= 77) return { label: 'Karlı', icon: '❄️' }
  if (code >= 80 && code <= 82) return { label: 'Sağanak Yağışlı', icon: '🌧️' }
  if (code === 85 || code === 86) return { label: 'Kar Sağanağı', icon: '🌨️' }
  if (code >= 95) return { label: 'Fırtına', icon: '⛈️' }
  return { label: 'Değişken', icon: '🌍' }
}

async function getWeather(city: string): Promise<WeatherResult> {
  try {
    return await cached(
      weatherCache,
      city.toLocaleLowerCase('tr-TR'),
      WEATHER_TTL_MS,
      () => fetchWeather(city),
    )
  } catch {
    // API erişilemez → mock'a düş, offline işaretle
    return { ...getMockWeather(city), source: 'offline', daily: [] }
  }
}

async function fetchWeather(city: string): Promise<WeatherResult> {
  // 1) Geocoding: şehir adı → koordinat (hazır liste → Open-Meteo → Nominatim)
  const place = await geocodeCity(city)

  // 2) Forecast: güncel + 4 günlük (bugün + 3 gün) tahmin
  const fc = await fetchJson<OpenMeteoForecast>(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=4&timezone=auto`,
  )

  const cur = fc.current
  const nowInfo = wmoInfo(cur.weather_code)
  const tz = fc.timezone || 'Europe/Istanbul'

  // Sonraki 3 günün mini tahmini (bugünü atla)
  const daily: WeatherDailyItem[] = fc.daily.time
    .slice(1, 4)
    .map((iso, idx) => {
      const j = idx + 1
      return {
        date: iso,
        icon: wmoInfo(fc.daily.weather_code[j]).icon,
        min: Math.round(fc.daily.temperature_2m_min[j]),
        max: Math.round(fc.daily.temperature_2m_max[j]),
      }
    })

  return {
    city: place.name || city,
    temp: Math.round(cur.temperature_2m),
    condition: nowInfo.label,
    icon: nowInfo.icon,
    humidity: Math.round(cur.relative_humidity_2m),
    wind: Math.round(cur.wind_speed_10m),
    date: new Date().toLocaleDateString('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: tz,
    }),
    high: Math.round(fc.daily.temperature_2m_max[0]),
    low: Math.round(fc.daily.temperature_2m_min[0]),
    source: 'open-meteo',
    daily,
  }
}

// ── Fallback: mock weather (deterministic by day) ────────────────
function getMockWeather(city: string) {
  const conditions = [
    { condition: 'Güneşli', icon: '☀️', range: [22, 30] as const },
    { condition: 'Parçalı Bulutlu', icon: '⛅', range: [18, 25] as const },
    { condition: 'Bulutlu', icon: '☁️', range: [14, 20] as const },
    { condition: 'Yağmurlu', icon: '🌧️', range: [12, 18] as const },
    { condition: 'Az Bulutlu', icon: '🌤️', range: [20, 26] as const },
  ]
  const daySeed = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
  const cityHash = city.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  const idx = (daySeed + cityHash) % conditions.length
  const cond = conditions[idx]
  const temp = cond.range[0] + ((daySeed + cityHash) % (cond.range[1] - cond.range[0] + 1))

  const humidity = 45 + ((daySeed * 7) % 45)
  const wind = 5 + ((daySeed * 3) % 20)

  const now = new Date()
  const dateStr = now.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return {
    city,
    temp,
    condition: cond.condition,
    icon: cond.icon,
    humidity,
    wind,
    date: dateStr,
    high: temp + 3,
    low: temp - 5,
  }
}

// ════════════════════════════════════════════════════════════════
// DÖVİZ — open.er-api.com (günlük kur) + frankfurter.dev (ECB, önceki iş günü)
// ════════════════════════════════════════════════════════════════

async function getCurrency(): Promise<CurrencyResult> {
  try {
    return await cached(currencyCache, 'usd-try', CURRENCY_TTL_MS, fetchCurrency)
  } catch {
    return { items: getMockCurrency(), source: 'offline', updatedAt: '' }
  }
}

async function fetchCurrency(): Promise<CurrencyResult> {
  const codes = ['USD', 'EUR', 'GBP'] as const

  // 1) open.er-api.com — günlük USD bazlı kurlar
  let rates: Record<string, number> | null = null
  let source: CurrencyResult['source'] = 'er-api'
  let updatedAt = ''
  try {
    const j = await fetchJson<{
      result?: string
      rates?: Record<string, number>
      time_last_update_utc?: string
    }>('https://open.er-api.com/v6/latest/USD')
    const r = j.rates
    if (j.result === 'success' && r && typeof r.TRY === 'number' && typeof r.EUR === 'number' && typeof r.GBP === 'number') {
      rates = { USD: 1, EUR: r.EUR, GBP: r.GBP, TRY: r.TRY }
      source = 'er-api'
      updatedAt = j.time_last_update_utc ?? ''
    }
  } catch {
    // er-api erişilemedi → frankfurter tek başına denenir
  }

  // 2) frankfurter (ECB günlük) time series — önceki iş günü kuru
  let prev: Record<string, number> | null = null
  try {
    const start = new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10)
    const j = await fetchJson<{ rates?: Record<string, Record<string, number>> }>(
      `https://api.frankfurter.dev/v1/${start}..?base=USD&symbols=TRY,EUR,GBP`,
    )
    const series = j.rates
    const dates = Object.keys(series ?? {}).sort()
    const last = dates[dates.length - 1]
    const prevDay = dates[dates.length - 2]
    if (series && last) {
      const l = series[last]
      if (typeof l.TRY === 'number' && typeof l.EUR === 'number' && typeof l.GBP === 'number') {
        if (!rates) {
          // er-api kapalı → frankfurter tek başına kur kaynağı
          rates = { USD: 1, EUR: l.EUR, GBP: l.GBP, TRY: l.TRY }
          source = 'frankfurter'
          updatedAt = last
        }
        if (prevDay) {
          const p = series[prevDay]
          if (typeof p.TRY === 'number' && typeof p.EUR === 'number' && typeof p.GBP === 'number') {
            prev = { USD: p.TRY, EUR: p.TRY / p.EUR, GBP: p.TRY / p.GBP }
          }
        }
      }
    }
  } catch {
    // prev alınamadı → değişim %0 gösterilir
  }

  if (!rates) throw new Error('Döviz API erişilemiyor')

  const round2 = (n: number) => Math.round(n * 100) / 100
  const items: CurrencyRateItem[] = codes.map((code) => {
    const rate = round2(code === 'USD' ? rates!.TRY : rates!.TRY / rates![code])
    const prevRate = prev && prev[code] ? round2(prev[code]) : rate
    const change = round2(rate - prevRate)
    const changePct = prevRate ? round2((change / prevRate) * 100) : 0
    return { code, rate, prev: prevRate, change, changePct, up: change >= 0 }
  })

  return { items, source, updatedAt }
}

// ── Fallback: mock currency rates (slightly random by hour) ──────
function getMockCurrency(): CurrencyRateItem[] {
  const hour = new Date().getHours()
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
  const seed = day * 24 + hour

  const base = { USD: 34.21, EUR: 37.45, GBP: 44.18 }
  const prev = { USD: 34.15, EUR: 37.62, GBP: 44.02 }

  const variance = (k: 'USD' | 'EUR' | 'GBP') => {
    const hash = (seed + k.charCodeAt(0) * 31) % 100
    return (hash - 50) / 100 // -0.5 .. +0.5
  }

  return (['USD', 'EUR', 'GBP'] as const).map((code) => {
    const rate = base[code] + variance(code)
    const prevRate = prev[code]
    const change = rate - prevRate
    const changePct = (change / prevRate) * 100
    return {
      code,
      rate: Math.round(rate * 100) / 100,
      prev: prevRate,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      up: change >= 0,
    }
  })
}

// ════════════════════════════════════════════════════════════════
// HABERLER — TRT Haber RSS → AA RSS → mock özet (regex XML parse)
// ════════════════════════════════════════════════════════════════

const NEWS_FEEDS: { url: string; label: string }[] = [
  { url: 'https://www.trthaber.com/sondakika.rss', label: 'TRT Haber' },
  { url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel', label: 'Anadolu Ajansı' },
]

async function getNews(): Promise<NewsResult> {
  try {
    return await cached(newsCache, 'tr', NEWS_TTL_MS, fetchNews)
  } catch {
    return { items: getMockNews(), source: 'mock', label: 'Özet' }
  }
}

async function fetchNews(): Promise<NewsResult> {
  for (const feed of NEWS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GNC-CRM/1.0; dashboard widget)' },
      })
      if (!res.ok) continue
      const xml = await res.text()
      const parsed = parseRss(xml)
        .slice(0, 5)
        .map((it) => ({ ...it, source: feed.label }))
      if (parsed.length >= 3) {
        return { items: parsed, source: 'rss', label: feed.label }
      }
    } catch {
      // sonraki feed'i dene
    }
  }
  return { items: getMockNews(), source: 'mock', label: 'Özet' }
}

// Minimal entity decode (kütüphanesiz)
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function tagText(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  if (!m) return ''
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseRss(xml: string): NewsItemResult[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  const out: NewsItemResult[] = []
  for (const b of blocks) {
    const title = tagText(b, 'title')
    if (!title) continue
    const link = tagText(b, 'link')
    const category = tagText(b, 'category') || 'Gündem'
    const pub = tagText(b, 'pubDate')
    const t = pub ? new Date(pub) : new Date()
    out.push({
      id: link || `rss-${out.length}`,
      title,
      source: '',
      time: Number.isNaN(t.getTime()) ? new Date().toISOString() : t.toISOString(),
      category,
      ...(link ? { link } : {}),
    })
  }
  return out.sort((a, b) => (a.time < b.time ? 1 : -1))
}

// ── Fallback: mock Turkish business news ─────────────────────────
function getMockNews(): NewsItemResult[] {
  const now = new Date()
  const hoursAgo = (h: number) => {
    const d = new Date(now.getTime() - h * 60 * 60 * 1000)
    return d.toISOString()
  }
  return [
    {
      id: 'n1',
      title: 'TCMB faiz kararı açıklandı: Politika faizi sabit tutuldu',
      source: 'Bloomberg HT',
      time: hoursAgo(2),
      category: 'Ekonomi',
    },
    {
      id: 'n2',
      title: 'Türkiye ihracatı bu çeyrekte rekor kırdı, 25 milyar doları aştı',
      source: 'Dünya Gazetesi',
      time: hoursAgo(5),
      category: 'Ticaret',
    },
    {
      id: 'n3',
      title: 'KOBİ’ler için yeni dijital dönüşüm destek paketi yürürlüğe girdi',
      source: 'Sanayi Gazetesi',
      time: hoursAgo(8),
      category: 'KOBİ',
    },
    {
      id: 'n4',
      title: 'EUR/TRY yeni zirveye çıktı, piyasalar hareketli',
      source: 'Investing.com',
      time: hoursAgo(12),
      category: 'Piyasa',
    },
    {
      id: 'n5',
      title: 'Yapay zekâ destekli CRM çözümlerinde KOBİ ilgisi artıyor',
      source: 'BT Haberleri',
      time: hoursAgo(18),
      category: 'Teknoloji',
    },
  ]
}
