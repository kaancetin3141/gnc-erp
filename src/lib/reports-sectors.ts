import { db } from '@/lib/db'
import { monthLabel } from '@/lib/dashboard-sectors'

// ============================================================
// SEKTÖR BAZLI RAPOR VERİSİ
//
// Her sektör için o sektöre özel analiz verisi toplanır.
// CRM sektörü mevcut /api/reports mantığını kullanır — burada 4
// CRM-dışı sektör için ayrı fetcher tanımlıdır.
//
// Tüm sorgular rangeStart/rangeEnd aralığını temel alır.
// ============================================================

const TR_DAY_NAMES = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

export function dayLabel(idx: number): string {
  return TR_DAY_NAMES[idx] ?? ''
}

// ============================================================
// CAFE — Saatlik kırılım, sipariş tipi, top items, günlük trend,
// çoklu kafe karşılaştırması
// ============================================================
export async function getCafeReportsData(
  tenantId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{
  sector: 'cafe'
  cafe: {
    cafeNames: string[]
    totalCafes: number
    totalRevenue: number
    totalOrders: number
    avgTicket: number
    activeTables: number
    totalTables: number
    dailyRevenue: { date: string; revenue: number; orders: number }[]
    hourlyBreakdown: { hour: number; revenue: number; orders: number }[]
    orderTypeMix: { type: string; count: number; revenue: number }[]
    topItems: { name: string; qty: number; revenue: number }[]
    perCafe: { id: string; name: string; revenue: number; orders: number; avgTicket: number }[]
  }
}> {
  const cafes = await db.cafe.findMany({
    where: { tenantId },
    select: {
      id: true, name: true, tableCount: true,
      tables: { select: { id: true, status: true } },
    },
  })

  const cafeIds = cafes.map((c) => c.id)

  if (cafeIds.length === 0) {
    return {
      sector: 'cafe',
      cafe: {
        cafeNames: [],
        totalCafes: 0,
        totalRevenue: 0,
        totalOrders: 0,
        avgTicket: 0,
        activeTables: 0,
        totalTables: 0,
        dailyRevenue: [],
        hourlyBreakdown: [],
        orderTypeMix: [],
        topItems: [],
        perCafe: [],
      },
    }
  }

  const [orders, items, activeTables] = await Promise.all([
    db.cafeOrder.findMany({
      where: {
        cafeId: { in: cafeIds },
        createdAt: { gte: rangeStart, lt: rangeEnd },
        status: 'odendi',
      },
      select: {
        cafeId: true, total: true, type: true, createdAt: true,
        cafe: { select: { name: true } },
      },
    }),
    db.cafeOrderItem.findMany({
      where: {
        order: {
          cafeId: { in: cafeIds },
          createdAt: { gte: rangeStart, lt: rangeEnd },
          status: 'odendi',
        },
      },
      select: { name: true, qty: true, unitPrice: true },
    }),
    db.cafeTable.count({
      where: { cafeId: { in: cafeIds }, status: { in: ['dolu', 'siparis', 'rezerve'] } },
    }),
  ])

  const totalRevenue = orders.reduce((s, o) => s + o.total, 0)
  const totalOrders = orders.length
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0
  const totalTables = cafes.reduce((s, c) => s + c.tableCount, 0)

  // Daily revenue (last 30 days or full range — whichever is shorter)
  const dailyMap = new Map<string, { revenue: number; orders: number }>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(rangeEnd.getTime() - i * 24 * 60 * 60 * 1000)
    dailyMap.set(d.toISOString().slice(0, 10), { revenue: 0, orders: 0 })
  }
  for (const o of orders) {
    const day = new Date(o.createdAt).toISOString().slice(0, 10)
    const cur = dailyMap.get(day)
    if (cur) {
      cur.revenue += o.total
      cur.orders += 1
    }
  }
  const dailyRevenue = Array.from(dailyMap.entries()).map(([date, v]) => ({
    date, revenue: v.revenue, orders: v.orders,
  }))

  // Hourly breakdown (08-23)
  const hourlyMap = new Map<number, { revenue: number; orders: number }>()
  for (let h = 8; h <= 23; h++) {
    hourlyMap.set(h, { revenue: 0, orders: 0 })
  }
  for (const o of orders) {
    const h = new Date(o.createdAt).getHours()
    const cur = hourlyMap.get(h)
    if (cur) {
      cur.revenue += o.total
      cur.orders += 1
    }
  }
  const hourlyBreakdown = Array.from(hourlyMap.entries()).map(([hour, v]) => ({
    hour, revenue: v.revenue, orders: v.orders,
  }))

  // Order type mix
  const typeMap = new Map<string, { count: number; revenue: number }>()
  for (const o of orders) {
    const cur = typeMap.get(o.type) ?? { count: 0, revenue: 0 }
    cur.count += 1
    cur.revenue += o.total
    typeMap.set(o.type, cur)
  }
  const orderTypeMix = Array.from(typeMap.entries()).map(([type, v]) => ({
    type, count: v.count, revenue: v.revenue,
  }))

  // Top items (by qty, then revenue)
  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const it of items) {
    const cur = itemMap.get(it.name) ?? { name: it.name, qty: 0, revenue: 0 }
    cur.qty += it.qty
    cur.revenue += it.qty * it.unitPrice
    itemMap.set(it.name, cur)
  }
  const topItems = Array.from(itemMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Per-cafe breakdown
  const cafeAggMap = new Map<string, { id: string; name: string; revenue: number; orders: number }>()
  for (const c of cafes) {
    cafeAggMap.set(c.id, { id: c.id, name: c.name, revenue: 0, orders: 0 })
  }
  for (const o of orders) {
    const cur = cafeAggMap.get(o.cafeId)
    if (cur) {
      cur.revenue += o.total
      cur.orders += 1
    }
  }
  const perCafe = Array.from(cafeAggMap.values()).map((c) => ({
    ...c,
    avgTicket: c.orders > 0 ? c.revenue / c.orders : 0,
  })).sort((a, b) => b.revenue - a.revenue)

  return {
    sector: 'cafe',
    cafe: {
      cafeNames: cafes.map((c) => c.name),
      totalCafes: cafes.length,
      totalRevenue,
      totalOrders,
      avgTicket,
      activeTables,
      totalTables,
      dailyRevenue,
      hourlyBreakdown,
      orderTypeMix,
      topItems,
      perCafe,
    },
  }
}

// ============================================================
// MARKET — Ödeme yöntemi, kasiyer performansı, top ürünler,
// stok turnover, düşük stok, günlük trend
// ============================================================
export async function getMarketReportsData(
  tenantId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{
  sector: 'market'
  market: {
    marketNames: string[]
    totalMarkets: number
    totalRevenue: number
    totalTx: number
    avgBasket: number
    lowStockCount: number
    outOfStockCount: number
    dailyRevenue: { date: string; revenue: number; tx: number }[]
    paymentMethodMix: { method: string; count: number; revenue: number }[]
    topProducts: { name: string; qty: number; revenue: number; currentStock: number }[]
    stockTurnover: { name: string; soldQty: number; currentStock: number; daysOfCover: number | null }[]
    cashierPerformance: { userId: string; name: string; txCount: number; totalRevenue: number; avgBasket: number }[]
    lowStockProducts: { name: string; stock: number; minStock: number; category: string | null }[]
  }
}> {
  const markets = await db.market.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true },
  })
  const marketIds = markets.map((m) => m.id)

  if (marketIds.length === 0) {
    return {
      sector: 'market',
      market: {
        marketNames: [],
        totalMarkets: 0,
        totalRevenue: 0,
        totalTx: 0,
        avgBasket: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        dailyRevenue: [],
        paymentMethodMix: [],
        topProducts: [],
        stockTurnover: [],
        cashierPerformance: [],
        lowStockProducts: [],
      },
    }
  }

  const [sales, saleItems, products] = await Promise.all([
    db.marketSale.findMany({
      where: {
        marketId: { in: marketIds },
        createdAt: { gte: rangeStart, lt: rangeEnd },
        type: 'satis',
        status: 'tamamlandi',
      },
      select: {
        id: true, total: true, paymentMethod: true, userId: true, createdAt: true,
      },
    }),
    db.marketSaleItem.findMany({
      where: {
        sale: {
          marketId: { in: marketIds },
          createdAt: { gte: rangeStart, lt: rangeEnd },
          type: 'satis',
          status: 'tamamlandi',
        },
      },
      select: { name: true, qty: true, lineTotal: true },
    }),
    db.product.findMany({
      where: { tenantId },
      select: { id: true, name: true, stock: true, minStock: true, category: true, price: true },
    }),
  ])

  // Cashier IDs — sales üzerinde grupla
  const cashierIds: string[] = Array.from(new Set(
    sales
      .map((s) => s.userId)
      .filter((u): u is string => !!u),
  ))

  const totalRevenue = sales.reduce((s, x) => s + x.total, 0)
  const totalTx = sales.length
  const avgBasket = totalTx > 0 ? totalRevenue / totalTx : 0

  // Low/out of stock
  const lowStockProducts = products
    .filter((p) => p.minStock > 0 && p.stock <= p.minStock)
    .map((p) => ({ name: p.name, stock: p.stock, minStock: p.minStock, category: p.category }))
  const outOfStockCount = products.filter((p) => p.stock === 0).length
  const lowStockCount = lowStockProducts.length

  // Daily revenue (last 30 days)
  const dailyMap = new Map<string, { revenue: number; tx: number }>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(rangeEnd.getTime() - i * 24 * 60 * 60 * 1000)
    dailyMap.set(d.toISOString().slice(0, 10), { revenue: 0, tx: 0 })
  }
  for (const s of sales) {
    const day = new Date(s.createdAt).toISOString().slice(0, 10)
    const cur = dailyMap.get(day)
    if (cur) {
      cur.revenue += s.total
      cur.tx += 1
    }
  }
  const dailyRevenue = Array.from(dailyMap.entries()).map(([date, v]) => ({
    date, revenue: v.revenue, tx: v.tx,
  }))

  // Payment method mix
  const methodMap = new Map<string, { count: number; revenue: number }>()
  for (const s of sales) {
    const cur = methodMap.get(s.paymentMethod) ?? { count: 0, revenue: 0 }
    cur.count += 1
    cur.revenue += s.total
    methodMap.set(s.paymentMethod, cur)
  }
  const paymentMethodMix = Array.from(methodMap.entries()).map(([method, v]) => ({
    method, count: v.count, revenue: v.revenue,
  }))

  // Top products (by revenue) — matched with current stock
  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const it of saleItems) {
    const cur = itemMap.get(it.name) ?? { name: it.name, qty: 0, revenue: 0 }
    cur.qty += it.qty
    cur.revenue += it.lineTotal
    itemMap.set(it.name, cur)
  }
  const topProductList = Array.from(itemMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
  const topProducts = topProductList.map((p) => {
    const prodMatch = products.find((pr) => pr.name === p.name)
    return { ...p, currentStock: prodMatch?.stock ?? 0 }
  })

  // Stock turnover (sold vs current stock) — days of cover
  const daysInRange = Math.max(
    1,
    Math.round((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)),
  )
  const stockTurnover = topProductList.map((p) => {
    const prodMatch = products.find((pr) => pr.name === p.name)
    const currentStock = prodMatch?.stock ?? 0
    const dailyRate = p.qty / daysInRange
    const daysOfCover = dailyRate > 0 ? Math.round(currentStock / dailyRate) : null
    return {
      name: p.name,
      soldQty: p.qty,
      currentStock,
      daysOfCover,
    }
  })

  // Cashier performance
  const cashierUsers = cashierIds.length > 0
    ? await db.user.findMany({
      where: { id: { in: cashierIds } },
      select: { id: true, name: true },
    })
    : []
  const cashierMap = new Map<string, { userId: string; name: string; txCount: number; totalRevenue: number }>()
  for (const u of cashierUsers) {
    cashierMap.set(u.id, { userId: u.id, name: u.name, txCount: 0, totalRevenue: 0 })
  }
  for (const s of sales) {
    if (!s.userId) continue
    const cur = cashierMap.get(s.userId)
    if (cur) {
      cur.txCount += 1
      cur.totalRevenue += s.total
    }
  }
  const cashierPerformance = Array.from(cashierMap.values()).map((c) => ({
    ...c,
    avgBasket: c.txCount > 0 ? c.totalRevenue / c.txCount : 0,
  })).sort((a, b) => b.totalRevenue - a.totalRevenue)

  return {
    sector: 'market',
    market: {
      marketNames: markets.map((m) => m.name),
      totalMarkets: markets.length,
      totalRevenue,
      totalTx,
      avgBasket,
      lowStockCount,
      outOfStockCount,
      dailyRevenue,
      paymentMethodMix,
      topProducts,
      stockTurnover,
      cashierPerformance,
      lowStockProducts,
    },
  }
}

// ============================================================
// SITE — Şikayet kategori breakdown, ortalama çözüm süresi,
// aidat tahsilat (6 ay), sakin büyümesi, personel iş yükü
// ============================================================
export async function getSiteReportsData(
  tenantId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{
  sector: 'site'
  site: {
    siteNames: string[]
    totalSites: number
    residentsCount: number
    apartmentsCount: number
    staffCount: number
    collectionRate: number
    totalDuesExpected: number
    totalDuesCollected: number
    monthlyCollection: { month: string; collected: number; expected: number }[]
    complaintStats: {
      total: number
      open: number
      resolved: number
      avgResolutionHours: number | null
      byCategory: { category: string; count: number; avgHours: number }[]
      byPriority: { priority: string; count: number }[]
    }
    residentGrowth: { month: string; newResidents: number; cumulative: number }[]
    staffWorkload: { userId: string; name: string; assignedComplaints: number; resolvedComplaints: number }[]
  }
}> {
  const sites = await db.site.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, defaultDueAmount: true, currency: true },
  })
  const siteIds = sites.map((s) => s.id)

  if (siteIds.length === 0) {
    return {
      sector: 'site',
      site: {
        siteNames: [],
        totalSites: 0,
        residentsCount: 0,
        apartmentsCount: 0,
        staffCount: 0,
        collectionRate: 0,
        totalDuesExpected: 0,
        totalDuesCollected: 0,
        monthlyCollection: [],
        complaintStats: {
          total: 0, open: 0, resolved: 0, avgResolutionHours: null,
          byCategory: [], byPriority: [],
        },
        residentGrowth: [],
        staffWorkload: [],
      },
    }
  }

  const [allDues, residentsCount, apartmentsCount, staffCount, complaints, residents, staff] = await Promise.all([
    db.dues.findMany({
      where: { siteId: { in: siteIds } },
      select: {
        id: true, amount: true, paidAmount: true, status: true,
        paidDate: true, dueDate: true, month: true, year: true,
      },
    }),
    db.resident.count({ where: { tenantId, isActive: true } }),
    db.apartment.count({ where: { siteId: { in: siteIds } } }),
    db.siteStaff.count({ where: { siteId: { in: siteIds }, isActive: true } }),
    db.complaint.findMany({
      where: { siteId: { in: siteIds } },
      select: {
        id: true, siteId: true, category: true, priority: true, status: true,
        createdAt: true, respondedAt: true, updatedAt: true,
      },
    }),
    db.resident.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, createdAt: true },
    }),
    db.siteStaff.findMany({
      where: { siteId: { in: siteIds }, isActive: true },
      select: { id: true, name: true, role: true, siteId: true },
    }),
  ])

  // === Dues / collection ===
  const totalDuesExpected = allDues.reduce((s, d) => s + d.amount, 0)
  const totalDuesCollected = allDues.reduce((s, d) => s + (d.paidAmount ?? 0), 0)
  const collectionRate = totalDuesExpected > 0
    ? (totalDuesCollected / totalDuesExpected) * 100
    : 0

  // Monthly collection (last 6 months by paidDate or dueDate)
  const monthlyCollectionMap = new Map<string, { collected: number; expected: number }>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() - i, 1)
    const key = monthLabel(d.getMonth())
    monthlyCollectionMap.set(key, { collected: 0, expected: 0 })
  }
  for (const d of allDues) {
    // expected by dueDate month
    if (d.dueDate) {
      const dd = new Date(d.dueDate)
      const sixMonthsAgo = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() - 5, 1)
      if (dd >= sixMonthsAgo && dd <= rangeEnd) {
        const key = monthLabel(dd.getMonth())
        const cur = monthlyCollectionMap.get(key)
        if (cur) cur.expected += d.amount
      }
    }
    // collected by paidDate month
    if (d.paidDate) {
      const pd = new Date(d.paidDate)
      const sixMonthsAgo = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() - 5, 1)
      if (pd >= sixMonthsAgo && pd <= rangeEnd) {
        const key = monthLabel(pd.getMonth())
        const cur = monthlyCollectionMap.get(key)
        if (cur) cur.collected += d.paidAmount ?? 0
      }
    }
  }
  const monthlyCollection = Array.from(monthlyCollectionMap.entries()).map(([month, v]) => ({
    month, collected: v.collected, expected: v.expected,
  }))

  // === Complaint stats ===
  const totalComplaints = complaints.length
  const openComplaints = complaints.filter((c) => c.status === 'acik' || c.status === 'inceleniyor').length
  const resolvedComplaints = complaints.filter((c) => c.status === 'cozuldu').length

  // Average resolution time (respondedAt - createdAt) for resolved complaints
  const resolutionTimes: number[] = []
  for (const c of complaints) {
    if (c.status === 'cozuldu') {
      const resolvedAt = c.respondedAt ?? c.updatedAt
      const hours = (resolvedAt.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60)
      if (hours >= 0) resolutionTimes.push(hours)
    }
  }
  const avgResolutionHours = resolutionTimes.length > 0
    ? Math.round((resolutionTimes.reduce((s, h) => s + h, 0) / resolutionTimes.length) * 10) / 10
    : null

  // Complaint by category
  const catMap = new Map<string, { count: number; hoursSum: number; resolvedCount: number }>()
  for (const c of complaints) {
    const cur = catMap.get(c.category) ?? { count: 0, hoursSum: 0, resolvedCount: 0 }
    cur.count += 1
    if (c.status === 'cozuldu') {
      const resolvedAt = c.respondedAt ?? c.updatedAt
      const hours = (resolvedAt.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60)
      if (hours >= 0) {
        cur.hoursSum += hours
        cur.resolvedCount += 1
      }
    }
    catMap.set(c.category, cur)
  }
  const byCategory = Array.from(catMap.entries()).map(([category, v]) => ({
    category,
    count: v.count,
    avgHours: v.resolvedCount > 0 ? Math.round((v.hoursSum / v.resolvedCount) * 10) / 10 : 0,
  })).sort((a, b) => b.count - a.count)

  // Complaint by priority
  const prioMap = new Map<string, number>()
  for (const c of complaints) {
    prioMap.set(c.priority, (prioMap.get(c.priority) ?? 0) + 1)
  }
  const byPriority = Array.from(prioMap.entries()).map(([priority, count]) => ({
    priority, count,
  })).sort((a, b) => b.count - a.count)

  // === Resident growth (last 12 months cumulative) ===
  const residentGrowthMap = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() - i, 1)
    const key = `${monthLabel(d.getMonth())} ${String(d.getFullYear()).slice(2)}`
    residentGrowthMap.set(key, 0)
  }
  for (const r of residents) {
    const rd = new Date(r.createdAt)
    const twelveMonthsAgo = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() - 11, 1)
    if (rd >= twelveMonthsAgo && rd <= rangeEnd) {
      const key = `${monthLabel(rd.getMonth())} ${String(rd.getFullYear()).slice(2)}`
      const cur = residentGrowthMap.get(key)
      if (cur !== undefined) residentGrowthMap.set(key, cur + 1)
    }
  }
  let runningTotal = Math.max(
    0,
    residents.filter((r) => new Date(r.createdAt) < new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() - 11, 1)).length,
  )
  const residentGrowth = Array.from(residentGrowthMap.entries()).map(([month, newResidents]) => {
    runningTotal += newResidents
    return { month, newResidents, cumulative: runningTotal }
  })

  // === Staff workload ===
  // Şemada Complaint.assigneeId olmadığı için, personel başına düşen
  // ortalama yükü site bazında eşit dağıtıyoruz (gerçek assigneeId yok).
  const staffWorkload = staff.map((s) => {
    const siteComplaints = complaints.filter((c) => c.siteId === s.siteId)
    const total = siteComplaints.length
    const resolved = siteComplaints.filter((c) => c.status === 'cozuldu').length
    const siteStaffCount = staff.filter((st) => st.siteId === s.siteId).length || 1
    return {
      userId: s.id,
      name: s.name,
      assignedComplaints: Math.round(total / siteStaffCount),
      resolvedComplaints: Math.round(resolved / siteStaffCount),
    }
  })

  return {
    sector: 'site',
    site: {
      siteNames: sites.map((s) => s.name),
      totalSites: sites.length,
      residentsCount,
      apartmentsCount,
      staffCount,
      collectionRate,
      totalDuesExpected,
      totalDuesCollected,
      monthlyCollection,
      complaintStats: {
        total: totalComplaints,
        open: openComplaints,
        resolved: resolvedComplaints,
        avgResolutionHours,
        byCategory,
        byPriority,
      },
      residentGrowth,
      staffWorkload,
    },
  }
}

// ============================================================
// APPOINTMENTS — Günlük volume, no-show, hizmet bazlı ciro,
// personel performansı, yoğun saatler
// ============================================================
export async function getAppointmentReportsData(
  tenantId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{
  sector: 'appointments'
  appointments: {
    providerNames: string[]
    totalCount: number
    completedCount: number
    cancelledCount: number
    noShowCount: number
    noShowRate: number
    totalRevenue: number
    dailyAppointments: { date: string; count: number; revenue: number }[]
    revenueByService: { name: string; count: number; revenue: number; avgPrice: number }[]
    staffPerformance: { userId: string; name: string; total: number; completed: number; cancelled: number; noShow: number; revenue: number }[]
    busyHours: { dayOfWeek: number; hour: number; count: number }[]
  }
}> {
  const providers = await db.serviceProvider.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, type: true },
  })
  const providerIds = providers.map((p) => p.id)

  if (providerIds.length === 0) {
    return {
      sector: 'appointments',
      appointments: {
        providerNames: [],
        totalCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        noShowCount: 0,
        noShowRate: 0,
        totalRevenue: 0,
        dailyAppointments: [],
        revenueByService: [],
        staffPerformance: [],
        busyHours: [],
      },
    }
  }

  const appointments = await db.appointment.findMany({
    where: {
      providerId: { in: providerIds },
      date: { gte: rangeStart, lt: rangeEnd },
    },
    select: {
      id: true, status: true, price: true, date: true,
      staffId: true, serviceId: true,
      service: { select: { name: true } },
      staff: { select: { id: true, name: true } },
    },
  })

  const totalCount = appointments.length
  const completedCount = appointments.filter((a) => a.status === 'tamamlandi').length
  const cancelledCount = appointments.filter((a) => a.status === 'iptal').length
  const noShowCount = appointments.filter((a) => a.status === 'gelmedi').length
  // No-show rate = no-show / (completed + no-show) — iptal dahil değil
  const completedOrNoShow = completedCount + noShowCount
  const noShowRate = completedOrNoShow > 0
    ? Math.round((noShowCount / completedOrNoShow) * 100)
    : 0
  const totalRevenue = appointments
    .filter((a) => a.status === 'tamamlandi')
    .reduce((s, a) => s + a.price, 0)

  // Daily appointments (last 30 days)
  const dailyMap = new Map<string, { count: number; revenue: number }>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(rangeEnd.getTime() - i * 24 * 60 * 60 * 1000)
    dailyMap.set(d.toISOString().slice(0, 10), { count: 0, revenue: 0 })
  }
  for (const a of appointments) {
    const day = new Date(a.date).toISOString().slice(0, 10)
    const cur = dailyMap.get(day)
    if (cur) {
      cur.count += 1
      if (a.status === 'tamamlandi') cur.revenue += a.price
    }
  }
  const dailyAppointments = Array.from(dailyMap.entries()).map(([date, v]) => ({
    date, count: v.count, revenue: v.revenue,
  }))

  // Revenue by service
  const serviceMap = new Map<string, { name: string; count: number; revenue: number }>()
  for (const a of appointments) {
    if (a.status !== 'tamamlandi') continue
    const name = a.service?.name ?? 'Genel Hizmet'
    const cur = serviceMap.get(name) ?? { name, count: 0, revenue: 0 }
    cur.count += 1
    cur.revenue += a.price
    serviceMap.set(name, cur)
  }
  const revenueByService = Array.from(serviceMap.values())
    .map((s) => ({
      ...s,
      avgPrice: s.count > 0 ? s.revenue / s.count : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Staff performance
  const staffAggMap = new Map<string, { userId: string; name: string; total: number; completed: number; cancelled: number; noShow: number; revenue: number }>()
  for (const a of appointments) {
    if (!a.staffId || !a.staff) continue
    const cur = staffAggMap.get(a.staffId) ?? {
      userId: a.staffId, name: a.staff.name,
      total: 0, completed: 0, cancelled: 0, noShow: 0, revenue: 0,
    }
    cur.total += 1
    if (a.status === 'tamamlandi') {
      cur.completed += 1
      cur.revenue += a.price
    } else if (a.status === 'iptal') {
      cur.cancelled += 1
    } else if (a.status === 'gelmedi') {
      cur.noShow += 1
    }
    staffAggMap.set(a.staffId, cur)
  }
  const staffPerformance = Array.from(staffAggMap.values())
    .sort((a, b) => b.total - a.total)

  // Busy hours (7x24 grid — only count all appointments)
  const busyMap = new Map<string, number>()
  for (const a of appointments) {
    const d = new Date(a.date)
    const dayOfWeek = d.getDay()
    const hour = d.getHours()
    const key = `${dayOfWeek}-${hour}`
    busyMap.set(key, (busyMap.get(key) ?? 0) + 1)
  }
  const busyHours = Array.from(busyMap.entries()).map(([k, count]) => {
    const [dayOfWeek, hour] = k.split('-').map(Number)
    return { dayOfWeek, hour, count }
  })

  return {
    sector: 'appointments',
    appointments: {
      providerNames: providers.map((p) => p.name),
      totalCount,
      completedCount,
      cancelledCount,
      noShowCount,
      noShowRate,
      totalRevenue,
      dailyAppointments,
      revenueByService,
      staffPerformance,
      busyHours,
    },
  }
}

// ============================================================
// Tarih aralığı hesaplama — URL parametresine göre
// ============================================================
export function computeRange(range: string, now: Date = new Date()): { rangeStart: Date; rangeEnd: Date } {
  const rangeEnd = new Date(now)
  let rangeStart: Date

  switch (range) {
    case '7d':
      rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case '30d':
      rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    case '90d':
      rangeStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      break
    case '6m':
      rangeStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      break
    case '1y':
      rangeStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      break
    case 'all':
    default:
      // 10 yıl öncesinden başla — tüm veriyi kapsar
      rangeStart = new Date(now.getFullYear() - 10, 0, 1)
      break
  }

  return { rangeStart, rangeEnd }
}
