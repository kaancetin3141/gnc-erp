import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// GET — tenant'a ait marketleri listele
// market.view yetkisi olan tüm roller (kasiyer, depo, admin, superadmin) erişebilir.
// ============================================================
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!user!.permissions.includes('market.view')) return err('Bu modül için yetkiniz yok', 403)

  const markets = await db.market.findMany({
    where: { tenantId: user!.tenantId },
    orderBy: { createdAt: 'asc' },
    include: {
      _count: {
        select: { shelves: true, posShifts: true, sales: true, barcodes: true, purchases: true },
      },
    },
  })

  return ok({ items: markets })
}

// ============================================================
// POST — yeni market oluştur (market.manage)
// ============================================================
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.manage')
  if (permErr) return permErr

  const body = await req.json()
  const { name, address, phone } = body as { name?: string; address?: string; phone?: string }
  if (!name || !name.trim()) return err('Market adı gerekli', 400)

  const market = await db.market.create({
    data: {
      tenantId: user!.tenantId,
      name: name.trim(),
      address: address?.trim() || null,
      phone: phone?.trim() || null,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'market',
    entityId: market.id,
    after: { name: market.name },
  })

  return ok(market)
}
