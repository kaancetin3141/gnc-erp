import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// ============================================================
// POST — barkod ile ürün arama (POS lookup)
// Body: { code }
// Response: { product, barcode, shelfItems }
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!user!.permissions.includes('market.view')) return err('Bu modül için yetkiniz yok', 403)

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Market bulunamadı', 404)

  const body = await req.json()
  const { code } = body as { code?: string }
  if (!code || !code.trim()) return err('Barkod kodu gerekli', 400)

  const cleanCode = code.trim()

  // Önce barkod tablosundan ara
  const barcode = await db.barcode.findUnique({
    where: { code: cleanCode },
    include: {
      product: {
        select: {
          id: true, name: true, sku: true, price: true, stock: true,
          taxRate: true, category: true, unit: true, minStock: true,
        },
      },
    },
  })

  // Barkod bulunduysa, marketin raflarındaki bilgisini de getir
  if (barcode && barcode.product) {
    const shelfItems = await db.shelfItem.findMany({
      where: { productId: barcode.product.id, shelf: { marketId: id } },
      include: { shelf: { select: { id: true, code: true, name: true, aisle: true } } },
    })
    return ok({
      found: true,
      matchType: 'barcode',
      product: barcode.product,
      barcode: { id: barcode.id, code: barcode.code, type: barcode.type },
      shelfItems,
    })
  }

  // Barkod yoksa, SKU olarak ara
  const bySku = await db.product.findFirst({
    where: { tenantId: user!.tenantId, sku: cleanCode },
    select: {
      id: true, name: true, sku: true, price: true, stock: true,
      taxRate: true, category: true, unit: true, minStock: true,
    },
  })
  if (bySku) {
    const shelfItems = await db.shelfItem.findMany({
      where: { productId: bySku.id, shelf: { marketId: id } },
      include: { shelf: { select: { id: true, code: true, name: true, aisle: true } } },
    })
    return ok({
      found: true,
      matchType: 'sku',
      product: bySku,
      barcode: null,
      shelfItems,
    })
  }

  // Hiçbiri bulunamadıysa, isim ile kısmi arama önerisi ver
  const suggestions = await db.product.findMany({
    where: {
      tenantId: user!.tenantId,
      name: { contains: cleanCode },
    },
    select: {
      id: true, name: true, sku: true, price: true, stock: true,
      taxRate: true, category: true, unit: true, minStock: true,
    },
    take: 10,
  })

  return ok({
    found: false,
    matchType: 'none',
    product: null,
    barcode: null,
    shelfItems: [],
    suggestions,
  })
}
