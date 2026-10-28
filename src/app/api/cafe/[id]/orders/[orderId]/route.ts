import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_ORDER_STATUSES = ['acik', 'hazirlaniyor', 'hazir', 'odendi', 'iptal']

// ============================================================
// GET — tekil sipariş (kalemler dahil)
// ============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.view')
  if (permErr) return permErr

  const { id, orderId } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Kafe bulunamadı', 404)

  const order = await db.cafeOrder.findUnique({
    where: { id: orderId },
    include: {
      table: true,
      items: {
        include: {
          menuItem: { select: { id: true, name: true, photo: true, station: true, recipe: true } },
        },
      },
      payments: true,
    },
  })
  if (!order || order.cafeId !== id) return err('Sipariş bulunamadı', 404)

  return ok(order)
}

// ============================================================
// PATCH — sipariş durumu güncelle
// Komi/kasa/admin: 'hazirlaniyor', 'hazir', 'odendi', 'iptal'
// Ödeme -> ödeme API'si üzerinden yapılır (orada 'odendi' + table 'bos').
// ============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.orders')
  if (permErr) return permErr

  const { id, orderId } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Kafe bulunamadı', 404)

  const order = await db.cafeOrder.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order || order.cafeId !== id) return err('Sipariş bulunamadı', 404)

  // DURUM MAKİNESİ KORUMASI: ödenmiş ya da zaten iptal edilmiş adisyon
  // değiştirilemez/iptal edilemez — aksi halde ödemeler havada kalır ve
  // ciro raporları ('odendi' filtreli) parayı kaybeder.
  if (['odendi', 'iptal'].includes(order.status)) {
    return err('Ödenmiş veya iptal edilmiş sipariş güncellenemez', 409)
  }

  const body = await req.json()
  const { status, notes } = body as { status?: string; notes?: string }

  const updateData: Record<string, unknown> = {}
  if (status !== undefined) {
    if (!VALID_ORDER_STATUSES.includes(status)) return err('Geçersiz durum', 400)
    // ÖDEME KAPISI (K2): 'odendi' durumu SADECE ödeme API'si üzerinden
    // set edilebilir — buradan direkt set edilirse ödemesiz kapanan adisyon
    // ciro ile ödeme türü toplamlarını ayrıştırır (nakit/kart yüzdeleri bozulur).
    if (status === 'odendi') {
      return err("'Ödendi' durumu ödeme ekranından (kasa) ayarlanmalıdır — buradan değiştirilemez", 400)
    }
    updateData.status = status
    // 'iptal' ise masayı da bosalt (sipariş varsa)
    if (status === 'iptal' && order.tableId) {
      const table = await db.cafeTable.findUnique({ where: { id: order.tableId } })
      if (table && table.status === 'siparis') {
        await db.cafeTable.update({
          where: { id: order.tableId },
          data: { status: 'bos' },
        })
      }
    }
  }
  if (notes !== undefined) updateData.notes = notes?.trim() || null

  const updated = await db.cafeOrder.update({
    where: { id: orderId },
    data: updateData,
    include: { items: true, table: true },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'cafe_order',
    entityId: orderId,
    before: { status: order.status },
    after: { status: updated.status },
  })

  return ok(updated)
}

// ============================================================
// DELETE — sipariş iptal et
// ============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.orders')
  if (permErr) return permErr

  const { id, orderId } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Kafe bulunamadı', 404)

  const order = await db.cafeOrder.findUnique({ where: { id: orderId } })
  if (!order || order.cafeId !== id) return err('Sipariş bulunamadı', 404)

  // Ödenmiş sipariş silinemez — önce ödeme iadesi yapılmalı (kasadan geri al).
  // İptal edilmiş siparişin tekrar iptali de anlamsız.
  if (order.status === 'odendi') {
    return err('Ödenmiş sipariş iptal edilemez — ödeme iadesi yapın', 409)
  }
  if (order.status === 'iptal') {
    return err('Sipariş zaten iptal edilmiş', 409)
  }

  // Siparişi 'iptal' olarak işaretle (donuk kayıt)
  await db.cafeOrder.update({
    where: { id: orderId },
    data: { status: 'iptal' },
  })

  // Masayı boşalt
  if (order.tableId) {
    const table = await db.cafeTable.findUnique({ where: { id: order.tableId } })
    if (table && table.status === 'siparis') {
      await db.cafeTable.update({
        where: { id: order.tableId },
        data: { status: 'bos' },
      })
    }
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'cancel',
    entity: 'cafe_order',
    entityId: orderId,
    before: { number: order.number, total: order.total },
  })

  return ok({ success: true })
}
