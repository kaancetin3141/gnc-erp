import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requirePermission, ok, err,
  getVisibilityFilter, tenantScope,
} from '@/lib/api-utils'
import { getTenantSector } from '@/lib/tenant-sector'
import {
  getCafeReportsData, getMarketReportsData,
  getSiteReportsData, getAppointmentReportsData,
  computeRange,
} from '@/lib/reports-sectors'

// GET — rapor verileri (agregat) — sektör bazlı dispatch
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'reports.view')
  if (permErr) return permErr

  // PRIVACY-TEMPLATES (#3): depo rolü satış/müşteri raporlarını GÖREMEZ
  if (user!.role === 'stock') {
    return err('Depo rolü için raporlara erişim kısıtlıdır', 403)
  }

  // Sektör tespiti — tenant adından
  const sector = getTenantSector(user!.tenant.name)

  // Tarih aralığı parametresi (7d | 30d | 90d | 6m | 1y | all)
  const url = new URL(req.url)
  const range = url.searchParams.get('range') || '6m'
  const { rangeStart, rangeEnd } = computeRange(range)

  // === CRM sektörü — mevcut tüm sorgular ===
  if (sector === 'crm') {
    const crmData = await getCrmReportsData(user!, rangeStart, rangeEnd)
    return ok({ sector, range, ...crmData })
  }

  // === CRM dışı sektörler — sektör-bazlı fetcher ===
  const tenantId = user!.tenantId

  let sectorData:
    | Awaited<ReturnType<typeof getCafeReportsData>>
    | Awaited<ReturnType<typeof getMarketReportsData>>
    | Awaited<ReturnType<typeof getSiteReportsData>>
    | Awaited<ReturnType<typeof getAppointmentReportsData>>

  if (sector === 'cafe') {
    sectorData = await getCafeReportsData(tenantId, rangeStart, rangeEnd)
  } else if (sector === 'market') {
    sectorData = await getMarketReportsData(tenantId, rangeStart, rangeEnd)
  } else if (sector === 'site') {
    sectorData = await getSiteReportsData(tenantId, rangeStart, rangeEnd)
  } else {
    // appointments
    sectorData = await getAppointmentReportsData(tenantId, rangeStart, rangeEnd)
  }

  // CRM alanlarını backward-compat için null/0 döndür (frontend dispatch sector'e göre)
  return ok({
    ...sectorData,
    range,
    // CRM backward-compat alanları (null/0 — frontend sector'a göre dispatch eder)
    pipeline: [],
    totalPipelineValue: 0,
    winRate: 0,
    wonCount: 0,
    lostCount: 0,
    lossReasons: [],
    revenueByMonth: [],
    totalRevenue: 0,
    topCustomers: [],
    staleCustomersCount: 0,
    staleCustomers: [],
    mapsLeadConversion: {
      totalLeads: 0,
      contactedCount: 0,
      qualifiedCount: 0,
      convertedCount: 0,
      conversionRate: 0,
      byCity: [],
    },
    activityByType: [],
    activitiesOverTime: [],
    repPerformance: [],
    erp: null,
  })
}

// ============================================================
// CRM rapor verisi — mevcut tüm sorgular (refactor öncesi ile birebir)
// rangeStart/rangeEnd artık gerçek sorgularda kullanılıyor
// ============================================================
async function getCrmReportsData(
  user: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const visFilter = await getVisibilityFilter(user)

  // Görünür kullanıcı ID'leri (yoksa undefined → tüm tenant)
  const visibleUserIds: string[] | undefined = visFilter.ownerId?.in

  // Filter helpers — her varlık için uygun alan
  const dealFilter = {
    ...tenantScope(user),
    ...(visibleUserIds ? { ownerId: { in: visibleUserIds } } : {}),
  }
  const customerFilter = {
    ...tenantScope(user),
    ...(visibleUserIds ? { ownerId: { in: visibleUserIds } } : {}),
  }
  const leadFilter = {
    ...tenantScope(user),
    ...(visibleUserIds ? { ownerId: { in: visibleUserIds } } : {}),
  }
  const activityFilter = {
    ...tenantScope(user),
    ...(visibleUserIds ? { userId: { in: visibleUserIds } } : {}),
  }

  // Tüm fırsatları çek (pipeline + win rate + revenue + loss reasons)
  const deals = await db.deal.findMany({
    where: dealFilter,
    select: {
      id: true, stage: true, value: true, currency: true, probability: true,
      expectedCloseDate: true, updatedAt: true, ownerId: true, lossReason: true,
      customer: { select: { id: true, name: true, lastActivityAt: true } },
    },
  })

  // Pipeline summary: her stage için count + total value (TRY varsayılan)
  const stageMap = new Map<string, { count: number; totalValue: number }>()
  for (const d of deals) {
    const cur = stageMap.get(d.stage) ?? { count: 0, totalValue: 0 }
    cur.count += 1
    cur.totalValue += d.value
    stageMap.set(d.stage, cur)
  }
  const pipeline = Array.from(stageMap.entries()).map(([stage, v]) => ({
    stage,
    count: v.count,
    totalValue: v.totalValue,
  }))

  // Win rate: won / (won + lost)
  const won = deals.filter((d) => d.stage === 'kazanıldı')
  const lost = deals.filter((d) => d.stage === 'kaybedildi')
  const winRate = won.length + lost.length > 0
    ? Math.round((won.length / (won.length + lost.length)) * 100)
    : 0

  // Loss reasons breakdown (kayıp fırsatlar)
  const lossReasonMap = new Map<string, number>()
  for (const d of lost) {
    const reason = d.lossReason || 'Belirtilmemiş'
    lossReasonMap.set(reason, (lossReasonMap.get(reason) ?? 0) + 1)
  }
  const lossReasons = Array.from(lossReasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  // Revenue by month — rangeStart/rangeEnd baz alarak 6 ay penceresi
  // (Mevcut davranışı koruyoruz — son 6 ay)
  const now = new Date()
  const revenueByMonth: { month: string; total: number; count: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const monthWon = won.filter((d) => {
      const date = d.expectedCloseDate || d.updatedAt
      return date >= monthStart && date < monthEnd
    })
    const total = monthWon.reduce((sum, d) => sum + d.value, 0)
    revenueByMonth.push({
      month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
      total,
      count: monthWon.length,
    })
  }

  // Top customers by deal value (won) — only within range
  const rangeWon = won.filter((d) => {
    const date = d.expectedCloseDate || d.updatedAt
    return date >= rangeStart && date < rangeEnd
  })
  const customerTotals = new Map<string, {
    id: string; name: string; total: number; count: number; lastActivityAt: string | null
  }>()
  for (const d of rangeWon) {
    if (!d.customer) continue
    const cur = customerTotals.get(d.customer.id) ?? {
      id: d.customer.id,
      name: d.customer.name,
      total: 0,
      count: 0,
      lastActivityAt: d.customer.lastActivityAt ? d.customer.lastActivityAt.toISOString() : null,
    }
    cur.total += d.value
    cur.count += 1
    if (d.customer.lastActivityAt && (!cur.lastActivityAt || d.customer.lastActivityAt.toISOString() > cur.lastActivityAt)) {
      cur.lastActivityAt = d.customer.lastActivityAt.toISOString()
    }
    customerTotals.set(d.customer.id, cur)
  }
  const topCustomers = Array.from(customerTotals.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  // Stale customers — count + list (rangeStart penceresinde son aktivitesi olmayanlar)
  const staleDate = new Date()
  staleDate.setDate(staleDate.getDate() - 30)
  const staleWhere = {
    ...customerFilter,
    OR: [
      { lastActivityAt: { lt: staleDate } },
      { lastActivityAt: null },
    ],
  }
  const staleCustomersCount = await db.customer.count({ where: staleWhere })
  const staleCustomersRaw = await db.customer.findMany({
    where: staleWhere,
    select: {
      id: true, name: true, city: true,
      lastActivityAt: true, ownerId: true,
      owner: { select: { id: true, name: true } },
    },
    orderBy: { lastActivityAt: 'asc' },
    take: 50,
  })
  const staleCustomers = staleCustomersRaw.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    ownerId: c.ownerId,
    ownerName: c.owner?.name ?? null,
    lastActivityAt: c.lastActivityAt,
  }))

  // Maps lead conversion — funnel (total → contacted → qualified → converted)
  const mapsLeads = await db.lead.findMany({
    where: { ...leadFilter, source: 'google_maps' },
    select: { id: true, status: true, city: true },
  })
  const mapsConverted = mapsLeads.filter((l) => l.status === 'donustu').length
  const mapsContacted = mapsLeads.filter(
    (l) => l.status === 'iletisim' || l.status === 'nitelikli' || l.status === 'donustu',
  ).length
  const mapsQualified = mapsLeads.filter(
    (l) => l.status === 'nitelikli' || l.status === 'donustu',
  ).length
  const mapsConversionRate = mapsLeads.length > 0
    ? Math.round((mapsConverted / mapsLeads.length) * 100)
    : 0

  // Leads by city (top 10)
  const cityMap = new Map<string, number>()
  for (const l of mapsLeads) {
    const city = l.city || 'Bilinmiyor'
    cityMap.set(city, (cityMap.get(city) ?? 0) + 1)
  }
  const leadsByCity = Array.from(cityMap.entries())
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Activities: type breakdown + over time (range penceresinde son 30 gün)
  const activities = await db.activity.findMany({
    where: { ...activityFilter, date: { gte: rangeStart, lt: rangeEnd } },
    select: { type: true, date: true },
  })
  const activityTypeMap = new Map<string, number>()
  for (const a of activities) {
    activityTypeMap.set(a.type, (activityTypeMap.get(a.type) ?? 0) + 1)
  }
  const activityByType = Array.from(activityTypeMap.entries()).map(([type, count]) => ({
    type, count,
  }))

  // Activities over time — last 30 days grouped by day
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
  thirtyDaysAgo.setHours(0, 0, 0, 0)
  const dayMap = new Map<string, number>()
  // Tüm günleri init et (boş günleri de göster)
  for (let i = 0; i < 30; i++) {
    const day = new Date(thirtyDaysAgo)
    day.setDate(day.getDate() + i)
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    dayMap.set(key, 0)
  }
  for (const a of activities) {
    const d = new Date(a.date)
    if (d < thirtyDaysAgo) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (dayMap.has(key)) {
      dayMap.set(key, (dayMap.get(key) ?? 0) + 1)
    }
  }
  const activitiesOverTime = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }))

  // Rep performance: her görünür rep için aktivite sayısı, kazanılan fırsat, total won value
  const repIds = visibleUserIds ?? (
    await db.user.findMany({
      where: { tenantId: user.tenantId, status: 'active' },
      select: { id: true },
    })
  ).map((u) => u.id)

  const reps = await db.user.findMany({
    where: { id: { in: repIds }, tenantId: user.tenantId },
    select: { id: true, name: true, title: true, role: true },
  })

  // Rep bazlı aktivite sayısı için ayrı sorgu (userId)
  const allActivitiesForReps = await db.activity.findMany({
    where: { tenantId: user.tenantId, userId: { in: repIds } },
    select: { userId: true },
  })
  const activityCountByUser = new Map<string, number>()
  for (const a of allActivitiesForReps) {
    if (!a.userId) continue
    activityCountByUser.set(a.userId, (activityCountByUser.get(a.userId) ?? 0) + 1)
  }

  // Won deals by owner
  const wonByOwner = new Map<string, { count: number; totalValue: number }>()
  for (const d of won) {
    if (!d.ownerId) continue
    const cur = wonByOwner.get(d.ownerId) ?? { count: 0, totalValue: 0 }
    cur.count += 1
    cur.totalValue += d.value
    wonByOwner.set(d.ownerId, cur)
  }

  // Closed deals by owner (for win rate calc)
  const lostByOwner = new Map<string, number>()
  for (const d of lost) {
    if (!d.ownerId) continue
    lostByOwner.set(d.ownerId, (lostByOwner.get(d.ownerId) ?? 0) + 1)
  }

  const repPerformance = reps.map((r) => {
    const wonInfo = wonByOwner.get(r.id) ?? { count: 0, totalValue: 0 }
    const lostCount = lostByOwner.get(r.id) ?? 0
    const closedCount = wonInfo.count + lostCount
    const winRateRep = closedCount > 0 ? Math.round((wonInfo.count / closedCount) * 100) : 0
    return {
      id: r.id,
      name: r.name,
      title: r.title,
      role: r.role,
      activityCount: activityCountByUser.get(r.id) ?? 0,
      dealsWon: wonInfo.count,
      totalWonValue: wonInfo.totalValue,
      winRate: winRateRep,
    }
  }).sort((a, b) => b.totalWonValue - a.totalWonValue)

  // Toplam pipeline değeri (açık fırsatlar)
  const totalPipelineValue = deals
    .filter((d) => d.stage !== 'kazanıldı' && d.stage !== 'kaybedildi')
    .reduce((sum, d) => sum + d.value, 0)

  // Toplam ciro (kazanılan tüm fırsatlar)
  const totalRevenue = won.reduce((sum, d) => sum + d.value, 0)

  // === ERP Metrikleri ===
  const erpProducts = await db.product.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, name: true, price: true, currency: true, stock: true, minStock: true, category: true },
  })
  const stockValue = erpProducts.reduce((s, p) => s + p.price * p.stock, 0)
  const lowStockProducts = erpProducts.filter((p) => p.stock <= p.minStock)
  const outOfStockProducts = erpProducts.filter((p) => p.stock === 0)

  // Invoice metrics
  const erpInvoices = await db.invoice.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, status: true, total: true, currency: true, issueDate: true, dueDate: true, paidDate: true },
  })
  const paidInvoices = erpInvoices.filter((i) => i.status === 'odendi')
  const pendingInvoices = erpInvoices.filter((i) => i.status === 'odeme_bekliyor')
  const overdueInvoices = erpInvoices.filter((i) => i.status === 'odeme_bekliyor' && i.dueDate && new Date(i.dueDate) < new Date())
  const totalInvoiced = erpInvoices.reduce((s, i) => s + i.total, 0)
  const totalPaid = paidInvoices.reduce((s, i) => s + i.total, 0)
  const totalPending = pendingInvoices.reduce((s, i) => s + i.total, 0)
  const totalOverdue = overdueInvoices.reduce((s, i) => s + i.total, 0)

  // Quote metrics
  const erpQuotes = await db.quote.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, status: true, total: true, currency: true },
  })
  const pendingQuotes = erpQuotes.filter((q) => q.status === 'taslak' || q.status === 'gonderildi')
  const approvedQuotes = erpQuotes.filter((q) => q.status === 'onaylandi')
  const totalQuoteValue = erpQuotes.reduce((s, q) => s + q.total, 0)
  const quoteConversionRate = erpQuotes.length > 0
    ? Math.round((erpQuotes.filter((q) => q.status === 'faturalandi').length / erpQuotes.length) * 100)
    : 0

  // Monthly revenue from invoices (last 6 months, by paidDate or issueDate)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const paidInvoicesRecent = paidInvoices.filter((i) => new Date(i.paidDate || i.issueDate) >= sixMonthsAgo)
  const invoiceRevenueByMonth: { month: string; value: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const monthName = d.toLocaleDateString('tr-TR', { month: 'short' })
    const monthValue = paidInvoicesRecent
      .filter((inv) => {
        const id = new Date(inv.paidDate || inv.issueDate)
        return `${id.getFullYear()}-${String(id.getMonth() + 1).padStart(2, '0')}` === monthKey
      })
      .reduce((s, inv) => s + inv.total, 0)
    invoiceRevenueByMonth.push({ month: monthName, value: monthValue })
  }

  // Top products by stock value
  const topProductsByValue = erpProducts
    .map((p) => ({ name: p.name, stockValue: p.price * p.stock, stock: p.stock }))
    .sort((a, b) => b.stockValue - a.stockValue)
    .slice(0, 5)

  return {
    pipeline,
    totalPipelineValue,
    winRate,
    wonCount: won.length,
    lostCount: lost.length,
    lossReasons,
    revenueByMonth,
    totalRevenue,
    topCustomers,
    staleCustomersCount,
    staleCustomers,
    mapsLeadConversion: {
      totalLeads: mapsLeads.length,
      contactedCount: mapsContacted,
      qualifiedCount: mapsQualified,
      convertedCount: mapsConverted,
      conversionRate: mapsConversionRate,
      byCity: leadsByCity,
    },
    activityByType,
    activitiesOverTime,
    repPerformance,
    erp: {
      products: {
        total: erpProducts.length,
        stockValue,
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length,
        topByValue: topProductsByValue,
      },
      invoices: {
        total: erpInvoices.length,
        totalInvoiced,
        totalPaid,
        totalPending,
        totalOverdue,
        paidCount: paidInvoices.length,
        pendingCount: pendingInvoices.length,
        overdueCount: overdueInvoices.length,
        revenueByMonth: invoiceRevenueByMonth,
      },
      quotes: {
        total: erpQuotes.length,
        pendingCount: pendingQuotes.length,
        approvedCount: approvedQuotes.length,
        totalValue: totalQuoteValue,
        conversionRate: quoteConversionRate,
      },
    },
  }
}
