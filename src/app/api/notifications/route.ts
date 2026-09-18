import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, getVisibilityFilter } from '@/lib/api-utils'

// GET /api/notifications — real notification feed for the bell icon
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const visFilter = await getVisibilityFilter(user!)
  const now = new Date()
  const staleDate = new Date()
  staleDate.setDate(staleDate.getDate() - 30)
  const next3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  const taskFilter = {
    tenantId: user!.tenantId,
    status: 'acik',
    ...(visFilter.ownerId ? { assigneeId: visFilter.ownerId } : {}),
  }

  const customerFilter = {
    tenantId: user!.tenantId,
    ...(visFilter.ownerId ? { ownerId: visFilter.ownerId } : {}),
  }

  const dealFilter = {
    tenantId: user!.tenantId,
    stage: { notIn: ['kazanıldı', 'kaybedildi'] },
    ...(visFilter.ownerId ? { ownerId: visFilter.ownerId } : {}),
  }

  const [overdueTasks, dueSoonTasks, staleCustomers, dealsClosingSoon, wonDealsToday] = await Promise.all([
    db.task.findMany({
      where: { ...taskFilter, dueDate: { lt: now } },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 5,
    }),
    db.task.findMany({
      where: { ...taskFilter, dueDate: { gte: now, lte: next3Days } },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 5,
    }),
    db.customer.count({
      where: {
        ...customerFilter,
        OR: [{ lastActivityAt: { lt: staleDate } }, { lastActivityAt: null }],
      },
    }),
    db.deal.findMany({
      where: { ...dealFilter, expectedCloseDate: { gte: now, lte: next3Days } },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { expectedCloseDate: 'asc' },
      take: 5,
    }),
    db.deal.count({
      where: {
        ...dealFilter,
        stage: 'kazanıldı',
        updatedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    }),
  ])

  const notifications: Array<{
    id: string
    type: 'overdue_task' | 'due_soon_task' | 'stale_customer' | 'deal_closing' | 'won_deal'
    severity: 'urgent' | 'warning' | 'info' | 'success'
    title: string
    description: string
    entityId?: string
    entityType?: 'task' | 'customer' | 'deal'
    meta?: Record<string, unknown>
  }> = []

  for (const t of overdueTasks) {
    const daysOver = Math.floor((now.getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24))
    notifications.push({
      id: `ot_${t.id}`,
      type: 'overdue_task',
      severity: 'urgent',
      title: t.title,
      description: `${daysOver} gün gecikmiş görev${t.customer ? ` · ${t.customer.name}` : ''}`,
      entityId: t.customer?.id,
      entityType: 'customer',
      meta: { taskId: t.id, priority: t.priority, daysOver },
    })
  }

  for (const t of dueSoonTasks) {
    const hoursLeft = Math.floor((new Date(t.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60))
    notifications.push({
      id: `ds_${t.id}`,
      type: 'due_soon_task',
      severity: hoursLeft < 24 ? 'warning' : 'info',
      title: t.title,
      description: `${hoursLeft < 24 ? `${hoursLeft} saat` : `${Math.floor(hoursLeft / 24)} gün`} içinde${t.customer ? ` · ${t.customer.name}` : ''}`,
      entityId: t.customer?.id,
      entityType: 'customer',
      meta: { taskId: t.id, priority: t.priority, hoursLeft },
    })
  }

  if (staleCustomers > 0) {
    notifications.push({
      id: 'stale_customers',
      type: 'stale_customer',
      severity: 'warning',
      title: `${staleCustomers} iletişimsiz müşteri`,
      description: '30+ gündür iletişim kurulmamış',
      entityType: 'customer',
    })
  }

  for (const d of dealsClosingSoon) {
    const daysLeft = Math.floor((new Date(d.expectedCloseDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    notifications.push({
      id: `dc_${d.id}`,
      type: 'deal_closing',
      severity: 'info',
      title: d.title,
      description: `${daysLeft === 0 ? 'Bugün' : daysLeft === 1 ? 'Yarın' : `${daysLeft} gün`} kapanış · ${d.customer.name}`,
      entityId: d.customer.id,
      entityType: 'customer',
      meta: { dealId: d.id, value: d.value, currency: d.currency },
    })
  }

  if (wonDealsToday > 0) {
    notifications.push({
      id: 'won_today',
      type: 'won_deal',
      severity: 'success',
      title: `${wonDealsToday} fırsat kazanıldı!`,
      description: 'Son 24 saatte',
    })
  }

  const urgentCount = notifications.filter((n) => n.severity === 'urgent').length
  const totalCount = notifications.length

  return ok({ notifications, urgentCount, totalCount })
}
