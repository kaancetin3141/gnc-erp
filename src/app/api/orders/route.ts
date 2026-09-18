import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err, getVisibilityFilter, safeJsonParse } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// Yardımcılar
// ============================================================

// Sipariş numarası üret: SIP-2025-001
async function generateOrderNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.order.count({ where: { tenantId } })
  return `SIP-${year}-${String(count + 1).padStart(3, '0')}`
}

const ORDER_STATUSES = ['hazirlaniyor', 'onaylandi', 'uretimde', 'sevk_yapildi', 'teslim_edildi', 'iptal']

// Depo rolü için fiyat içermeyen sade sipariş görünümü.
// Stock/depo_sorumlusu rolleri fiyat görmemeli (gizlilik).
function serializeForDepo(order: {
  id: string
  number: string
  status: string
  orderDate: Date
  expectedDelivery: Date | null
  deliveredAt: Date | null
  createdAt: Date
  updatedAt: Date
  currency: string
  notes: string | null
  tenantId: string
  customerId: string
  quoteId: string | null
  customer: { id: string; name: string; segment?: string; status?: string } | null
  quote: { id: string; number: string } | null
  invoice: { id: string; number: string; status: string; packingListNo?: string | null } | null
  irsaliyeler?: { id: string; number: string; status: string }[]
  _count?: { trackingSteps: number; productionItems?: number }
}) {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    orderDate: order.orderDate,
    expectedDelivery: order.expectedDelivery,
    deliveredAt: order.deliveredAt,
    currency: order.currency,
    notes: order.notes,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    tenantId: order.tenantId,
    customerId: order.customerId,
    quoteId: order.quoteId,
    // İlişkiler (fiyat yok)
    customer: order.customer ? {
      id: order.customer.id, name: order.customer.name,
      segment: order.customer.segment ?? null, status: order.customer.status ?? null,
    } : null,
    quote: order.quote ? { id: order.quote.id, number: order.quote.number } : null,
    invoice: order.invoice ? { id: order.invoice.id, number: order.invoice.number, status: order.invoice.status } : null,
    // İrsaliyeler — Belge Yönetimi sayfası için (fiyatsız özet)
    irsaliyeler: (order.irsaliyeler ?? []).map((i) => ({ id: i.id, number: i.number, status: i.status })),
    _count: order._count,
    // totalAmount bilinçli olarak DAHİL DEĞİL — depo fiyatı görmemeli
  }
}

// ============================================================
// GET — sipariş listesi
// ?depo=1 → depo rolü için fiyatları gizle
// 'orders.view' veya 'erp.manage' yetkisi gerekir
// ============================================================
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  if (!user) return err('Oturum açmanız gerekli', 401)

  // Yetki kontrolü — orders.view VEYA erp.manage
  const hasView = user.permissions.includes('orders.view')
  const hasManage = user.permissions.includes('erp.manage')
  if (!hasView && !hasManage) {
    return err('Bu işlem için yetkiniz yok', 403)
  }

  // Depo modu: ?depo=1 → sadece depo rolü kullanıcıları fiyat göremez
  const url = new URL(req.url)
  const depoMode = url.searchParams.get('depo') === '1'
  const isDepoRole = user.role === 'stock' || user.role === 'depo_sorumlusu'

  // Eğer depo rolü değilse ve depo=1 istediyse, normal görünüm ver
  // Eğer depo rolüyse ve depo=1 istemediyse yine de fiyatları gizle (zorunlu)
  const hidePrices = depoMode || isDepoRole

  const search = url.searchParams.get('search') || ''
  const status = url.searchParams.get('status') || ''
  const customerId = url.searchParams.get('customerId') || ''
  const limit = parseInt(url.searchParams.get('limit') || '200')
  const offset = parseInt(url.searchParams.get('offset') || '0')

  // Depo rolü tüm siparişleri görür (görünürlük filtresi yok — stok yönetimi için)
  // 'orders.view' yetkisi olanlar (müdür, depocu, admin) şirketin TÜM siparişlerini görür
  // — Belge Yönetimi sayfası şirket geneli belge erişimi gerektirir.
  // CRM rolleri (rep — yalnızca erp.manage olmadan) görünürlük filtresine tabi
  let where: Record<string, unknown> = { tenantId: user.tenantId }

  const hasCompanyWideOrders = hasView || isDepoRole // orders.view = şirket geneli belge erişimi
  if (!hasCompanyWideOrders) {
    const visFilter = await getVisibilityFilter(user)
    if (visFilter.ownerId) {
      where.customer = { ownerId: visFilter.ownerId }
    }
  }

  if (search) {
    where.OR = [
      { number: { contains: search } },
      { customer: { name: { contains: search } } },
    ]
  }
  if (status) where.status = status
  if (customerId) where.customerId = customerId

  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, segment: true, status: true, ownerId: true } },
        quote: { select: { id: true, number: true } },
        invoice: { select: { id: true, number: true, status: true, packingListNo: true } },
        irsaliyeler: { select: { id: true, number: true, status: true } },
        _count: { select: { trackingSteps: true, productionItems: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.order.count({ where }),
  ])

  // Depo modu → fiyatları gizle
  if (hidePrices) {
    return ok({
      items: items.map((o) => serializeForDepo(o)),
      total,
      limit,
      offset,
      hidePrices: true,
    })
  }

  return ok({ items, total, limit, offset })
}

// ============================================================
// POST — yeni sipariş (manuel veya proforma/teklif bağlantılı)
// ============================================================
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const body = await req.json()
  const {
    customerId, quoteId, invoiceId, totalAmount, currency,
    expectedDelivery, notes, status,
  } = body as {
    customerId?: string
    quoteId?: string
    invoiceId?: string
    totalAmount?: number | string
    currency?: string
    expectedDelivery?: string
    notes?: string
    status?: string
  }

  if (!customerId) return err('Müşteri seçimi gerekli', 400)

  const customer = await db.customer.findUnique({ where: { id: customerId } })
  if (!customer) return err('Müşteri bulunamadı', 404)
  if (customer.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  // Opsiyonel: teklif bağla
  let quoteData: { total: number; currency: string; number: string } | null = null
  if (quoteId) {
    const quote = await db.quote.findUnique({ where: { id: quoteId } })
    if (!quote) return err('Teklif bulunamadı', 404)
    if (quote.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)
    quoteData = { total: quote.total, currency: quote.currency, number: quote.number }
  }

  const finalStatus = status && ORDER_STATUSES.includes(status) ? status : 'hazirlaniyor'
  const finalAmount = totalAmount !== undefined ? Number(totalAmount) : (quoteData?.total ?? 0)
  const finalCurrency = currency || quoteData?.currency || user!.tenant.defaultCurrency || 'TRY'

  const number = await generateOrderNumber(user!.tenantId)

  const order = await db.order.create({
    data: {
      tenantId: user!.tenantId,
      customerId,
      quoteId: quoteId || null,
      number,
      status: finalStatus,
      totalAmount: isFinite(finalAmount) ? finalAmount : 0,
      currency: finalCurrency,
      orderDate: new Date(),
      expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
      notes: notes || null,
    },
    include: {
      customer: { select: { id: true, name: true } },
      trackingSteps: true,
    },
  })

  // İlk takip adımı
  await db.orderTrackingStep.create({
    data: {
      orderId: order.id,
      step: finalStatus,
      note: quoteData ? `Teklif ${quoteData.number} üzerinden oluşturuldu` : 'Manuel sipariş oluşturuldu',
      userId: user!.id,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'order',
    entityId: order.id,
    after: safeJsonParse(JSON.stringify(order), null),
  })

  return ok(order)
}
