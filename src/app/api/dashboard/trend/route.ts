import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok } from '@/lib/api-utils'
import { isSuperAdmin } from '@/lib/rbac'

// GET /api/dashboard/trend — Sevk & Sipariş Trendi (hafif, bağımsız uç)
// · 12 aylık trend: aylık yeni sipariş adedi, sevk edilen irsaliye, TRY ciro
// · Filtre: ?customerId=... (opsiyonel — şirket bazlı trend)
// · Yalnızca CRM sektörü için anlamlı; depo rolü kısıtlı
// · GİZLİLİK: ciro yalnızca invoices.view/erp.manage yetkisinde döner
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const customerId = url.searchParams.get('customerId') || ''

  // Depo rolü kısıtlı — trend vermez (dashboard ile aynı gizlilik)
  if (user!.role === 'stock') {
    return ok({
      trend: [],
      customers: [],
      canSeeAmounts: false,
      restricted: true,
    })
  }

  const canSeeAmounts =
    user!.permissions.includes('invoices.view') || user!.permissions.includes('erp.manage')

  const now = new Date()
  const trendStart = new Date(now.getFullYear(), now.getMonth() - 11, 1)

  // SUPERADMIN (Program Admini): platform geneli — tüm şirketlerin trendi
  const scopeTenant = isSuperAdmin(user!.role) ? undefined : user!.tenantId

  // Filtrelenen müşterinin bu tenant'a ait olduğunu doğrula
  let validCustomerId: string | undefined
  if (customerId) {
    const customer = await db.customer.findFirst({
      where: { id: customerId, ...(scopeTenant ? { tenantId: scopeTenant } : {}) },
      select: { id: true },
    })
    validCustomerId = customer?.id
  }

  const customerFilter = validCustomerId ? { customerId: validCustomerId } : {}

  // Fatura sorgusu ayrı tutulur: koşullu spread `Promise.all` içinde pozisyon
  // tiplerini bozar ve union tipler çıkarır — bu yüzden bağımsız promise olarak
  // yazıldı (tutar görmeyen roller boş dizi alır).
  const invoicesPromise: Promise<{ issueDate: Date; total: number; currency: string }[]> =
    canSeeAmounts
      ? db.invoice.findMany({
          where: {
            ...(scopeTenant ? { tenantId: scopeTenant } : {}),
            status: { not: 'iptal' },
            issueDate: { gte: trendStart },
            ...customerFilter,
          },
          select: { issueDate: true, total: true, currency: true },
        })
      : Promise.resolve([])

  const [orders, irsaliyes, filterCustomers, invoices] = await Promise.all([
    // Trend — siparişler (aylık adet)
    db.order.findMany({
      where: {
        ...(scopeTenant ? { tenantId: scopeTenant } : {}),
        orderDate: { gte: trendStart },
        ...customerFilter,
      },
      select: { orderDate: true },
    }),
    // Trend — sevk edilen irsaliyeler
    db.irsaliye.findMany({
      where: {
        ...(scopeTenant ? { tenantId: scopeTenant } : {}),
        status: { in: ['sevk_edildi', 'teslim_edildi'] },
        date: { gte: trendStart },
        ...customerFilter,
      },
      select: { date: true },
    }),
    // Filtre listesi — 12 ayda siparişi olan müşteriler (filtresiz)
    db.order.findMany({
      where: {
        ...(scopeTenant ? { tenantId: scopeTenant } : {}),
        orderDate: { gte: trendStart },
      },
      select: {
        customerId: true,
        customer: { select: { id: true, name: true, city: true, segment: true } },
      },
      distinct: ['customerId'],
    }),
    invoicesPromise,
  ])

  // 12 aylık bucket'lar
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
  for (const o of orders) {
    const b = bucketOf(o.orderDate)
    if (b) b.orders += 1
  }
  for (const irs of irsaliyes) {
    const b = bucketOf(irs.date)
    if (b) b.shipped += 1
  }
  // Ciro: TRY bazına sabit kurlarla (demo)
  const FX_TO_TRY: Record<string, number> = { TRY: 1, USD: 42, EUR: 45, GBP: 52 }
  for (const inv of invoices) {
    const b = bucketOf(inv.issueDate)
    if (b) b.revenue += inv.total * (FX_TO_TRY[inv.currency] ?? 1)
  }

  const trend = trendBuckets.map((b) => ({
    label: b.label,
    orders: b.orders,
    shipped: b.shipped,
    revenue: canSeeAmounts ? Math.round(b.revenue) : undefined,
  }))

  // Müşteri filtre listesi — isme göre sıralı; aynı isimli müşteriler
  // şehir/segment ekiyle ayırt edilir (ör. "Uludağ A.Ş. — Ankara/vip")
  const customerMap = new Map<string, { name: string; city: string | null; segment: string | null }>()
  for (const o of filterCustomers) {
    if (o.customer) {
      customerMap.set(o.customer.id, {
        name: o.customer.name,
        city: o.customer.city,
        segment: o.customer.segment,
      })
    }
  }
  const nameCounts = new Map<string, number>()
  for (const c of customerMap.values()) nameCounts.set(c.name, (nameCounts.get(c.name) ?? 0) + 1)
  const customers = Array.from(customerMap.entries())
    .map(([id, c]) => {
      const needsSuffix = (nameCounts.get(c.name) ?? 0) > 1
      const suffixBits = needsSuffix ? [c.city, c.segment === 'vip' ? 'vip' : null].filter(Boolean) : []
      return {
        id,
        name: suffixBits.length ? `${c.name} (${suffixBits.join(' · ')})` : c.name,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  return ok({
    trend,
    customers,
    canSeeAmounts,
    customerId: validCustomerId ?? null,
  })
}
