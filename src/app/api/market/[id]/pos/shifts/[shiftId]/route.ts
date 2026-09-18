import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

async function checkShift(marketId: string, shiftId: string, tenantId: string) {
  const shift = await db.posShift.findUnique({
    where: { id: shiftId },
    include: { market: true },
  })
  if (!shift || shift.marketId !== marketId || shift.market.tenantId !== tenantId) return null
  return shift
}

// ============================================================
// GET — tekil vardiya + satış özeti
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; shiftId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id, shiftId } = await params
  const shift = await checkShift(id, shiftId, user!.tenantId)
  if (!shift) return err('Vardiya bulunamadı', 404)

  const sales = await db.marketSale.findMany({
    where: { posShiftId: shiftId },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const totals = sales.reduce(
    (acc, s) => {
      if (s.type === 'satis' && s.status === 'tamamlandi') {
        acc.subtotal += s.subtotal
        acc.taxTotal += s.taxTotal
        acc.total += s.total
        acc.cashAmount += s.cashAmount
        acc.cardAmount += s.cardAmount
        acc.count += 1
      }
      return acc
    },
    { subtotal: 0, taxTotal: 0, total: 0, cashAmount: 0, cardAmount: 0, count: 0 },
  )

  return ok({ shift, sales, summary: totals })
}

// ============================================================
// PATCH — vardiya kapat (tekil)
// Body: { closingCash, notes }
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; shiftId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.pos')
  if (permErr) return permErr

  const { id, shiftId } = await params
  const shift = await checkShift(id, shiftId, user!.tenantId)
  if (!shift) return err('Vardiya bulunamadı', 404)
  if (shift.status === 'kapali') return err('Vardiya zaten kapalı', 400)

  const body = await req.json()
  const { closingCash, notes } = body as { closingCash?: number; notes?: string }

  // Beklenen nakit: açılış + nakit satışlar - nakit iadeler
  const sales = await db.marketSale.findMany({
    where: { posShiftId: shiftId, status: 'tamamlandi', type: 'satis' },
    select: { cashAmount: true, cardAmount: true, total: true },
  })

  const returns = await db.marketReturn.findMany({
    where: { sale: { posShiftId: shiftId } },
    include: { sale: { select: { paymentMethod: true, cashAmount: true, total: true } } },
  })

  const salesCash = sales.reduce((s, x) => s + (x.cashAmount || 0), 0)
  const returnsCash = returns.reduce((s, r) => {
    if (r.sale.paymentMethod === 'card') return s
    const ratio = r.sale.total ? r.totalAmount / r.sale.total : 0
    return s + (r.sale.cashAmount || 0) * ratio
  }, 0)

  const expectedCash = shift.openingCash + salesCash - returnsCash
  const actualClose = Number(closingCash ?? 0)
  const difference = actualClose - expectedCash

  const updated = await db.posShift.update({
    where: { id: shiftId },
    data: {
      status: 'kapali',
      closingCash: actualClose,
      expectedCash,
      difference,
      closingTime: new Date(),
      notes: notes?.trim() || shift.notes,
    },
  })

  return ok(updated)
}
