import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// ============================================================
// GET — raftaki ürünler
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; shelfId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id, shelfId } = await params
  const shelf = await db.shelf.findUnique({
    where: { id: shelfId },
    include: { market: true },
  })
  if (!shelf || shelf.marketId !== id || shelf.market.tenantId !== user!.tenantId) {
    return err('Raf bulunamadı', 404)
  }

  const items = await db.shelfItem.findMany({
    where: { shelfId },
    include: {
      product: { select: { id: true, name: true, sku: true, price: true, stock: true, category: true } },
    },
    orderBy: { product: { name: 'asc' } },
  })

  return ok({ items })
}

// ============================================================
// POST — rafa ürün ekle (productId, qty, minDisplayQty)
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; shelfId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id, shelfId } = await params
  const shelf = await db.shelf.findUnique({
    where: { id: shelfId },
    include: { market: true },
  })
  if (!shelf || shelf.marketId !== id || shelf.market.tenantId !== user!.tenantId) {
    return err('Raf bulunamadı', 404)
  }

  const body = await req.json()
  const { productId, qty, minDisplayQty } = body as {
    productId?: string
    qty?: number
    minDisplayQty?: number
  }
  if (!productId) return err('Ürün ID gerekli', 400)

  // Ürün tenant'a mı ait?
  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product || product.tenantId !== user!.tenantId) return err('Ürün bulunamadı', 404)

  // Aynı ürün aynı rafta varsa miktarı güncelle
  const existing = await db.shelfItem.findFirst({
    where: { shelfId, productId },
  })
  if (existing) {
    const q = qty ?? 0
    const updated = await db.shelfItem.update({
      where: { id: existing.id },
      data: {
        qty: q > 0 ? existing.qty + q : existing.qty,
        minDisplayQty: minDisplayQty ?? existing.minDisplayQty,
      },
    })
    return ok(updated)
  }

  const item = await db.shelfItem.create({
    data: {
      shelfId,
      productId,
      qty: qty ?? 0,
      minDisplayQty: minDisplayQty ?? 2,
    },
  })

  return ok(item)
}
