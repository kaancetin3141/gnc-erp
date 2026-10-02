import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// Tenant izolasyonu + varlık kontrolü
async function getCafeForUser(cafeId: string, tenantId: string) {
  const cafe = await db.cafe.findUnique({ where: { id: cafeId } })
  if (!cafe || cafe.tenantId !== tenantId) return null
  return cafe
}

// ============================================================
// GET — tekil kafe
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.view')
  if (permErr) return permErr

  const { id } = await params
  const cafe = await getCafeForUser(id, user!.tenantId)
  if (!cafe) return err('Kafe bulunamadı', 404)

  return ok(cafe)
}

// ============================================================
// PATCH — kafe bilgileri
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.manage')
  if (permErr) return permErr

  const { id } = await params
  const cafe = await getCafeForUser(id, user!.tenantId)
  if (!cafe) return err('Kafe bulunamadı', 404)

  const body = await req.json()
  const { name, address, phone } = body as { name?: string; address?: string; phone?: string }

  const updated = await db.cafe.update({
    where: { id },
    data: {
      ...(name !== undefined && name.trim() ? { name: name.trim() } : {}),
      ...(address !== undefined ? { address: address?.trim() || null } : {}),
      ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'cafe',
    entityId: id,
    before: { name: cafe.name, address: cafe.address, phone: cafe.phone },
    after: { name: updated.name, address: updated.address, phone: updated.phone },
  })

  return ok(updated)
}

// ============================================================
// DELETE — kafe sil
// ============================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.manage')
  if (permErr) return permErr

  const { id } = await params
  const cafe = await getCafeForUser(id, user!.tenantId)
  if (!cafe) return err('Kafe bulunamadı', 404)

  await db.cafe.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'cafe',
    entityId: id,
    before: { name: cafe.name },
  })

  return ok({ success: true })
}
