import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { scoreLead } from '@/lib/ai/crm-ai'

// POST — belirli lead için AI skoru hesapla
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'leads.view')) return err('Lead görüntüleme yetkiniz yok', 403)

  const body = await req.json().catch(() => ({}))
  const { leadId } = body as { leadId?: string }
  if (!leadId) return err('leadId gerekli', 400)

  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId: user!.tenantId },
    include: {
      activities: { select: { date: true, type: true } },
    },
  })
  if (!lead) return err('Lead bulunamadı', 404)

  const now = new Date()
  const activities = lead.activities ?? []
  const lastActivity = activities.length > 0
    ? activities.reduce((latest, a) => new Date(a.date) > new Date(latest.date) ? a : latest, activities[0])
    : null
  const lastActivityDaysAgo = lastActivity
    ? Math.floor((now.getTime() - new Date(lastActivity.date).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const result = await scoreLead({
    name: lead.name,
    sector: lead.category ?? undefined,
    city: lead.city ?? undefined,
    phone: lead.phone ?? undefined,
    web: lead.web ?? undefined,
    email: undefined,
    hasActivity: activities.length > 0,
    activityCount: activities.length,
    lastActivityDaysAgo,
    convertedToCustomer: !!lead.convertedCustomerId,
    source: lead.source ?? undefined,
    rating: lead.rating ?? undefined,
    reviewCount: lead.reviewCount ?? undefined,
  })

  return ok({ leadId, ...result })
}

// GET — tüm lead'lerin skorunu hesapla (toplu)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'leads.view')) return err('Lead görüntüleme yetkiniz yok', 403)

  const leads = await db.lead.findMany({
    where: { tenantId: user!.tenantId },
    include: {
      activities: { select: { date: true, type: true } },
    },
    take: 100,
  })

  const now = new Date()
  const results = await Promise.all(leads.map(async (lead) => {
    const activities = lead.activities ?? []
    const lastActivity = activities.length > 0
      ? activities.reduce((latest, a) => new Date(a.date) > new Date(latest.date) ? a : latest, activities[0])
      : null
    const lastActivityDaysAgo = lastActivity
      ? Math.floor((now.getTime() - new Date(lastActivity.date).getTime()) / (1000 * 60 * 60 * 24))
      : null

    const result = await scoreLead({
      name: lead.name,
      sector: lead.category ?? undefined,
      city: lead.city ?? undefined,
      hasActivity: activities.length > 0,
      activityCount: activities.length,
      lastActivityDaysAgo,
      convertedToCustomer: !!lead.convertedCustomerId,
      rating: lead.rating ?? undefined,
      reviewCount: lead.reviewCount ?? undefined,
    })
    return {
      id: lead.id,
      name: lead.name,
      score: result.score,
      level: result.level,
    }
  }))

  // Skora göre sırala
  results.sort((a, b) => b.score - a.score)

  return ok(results)
}
