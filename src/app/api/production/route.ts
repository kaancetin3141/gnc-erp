import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err, getVisibilityFilter, tenantScope } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import type { SessionUser } from '@/types'

// ============================================================
// Yardımcılar
// ============================================================

// Stock rolü tüm üretim kalemlerini görür (müşteri sahibi filtresi yok).
// Depo_sorumlusu rolü de tüm siparişlerin üretim kalemlerini görür (irsaliye yönetimi için).
// Rep rolü: yalnızca kendi müşterilerinin siparişlerinden gelen kalemler.
// Admin / manager / superadmin: görünürlük kapsamına göre (genelde tümü).
// SUPERADMIN (Program Admini): platform geneli — tenant kısıtlaması yok (tenantScope).
function buildTenantWhere(user: SessionUser, visFilter: { ownerId?: { in: string[] } }) {
  const where: Record<string, unknown> = { ...tenantScope(user) }
  if (user.role === 'stock' || user.role === 'depo_sorumlusu') {
    // Stock/Depo tüm siparişlerin üretim kalemlerini görür — fiyat yok.
    return where
  }
  // rep / manager / admin — görünürlük filtresi uygula (customer.ownerId bazında)
  if (visFilter.ownerId) {
    where.order = { customer: { ownerId: visFilter.ownerId } }
  }
  return where
}

// Fiyat alanlarını dışarıda bırakan formatter.
// Warehouse (stock) rolü ASLA fiyat görmemeli.
function serializeItem(item: {
  id: string
  tenantId: string
  orderId: string
  productId: string | null
  description: string
  qty: number
  status: string
  producedAt: Date | null
  producedBy: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  order: { id: string; number: string; customer: { id: string; name: string } } | null
  product: { id: string; name: string; photo: string | null } | null
}) {
  return {
    id: item.id,
    tenantId: item.tenantId,
    orderId: item.orderId,
    orderNumber: item.order?.number ?? null,
    customerId: item.order?.customer?.id ?? null,
    customerName: item.order?.customer?.name ?? null,
    productId: item.productId,
    productName: item.product?.name ?? null,
    productPhoto: item.product?.photo ?? null,
    description: item.description,
    qty: item.qty,
    status: item.status,
    producedAt: item.producedAt,
    producedBy: item.producedBy,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

// ============================================================
// GET — üretim kalemleri listesi
// ============================================================
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'production.view')
  if (permErr) return permErr

  const url = new URL(req.url)
  const status = url.searchParams.get('status') || ''
  const orderId = url.searchParams.get('orderId') || ''
  const limit = parseInt(url.searchParams.get('limit') || '500')
  const offset = parseInt(url.searchParams.get('offset') || '0')

  // Stock rolü için görünürlük filtresini atla (tümünü görür).
  // Rep/manager/admin için mevcut görünürlük filtresini kullan.
  const visFilter = user!.role === 'stock'
    ? {}
    : await getVisibilityFilter(user!)

  const where: Record<string, unknown> = buildTenantWhere(user!, visFilter)
  if (status) where.status = status
  if (orderId) where.orderId = orderId

  const items = await db.productionItem.findMany({
    where,
    include: {
      order: {
        select: {
          id: true,
          number: true,
          customer: { select: { id: true, name: true } },
        },
      },
      product: { select: { id: true, name: true, photo: true } },
    },
    orderBy: [
      { status: 'asc' }, // bekliyor → uretiliyor → uretildi
      { createdAt: 'desc' },
    ],
    take: limit,
    skip: offset,
  })

  // Fiyat alanları hiç select edilmedi — serializer ile ekstra güvenlik katmanı.
  return ok({
    items: items.map(serializeItem),
    total: items.length,
    limit,
    offset,
  })
}

// ============================================================
// POST — siparişten üretim kalemleri oluştur
// Sipariş durumu 'uretimde' olduğunda çağrılır.
// Siparişin fatura veya teklif kalemlerini okuyarak her kalem için
// bir ProductionItem oluşturur (var olanları tekrar oluşturmaz).
// ============================================================
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  // Stock rolü de üretim kalemi oluşturabilir (sipariş onaylandığında)? Hayır —
  // sipariş durum değişikliği satış/erp yetkisi gerektirir. Stock yalnızca
  // mevcut kalemlerin status'ünü günceller.
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const body = await req.json()
  const { orderId } = body as { orderId?: string }
  if (!orderId) return err('orderId gerekli', 400)

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      quote: {
        include: {
          lines: { select: { id: true, productId: true, description: true, qty: true } },
        },
      },
      invoice: {
        include: {
          lines: { select: { id: true, productId: true, description: true, qty: true } },
        },
      },
    },
  })

  if (!order) return err('Sipariş bulunamadı', 404)
  if (order.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  // Aynı sipariş için zaten kalemler oluşturulmuş mu?
  const existingCount = await db.productionItem.count({
    where: { orderId: order.id, tenantId: order.tenantId },
  })
  if (existingCount > 0) {
    return err('Bu sipariş için üretim kalemleri zaten oluşturulmuş', 400)
  }

  // Fatura kalemlerini önceliklendir; yoksa teklif kalemleri
  const sourceLines =
    (order.invoice?.lines?.length ?? 0) > 0
      ? order.invoice!.lines
      : order.quote?.lines ?? []

  if (sourceLines.length === 0) {
    return err('Siparişte fatura/teklif kalemi yok — üretim kalemi oluşturulamadı', 400)
  }

  // Toplu oluşturma
  const created = await db.$transaction(
    sourceLines.map((line) =>
      db.productionItem.create({
        data: {
          // SUPERADMIN: kalem siparişin tenantına ait olmalı (çapraz-tenant tutarlılığı)
          tenantId: order.tenantId,
          orderId: order.id,
          productId: line.productId,
          description: line.description,
          qty: line.qty ?? 1,
          status: 'bekliyor',
        },
      }),
    ),
  )

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'production',
    entityId: order.id,
    after: { count: created.length, orderId: order.id },
  })

  return ok({ count: created.length, orderId: order.id })
}
