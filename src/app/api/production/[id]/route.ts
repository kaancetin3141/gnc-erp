import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err, getVisibilityFilter } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import type { SessionUser } from '@/types'

// ============================================================
// Yardımcılar
// ============================================================

const VALID_STATUSES = ['bekliyor', 'uretiliyor', 'uretildi']

// Fiyat alanlarını dışarıda bırakan formatter.
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

// Kullanıcı bu kalemi görebiliyor mu? (tenant + görünürlük kontrolü)
async function canAccessItem(user: SessionUser, item: { tenantId: string; order?: { customer?: { ownerId?: string | null } | null } | null }) {
  if (item.tenantId !== user.tenantId) return false
  // Stock tüm kalemleri görür
  if (user.role === 'stock') return true
  // Admin / superadmin tümünü görür
  if (user.role === 'admin' || user.role === 'superadmin') return true
  // manager / rep — görünürlük filtresi
  const visFilter = await getVisibilityFilter(user)
  if (!visFilter.ownerId) return true // 'all' kapsamı
  const ownerId = item.order?.customer?.ownerId
  if (!ownerId) return false
  return visFilter.ownerId.in.includes(ownerId)
}

// ============================================================
// PATCH — üretim kalemi güncelle (status / notes)
// Stock rolü 'production.manage' yetkisiyle güncelleyebilir.
// 'uretildi' durumuna geçişte producedAt + producedBy set edilir.
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'production.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.productionItem.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          id: true, number: true,
          customer: { select: { id: true, name: true, ownerId: true } },
        },
      },
      product: { select: { id: true, name: true, photo: true } },
    },
  })
  if (!existing) return err('Üretim kalemi bulunamadı', 404)

  const canAccess = await canAccessItem(user!, {
    tenantId: existing.tenantId,
    order: { customer: { ownerId: existing.order?.customer?.ownerId ?? null } },
  })
  if (!canAccess) return err('Bu kalemi güncelleme yetkiniz yok', 403)

  const body = await req.json()
  const { status, notes } = body as { status?: string; notes?: string | null }

  const updateData: Record<string, unknown> = {}

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return err('Geçersiz durum (bekliyor/uretiliyor/uretildi)', 400)
    }
    updateData.status = status
    if (status === 'uretildi' && !existing.producedAt) {
      updateData.producedAt = new Date()
      updateData.producedBy = user!.id
    }
    // Üretimden geri alındıysa producedAt/producedBy temizle
    if (status !== 'uretildi') {
      updateData.producedAt = null
      updateData.producedBy = null
    }
  }

  if (notes !== undefined) {
    updateData.notes = notes || null
  }

  const updated = await db.productionItem.update({
    where: { id },
    data: updateData,
    include: {
      order: {
        select: {
          id: true, number: true,
          customer: { select: { id: true, name: true } },
        },
      },
      product: { select: { id: true, name: true, photo: true } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'production',
    entityId: id,
    before: { status: existing.status, notes: existing.notes },
    after: { status: updated.status, notes: updated.notes, producedAt: updated.producedAt },
  })

  return ok(serializeItem(updated))
}

// ============================================================
// DELETE — üretim kalemi sil (yalnızca admin/manager)
// ============================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  // Silme: yalnızca erp.manage (admin/manager/superadmin). Stock silemez.
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.productionItem.findUnique({ where: { id } })
  if (!existing) return err('Üretim kalemi bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  await db.productionItem.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'production',
    entityId: id,
    before: { description: existing.description, orderId: existing.orderId },
  })

  return ok({ success: true })
}
