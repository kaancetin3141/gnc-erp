import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, ok, err,
  getVisibilityFilter, canAccessResource, tenantScope,
} from '@/lib/api-utils'
import { getViewScope } from '@/lib/rbac'

// Gün Sonu Raporu (Daily Report)
// Bir satış temsilcisinin (veya tüm ekibin) belirli bir gündeki tüm
// aktivitelerini, arama/mesaj/teklif sayılarını ve müşteri iletişim listesini
// döndürür.
//
// GET /api/reports/daily?date=YYYY-MM-DD&userId=<id>
//   - date: opsiyonel (varsayılan: bugün)
//   - userId: opsiyonel (varsayılan: giriş yapmış kullanıcı)
//
// RBAC:
//   - admin/superadmin: tüm tenant
//   - manager: sadece astları + kendisi
//   - rep: sadece kendisi

interface ActivityRow {
  id: string
  type: string
  subject: string
  detail: string | null
  outcome: string | null
  durationMin: number
  date: string
  customerId: string | null
  customerName: string | null
  userId: string | null
  userName: string | null
}

interface ContactedCustomer {
  id: string
  name: string
  segment: string
  contactCount: number
  types: string[]
  lastContactAt: string
}

export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  // PRIVACY-TEMPLATES (#3): depo rolü gün sonu raporunu GÖREMEZ
  if (user!.role === 'stock') {
    return err('Depo rolü için gün sonu raporuna erişim kısıtlıdır', 403)
  }

  const url = new URL(req.url)
  const dateParam = url.searchParams.get('date')
  let targetUserId = url.searchParams.get('userId') || user!.id

  // Tarih aralığı (gün başı - gün sonu)
  const targetDate = dateParam ? new Date(dateParam + 'T00:00:00') : new Date()
  if (isNaN(targetDate.getTime())) {
    return err('Geçersiz tarih formatı. YYYY-MM-DD kullanın.', 400)
  }
  const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
  const dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1)

  // ---- Hedef kullanıcı ve yetki kontrolü ----
  const targetUser = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, tenantId: true, name: true, role: true, title: true, managerId: true },
  })

  if (!targetUser || targetUser.tenantId !== user!.tenantId && user!.role !== 'superadmin') {
    return err('Kullanıcı bulunamadı', 404)
  }

  // Admin değilse ve kendisi değilse → manager ast kontrolü yap
  if (targetUserId !== user!.id) {
    const scope = getViewScope(user!)
    if (scope !== 'all') {
      if (scope === 'team') {
        const allowed = await canAccessResource(user!, targetUser.managerId)
        if (!allowed && targetUser.managerId !== user!.id) {
          return err('Bu kullanıcının raporunu görüntüleme yetkiniz yok', 403)
        }
      } else {
        return err('Bu kullanıcının raporunu görüntüleme yetkiniz yok', 403)
      }
    }
  }

  // ---- Yetkili kullanıcı ID'leri ----
  // Eğer targetUserId verilmişse → sadece o kullanıcı. Aksi halde görünür kullanıcılar.
  let userIds: string[] | undefined = undefined
  if (targetUserId) {
    userIds = [targetUserId]
  } else {
    const visFilter = await getVisibilityFilter(user!)
    userIds = visFilter.ownerId?.in
  }

  // Filtre yardımcıları
  const activityWhere = {
    ...tenantScope(user!),
    date: { gte: dayStart, lt: dayEnd },
    ...(userIds ? { userId: { in: userIds } } : {}),
  }
  const taskAssigneeFilter = {
    ...tenantScope(user!),
    ...(userIds ? { assigneeId: { in: userIds } } : {}),
  }
  const dealOwnerFilter = {
    ...tenantScope(user!),
    ...(userIds ? { ownerId: { in: userIds } } : {}),
  }
  const customerOwnerFilter = {
    ...tenantScope(user!),
    ...(userIds ? { ownerId: { in: userIds } } : {}),
  }

  // ---- Paralel sorgular ----
  const [
    activities,
    tasksCompleted,
    tasksCreated,
    overdueTasks,
    newCustomers,
    newDeals,
    dealsWon,
    dealsLost,
    quotesCreated,
    quotesSent,
  ] = await Promise.all([
    db.activity.findMany({
      where: activityWhere,
      include: {
        customer: { select: { id: true, name: true, segment: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { date: 'asc' },
      take: 500,
    }),
    // Bugün tamamlanan görevler
    db.task.count({
      where: {
        ...taskAssigneeFilter,
        status: 'tamamlandi',
        completedAt: { gte: dayStart, lt: dayEnd },
      },
    }),
    // Bugün oluşturulan görevler
    db.task.count({
      where: {
        ...taskAssigneeFilter,
        createdAt: { gte: dayStart, lt: dayEnd },
      },
    }),
    // Gecikmiş görevler (hedef kullanıcıya ait, hâlâ açık, vadesi geçmiş)
    db.task.count({
      where: {
        ...taskAssigneeFilter,
        status: 'acik',
        dueDate: { lt: dayEnd },
      },
    }),
    // Bugün eklenen yeni müşteriler
    db.customer.findMany({
      where: {
        ...customerOwnerFilter,
        createdAt: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true, name: true, segment: true, ownerId: true, owner: { select: { name: true } } },
      take: 100,
    }),
    // Bugün oluşturulan fırsatlar
    db.deal.findMany({
      where: {
        ...dealOwnerFilter,
        createdAt: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true, value: true, currency: true, stage: true, customerId: true, customer: { select: { name: true } } },
      take: 100,
    }),
    // Bugün kazanılan fırsatlar (updatedAt gün içinde + stage=kazanıldı)
    db.deal.findMany({
      where: {
        ...dealOwnerFilter,
        stage: 'kazanıldı',
        updatedAt: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true, value: true, customer: { select: { name: true } } },
      take: 100,
    }),
    // Bugün kaybedilen fırsatlar
    db.deal.findMany({
      where: {
        ...dealOwnerFilter,
        stage: 'kaybedildi',
        updatedAt: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true, value: true, lossReason: true, customer: { select: { name: true } } },
      take: 100,
    }),
    // Bugün oluşturulan teklifler
    db.quote.findMany({
      where: {
        tenantId: user!.tenantId,
        createdAt: { gte: dayStart, lt: dayEnd },
        // Teklif sahibi alanı yok → customer üzerinden dolaylı filtre
        ...(userIds ? { customer: { ownerId: { in: userIds } } } : {}),
      },
      select: {
        id: true, number: true, status: true, total: true, currency: true,
        isProforma: true, customerId: true, customer: { select: { name: true } },
      },
      take: 100,
    }),
    // Bugün gönderilen teklifler (status='gonderildi' + updatedAt gün içinde)
    db.quote.count({
      where: {
        tenantId: user!.tenantId,
        status: 'gonderildi',
        updatedAt: { gte: dayStart, lt: dayEnd },
        ...(userIds ? { customer: { ownerId: { in: userIds } } } : {}),
      },
    }),
  ])

  // ---- Arama / mesaj özetleri (aktivite tiplerine göre) ----
  let callTotal = 0, callSuccessful = 0, callFailed = 0
  let whatsappCount = 0, emailCount = 0
  let totalDuration = 0
  const calledCustomerSet = new Set<string>()
  const messagedCustomerSet = new Set<string>()
  const contactedMap = new Map<string, ContactedCustomer>()

  for (const a of activities) {
    totalDuration += a.durationMin || 0
    if (a.type === 'arama') {
      callTotal++
      if (a.outcome === 'basarili') callSuccessful++
      else if (a.outcome === 'basarisiz') callFailed++
      if (a.customerId) calledCustomerSet.add(a.customerId)
    } else if (a.type === 'whatsapp') {
      whatsappCount++
      if (a.customerId) messagedCustomerSet.add(a.customerId)
    } else if (a.type === 'email') {
      emailCount++
      if (a.customerId) messagedCustomerSet.add(a.customerId)
    }

    // Müşteri iletişim haritası
    if (a.customerId && a.customer) {
      const existing = contactedMap.get(a.customerId)
      if (existing) {
        existing.contactCount++
        if (!existing.types.includes(a.type)) existing.types.push(a.type)
        if (new Date(a.date).getTime() > new Date(existing.lastContactAt).getTime()) {
          existing.lastContactAt = a.date.toISOString()
        }
      } else {
        contactedMap.set(a.customerId, {
          id: a.customerId,
          name: a.customer.name,
          segment: a.customer.segment,
          contactCount: 1,
          types: [a.type],
          lastContactAt: a.date.toISOString(),
        })
      }
    }
  }

  // ---- Top customers (en çok iletişim kurulan) ----
  const topCustomers = Array.from(contactedMap.values())
    .sort((a, b) => b.contactCount - a.contactCount)
    .slice(0, 10)

  // ---- Aktivite zaman çizelgesi ----
  const timeline: ActivityRow[] = activities.map((a) => ({
    id: a.id,
    type: a.type,
    subject: a.subject,
    detail: a.detail,
    outcome: a.outcome,
    durationMin: a.durationMin || 0,
    date: a.date.toISOString(),
    customerId: a.customerId,
    customerName: a.customer?.name ?? null,
    userId: a.userId,
    userName: a.user?.name ?? null,
  }))

  // ---- Tip özetleri ----
  const typeStats: Record<string, number> = {}
  for (const a of activities) {
    typeStats[a.type] = (typeStats[a.type] ?? 0) + 1
  }
  const outcomeStats: Record<string, number> = {}
  for (const a of activities) {
    if (a.outcome) outcomeStats[a.outcome] = (outcomeStats[a.outcome] ?? 0) + 1
  }

  // ---- Teklif özet ----
  const quotesCreatedTotalValue = quotesCreated.reduce((s, q) => s + (q.total || 0), 0)

  // ---- Fırsat özet ----
  const dealsWonValue = dealsWon.reduce((s, d) => s + (d.value || 0), 0)
  const dealsLostValue = dealsLost.reduce((s, d) => s + (d.value || 0), 0)
  const newDealsValue = newDeals.reduce((s, d) => s + (d.value || 0), 0)

  return ok({
    date: dayStart.toISOString().slice(0, 10),
    targetUser: {
      id: targetUser.id,
      name: targetUser.name,
      role: targetUser.role,
      title: targetUser.title,
    },
    scope: {
      isAll: !userIds,
      userIds: userIds ?? null,
      viewerRole: user!.role,
    },
    summary: {
      calls: {
        total: callTotal,
        successful: callSuccessful,
        failed: callFailed,
        uniqueCustomersCalled: calledCustomerSet.size,
      },
      messages: {
        whatsapp: whatsappCount,
        email: emailCount,
        uniqueCustomersMessaged: messagedCustomerSet.size,
      },
      quotes: {
        created: quotesCreated.length,
        totalValue: quotesCreatedTotalValue,
        sent: quotesSent,
      },
      deals: {
        created: newDeals.length,
        createdValue: newDealsValue,
        won: dealsWon.length,
        wonValue: dealsWonValue,
        lost: dealsLost.length,
        lostValue: dealsLostValue,
      },
      tasks: {
        completed: tasksCompleted,
        created: tasksCreated,
        overdue: overdueTasks,
      },
      customers: {
        newCustomers: newCustomers.length,
        contacted: contactedMap.size,
      },
      totalDuration,
    },
    timeline,
    topCustomers,
    newCustomers: newCustomers.map((c) => ({
      id: c.id,
      name: c.name,
      segment: c.segment,
      ownerName: c.owner?.name ?? '—',
    })),
    typeStats,
    outcomeStats,
    dealsWon: dealsWon.map((d) => ({
      id: d.id,
      value: d.value,
      customerName: d.customer?.name ?? '—',
    })),
    dealsLost: dealsLost.map((d) => ({
      id: d.id,
      value: d.value,
      lossReason: d.lossReason,
      customerName: d.customer?.name ?? '—',
    })),
    quotesCreated: quotesCreated.map((q) => ({
      id: q.id,
      number: q.number,
      status: q.status,
      total: q.total,
      currency: q.currency,
      isProforma: q.isProforma,
      customerName: q.customer?.name ?? '—',
    })),
  })
}
