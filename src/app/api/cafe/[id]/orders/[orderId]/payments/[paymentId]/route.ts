import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// DELETE — ÖDEME İADESİ (K3)
// Ödenmiş adisyondaki bir ödemeyi 'iade' durumuna çeker:
//   · CafePayment.status: 'tamamlandi' → 'iade'
//   · Kasa hareketi ters kayıt girer (gider — Kafe İadesi)
//   · İade sonrası kalan ödeme tutarı adisyonu kapatmıyorsa
//     adisyon yeniden AÇILIR ve masa tekrar dolu işaretlenir
//   · İptal edilmiş siparişin ödemesi de iade edilebilir (para
//     müşteriye geri verilir)
// ============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string; paymentId: string }> },
) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.manage')
  if (permErr) return permErr

  const { id, orderId, paymentId } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Kafe bulunamadı', 404)

  const order = await db.cafeOrder.findUnique({
    where: { id: orderId },
    include: { payments: true },
  })
  if (!order || order.cafeId !== id) return err('Sipariş bulunamadı', 404)

  const payment = order.payments.find((p) => p.id === paymentId)
  if (!payment) return err('Ödeme bulunamadı', 404)
  if (payment.status === 'iade') return err('Bu ödeme zaten iade edilmiş', 400)

  // Ödemeyi iade et + kasa ters kaydı
  await db.$transaction(async (tx) => {
    await tx.cafePayment.update({
      where: { id: paymentId },
      data: { status: 'iade' },
    })
    // Kasa ters kaydı: iade edilen para çekmeceden/bankadan çıkar
    const wantType = payment.method === 'cash' ? 'kasa' : 'banka'
    let account = await tx.cashAccount.findFirst({
      where: { tenantId: user!.tenantId, type: wantType, archived: false },
      orderBy: { createdAt: 'asc' },
    })
    if (!account) {
      account = await tx.cashAccount.create({
        data: {
          tenantId: user!.tenantId,
          name: wantType === 'kasa' ? 'Ana Kasa' : 'Banka / Kart',
          type: wantType,
        },
      })
    }
    const methodLabel = payment.method === 'cash' ? 'Nakit' : payment.method === 'card' ? 'Kart' : 'Online'
    await tx.cashTransaction.create({
      data: {
        tenantId: user!.tenantId,
        accountId: account.id,
        type: 'gider',
        category: 'Kafe İadesi',
        amount: payment.amount,
        description: `${methodLabel} iade — Adisyon ${order.number}`,
        refType: 'cafe_payment_refund',
        refId: paymentId,
        userId: user!.id,
      },
    })
  })

  // Adisyon kapanmıştı ve artık tam ödenmiyor mu? → yeniden aç
  // DİKKAT: order.payments işlem öncesi çekilmişti — iade edilen ödeme hâlâ
  // 'tamamlandi' görünür. Bu yüzden iade edilen ödeme id'si hariç tutulur;
  // aksi halde adisyon yeniden açılmaz ve remaining yanlış döner (stale data).
  const remainingPaid = order.payments
    .filter((p) => p.id !== paymentId && p.status === 'tamamlandi')
    .reduce((s, p) => s + p.amount, 0)
  const stillPaidOff = remainingPaid >= order.total - 0.01

  let reopened = false
  if (order.status === 'odendi' && !stillPaidOff) {
    await db.cafeOrder.update({
      where: { id: orderId },
      data: { status: 'hazir' },
    })
    // Masayı yeniden dolu işaretle (boşsa)
    if (order.tableId) {
      const table = await db.cafeTable.findUnique({ where: { id: order.tableId } })
      if (table && table.status === 'bos') {
        await db.cafeTable.update({
          where: { id: order.tableId },
          data: { status: 'siparis' },
        })
      }
    }
    reopened = true
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'refund',
    entity: 'cafe_payment',
    entityId: paymentId,
    before: { status: 'tamamlandi', amount: payment.amount },
    after: { status: 'iade', reopened },
  })

  return ok({
    refunded: true,
    reopened,
    totalPaid: remainingPaid,
    total: order.total,
    remaining: Math.max(0, order.total - remainingPaid),
  })
}
