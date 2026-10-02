import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

async function checkShelf(marketId: string, shelfId: string, tenantId: string) {
  const shelf = await db.shelf.findUnique({
    where: { id: shelfId },
    include: { market: true },
  })
  if (!shelf || shelf.marketId !== marketId || shelf.market.tenantId !== tenantId) return null
  return shelf
}

// PATCH — raf güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; shelfId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id, shelfId } = await params
  const shelf = await checkShelf(id, shelfId, user!.tenantId)
  if (!shelf) return err('Raf bulunamadı', 404)

  const body = await req.json()
  const { code, name, aisle } = body as { code?: string; name?: string; aisle?: string }

  const updated = await db.shelf.update({
    where: { id: shelfId },
    data: {
      ...(code !== undefined && code.trim() ? { code: code.trim().toUpperCase() } : {}),
      ...(name !== undefined ? { name: name?.trim() || null } : {}),
      ...(aisle !== undefined ? { aisle: aisle?.trim() || null } : {}),
    },
  })

  return ok(updated)
}

// DELETE — raf sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; shelfId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id, shelfId } = await params
  const shelf = await checkShelf(id, shelfId, user!.tenantId)
  if (!shelf) return err('Raf bulunamadı', 404)

  await db.shelf.delete({ where: { id: shelfId } })

  return ok({ success: true })
}
