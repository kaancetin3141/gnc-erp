import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// ============================================================
// GET — stok sayımları
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Market bulunamadı', 404)

  const counts = await db.stockCount.findMany({
    where: { marketId: id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { items: true } },
    },
    take: 100,
  })

  return ok({ items: counts })
}

// ============================================================
// POST — yeni sayım oluştur (tüm ürünleri expectedQty ile listele)
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Market bulunamadı', 404)

  const body = await req.json()
  const { notes } = body as { notes?: string }

  // Tüm aktif ürünleri çek
  const products = await db.product.findMany({
    where: { tenantId: user!.tenantId },
    select: { id: true, name: true, stock: true },
  })

  // Sayım numarası
  const cnt = await db.stockCount.count({ where: { marketId: id } })
  const number = `SAY-${String(cnt + 1).padStart(3, '0')}`

  const stockCount = await db.stockCount.create({
    data: {
      marketId: id,
      number,
      status: 'taslak',
      notes: notes?.trim() || null,
      createdById: user!.id,
      items: {
        create: products.map((p) => ({
          productId: p.id,
          expectedQty: p.stock,
          countedQty: null,
          difference: null,
        })),
      },
    },
    include: { items: { include: { product: { select: { id: true, name: true, sku: true, category: true } } } } },
  })

  return ok(stockCount)
}
