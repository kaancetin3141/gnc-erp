import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { analyzeDealRisk } from '@/lib/ai/crm-ai'

// POST — belirli deal için risk analizi
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'deals.manage')) return err('Fırsat yönetme yetkiniz yok', 403)

  const body = await req.json().catch(() => ({}))
  const { dealId } = body as { dealId?: string }
  if (!dealId) return err('dealId gerekli', 400)

  const deal = await db.deal.findFirst({
    where: { id: dealId, tenantId: user!.tenantId },
    include: {
      customer: { select: { id: true, name: true, lastActivityAt: true } },
      activities: { select: { date: true, type: true } },
    },
  })
  if (!deal) return err('Fırsat bulunamadı', 404)

  // Stage'de geçirdiği süre — son aktivite tarihine göre tahmin et
  const now = new Date()
  const activities = deal.activities ?? []
  const lastActivity = activities.length > 0
    ? activities.reduce((latest, a) => new Date(a.date) > new Date(latest.date) ? a : latest, activities[0])
    : null
  const lastActivityDaysAgo = lastActivity
    ? Math.floor((now.getTime() - new Date(lastActivity.date).getTime()) / (1000 * 60 * 60 * 24))
    : null

  // Stage'de kaldığı süre (approximation — createdAt'dan bugüne)
  const daysInStage = Math.floor((now.getTime() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24))

  // Müşteri stale mi
  const customerStale = deal.customer?.lastActivityAt
    ? (now.getTime() - new Date(deal.customer.lastActivityAt).getTime()) > 30 * 24 * 60 * 60 * 1000
    : true

  const result = await analyzeDealRisk({
    title: deal.title,
    stage: deal.stage,
    value: deal.value,
    probability: deal.probability,
    expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? '',
    daysInStage,
    activityCount: activities.length,
    lastActivityDaysAgo,
    customerStale,
  })

  return ok({ dealId, ...result })
}

// GET — tüm açık deal'lerin risk analizi
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'deals.manage')) return err('Fırsat yönetme yetkiniz yok', 403)

  const deals = await db.deal.findMany({
    where: {
      tenantId: user!.tenantId,
      stage: { notIn: ['kazanıldı', 'kaybedildi'] },
    },
    include: {
      customer: { select: { id: true, name: true, lastActivityAt: true } },
      activities: { select: { date: true, type: true } },
    },
    take: 100,
  })

  const now = new Date()
  const results = await Promise.all(deals.map(async (deal) => {
    const activities = deal.activities ?? []
    const lastActivity = activities.length > 0
      ? activities.reduce((latest, a) => new Date(a.date) > new Date(latest.date) ? a : latest, activities[0])
      : null
    const lastActivityDaysAgo = lastActivity
      ? Math.floor((now.getTime() - new Date(lastActivity.date).getTime()) / (1000 * 60 * 60 * 24))
      : null
    const daysInStage = Math.floor((now.getTime() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    const customerStale = deal.customer?.lastActivityAt
      ? (now.getTime() - new Date(deal.customer.lastActivityAt).getTime()) > 30 * 24 * 60 * 60 * 1000
      : true

    const result = await analyzeDealRisk({
      title: deal.title,
      stage: deal.stage,
      value: deal.value,
      probability: deal.probability,
      expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? '',
      daysInStage,
      activityCount: activities.length,
      lastActivityDaysAgo,
      customerStale,
    })
    return {
      id: deal.id,
      title: deal.title,
      value: deal.value,
      stage: deal.stage,
      riskLevel: result.riskLevel,
      riskScore: result.riskScore,
    }
  }))

  results.sort((a, b) => b.riskScore - a.riskScore)

  return ok(results)
}
