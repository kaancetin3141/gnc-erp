import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, getVisibilityFilter } from '@/lib/api-utils'

// GET /api/widgets — dashboard widget verileri (hava durumu, son mesajlar, haber, döviz, streak)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const city = url.searchParams.get('city') || 'İstanbul'

  const visFilter = await getVisibilityFilter(user!)
  const tenantId = user!.tenantId

  // ── 1. Hava durumu (mock — İstanbul varsayılan, deterministic) ──
  const weather = getMockWeather(city)

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

  // ── 3. Haberler (statik Türk iş dünyası manşetleri) ──
  const news = getMockNews()

  // ── 4. Döviz kurları (mock, hafif dalgalı) ──
  const currency = getMockCurrency()

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

// ── Mock weather (deterministic by day) ──────────────────────────
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

// ── Mock Turkish business news ──────────────────────────────────
function getMockNews() {
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

// ── Mock currency rates (slightly random by hour) ───────────────
function getMockCurrency() {
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
