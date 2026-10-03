// OpenStreetMap entegrasyonu — %100 ücretsiz, API anahtarı GEREKTİRMEZ.
//  - geocodePlace:     Nominatim (yer/şehir çözümleme)
//  - searchBusinesses: Overpass API (gerçek işletme/POI arama)
// Servis arayüzü maps-mock.ts ile AYNI shape'i döner (MapsResult) —
// UI ve lead import akışı kırılmaz. Mock dosya çevrimdışı fallback olarak kalır.

import http from 'node:http'
import https from 'node:https'

import type { MapsResult } from '@/types'

// ----------------------------------------------------------------------------
// Sabitler
// ----------------------------------------------------------------------------

const USER_AGENT = 'GNC-CRM/1.0 (gncinc.online)'

// Overpass sunucuları — sırayla denenir (ana sunucu → mirror'lar)
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search'

const GEOCODE_TIMEOUT_MS = 15_000
const OVERPASS_TIMEOUT_MS = 7_000
// Tüm endpoint denemeleri için toplam bütçe — UX'i bloklamasın
const OVERPASS_TOTAL_BUDGET_MS = 24_000

const MAX_RESULTS = 40

// Nominatim kullanım politikası: 1 req/sn üst sınırı → 1.1sn güvenli aralık
const NOMINATIM_MIN_INTERVAL_MS = 1_100

// ----------------------------------------------------------------------------
// Hafıza cache (TTL 24h)
// ----------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T
  expires: number
}

const geocodeCache = new Map<string, CacheEntry<GeocodeResult | null>>()
const GEO_CACHE_TTL = 24 * 60 * 60 * 1000

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  if (hit) cache.delete(key)
  return null
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  // cache büyümesini sınırla (en eski 50 kaydı temizle)
  if (cache.size > 500) {
    const keys = Array.from(cache.keys()).slice(0, 50)
    for (const k of keys) cache.delete(k)
  }
  cache.set(key, { value, expires: Date.now() + GEO_CACHE_TTL })
}

// ----------------------------------------------------------------------------
// Nominatim rate-limit koruması — global promise kuyruğu,
// istekler arası minimum 1.1sn garanti edilir.
// ----------------------------------------------------------------------------

let lastNominatimAt = 0
let nominatimQueue: Promise<unknown> = Promise.resolve()

function scheduleNominatim<T>(task: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const wait = lastNominatimAt + NOMINATIM_MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastNominatimAt = Date.now()
    return task()
  })
  // kuyruk hata sonrası yaşamaya devam etsin
  nominatimQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

// ----------------------------------------------------------------------------
// Timeout'lu HTTP istekleri — node:https tabanlı.
// Not: Next.js dev sunucusu global fetch'i cache enstrümantasyonu için sarmalar
// ve AbortSignal'li dış istekler dev'de askıda kalıp abort olabiliyor; bu yüzden
// patch'lenmeyen node http/https modülü kullanılır.
// ----------------------------------------------------------------------------

interface MinimalResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

async function fetchWithTimeout(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  timeoutMs: number,
): Promise<MinimalResponse> {
  return new Promise<MinimalResponse>((resolve, reject) => {
    const u = new URL(url)
    const mod = u.protocol === 'http:' ? http : https

    const headers: http.OutgoingHttpHeaders = { ...init.headers }
    if (init.body) headers['Content-Length'] = Buffer.byteLength(init.body)

    const req = mod.request(
      u,
      {
        method: init.method ?? 'GET',
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => {
          // yanıt büyümesini sınırla (8 MB yeter)
          if (chunks.reduce((s, x) => s + x.length, 0) > 8 * 1024 * 1024) {
            req.destroy(new Error('Yanıt çok büyük'))
            return
          }
          chunks.push(c)
        })
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8')
          const status = res.statusCode ?? 0
          resolve({
            ok: status >= 200 && status < 300,
            status,
            json: async () => JSON.parse(body),
          })
        })
        res.on('error', reject)
      },
    )

    req.on('timeout', () => {
      req.destroy(new Error(`İstek zaman aşımı (${timeoutMs}ms) — ${u.hostname}`))
    })
    req.on('error', reject)

    if (init.body) req.write(init.body)
    req.end()
  })
}

// ----------------------------------------------------------------------------
// Geocoding — Nominatim
// ----------------------------------------------------------------------------

export interface GeocodeResult {
  lat: number
  lng: number
  displayName: string
  city: string | null
  district: string | null
  /** ISO 3166-1 alpha-2 ülke kodu (tr, de, fr…) — yurt içi/dışı ayrımı için */
  countryCode: string | null
}

interface NominatimItem {
  lat: string
  lon: string
  display_name?: string
  name?: string
  address?: Record<string, string>
}

function normText(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .trim()
}

/**
 * Yer adını (mahalle, ilçe, şehir vb.) koordinata çevirir.
 * 24h hafıza cache + 1.1sn istek aralığı (Nominatim politika uyumu).
 * Hata durumunda throw eder — çağıran (API route) fallback'e alır.
 */
export async function geocodePlace(query: string): Promise<GeocodeResult | null> {
  const q = query.trim()
  if (!q) return null

  const cacheKey = normText(q)
  const cached = getCached(geocodeCache, cacheKey)
  if (cached !== null) return cached

  const result = await scheduleNominatim(async () => {
    const url =
      `${NOMINATIM_ENDPOINT}?format=jsonv2&addressdetails=1&limit=1` +
      `&accept-language=tr&q=${encodeURIComponent(q)}`

    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'tr',
        },
      },
      GEOCODE_TIMEOUT_MS,
    )
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)

    const data = (await res.json()) as NominatimItem[]
    const item = data[0]
    if (!item) return null

    const addr = item.address ?? {}
    const lat = Number.parseFloat(item.lat)
    const lng = Number.parseFloat(item.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

    const city =
      addr.city ?? addr.town ?? addr.municipality ?? addr.village ?? addr.county ?? null
    const district = addr.suburb ?? addr.district ?? addr.neighbourhood ?? addr.town ?? null

    const value: GeocodeResult = {
      lat,
      lng,
      displayName: item.display_name ?? item.name ?? q,
      city,
      district,
      countryCode: addr.country_code ?? null,
    }
    setCached(geocodeCache, cacheKey, value)
    return value
  })

  return result
}

// ----------------------------------------------------------------------------
// Kategori tanımları — sorgu metni → Overpass tag filtreleri
// ----------------------------------------------------------------------------

export interface CategoryDef {
  /** MAPS_CATEGORIES.query ile hizalı anahtar */
  key: string
  /** UI'da gösterilen kategori etiketi */
  label: string
  /** Overpass tag seçicileri (her biri node+way olarak aranır) */
  filters: string[]
  /** Serbest metin eşleşmesi için alias'lar (normalize Türkçe) */
  aliases: string[]
}

export const OSM_CATEGORIES: CategoryDef[] = [
  {
    key: 'cafe',
    label: 'Kafe',
    filters: ['["amenity"="cafe"]', '["shop"="coffee"]', '["cuisine"="coffee_shop"]'],
    aliases: ['cafe', 'kafe', 'kahve', 'coffee', 'pastane', 'pasta', 'fırın', 'firin'],
  },
  {
    key: 'restoran',
    label: 'Restoran',
    filters: ['["amenity"="restaurant"]', '["amenity"="fast_food"]', '["amenity"="food_court"]'],
    aliases: ['restoran', 'lokanta', 'yemek', 'kebap', 'pide', 'kahvaltı', 'kahvalti', 'food', 'mutfak', 'fast food'],
  },
  {
    key: 'market',
    label: 'Market',
    filters: [
      '["shop"="supermarket"]',
      '["shop"="convenience"]',
      '["shop"="greengrocer"]',
      '["shop"="butcher"]',
    ],
    aliases: ['market', 'bakkal', 'süpermarket', 'supermarket', 'manav', 'kasap'],
  },
  {
    key: 'kuaför',
    label: 'Kuaför & Güzellik',
    filters: ['["shop"="hairdresser"]', '["shop"="beauty"]', '["leisure"="tanning_salon"]'],
    aliases: ['kuaför', 'kuafor', 'berber', 'güzellik', 'guzellik', 'saç', 'sac', 'epilasyon', 'manikür', 'kuaför'],
  },
  {
    key: 'diş kliniği',
    label: 'Diş Kliniği',
    filters: ['["amenity"="dentist"]', '["healthcare"="dentist"]'],
    aliases: ['diş', 'dis', 'dental', 'implant', 'ortodonti', 'ağız', 'agiz'],
  },
  {
    key: 'eczane',
    label: 'Eczane',
    filters: ['["amenity"="pharmacy"]', '["healthcare"="pharmacy"]'],
    aliases: ['eczane', 'ecz', 'ilaç', 'ilac'],
  },
  {
    key: 'otomotiv',
    label: 'Otomotiv',
    filters: [
      '["shop"="car_repair"]',
      '["shop"="tyres"]',
      '["shop"="car"]',
      '["shop"="car_parts"]',
    ],
    aliases: ['oto', 'otomotiv', 'araba', 'servis', 'lastik', 'kaporta', 'boya', 'oto tamir'],
  },
  {
    key: 'benzinlik',
    label: 'Benzinlik',
    filters: ['["amenity"="fuel"]'],
    aliases: ['benzinlik', 'petrol', 'akaryakıt', 'akaryakit', 'istasyon'],
  },
  {
    key: 'gym fitness',
    label: 'Spor Salonu',
    filters: ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]'],
    aliases: ['spor', 'gym', 'fitness', 'pilates', 'yoga', 'salon'],
  },
  {
    key: 'avukat',
    label: 'Hukuk Bürosu',
    filters: ['["office"="lawyer"]', '["office"="lawyer_extra"]'],
    aliases: ['avukat', 'hukuk', 'law'],
  },
  {
    key: 'muhasebe',
    label: 'Muhasebe',
    filters: ['["office"="accountant"]', '["office"="tax_advisor"]'],
    aliases: ['muhasebe', 'mali müşavir', 'mali', 'smmm', 'müşavir', 'musavir'],
  },
  {
    key: 'otel',
    label: 'Otel',
    filters: ['["tourism"="hotel"]', '["tourism"="guest_house"]', '["tourism"="apartment"]', '["tourism"="hostel"]'],
    aliases: ['otel', 'hotel', 'pansiyon', 'konaklama', 'apart', 'hostel'],
  },
  {
    key: 'veteriner',
    label: 'Veteriner',
    filters: ['["amenity"="veterinary"]'],
    aliases: ['veteriner', 'vet', 'pet', 'hayvan'],
  },
  {
    key: 'eğitim',
    label: 'Eğitim',
    filters: [
      '["amenity"="language_school"]',
      '["amenity"="prep_school"]',
      '["amenity"="dancing_school"]',
      '["amenity"="training"]',
      '["amenity"="college"]',
      '["amenity"="kindergarten"]',
    ],
    aliases: ['kurs', 'etüt', 'etut', 'eğitim', 'egitim', 'dershane', 'özel öğretim', 'anaokulu', 'kreş', 'kres'],
  },
  {
    key: 'emlak',
    label: 'Emlak',
    filters: ['["office"="estate_agent"]'],
    aliases: ['emlak', 'gayrimenkul', 'kiralık', 'kiralik', 'satılık', 'satilik', 'inşaat', 'insaat'],
  },
  {
    key: 'butik',
    label: 'Butik & Perakende',
    filters: ['["shop"="clothes"]', '["shop"="boutique"]', '["shop"="shoes"]', '["shop"="jewelry"]', '["shop"="gift"]'],
    aliases: ['butik', 'giyim', 'mağaza', 'magaza', 'ayakkabı', 'ayakkabi', 'takı', 'taki', 'hediyelik'],
  },
  {
    key: 'eğlence',
    label: 'Eğlence',
    filters: [
      '["amenity"="bowling_alley"]',
      '["leisure"="escape_game"]',
      '["amenity"="cinema"]',
      '["leisure"="amusement_arcade"]',
    ],
    aliases: ['eğlence', 'eglence', 'bowling', 'sinema', 'oyun', 'kafein', 'escape'],
  },
]

/** Serbest sorgu metninden kategori bulur (önce birebir key, sonra alias) */
export function detectOsmCategory(query: string): CategoryDef {
  const q = normText(query)

  // 1) birebir kategori key/label eşleşmesi
  const direct = OSM_CATEGORIES.find(
    (c) => q.includes(normText(c.key)) || q.includes(normText(c.label)),
  )
  if (direct) return direct

  // 2) alias sözlüğü — "berber" → kuaför, "dental" → diş kliniği ...
  let best: CategoryDef | null = null
  let bestLen = 0
  for (const cat of OSM_CATEGORIES) {
    for (const alias of cat.aliases) {
      if (q.includes(normText(alias)) && alias.length > bestLen) {
        best = cat
        bestLen = alias.length
      }
    }
  }
  if (best) return best

  // 3) hiçbiri eşleşmezse — genel işletme araması (adı olan tüm POI'lar)
  return {
    key: 'genel',
    label: 'İşletme',
    filters: ['["shop"]', '["amenity"~"^(cafe|restaurant|bar|pharmacy|bank|dentist)$"]'],
    aliases: [],
  }
}

// ----------------------------------------------------------------------------
// Overpass — gerçek işletme arama
// ----------------------------------------------------------------------------

export interface OsmSearchParams {
  query: string
  /** opsiyonel kategori etiketi — verilmezse query'den tahmin edilir */
  category?: string
  lat: number
  lng: number
  radiusM: number
  existingPlaceIds?: string[]
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function buildOverpassQuery(
  filters: string[],
  lat: number,
  lng: number,
  radiusM: number,
): string {
  const parts: string[] = []
  for (const f of filters) {
    parts.push(`node${f}(around:${radiusM},${lat},${lng});`)
    parts.push(`way${f}(around:${radiusM},${lat},${lng});`)
  }
  return `[out:json][timeout:20];(\n${parts.join('\n')}\n);out center ${MAX_RESULTS * 3};`
}

function parseAddress(tags: Record<string, string>): string {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ')
  const city = tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:suburb'] ?? ''
  const line = [street, city].filter(Boolean).join(', ')
  return line || ''
}

async function fetchOverpass(query: string): Promise<OverpassElement[]> {
  let lastErr: Error = new Error('Overpass isteği başarısız')
  const deadline = Date.now() + OVERPASS_TOTAL_BUDGET_MS

  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (Date.now() > deadline - OVERPASS_TIMEOUT_MS) break // bütçe bitti
    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ data: query }).toString(),
        },
        OVERPASS_TIMEOUT_MS,
      )
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
      const data = (await res.json()) as { elements?: OverpassElement[] }
      return data.elements ?? []
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr
}

/**
 * Verilen koordinat çevresinde GERÇEK işletmeleri Overpass API ile arar.
 * Sonuç MapsResult mock shape'ine map edilir (UI/import akışı uyumlu).
 * Hata durumunda throw eder — API route mock fallback'e alır.
 */
export async function searchBusinesses(
  params: OsmSearchParams,
): Promise<MapsResult[]> {
  const { query, lat, lng, existingPlaceIds = [] } = params

  const radiusM = Math.min(100_000, Math.max(300, Math.round(params.radiusM || 2000)))

  // Kategori: explicit verildiyse key'e göre bul, yoksa sorgudan tahmin et
  const cat =
    (params.category && OSM_CATEGORIES.find((c) => c.key === params.category)) ||
    (params.category && OSM_CATEGORIES.find((c) => normText(c.label) === normText(params.category!))) ||
    detectOsmCategory(query)

  const ql = buildOverpassQuery(cat.filters, lat, lng, radiusM)
  const elements = await fetchOverpass(ql)

  const existingSet = new Set(existingPlaceIds)
  const seen = new Set<string>()
  const results: (MapsResult & { distM: number })[] = []

  for (const el of elements) {
    const tags = el.tags ?? {}
    const name = tags.name?.trim()
    if (!name) continue // adı olmayan elementleri at

    const placeId = `osm-${el.type}/${el.id}`
    if (seen.has(placeId)) continue
    seen.add(placeId)

    const elLat = el.lat ?? el.center?.lat
    const elLng = el.lon ?? el.center?.lon
    if (elLat === undefined || elLng === undefined) continue

    const phone = tags.phone ?? tags['contact:phone'] ?? tags['contact:mobile'] ?? null
    const website = tags.website ?? tags['contact:website'] ?? tags['contact:facebook'] ?? null

    const address =
      parseAddress(tags) ||
      `${cat.label} · ${Math.round(haversineM(lat, lng, elLat, elLng))} m`

    const city = tags['addr:city'] ?? tags['addr:town'] ?? null
    const district = tags['addr:suburb'] ?? tags['addr:district'] ?? tags['addr:neighbourhood'] ?? null

    const streetFull = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ')

    results.push({
      placeId,
      name,
      category: cat.label,
      address: streetFull || address,
      city: city ?? district ?? '',
      phone,
      web: website,
      rating: null, // OSM'de puan verisi yoktur
      reviewCount: null,
      lat: elLat,
      lng: elLng,
      existsInCrm: existingSet.has(placeId),
      distM: haversineM(lat, lng, elLat, elLng),
    })
  }

  // mesafeye göre sırala (en yakın önce)
  results.sort((a, b) => a.distM - b.distM)

  return results.slice(0, MAX_RESULTS).map(({ distM: _d, ...r }) => r)
}

// ----------------------------------------------------------------------------
// Google Places API (New) — OPSİYONEL Google verisi
// ----------------------------------------------------------------------------
// GOOGLE_MAPS_API_KEY ortam değişkeni tanımlıysa aramalar Google Places
// Text Search ile yapılır (puan/yorum/telefon dahil zengin veri).
// Tanımlı değilse akış %100 ücretsiz OSM ile devam eder.
// Anahtar almak: https://console.cloud.google.com → Maps Platform → API key
// (aylık ücretsiz çağrı paketi vardır; Text Search Essentials)

interface GooglePlace {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  rating?: number
  userRatingCount?: number
  internationalPhoneNumber?: string
  websiteUri?: string
}

export interface GoogleSearchParams {
  query: string
  lat: number
  lng: number
  radiusM: number
  existingPlaceIds?: string[]
  categoryLabel?: string
}

export async function searchBusinessesGoogle(
  params: GoogleSearchParams,
): Promise<MapsResult[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY tanımlı değil')

  const body = {
    textQuery: params.query,
    maxResultCount: 20,
    locationBias: {
      circle: {
        center: { latitude: params.lat, longitude: params.lng },
        radius: Math.min(50_000, Math.max(300, params.radiusM)),
      },
    },
  }

  const res = await fetchWithTimeout(
    'https://places.googleapis.com/v1/places:searchText',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.internationalPhoneNumber,places.websiteUri',
      },
      body: JSON.stringify(body),
    },
    8_000,
  )
  if (!res.ok) throw new Error(`Google Places HTTP ${res.status}`)

  const data = (await res.json()) as { places?: GooglePlace[] }
  const places = data.places ?? []

  const existingSet = new Set(params.existingPlaceIds ?? [])
  const results: (MapsResult & { distM: number })[] = []

  for (const p of places) {
    const name = p.displayName?.text?.trim()
    if (!name || !p.location) continue
    results.push({
      placeId: `g-${p.id}`,
      name,
      category: params.categoryLabel ?? 'İşletme',
      address: p.formattedAddress ?? '',
      city: '',
      phone: p.internationalPhoneNumber ?? null,
      web: p.websiteUri ?? null,
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      lat: p.location.latitude,
      lng: p.location.longitude,
      existsInCrm: existingSet.has(`g-${p.id}`),
      distM: haversineM(params.lat, params.lng, p.location.latitude, p.location.longitude),
    })
  }

  results.sort((a, b) => a.distM - b.distM)
  return results.slice(0, MAX_RESULTS).map(({ distM: _d, ...r }) => r)
}
