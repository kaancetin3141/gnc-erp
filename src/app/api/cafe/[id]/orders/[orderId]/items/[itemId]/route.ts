import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_ITEM_STATUSES = ['bekliyor', 'hazirlaniyor', 'hazir', 'servis_edildi']

// ============================================================
// PATCH — sipariş kalemi durumu güncelle
//  barmen: 'hazirlaniyor' → 'hazir'  (bar istasyonu, kasa görür)
//  komi: 'hazir' → 'servis_edildi'   (müşteriye teslim)
//  mutfak: 'hazirlaniyor' → 'hazir'  (kitchen istasyonu)
// ============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string; itemId: string }> },
) {
  const user = await getSession(req)
  const { id, orderId, itemId } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Kafe bulunamadı', 404)

  // Yetki: barmen 'cafe.bar', komi/kasa 'cafe.kitchen', admin her ikisi de
  const hasBar = !!user && user.permissions.includes('cafe.bar')
  const hasKitchen = !!user && user.permissions.includes('cafe.kitchen')
  if (!hasBar && !hasKitchen) return err('Bu işlem için yetkiniz yok', 403)

  const order = await db.cafeOrder.findUnique({ where: { id: orderId } })
  if (!order || order.cafeId !== id) return err('Sipariş bulunamadı', 404)

  const item = await db.cafeOrderItem.findUnique({ where: { id: itemId } })
  if (!item || item.orderId !== orderId) return err('Sipariş kalemi bulunamadı', 404)

  const body = await req.json()
  const { status } = body as { status?: string }
  if (!status || !VALID_ITEM_STATUSES.includes(status)) {
    return err('Geçersiz durum', 400)
  }

  // İstasyon kontrolü — barmen sadece bar, mutfak sadece kitchen/dessert
  if (hasBar && !hasKitchen && item.station !== 'bar') {
    return err('Bu kalem bar istasyonuna ait değil', 403)
  }
  if (hasKitchen && !hasBar && item.station === 'bar') {
    return err('Bu kalem bar istasyonuna ait', 403)
  }

  // 'servis_edildi' için öncül 'hazir' olmalı (sadece komi yapar)
  if (status === 'servis_edildi' && item.status !== 'hazir') {
    return err('Kalem önce hazırlanmalı (hazir) sonra servis edilebilir', 400)
  }

  const updated = await db.cafeOrderItem.update({
    where: { id: itemId },
    data: { status },
  })

  // Siparişin tüm kalemleri 'hazir' mi? -> order.status='hazir'
  if (status === 'hazir') {
    const allItems = await db.cafeOrderItem.findMany({
      where: { orderId },
      select: { id: true, status: true },
    })
    const allReady = allItems.every((i) => i.status === 'hazir' || i.status === 'servis_edildi')
    const anyActive = allItems.some((i) => i.status !== 'servis_edildi')
    if (allReady && anyActive) {
      await db.cafeOrder.update({
        where: { id: orderId },
        data: { status: 'hazir' },
      })
    } else if (allReady && !anyActive) {
      // Tümü servis edildi — sipariş hazır/tamamlandı durumunda kalır,
      // ödeme beklenir.
      await db.cafeOrder.update({
        where: { id: orderId },
        data: { status: 'hazir' },
      })
    }
  }

  // En az bir kalem hazırlanmaya başlandıysa sipariş 'hazirlaniyor'
  if (status === 'hazirlaniyor' && order.status === 'acik') {
    await db.cafeOrder.update({
      where: { id: orderId },
      data: { status: 'hazirlaniyor' },
    })
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'cafe_order_item',
    entityId: itemId,
    before: { status: item.status },
    after: { status: updated.status },
  })

  return ok(updated)
}
