import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// AI önerisiyle otomatik görev oluşturma.
// /api/ai/prioritize'ten gelen en yüksek potansiyelli N müşteri için
// otomatik takip görevleri oluşturur. Aynı müşteri için zaten açık bir
// AI görevi varsa atlar (mükerrer kontrolü).

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
  if (days === null) return 40
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
  const capped = Math.min(totalValue, 50_000)
  return Math.round((capped / 50_000) * 20)
}

function activityScore(count: number): number {
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

function priorityFor(score: number): 'acil' | 'yuksek' | 'orta' | 'dusuk' {
  if (score >= 80) return 'acil'
  if (score >= 60) return 'yuksek'
  if (score >= 40) return 'orta'
  return 'dusuk'
}

// POST /api/ai/auto-assign
// Body: { limit?: number, customerId?: string }
//   - customerId verilirse yalnızca o müşteri için görev oluşturulur (tekil buton)
//   - Aksi halde en yüksek potansiyelli N müşteri için (limit, varsayılan 10)
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  // Sadece yönetici rolündekiler otomatik atama yapabilir
  if (user!.role !== 'admin' && user!.role !== 'manager' && user!.role !== 'superadmin') {
    return err('Bu işlem için yetkiniz yok', 403)
  }

  let body: { limit?: number; customerId?: string } = {}
  try {
    const text = await req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    body = {}
  }
  const limit = Math.min(Math.max(body.limit ?? 10, 1), 50)
  const singleCustomerId = body.customerId

  // Aynı skorlama mantığını tekrar uygula (server-side tutarlılık)
  const customers = await db.customer.findMany({
    where: {
      tenantId: user!.tenantId,
      status: 'aktif',
      ownerId: { not: null },
      ...(singleCustomerId ? { id: singleCustomerId } : {}),
    },
    select: {
      id: true,
      name: true,
      segment: true,
      ownerId: true,
      lastActivityAt: true,
      owner: { select: { id: true, name: true } },
      deals: {
        where: { stage: { notIn: ['kazanıldı', 'kaybedildi'] } },
        select: { value: true },
      },
    },
    take: 500,
  })

  if (customers.length === 0) {
    return ok({ assigned: 0, skipped: 0, tasks: [], scanned: 0 })
  }

  const customerIds = customers.map((c) => c.id)

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
      scoreBreakdown: { recency, segment, dealValue: deal, activity },
      suggestedAction: suggestedActionFor(score),
    }
  })

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, limit)

  // Mükerrer kontrolü — bu müşteriler için zaten açık AI görevi var mı?
  const existingAutoTasks = await db.task.findMany({
    where: {
      tenantId: user!.tenantId,
      status: 'acik',
      autoGenerated: true,
      customerId: { in: top.map((c) => c.id) },
    },
    select: { customerId: true },
  })
  const withTask = new Set(existingAutoTasks.map((t) => t.customerId))

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 2)

  const tasks: Array<{ id: string; customerId: string; customerName: string; score: number; suggestedAction: string }> = []

  for (const c of top) {
    if (withTask.has(c.id)) continue

    const task = await db.task.create({
      data: {
        tenantId: user!.tenantId,
        title: `AI: ${c.name} ile iletişim`,
        description: `AI önerisi: Bu müşteri ${c.score} puanla yüksek potansiyele sahip. ${c.suggestedAction} önerilir. (Son aktivite: ${c.daysSinceLastActivity === null ? 'hiç yok' : c.daysSinceLastActivity + ' gün önce'} · Açık fırsat: ${Math.round(c.openDealValue).toLocaleString('tr-TR')}₺)`,
        dueDate,
        assigneeId: c.ownerId,
        customerId: c.id,
        priority: priorityFor(c.score),
        reminderTime: '09:00',
        status: 'acik',
        autoGenerated: true,
      },
    })

    tasks.push({
      id: task.id,
      customerId: c.id,
      customerName: c.name,
      score: c.score,
      suggestedAction: c.suggestedAction,
    })

    await writeAuditLog({
      tenantId: user!.tenantId,
      actorId: user!.id,
      action: 'create',
      entity: 'task',
      entityId: task.id,
      after: { ...task, source: 'ai_auto_assign', aiScore: c.score, suggestedAction: c.suggestedAction },
    })
  }

  return ok({
    assigned: tasks.length,
    skipped: top.length - tasks.length,
    scanned: customers.length,
    tasks: tasks.slice(0, 20),
    limit,
  })
}
