import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// GET — tenant'a ait kafeleri listele
// Tüm kafe rolleri (kasa/barmen/komi/admin) erişebilir.
// ============================================================
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.view')
  if (permErr) return permErr

  const cafes = await db.cafe.findMany({
    where: { tenantId: user!.tenantId },
    orderBy: { createdAt: 'asc' },
    include: {
      _count: {
        select: { tables: true, menuCategories: true, cafeOrders: true },
      },
    },
  })

  return ok({ items: cafes })
}

// ============================================================
// POST — yeni kafe oluştur (admin/cafe.manage)
// ============================================================
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.manage')
  if (permErr) return permErr

  const body = await req.json()
  const { name, address, phone } = body as { name?: string; address?: string; phone?: string }
  if (!name || !name.trim()) return err('Kafe adı gerekli', 400)

  const cafe = await db.cafe.create({
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
    entity: 'cafe',
    entityId: cafe.id,
    after: { name: cafe.name },
  })

  return ok(cafe)
}
