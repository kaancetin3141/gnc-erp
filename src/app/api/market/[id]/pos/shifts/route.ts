import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// ============================================================
// GET — vardiyalar (status filtresi: ?status=acik|kapali)
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId) return err('Market bulunamadı', 404)

  const { status } = Object.fromEntries(new URL(req.url).searchParams)
  const where: Record<string, unknown> = { marketId: id }
  if (status === 'acik' || status === 'kapali') where.status = status

  const shifts = await db.posShift.findMany({
    where,
    orderBy: { openingTime: 'desc' },
    include: {
      _count: { select: { sales: true } },
    },
    take: 100,
  })

  return ok({ items: shifts })
}

// ============================================================
// POST — vardiya aç (market.pos)
// Body: { openingCash, notes }
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.pos')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId) return err('Market bulunamadı', 404)

  // Açık vardiya var mı?
  const openShift = await db.posShift.findFirst({
    where: { marketId: id, status: 'acik' },
  })
  if (openShift) return err('Bu markette zaten açık vardiya var. Önce kapatın.', 409)

  const body = await req.json()
  const { openingCash, notes } = body as { openingCash?: number; notes?: string }

  // Vardiya numarası: V-001, V-002...
  const count = await db.posShift.count({ where: { marketId: id } })
  const number = `V-${String(count + 1).padStart(3, '0')}`

  const shift = await db.posShift.create({
    data: {
      marketId: id,
      userId: user!.id,
      number,
      status: 'acik',
      openingCash: Number(openingCash ?? 0),
      notes: notes?.trim() || null,
    },
  })

  return ok(shift)
}

// ============================================================
// PATCH — toplu güncelleme (kapatma dahil)
// Body: { action: 'close', closingCash, notes }
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.pos')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId) return err('Market bulunamadı', 404)

  const body = await req.json()
  const { action, closingCash, notes } = body as {
    action?: string
    closingCash?: number
    notes?: string
  }

  if (action === 'close') {
    const openShift = await db.posShift.findFirst({
      where: { marketId: id, status: 'acik' },
    })
    if (!openShift) return err('Açık vardiya yok', 404)

    // Bu vardiyadaki tüm satışlardan beklenen nakit hesapla
    const sales = await db.marketSale.findMany({
      where: { posShiftId: openShift.id, status: 'tamamlandi', type: 'satis' },
      select: { cashAmount: true, cardAmount: true, total: true },
    })

    // İade edilen nakitleri de düş
    const returns = await db.marketReturn.findMany({
      where: { sale: { posShiftId: openShift.id } },
      include: { sale: { select: { paymentMethod: true, cashAmount: true, cardAmount: true, total: true } } },
    })

    const salesCash = sales.reduce((s, x) => s + (x.cashAmount || 0), 0)
    const returnsCash = returns.reduce((s, r) => {
      // İade ödeme yöntemine göre nakit veya kart
      if (r.sale.paymentMethod === 'card') return s + 0
      return s + (r.sale.cashAmount || 0) * (r.totalAmount / (r.sale.total || 1))
    }, 0)

    const expectedCash = openShift.openingCash + salesCash - returnsCash
    const actualClose = Number(closingCash ?? 0)
    const difference = actualClose - expectedCash

    const updated = await db.posShift.update({
      where: { id: openShift.id },
      data: {
        status: 'kapali',
        closingCash: actualClose,
        expectedCash,
        difference,
        closingTime: new Date(),
        notes: notes?.trim() || openShift.notes,
      },
    })

    return ok(updated)
  }

  return err('Geçersiz işlem', 400)
}
