import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_STATIONS = ['bar', 'kitchen', 'dessert']

// ============================================================
// PATCH — menü kalemi güncelle
// ============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.manage')
  if (permErr) return permErr

  const { id, itemId } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Kafe bulunamadı', 404)

  const item = await db.menuItem.findUnique({
    where: { id: itemId },
    include: { category: { select: { cafeId: true } } },
  })
  if (!item || item.category.cafeId !== id) return err('Menü kalemi bulunamadı', 404)

  const body = await req.json()
  const {
    name, description, price, photo, prepTime, station, recipe, sortOrder, isAvailable,
  } = body as {
    name?: string
    description?: string
    price?: number
    photo?: string
    prepTime?: number
    station?: string
    recipe?: string
    sortOrder?: number
    isAvailable?: boolean
  }

  if (station && !VALID_STATIONS.includes(station)) return err('Geçersiz istasyon', 400)
  if (price !== undefined && (typeof price !== 'number' || price < 0)) {
    return err('Geçersiz fiyat', 400)
  }

  const updated = await db.menuItem.update({
    where: { id: itemId },
    data: {
      ...(name !== undefined && name.trim() ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(price !== undefined ? { price } : {}),
      ...(photo !== undefined ? { photo: photo || null } : {}),
      ...(prepTime !== undefined && prepTime >= 0 ? { prepTime } : {}),
      ...(station ? { station } : {}),
      ...(recipe !== undefined ? { recipe: recipe?.trim() || null } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(isAvailable !== undefined ? { isAvailable } : {}),
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'menu_item',
    entityId: itemId,
    before: { name: item.name, price: item.price, isAvailable: item.isAvailable },
    after: { name: updated.name, price: updated.price, isAvailable: updated.isAvailable },
  })

  return ok(updated)
}

// ============================================================
// DELETE — menü kalemi sil
// ============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.manage')
  if (permErr) return permErr

  const { id, itemId } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Kafe bulunamadı', 404)

  const item = await db.menuItem.findUnique({
    where: { id: itemId },
    include: { category: { select: { cafeId: true } } },
  })
  if (!item || item.category.cafeId !== id) return err('Menü kalemi bulunamadı', 404)

  await db.menuItem.delete({ where: { id: itemId } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'menu_item',
    entityId: itemId,
    before: { name: item.name },
  })

  return ok({ success: true })
}
