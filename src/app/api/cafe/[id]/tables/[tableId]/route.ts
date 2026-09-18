import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_SHAPES = ['square', 'round', 'rectangle']
const VALID_STATUSES = ['bos', 'dolu', 'rezerve', 'siparis']

function clamp(n: number, min: number, max: number): number {
  if (isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

// ============================================================
// PATCH — masa güncelle (konum/şekil/numara/durum/kapasite)
// ============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tableId: string }> },
) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.manage')
  if (permErr) return permErr

  const { id, tableId } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId) return err('Kafe bulunamadı', 404)

  const table = await db.cafeTable.findUnique({ where: { id: tableId } })
  if (!table || table.cafeId !== id) return err('Masa bulunamadı', 404)

  const body = await req.json()
  const { number, shape, x, y, width, height, capacity, status } = body as {
    number?: string
    shape?: string
    x?: number
    y?: number
    width?: number
    height?: number
    capacity?: number
    status?: string
  }

  if (shape && !VALID_SHAPES.includes(shape)) return err('Geçersiz şekil', 400)
  if (status && !VALID_STATUSES.includes(status)) return err('Geçersiz durum', 400)

  // Numara değiştiyse çakışma kontrolü
  if (number && number.trim() !== table.number) {
    const clash = await db.cafeTable.findFirst({
      where: { cafeId: id, number: number.trim(), NOT: { id: tableId } },
    })
    if (clash) return err('Bu masa numarası zaten kullanımda', 400)
  }

  const updated = await db.cafeTable.update({
    where: { id: tableId },
    data: {
      ...(number !== undefined && number.trim() ? { number: number.trim() } : {}),
      ...(shape ? { shape } : {}),
      ...(typeof x === 'number' ? { x: clamp(x, 0, 100) } : {}),
      ...(typeof y === 'number' ? { y: clamp(y, 0, 100) } : {}),
      ...(typeof width === 'number' ? { width: clamp(width, 3, 40) } : {}),
      ...(typeof height === 'number' ? { height: clamp(height, 3, 40) } : {}),
      ...(typeof capacity === 'number' && capacity > 0 ? { capacity } : {}),
      ...(status ? { status } : {}),
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'cafe_table',
    entityId: tableId,
    before: { number: table.number, x: table.x, y: table.y, status: table.status },
    after: { number: updated.number, x: updated.x, y: updated.y, status: updated.status },
  })

  return ok(updated)
}

// ============================================================
// DELETE — masa sil
// ============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tableId: string }> },
) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.manage')
  if (permErr) return permErr

  const { id, tableId } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId) return err('Kafe bulunamadı', 404)

  const table = await db.cafeTable.findUnique({ where: { id: tableId } })
  if (!table || table.cafeId !== id) return err('Masa bulunamadı', 404)

  await db.cafeTable.delete({ where: { id: tableId } })

  // Kafe tableCount senkronize et
  await db.cafe.update({
    where: { id },
    data: { tableCount: await db.cafeTable.count({ where: { cafeId: id } }) },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'cafe_table',
    entityId: tableId,
    before: { number: table.number },
  })

  return ok({ success: true })
}
