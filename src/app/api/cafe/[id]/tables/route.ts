import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_SHAPES = ['square', 'round', 'rectangle']
const VALID_STATUSES = ['bos', 'dolu', 'rezerve', 'siparis']

// ============================================================
// GET — kafedeki tüm masalar (kuş bakışı konum dahil)
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.view')
  if (permErr) return permErr

  const { id } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Kafe bulunamadı', 404)

  const tables = await db.cafeTable.findMany({
    where: { cafeId: id },
    orderBy: { number: 'asc' },
    include: {
      orders: {
        where: { status: { in: ['acik', 'hazirlaniyor', 'hazir'] } },
        select: {
          id: true, number: true, status: true, total: true,
          _count: { select: { items: true } },
        },
        take: 1,
      },
    },
  })

  return ok({ items: tables })
}

// ============================================================
// POST — masa ekle
// Body: { number, shape?, x?, y?, width?, height?, capacity? }
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.manage')
  if (permErr) return permErr

  const { id } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Kafe bulunamadı', 404)

  const body = await req.json()
  const { number, shape, x, y, width, height, capacity } = body as {
    number?: string
    shape?: string
    x?: number
    y?: number
    width?: number
    height?: number
    capacity?: number
  }
  if (!number || !number.trim()) return err('Masa numarası gerekli', 400)
  if (shape && !VALID_SHAPES.includes(shape)) return err('Geçersiz şekil', 400)

  // Aynı numara var mı?
  const exists = await db.cafeTable.findFirst({
    where: { cafeId: id, number: number.trim() },
  })
  if (exists) return err('Bu masa numarası zaten kullanımda', 400)

  const table = await db.cafeTable.create({
    data: {
      cafeId: id,
      number: number.trim(),
      shape: shape ?? 'square',
      x: typeof x === 'number' ? clamp(x, 0, 100) : 50,
      y: typeof y === 'number' ? clamp(y, 0, 100) : 50,
      width: typeof width === 'number' ? clamp(width, 3, 40) : 10,
      height: typeof height === 'number' ? clamp(height, 3, 40) : 10,
      capacity: typeof capacity === 'number' && capacity > 0 ? capacity : 4,
      status: 'bos',
    },
  })

  // Kafe tableCount senkronize et
  await db.cafe.update({
    where: { id },
    data: { tableCount: await db.cafeTable.count({ where: { cafeId: id } }) },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'cafe_table',
    entityId: table.id,
    after: { number: table.number, shape: table.shape, x: table.x, y: table.y },
  })

  return ok(table)
}

function clamp(n: number, min: number, max: number): number {
  if (isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}
