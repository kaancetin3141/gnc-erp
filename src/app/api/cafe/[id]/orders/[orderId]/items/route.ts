import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// POST — AÇIK ADİSYONA KALEM EKLE (K5)
// Kafede en sık operasyon: "masaya bir kahve daha".
// Önceden tek yol siparişi iptal edip yeniden kurmaktı — mutfak kuyruğu
// ve ödeme geçmişi bozuluyordu.
// Body: { items: [{ menuItemId, qty, notes? }] }
// Kurallar:
//   · Sipariş AÇIK olmalı (acik | hazirlaniyor | hazir) — ödenmiş/iptal
//     adisyona kalem eklenemez
//   · Menü kalemleri aynı kafeye ait olmalı
//   · Fiyat/ad snapshot'ı ekleme anındaki menüden alınır
//   · Adisyon tutarları yeniden hesaplanır
// ============================================================
export async function POST(
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

  if (!['acik', 'hazirlaniyor', 'hazir'].includes(order.status)) {
    return err('Sadece açık adisyonlara kalem eklenebilir (mevcut durum: ' + order.status + ')', 400)
  }

  const body = await req.json()
  const { items } = body as { items?: { menuItemId: string; qty: number; notes?: string }[] }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return err('En az bir kalem gerekli', 400)
  }

  // Menü kalemlerini çöz — snapshot için
  const menuItemIds = items.map((i) => i.menuItemId)
  const menuItems = await db.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    include: { category: { select: { cafeId: true } } },
  })
  for (const mi of menuItems) {
    if (mi.category.cafeId !== id) return err('Geçersiz menü kalemi', 400)
  }
  if (menuItems.length !== menuItemIds.length) {
    return err('Bazı menü kalemleri bulunamadı', 400)
  }

  const newLines = items.map((it) => {
    const mi = menuItems.find((m) => m.id === it.menuItemId)!
    const qty = Math.max(1, Math.floor(it.qty) || 1)
    return {
      orderId,
      menuItemId: mi.id,
      name: mi.name,
      qty,
      unitPrice: mi.price,
      notes: it.notes?.trim() || null,
      station: mi.station,
      status: 'bekliyor',
    }
  })

  // Tutarları güncelle + kalemleri ekle (atomik)
  const addedItems = await db.$transaction(async (tx) => {
    await tx.cafeOrderItem.createMany({ data: newLines })

    const lines = await tx.cafeOrderItem.findMany({
      where: { orderId },
      select: { unitPrice: true, qty: true },
    })
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0)

    // Adisyon yeniden hazırlanmaya başladı — sipariş 'hazir' bile olsa
    // mutfak kuyruğuna geri döner
    const nextStatus = order.status === 'acik' ? 'acik' : 'hazirlaniyor'
    await tx.cafeOrder.update({
      where: { id: orderId },
      data: { subtotal, total: subtotal, status: nextStatus },
    })

    return tx.cafeOrderItem.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    })
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'cafe_order',
    entityId: orderId,
    after: { addedItems: newLines.map((l) => ({ name: l.name, qty: l.qty })), newTotal: addedItems.length },
  })

  return ok({ items: addedItems }, 201)
}
