import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, ok,
  getVisibilityFilter,
} from '@/lib/api-utils'
import { getTenantSector } from '@/lib/tenant-sector'
import {
  getCafeDashboardData,
  getMarketDashboardData,
  getSiteDashboardData,
  getAppointmentDashboardData,
} from '@/lib/dashboard-sectors'

// GET — ana dashboard metrikleri (hafif, ana ekran için)
// SEKTÖR BAZLI: tenant adından sektör tespit edilir ve o sektöre
// özel KPI'lar döner. CRM sektörü mevcut dashboard'u kullanır.
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  // Tenant sektörünü belirle
  const sector = getTenantSector(user!.tenant.name)

  // Tarih aralığı parametresi: today | 7d | 30d | month | quarter | all (default month)
  const url = new URL(req.url)
  const range = url.searchParams.get('range') || 'month'

  const now = new Date()
  let rangeStart = new Date(now.getFullYear(), now.getMonth(), 1) // default: bu ay
  let rangeLabel = 'Bu Ay'

  switch (range) {
    case 'today':
      rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      rangeLabel = 'Bugün'
      break
    case '7d':
      rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      rangeLabel = 'Son 7 Gün'
      break
    case '30d':
      rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      rangeLabel = 'Son 30 Gün'
      break
    case 'month':
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1)
      rangeLabel = 'Bu Ay'
      break
    case 'quarter':
      rangeStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
      rangeLabel = 'Bu Çeyrek'
      break
    case 'all':
      rangeStart = new Date(2000, 0, 1)
      rangeLabel = 'Tüm Zamanlar'
      break
  }

  // PRIVACY-TEMPLATES (#3): depo rolü için dashboard kısıtlı
  if (user!.role === 'stock') {
    // Depo rolü: siparişler görünür (orders.view) — bekleyen sevkiyatları göster
    // GİZLİLİK: fiyat/tutar alanları depo rolüne dönmez
    const pendingShipmentsStock = await db.order.findMany({
      where: {
        tenantId: user!.tenantId,
        status: { in: ['hazirlaniyor', 'onaylandi', 'uretimde'] },
      },
      select: {
        id: true, number: true, status: true,
        orderDate: true, expectedDelivery: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: { expectedDelivery: 'asc' },
      take: 8,
    })
    return ok({
      restricted: true,
      message: 'Depo rolü için dashboard kısıtlı',
      sector,
      range: '—',
      customers: { total: 0, newThisMonth: 0, staleCount: 0 },
      deals: { activeCount: 0, totalPipelineValue: 0, wonThisMonth: 0, revenueThisMonth: 0 },
      tasks: { openCount: 0, overdueCount: 0, upcomingCount: 0 },
      pipelineByStage: [],
      activitiesOverTime: [],
      recentActivities: [],
      upcomingTasks: [],
      shipments: { pendingCount: pendingShipmentsStock.length, orders: pendingShipmentsStock },
    })
  }

  // ============================================================
  // SEKTÖR BAZLI DASHBOARD
  // ============================================================
  // Kafe / Market / Site / Randevu sektörleri için özel veriler
  // döndürülür. CRM sektörü mevcut dashboard'u kullanır.
  // ============================================================
  const sectorDataPromise = (async () => {
    if (sector === 'cafe') return await getCafeDashboardData(user!.tenantId, rangeStart, now)
    if (sector === 'market') return await getMarketDashboardData(user!.tenantId, rangeStart, now)
    if (sector === 'site') return await getSiteDashboardData(user!.tenantId, rangeStart, now)
    if (sector === 'appointments') return await getAppointmentDashboardData(user!.tenantId, rangeStart, now)
    return null
  })()

  // CRM sektörü ise paralel olarak mevcut dashboard verileri toplanır
  const isCrm = sector === 'crm'
  const visFilter = isCrm ? await getVisibilityFilter(user!) : null

  // Fatura tutarlarını görebilir mi? (müdür/admin evet, depocu hayır)
  const canSeeAmounts =
    user!.permissions.includes('invoices.view') || user!.permissions.includes('erp.manage')

  const visibleUserIds: string[] | undefined = visFilter?.ownerId?.in

  const dealFilter = {
    tenantId: user!.tenantId,
    ...(visibleUserIds ? { ownerId: { in: visibleUserIds } } : {}),
  }
  const customerFilter = {
    tenantId: user!.tenantId,
    ...(visibleUserIds ? { ownerId: { in: visibleUserIds } } : {}),
  }
  const taskFilter = {
    tenantId: user!.tenantId,
    ...(visibleUserIds ? { assigneeId: { in: visibleUserIds } } : {}),
  }
  const activityFilter = {
    tenantId: user!.tenantId,
    ...(visibleUserIds ? { userId: { in: visibleUserIds } } : {}),
  }

  const monthStart = rangeStart
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const staleDate = new Date()
  staleDate.setDate(staleDate.getDate() - 30)

  // Son 12 ayın başlangıcı — trend grafiği için (widget 3/6/12 ay dilimler)
  const trendStart = new Date(now.getFullYear(), now.getMonth() - 11, 1)

  // CRM sektörü için paralel sorgular; değilse null döner
  const crmQueries = isCrm ? Promise.all([
    db.customer.count({ where: customerFilter }),
    db.customer.count({
      where: { ...customerFilter, createdAt: { gte: monthStart } },
    }),
    db.deal.findMany({
      where: {
        ...dealFilter,
        stage: { notIn: ['kazanıldı', 'kaybedildi'] },
      },
      select: { value: true },
    }),
    db.deal.findMany({
      where: {
        ...dealFilter,
        stage: 'kazanıldı',
        updatedAt: { gte: monthStart },
      },
      select: { value: true },
    }),
    db.task.count({
      where: { ...taskFilter, status: 'acik' },
    }),
    db.task.count({
      where: {
        ...taskFilter,
        status: 'acik',
        dueDate: { lt: now },
      },
    }),
    db.customer.count({
      where: {
        ...customerFilter,
        OR: [
          { lastActivityAt: { lt: staleDate } },
          { lastActivityAt: null },
        ],
      },
    }),
    db.activity.findMany({
      where: activityFilter,
      include: {
        user: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
      take: 10,
    }),
    db.task.findMany({
      where: {
        ...taskFilter,
        status: 'acik',
        dueDate: { gte: now, lte: next7Days },
      },
      include: {
        assignee: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 10,
    }),
    db.deal.findMany({
      where: {
        ...dealFilter,
        stage: { notIn: ['kazanıldı', 'kaybedildi'] },
      },
      select: { stage: true, value: true },
    }),
    db.activity.findMany({
      where: {
        ...activityFilter,
        date: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: { date: true, type: true },
    }),
    // Bekleyen sevkiyatlar — henüz sevk edilmemiş siparişler (B2B ERP akışı)
    // GİZLİLİK: fatura göremeyen roller (depocu vb.) için tutar alanları dönmez
    db.order.findMany({
      where: {
        tenantId: user!.tenantId,
        status: { in: ['hazirlaniyor', 'onaylandi', 'uretimde'] },
      },
      select: {
        id: true,
        number: true,
        status: true,
        orderDate: true,
        expectedDelivery: true,
        customer: { select: { id: true, name: true } },
        ...(canSeeAmounts ? { totalAmount: true, currency: true } : {}),
      },
      orderBy: { expectedDelivery: 'asc' },
      take: 8,
    }),
    // 6 aylık trend — siparişler (aylık adet)
    db.order.findMany({
      where: {
        tenantId: user!.tenantId,
        orderDate: { gte: trendStart },
      },
      select: { orderDate: true },
    }),
    // 6 aylık trend — sevk edilen irsaliyeler (sevk_edildi + teslim_edildi)
    db.irsaliye.findMany({
      where: {
        tenantId: user!.tenantId,
        status: { in: ['sevk_edildi', 'teslim_edildi'] },
        date: { gte: trendStart },
      },
      select: { date: true },
    }),
    // 6 aylık trend — fatura cirosu (yalnızca tutar görebilen roller)
    ...(canSeeAmounts ? [db.invoice.findMany({
      where: {
        tenantId: user!.tenantId,
        status: { not: 'iptal' },
        issueDate: { gte: trendStart },
      },
      select: { issueDate: true, total: true, currency: true },
    })] : [[] as { issueDate: Date; total: number; currency: string }[]]),
  ]) : null

  const [sectorData, crmResults] = await Promise.all([sectorDataPromise, crmQueries])

  // Eğer CRM dışı sektör ise — sektör verisini döndür, CRM alanları sıfır
  // NOT: sectorData zaten `sector` alanını içerir (cafe/market/site/appointments)
  if (sectorData && sector !== 'crm') {
    return ok({
      range: rangeLabel,
      customers: { total: 0, newThisMonth: 0, staleCount: 0 },
      deals: { activeCount: 0, totalPipelineValue: 0, wonThisMonth: 0, revenueThisMonth: 0 },
      tasks: { openCount: 0, overdueCount: 0, upcomingCount: 0 },
      pipelineByStage: [],
      activitiesOverTime: [],
      recentActivities: [],
      upcomingTasks: [],
      ...sectorData,
    })
  }

  // CRM sektörü için paralel sorgular; değilse null döner
  const [
    totalCustomers,
    newCustomersThisMonth,
    activeDeals,
    wonDealsThisMonth,
    openTasks,
    overdueTasks,
    staleCustomersCount,
    recentActivities,
    upcomingTasks,
    pipelineDeals,
    activities30d,
    pendingShipmentOrders,
    trendOrders,
    trendIrsaliye,
    trendInvoices,
  ] = crmResults!

  // 12 aylık sevk & sipariş trendi — aylık gruplanmış (widget dönem seçer)
  const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  const trendBuckets: {
    key: string; label: string; orders: number; shipped: number; revenue: number
  }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    trendBuckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: TR_MONTHS[d.getMonth()],
      orders: 0, shipped: 0, revenue: 0,
    })
  }
  const bucketOf = (date: Date | string) => {
    const d = new Date(date)
    return trendBuckets.find((b) => b.key === `${d.getFullYear()}-${d.getMonth()}`)
  }
  for (const o of trendOrders) {
    const b = bucketOf(o.orderDate)
    if (b) b.orders += 1
  }
  for (const irs of trendIrsaliye) {
    const b = bucketOf(irs.date)
    if (b) b.shipped += 1
  }
  // Ciro: TRY bazına basit sabit kurlarla toplanır (demo amaçlı sabit kur)
  const FX_TO_TRY: Record<string, number> = { TRY: 1, USD: 42, EUR: 45, GBP: 52 }
  for (const inv of trendInvoices) {
    const b = bucketOf(inv.issueDate)
    if (b) b.revenue += inv.total * (FX_TO_TRY[inv.currency] ?? 1)
  }
  const shipmentsTrend = trendBuckets.map((b) => ({
    label: b.label,
    orders: b.orders,
    shipped: b.shipped,
    revenue: canSeeAmounts ? Math.round(b.revenue) : undefined,
  }))

  // Pipeline by stage
  const stageMap = new Map<string, { count: number; totalValue: number }>()
  for (const d of pipelineDeals) {
    const cur = stageMap.get(d.stage) ?? { count: 0, totalValue: 0 }
    cur.count += 1
    cur.totalValue += d.value
    stageMap.set(d.stage, cur)
  }
  const pipelineByStage = Array.from(stageMap.entries()).map(([stage, v]) => ({
    stage, count: v.count, totalValue: v.totalValue,
  }))

  const totalPipelineValue = activeDeals.reduce((s, d) => s + d.value, 0)
  const totalRevenueThisMonth = wonDealsThisMonth.reduce((s, d) => s + d.value, 0)

  // Activities over time (last 30 days, grouped by day)
  const activityDayMap = new Map<string, number>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    activityDayMap.set(d.toISOString().slice(0, 10), 0)
  }
  for (const a of activities30d) {
    const day = new Date(a.date).toISOString().slice(0, 10)
    activityDayMap.set(day, (activityDayMap.get(day) ?? 0) + 1)
  }
  const activitiesOverTime = Array.from(activityDayMap.entries()).map(([date, count]) => ({
    date, count,
  }))

  return ok({
    sector,
    range: rangeLabel,
    customers: {
      total: totalCustomers,
      newThisMonth: newCustomersThisMonth,
      staleCount: staleCustomersCount,
    },
    deals: {
      activeCount: activeDeals.length,
      totalPipelineValue,
      wonThisMonth: wonDealsThisMonth.length,
      revenueThisMonth: totalRevenueThisMonth,
    },
    tasks: {
      openCount: openTasks,
      overdueCount: overdueTasks,
      upcomingCount: upcomingTasks.length,
    },
    pipelineByStage,
    activitiesOverTime,
    recentActivities,
    upcomingTasks,
    shipments: {
      pendingCount: pendingShipmentOrders.length,
      orders: pendingShipmentOrders,
    },
    shipmentsTrend,
  })
}
