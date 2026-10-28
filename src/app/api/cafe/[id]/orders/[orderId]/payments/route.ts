import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_METHODS = ['cash', 'card', 'online']

// Kasa & Banka entegrasyonu (K1): kafe ödemesi artık genel muhasebe kasasına
// yazılır — nakit → 'kasa' hesabı, kart/online → 'banka' hesabı.
// Böylece gün sonunda "çekmecede kaç TL olmalı" sorusu Kasa modülünden
// yanıtlanabilir hale gelir.
async function writeCashEntry(opts: {
  tenantId: string
  userId: string
  paymentId: string
  orderNumber: string
  amount: number
  method: string
  type: 'gelir' | 'gider'
}) {
  try {
    const wantType = opts.method === 'cash' ? 'kasa' : 'banka'
    let account = await db.cashAccount.findFirst({
      where: { tenantId: opts.tenantId, type: wantType, archived: false },
      orderBy: { createdAt: 'asc' },
    })
    if (!account) {
      account = await db.cashAccount.create({
        data: {
          tenantId: opts.tenantId,
          name: wantType === 'kasa' ? 'Ana Kasa' : 'Banka / Kart',
          type: wantType,
        },
      })
    }
    const methodLabel = opts.method === 'cash' ? 'Nakit' : opts.method === 'card' ? 'Kart' : 'Online'
    await db.cashTransaction.create({
      data: {
        tenantId: opts.tenantId,
        accountId: account.id,
        type: opts.type,
        category: opts.type === 'gelir' ? 'Kafe Satış' : 'Kafe İadesi',
        amount: opts.amount,
        description: `${methodLabel} ödeme — Adisyon ${opts.orderNumber}`,
        refType: 'cafe_payment',
        refId: opts.paymentId,
        userId: opts.userId,
      },
    })
  } catch {
    // Kasa entegrasyonu ödeme akışını bloklamaz
  }
}

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

  // Kasa hareketi — nakit çekmeceye, kart/online bankaya girer (K1)
  await writeCashEntry({
    tenantId: user!.tenantId,
    userId: user!.id,
    paymentId: payment.id,
    orderNumber: order.number,
    amount,
    method,
    type: 'gelir',
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
