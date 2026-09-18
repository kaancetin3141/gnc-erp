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

  const [overdueTasks, dueSoonTasks, staleCustomers, dealsClosingSoon, wonDealsToday, pendingAppointments, upcomingAppointments] = await Promise.all([
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
    // Onay bekleyen randevular (işletmeye uyarı)
    db.appointment.findMany({
      where: {
        status: 'beklemede',
        date: { gte: now },
        provider: { tenantId: user!.tenantId },
      },
      include: {
        provider: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { date: 'asc' },
      take: 5,
    }),
    // Önümüzdeki 24 saatteki onaylı randevular (hatırlatma)
    db.appointment.findMany({
      where: {
        status: 'onaylandi',
        date: { gte: now, lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
        provider: { tenantId: user!.tenantId },
      },
      include: {
        provider: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { date: 'asc' },
      take: 5,
    }),
  ])

  const notifications: Array<{
    id: string
    type: 'overdue_task' | 'due_soon_task' | 'stale_customer' | 'deal_closing' | 'won_deal' | 'appointment_pending' | 'appointment_reminder'
    severity: 'urgent' | 'warning' | 'info' | 'success'
    title: string
    description: string
    entityId?: string
    entityType?: 'task' | 'customer' | 'deal' | 'appointment'
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

  // Onay bekleyen randevular — otomatik onay kapalıysa işletme onaylamalı
  for (const a of pendingAppointments) {
    const hoursWaiting = Math.floor((now.getTime() - new Date(a.createdAt).getTime()) / (1000 * 60 * 60))
    notifications.push({
      id: `ap_${a.id}`,
      type: 'appointment_pending',
      severity: 'urgent',
      title: `Onay bekleyen randevu — ${a.customerName}`,
      description: `${a.service?.name ?? 'Hizmet'} · ${formatDateTimeLabel(a.date)} · ${hoursWaiting} saatten uzun süredir bekliyor`,
      entityType: 'appointment',
      meta: { appointmentId: a.id, providerName: a.provider.name, appointmentNo: a.id.slice(-8).toUpperCase() },
    })
  }

  // Yaklaşan onaylı randevular — hatırlatma
  for (const a of upcomingAppointments) {
    const hoursLeft = Math.floor((new Date(a.date).getTime() - now.getTime()) / (1000 * 60 * 60))
    notifications.push({
      id: `ar_${a.id}`,
      type: 'appointment_reminder',
      severity: hoursLeft <= 3 ? 'warning' : 'info',
      title: `Yaklaşan randevu — ${a.customerName}`,
      description: `${a.service?.name ?? 'Hizmet'} · ${formatDateTimeLabel(a.date)} · ${hoursLeft <= 0 ? 'şimdi' : `${hoursLeft} saat sonra`}`,
      entityType: 'appointment',
      meta: { appointmentId: a.id, providerName: a.provider.name, appointmentNo: a.id.slice(-8).toUpperCase(), reminderSent: a.reminderSent },
    })
  }

  const urgentCount = notifications.filter((n) => n.severity === 'urgent').length
  const totalCount = notifications.length

  return ok({ notifications, urgentCount, totalCount })
}

function formatDateTimeLabel(d: Date | string) {
  const dt = new Date(d)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}
