import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

async function checkMarket(marketId: string, tenantId: string) {
  const m = await db.market.findUnique({ where: { id: marketId } })
  if (!m || m.tenantId !== tenantId) return null
  return m
}

// ============================================================
// GET — market'in rafları
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id } = await params
  const market = await checkMarket(id, user!.tenantId)
  if (!market) return err('Market bulunamadı', 404)

  const shelves = await db.shelf.findMany({
    where: { marketId: id },
    orderBy: { code: 'asc' },
    include: {
      _count: { select: { items: true } },
    },
  })

  return ok({ items: shelves })
}

// ============================================================
// POST — yeni raf (market.manage veya market.stock)
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id } = await params
  const market = await checkMarket(id, user!.tenantId)
  if (!market) return err('Market bulunamadı', 404)

  const body = await req.json()
  const { code, name, aisle } = body as { code?: string; name?: string; aisle?: string }
  if (!code || !code.trim()) return err('Raf kodu gerekli', 400)

  const shelf = await db.shelf.create({
    data: {
      marketId: id,
      code: code.trim().toUpperCase(),
      name: name?.trim() || null,
      aisle: aisle?.trim() || null,
    },
  })

  return ok(shelf)
}
