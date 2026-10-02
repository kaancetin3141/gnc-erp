import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

async function checkCount(marketId: string, countId: string, tenantId: string) {
  const sc = await db.stockCount.findUnique({
    where: { id: countId },
    include: { market: true },
  })
  if (!sc || sc.marketId !== marketId || sc.market.tenantId !== tenantId) return null
  return sc
}

// ============================================================
// GET — tekil sayım + kalemler
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; countId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id, countId } = await params
  const sc = await checkCount(id, countId, user!.tenantId)
  if (!sc) return err('Sayım bulunamadı', 404)

  const detailed = await db.stockCount.findUnique({
    where: { id: countId },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, stock: true, category: true, price: true } },
        },
        orderBy: { product: { name: 'asc' } },
      },
    },
  })

  return ok(detailed)
}

// ============================================================
// PATCH — sayım güncelle (status veya notes veya tüm itemları toplu)
// Body: { notes?, status? }
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; countId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id, countId } = await params
  const sc = await checkCount(id, countId, user!.tenantId)
  if (!sc) return err('Sayım bulunamadı', 404)

  const body = await req.json()
  const { notes, status } = body as { notes?: string; status?: string }

  if (status && !['taslak', 'tamamlandi', 'iptal'].includes(status)) {
    return err('Geçersiz status', 400)
  }

  const updated = await db.stockCount.update({
    where: { id: countId },
    data: {
      ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      ...(status ? { status } : {}),
    },
  })

  return ok(updated)
}

// ============================================================
// POST — sayımı tamamla (finalize): farkları stoğa uygula
// Body: { action: 'finalize' }
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; countId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id, countId } = await params
  const sc = await checkCount(id, countId, user!.tenantId)
  if (!sc) return err('Sayım bulunamadı', 404)
  if (sc.status === 'tamamlandi') return err('Sayım zaten tamamlanmış', 400)

  const body = await req.json()
  const { action } = body as { action?: string }
  if (action !== 'finalize') return err('Geçersiz işlem', 400)

  // Tüm kalemleri çek
  const items = await db.stockCountItem.findMany({
    where: { stockCountId: countId },
    include: { product: true },
  })

  // Transaction: farkları uygula + stok hareketleri oluştur
  await db.$transaction(async (tx) => {
    for (const item of items) {
      if (item.countedQty === null) continue
      const diff = item.countedQty - item.expectedQty
      if (diff === 0) continue

      // Stok düzelt
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: item.countedQty },
      })

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          quantity: diff,
          type: 'duzeltme',
          reason: `Stok Sayımı (${sc.number})`,
          refType: 'stock_count',
          refId: countId,
        },
      })

      await tx.stockCountItem.update({
        where: { id: item.id },
        data: { difference: diff },
      })
    }

    await tx.stockCount.update({
      where: { id: countId },
      data: { status: 'tamamlandi', endDate: new Date() },
    })
  })

  const final = await db.stockCount.findUnique({
    where: { id: countId },
    include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
  })

  return ok(final)
}
