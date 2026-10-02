import { db } from '@/lib/db'

// ============================================================
// SEKTÖR BAZLI DASHBOARD VERİSİ
//
// Her sektör için o sektöre özel KPI'lar toplanır.
// CRM sector → müşteri/pipeline/görev/aktivite (ana dashboard)
// Cafe   → günün cirosu, açık masalar, kasa, top items
// Market → günün satışı, vardiya, stok uyarı, POS
// Site   → aidat tahsilat, sakin, şikayet, personel
// Appointments → günün randevuları, ciro, bekleyen
// ============================================================

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

export function monthLabel(idx: number): string {
  return TR_MONTHS[idx] ?? ''
}

// ---------- CAFE ----------
export async function getCafeDashboardData(tenantId: string, rangeStart: Date, now: Date) {
  const cafes = await db.cafe.findMany({
    where: { tenantId },
    select: {
      id: true, name: true, tableCount: true,
      tables: { select: { id: true, status: true, number: true } },
    },
  })

  const cafeIds = cafes.map((c) => c.id)

  // Bugünün başlangıcı
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rangeStartCafe = rangeStart

  const [todayOrders, rangeOrders, rangePaidOrders, activeTables, topItemsRaw] = await Promise.all([
    db.cafeOrder.count({
      where: { cafeId: { in: cafeIds }, createdAt: { gte: dayStart } },
    }),
    db.cafeOrder.findMany({
      where: { cafeId: { in: cafeIds }, createdAt: { gte: rangeStartCafe } },
      select: { subtotal: true, taxTotal: true, total: true, status: true, type: true, createdAt: true },
    }),
    db.cafeOrder.findMany({
      where: {
        cafeId: { in: cafeIds },
        status: 'odendi',
        createdAt: { gte: rangeStartCafe },
      },
      select: { total: true, createdAt: true },
    }),
    db.cafeTable.count({
      where: { cafeId: { in: cafeIds }, status: { in: ['dolu', 'siparis', 'rezerve'] } },
    }),
    db.cafeOrderItem.findMany({
      where: { order: { cafeId: { in: cafeIds }, createdAt: { gte: rangeStartCafe } } },
      select: { name: true, qty: true, unitPrice: true },
    }),
  ])

  const rangeRevenue = rangePaidOrders.reduce((s, o) => s + o.total, 0)
  const todayRevenue = rangePaidOrders
    .filter((o) => new Date(o.createdAt) >= dayStart)
    .reduce((s, o) => s + o.total, 0)

  // Top items (by qty)
  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const it of topItemsRaw) {
    const cur = itemMap.get(it.name) ?? { name: it.name, qty: 0, revenue: 0 }
    cur.qty += it.qty
    cur.revenue += it.qty * it.unitPrice
    itemMap.set(it.name, cur)
  }
  const topItems = Array.from(itemMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6)

  // Daily revenue (last 14 days)
  const dailyRevenueMap = new Map<string, number>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    dailyRevenueMap.set(d.toISOString().slice(0, 10), 0)
  }
  for (const o of rangePaidOrders) {
    const day = new Date(o.createdAt).toISOString().slice(0, 10)
    if (dailyRevenueMap.has(day)) {
      dailyRevenueMap.set(day, (dailyRevenueMap.get(day) ?? 0) + o.total)
    }
  }
  const dailyRevenue = Array.from(dailyRevenueMap.entries()).map(([date, revenue]) => ({
    date, revenue,
  }))

  // Order type breakdown
  const typeMap = new Map<string, number>()
  for (const o of rangeOrders) {
    typeMap.set(o.type, (typeMap.get(o.type) ?? 0) + 1)
  }
  const orderByType = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }))

  const totalTables = cafes.reduce((s, c) => s + c.tableCount, 0)
  const cafeNames = cafes.map((c) => c.name)

  return {
    sector: 'cafe' as const,
    cafe: {
      cafeNames,
      totalCafes: cafes.length,
      totalTables,
      activeTables,
      todayRevenue,
      rangeRevenue,
      todayOrderCount: todayOrders,
      rangeOrderCount: rangeOrders.length,
      topItems,
      dailyRevenue,
      orderByType,
    },
  }
}

// ---------- MARKET ----------
export async function getMarketDashboardData(tenantId: string, rangeStart: Date, now: Date) {
  const markets = await db.market.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true },
  })
  const marketIds = markets.map((m) => m.id)

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [todaySales, rangeSales, activeShifts, lowStockProducts, topProductsRaw] = await Promise.all([
    db.marketSale.findMany({
      where: {
        marketId: { in: marketIds },
        createdAt: { gte: dayStart },
        type: 'satis',
        status: 'tamamlandi',
      },
      select: { total: true, paymentMethod: true, cashAmount: true, cardAmount: true },
    }),
    db.marketSale.findMany({
      where: {
        marketId: { in: marketIds },
        createdAt: { gte: rangeStart },
        type: 'satis',
        status: 'tamamlandi',
      },
      select: { total: true, createdAt: true, paymentMethod: true },
    }),
    db.posShift.count({
      where: { marketId: { in: marketIds }, status: 'acik' },
    }),
    db.product.count({
      where: { tenantId, minStock: { gt: 0 }, stock: { lte: 0 } },
    }),
    db.marketSaleItem.findMany({
      where: {
        sale: { marketId: { in: marketIds }, createdAt: { gte: rangeStart }, type: 'satis', status: 'tamamlandi' },
      },
      select: { name: true, qty: true, lineTotal: true },
    }),
  ])

  const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0)
  const rangeRevenue = rangeSales.reduce((s, x) => s + x.total, 0)
  const todayTxCount = todaySales.length
  const rangeTxCount = rangeSales.length

  // Top products (by revenue)
  const prodMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const it of topProductsRaw) {
    const cur = prodMap.get(it.name) ?? { name: it.name, qty: 0, revenue: 0 }
    cur.qty += it.qty
    cur.revenue += it.lineTotal
    prodMap.set(it.name, cur)
  }
  const topProducts = Array.from(prodMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6)

  // Daily revenue (last 14 days)
  const dailyRevenueMap = new Map<string, number>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    dailyRevenueMap.set(d.toISOString().slice(0, 10), 0)
  }
  for (const s of rangeSales) {
    const day = new Date(s.createdAt).toISOString().slice(0, 10)
    if (dailyRevenueMap.has(day)) {
      dailyRevenueMap.set(day, (dailyRevenueMap.get(day) ?? 0) + s.total)
    }
  }
  const dailyRevenue = Array.from(dailyRevenueMap.entries()).map(([date, revenue]) => ({ date, revenue }))

  // Payment method breakdown
  const methodMap = new Map<string, number>()
  for (const s of rangeSales) {
    methodMap.set(s.paymentMethod, (methodMap.get(s.paymentMethod) ?? 0) + 1)
  }
  const paymentMethods = Array.from(methodMap.entries()).map(([method, count]) => ({ method, count }))

  // Cash + card totals (today)
  const todayCash = todaySales.reduce((s, x) => s + x.cashAmount, 0)
  const todayCard = todaySales.reduce((s, x) => s + x.cardAmount, 0)

  return {
    sector: 'market' as const,
    market: {
      marketNames: markets.map((m) => m.name),
      totalMarkets: markets.length,
      activeShifts,
      lowStockProducts,
      todayRevenue,
      rangeRevenue,
      todayTxCount,
      rangeTxCount,
      todayCash,
      todayCard,
      topProducts,
      dailyRevenue,
      paymentMethods,
    },
  }
}

// ---------- SITE ----------
export async function getSiteDashboardData(tenantId: string, rangeStart: Date, now: Date) {
  const sites = await db.site.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, defaultDueAmount: true, currency: true },
  })
  const siteIds = sites.map((s) => s.id)

  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // Bu yılki aidatlar
  const [allDues, residentsCount, apartmentsCount, openComplaints, recentComplaints, recentAnnouncements, staffCount] = await Promise.all([
    db.dues.findMany({
      where: { siteId: { in: siteIds }, year: currentYear },
      select: { id: true, month: true, year: true, amount: true, paidAmount: true, status: true, paidDate: true, apartmentId: true },
    }),
    db.resident.count({ where: { tenantId, isActive: true } }),
    db.apartment.count({ where: { siteId: { in: siteIds } } }),
    db.complaint.count({ where: { siteId: { in: siteIds }, status: { in: ['acik', 'inceleniyor'] } } }),
    db.complaint.findMany({
      where: { siteId: { in: siteIds } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, title: true, category: true, priority: true, status: true, createdAt: true, resident: { select: { name: true } } },
    }),
    db.announcement.findMany({
      where: { siteId: { in: siteIds } },
      orderBy: { publishDate: 'desc' },
      take: 5,
      select: { id: true, title: true, type: true, isPinned: true, publishDate: true },
    }),
    db.siteStaff.count({ where: { siteId: { in: siteIds }, isActive: true } }),
  ])

  const totalDuesExpected = allDues.reduce((s, d) => s + d.amount, 0)
  const totalDuesCollected = allDues.reduce((s, d) => s + (d.paidAmount ?? 0), 0)
  const collectionRate = totalDuesExpected > 0 ? (totalDuesCollected / totalDuesExpected) * 100 : 0

  const paidCount = allDues.filter((d) => d.status === 'odendi').length
  const unpaidCount = allDues.filter((d) => d.status === 'odenmedi').length
  const overdueCount = allDues.filter((d) => d.status === 'gecikti').length

  // Bu ay tahsil edilen tutar
  const monthStart = new Date(currentYear, currentMonth - 1, 1)
  const collectedThisMonth = allDues
    .filter((d) => d.paidDate && new Date(d.paidDate) >= monthStart)
    .reduce((s, d) => s + (d.paidAmount ?? 0), 0)

  // Last 6 months collection (by paidDate)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const paidInRange = allDues.filter((d) => d.paidDate && new Date(d.paidDate) >= sixMonthsAgo)
  const monthlyCollectionMap = new Map<string, number>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${monthLabel(d.getMonth())}`
    monthlyCollectionMap.set(key, 0)
  }
  for (const d of paidInRange) {
    if (!d.paidDate) continue
    const pd = new Date(d.paidDate)
    const key = monthLabel(pd.getMonth())
    if (monthlyCollectionMap.has(key)) {
      monthlyCollectionMap.set(key, (monthlyCollectionMap.get(key) ?? 0) + (d.paidAmount ?? 0))
    }
  }
  const monthlyCollection = Array.from(monthlyCollectionMap.entries()).map(([month, amount]) => ({ month, amount }))

  return {
    sector: 'site' as const,
    site: {
      siteNames: sites.map((s) => s.name),
      totalSites: sites.length,
      residentsCount,
      apartmentsCount,
      staffCount,
      openComplaints,
      totalDuesExpected,
      totalDuesCollected,
      collectionRate,
      paidCount,
      unpaidCount,
      overdueCount,
      collectedThisMonth,
      monthlyCollection,
      recentComplaints,
      recentAnnouncements,
    },
  }
}

// ---------- APPOINTMENTS ----------
export async function getAppointmentDashboardData(tenantId: string, rangeStart: Date, now: Date) {
  const providers = await db.serviceProvider.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, type: true },
  })
  const providerIds = providers.map((p) => p.id)

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [todayAppts, weekAppts, rangeCompleted, pendingAppts, topServicesRaw] = await Promise.all([
    db.appointment.findMany({
      where: { providerId: { in: providerIds }, date: { gte: dayStart, lt: dayEnd } },
      select: { id: true, status: true, customerName: true, price: true, date: true, service: { select: { name: true } }, staff: { select: { name: true } } },
      orderBy: { date: 'asc' },
    }),
    db.appointment.count({
      where: { providerId: { in: providerIds }, date: { gte: dayStart, lt: weekEnd } },
    }),
    db.appointment.findMany({
      where: { providerId: { in: providerIds }, status: 'tamamlandi', date: { gte: rangeStart } },
      select: { price: true, date: true, serviceId: true, service: { select: { name: true } } },
    }),
    db.appointment.count({
      where: { providerId: { in: providerIds }, status: 'beklemede' },
    }),
    db.appointment.findMany({
      where: { providerId: { in: providerIds }, status: 'tamamlandi', date: { gte: rangeStart } },
      select: { service: { select: { name: true } }, price: true },
    }),
  ])

  const rangeRevenue = rangeCompleted.reduce((s, a) => s + a.price, 0)
  const todayRevenue = rangeCompleted
    .filter((a) => new Date(a.date) >= dayStart)
    .reduce((s, a) => s + a.price, 0)

  // Top services (by count)
  const svcMap = new Map<string, { name: string; count: number; revenue: number }>()
  for (const a of topServicesRaw) {
    const name = a.service?.name ?? 'Genel'
    const cur = svcMap.get(name) ?? { name, count: 0, revenue: 0 }
    cur.count += 1
    cur.revenue += a.price
    svcMap.set(name, cur)
  }
  const topServices = Array.from(svcMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  // Daily appts (last 14 days)
  const dailyMap = new Map<string, number>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    dailyMap.set(d.toISOString().slice(0, 10), 0)
  }
  // last 14 days from DB
  const last14 = await db.appointment.findMany({
    where: { providerId: { in: providerIds }, date: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
    select: { date: true },
  })
  for (const a of last14) {
    const day = new Date(a.date).toISOString().slice(0, 10)
    if (dailyMap.has(day)) dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1)
  }
  const dailyAppointments = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }))

  return {
    sector: 'appointments' as const,
    appointments: {
      providerNames: providers.map((p) => p.name),
      todayCount: todayAppts.length,
      weekCount: weekAppts,
      pendingCount: pendingAppts,
      todayRevenue,
      rangeRevenue,
      rangeCompletedCount: rangeCompleted.length,
      topServices,
      dailyAppointments,
      todayAppointments: todayAppts,
    },
  }
}
