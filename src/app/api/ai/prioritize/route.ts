import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok } from '@/lib/api-utils'

// AI destekli potansiyel skorlama algoritması.
// Müşterileri 0-100 arası bir potansiyel puanıyla sıralar ve önerilen
// aksiyonu (Ara / WhatsApp / E-posta / Takip) döndürür.
//
// Skor hesabı:
//   - Recency (40pt)     : son aktivite tarihine göre (0 gün = 40, 7 = 30, 30 = 15, 60+ = 0)
//   - Segment (25pt)     : vip=25, kurumsal=20, standart=10, potansiyel=5
//   - Deal value (20pt)  : açık fırsatların toplam değerine göre orantılı (max 20)
//   - Activity (15pt)    : son 90 gündeki aktivite sayısına göre (az aktivite = daha çok puan)

interface ScoredCustomer {
  id: string
  name: string
  segment: string
  ownerId: string
  ownerName: string
  lastActivityAt: string | null
  daysSinceLastActivity: number | null
  openDealValue: number
  activityCount90d: number
  score: number
  scoreBreakdown: {
    recency: number
    segment: number
    dealValue: number
    activity: number
  }
  suggestedAction: 'Ara' | 'WhatsApp' | 'E-posta' | 'Takip'
}

function recencyScore(days: number | null): number {
  if (days === null) return 40 // hiç aktivite yok → en yüksek öncelik
  if (days <= 0) return 40
  if (days <= 7) return 30
  if (days <= 30) return 15
  if (days <= 60) return 5
  return 0
}

function segmentScore(segment: string): number {
  switch (segment) {
    case 'vip': return 25
    case 'kurumsal': return 20
    case 'standart': return 10
    case 'potansiyel': return 5
    default: return 5
  }
}

function dealValueScore(totalValue: number): number {
  if (totalValue <= 0) return 0
  // 50.000₺+ → max 20 puan; lineer ölçek
  const capped = Math.min(totalValue, 50_000)
  return Math.round((capped / 50_000) * 20)
}

function activityScore(count: number): number {
  // Az aktivite = daha çok puan (aranmaya ihtiyaç var)
  // 0 aktivite = 15 puan, 10+ aktivite = 0 puan
  if (count <= 0) return 15
  if (count >= 10) return 0
  return Math.round(15 - (count / 10) * 15)
}

function suggestedActionFor(score: number): 'Ara' | 'WhatsApp' | 'E-posta' | 'Takip' {
  if (score > 70) return 'Ara'
  if (score >= 50) return 'WhatsApp'
  if (score >= 30) return 'E-posta'
  return 'Takip'
}

// GET /api/ai/prioritize
// ?limit=50 (varsayılan) — en yüksek potansiyelli N müşteri
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 500)

  // Sadece atanmış (ownerId olan) aktif müşteriler
  const customers = await db.customer.findMany({
    where: {
      tenantId: user!.tenantId,
      status: 'aktif',
      ownerId: { not: null },
    },
    select: {
      id: true,
      name: true,
      segment: true,
      ownerId: true,
      lastActivityAt: true,
      owner: { select: { id: true, name: true } },
      deals: {
        where: {
          stage: { notIn: ['kazanıldı', 'kaybedildi'] },
        },
        select: { value: true },
      },
    },
    take: 500,
  })

  if (customers.length === 0) {
    return ok({ items: [] as ScoredCustomer[], total: 0 })
  }

  const customerIds = customers.map((c) => c.id)

  // Son 90 günde aktivite sayılarını topla
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 90)
  const activityAgg = await db.activity.groupBy({
    by: ['customerId'],
    where: {
      tenantId: user!.tenantId,
      customerId: { in: customerIds },
      date: { gte: sinceDate },
    },
    _count: { _all: true },
  })
  const activityCountMap = new Map<string, number>()
  for (const a of activityAgg) {
    if (a.customerId) activityCountMap.set(a.customerId, a._count._all)
  }

  const now = Date.now()
  const scored: ScoredCustomer[] = customers.map((c) => {
    const lastTs = c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : null
    const days = lastTs === null ? null : Math.floor((now - lastTs) / (1000 * 60 * 60 * 24))
    const openDealValue = c.deals.reduce((s, d) => s + (d.value || 0), 0)
    const actCount = activityCountMap.get(c.id) ?? 0

    const recency = recencyScore(days)
    const segment = segmentScore(c.segment)
    const deal = dealValueScore(openDealValue)
    const activity = activityScore(actCount)
    const score = recency + segment + deal + activity

    return {
      id: c.id,
      name: c.name,
      segment: c.segment,
      ownerId: c.ownerId!,
      ownerName: c.owner?.name ?? '—',
      lastActivityAt: c.lastActivityAt ? c.lastActivityAt.toISOString() : null,
      daysSinceLastActivity: days,
      openDealValue,
      activityCount90d: actCount,
      score,
      scoreBreakdown: {
        recency,
        segment,
        dealValue: deal,
        activity,
      },
      suggestedAction: suggestedActionFor(score),
    }
  })

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, limit)

  return ok({
    items: top,
    total: scored.length,
    generatedAt: new Date().toISOString(),
  })
}
