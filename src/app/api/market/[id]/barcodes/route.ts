import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// ============================================================
// GET — market barkodları
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId) return err('Market bulunamadı', 404)

  const { search } = Object.fromEntries(new URL(req.url).searchParams)
  const where: Record<string, unknown> = {
    OR: [{ marketId: id }, { marketId: null, product: { tenantId: user!.tenantId } }],
  }
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { product: { name: { contains: search } } },
    ]
  }

  const barcodes = await db.barcode.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, sku: true, price: true, stock: true, taxRate: true, category: true, unit: true } },
    },
    orderBy: { code: 'asc' },
    take: 500,
  })

  return ok({ items: barcodes })
}

// ============================================================
// POST — barkod ekle (productId, code, type)
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId) return err('Market bulunamadı', 404)

  const body = await req.json()
  const { productId, code, type } = body as { productId?: string; code?: string; type?: string }
  if (!productId) return err('Ürün ID gerekli', 400)
  if (!code || !code.trim()) return err('Barkod kodu gerekli', 400)

  // Ürün tenant'a mı ait?
  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product || product.tenantId !== user!.tenantId) return err('Ürün bulunamadı', 404)

  // Unique check
  const dup = await db.barcode.findUnique({ where: { code: code.trim() } })
  if (dup) return err('Bu barkod zaten kayıtlı', 409)

  const barcode = await db.barcode.create({
    data: {
      marketId: id,
      productId,
      code: code.trim(),
      type: type?.trim() || 'ean13',
    },
  })

  return ok(barcode)
}
