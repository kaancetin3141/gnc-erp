import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_METHODS = ['cash', 'card', 'online']

// ============================================================
// POST — ödeme ekle
// Body: { amount, method }
// Tamamı ödendiğinde: order.status='odendi', table.status='bos'
// ============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.manage')
  if (permErr) return permErr

  const { id, orderId } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Kafe bulunamadı', 404)

  const order = await db.cafeOrder.findUnique({
    where: { id: orderId },
    include: {
      payments: true,
      items: { select: { id: true, status: true } },
    },
  })
  if (!order || order.cafeId !== id) return err('Sipariş bulunamadı', 404)
  if (order.status === 'odendi') return err('Sipariş zaten ödendi', 400)
  if (order.status === 'iptal') return err('İptal edilmiş siparişe ödeme alınamaz', 400)

  const body = await req.json()
  const { amount, method } = body as { amount?: number; method?: string }
  if (typeof amount !== 'number' || amount <= 0) return err('Geçerli tutar gerekli', 400)
  if (!method || !VALID_METHODS.includes(method)) return err('Geçersiz ödeme yöntemi', 400)

  // Toplam ödenen
  const paid = order.payments
    .filter((p) => p.status === 'tamamlandi')
    .reduce((s, p) => s + p.amount, 0)
  const remaining = order.total - paid
  if (amount > remaining + 0.01) {
    return err(`Maksimum ${remaining.toFixed(2)} ödeme alınabilir`, 400)
  }

  const payment = await db.cafePayment.create({
    data: {
      orderId,
      amount,
      method,
      status: 'tamamlandi',
    },
  })

  // Toplam ödeme total'e eşit veya fazlaysa siparişi kapat
  const newPaid = paid + amount
  const isPaidOff = newPaid >= order.total - 0.01

  if (isPaidOff) {
    await db.cafeOrder.update({
      where: { id: orderId },
      data: { status: 'odendi' },
    })
    // Masayı boşalt
    if (order.tableId) {
      await db.cafeTable.update({
        where: { id: order.tableId },
        data: { status: 'bos' },
      })
    }
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'cafe_payment',
    entityId: payment.id,
    after: { orderId, amount, method, paidOff: isPaidOff },
  })

  return ok({ payment, paidOff: isPaidOff, totalPaid: newPaid, total: order.total, remaining: Math.max(0, order.total - newPaid) })
}
