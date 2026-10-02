import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

async function getProviderForUser(providerId: string, tenantId: string) {
  const provider = await db.serviceProvider.findUnique({ where: { id: providerId } })
  if (!provider || provider.tenantId !== tenantId) return null
  return provider
}

async function getStaffForProvider(staffId: string, providerId: string) {
  const staff = await db.staff.findUnique({ where: { id: staffId } })
  if (!staff || staff.providerId !== providerId) return null
  return staff
}

// ============================================================
// PATCH — personel bilgileri güncelle
// ============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; staffId: string }> },
) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, staffId } = await params
  const provider = await getProviderForUser(id, user!.tenantId)
  if (!provider) return err('İşletme bulunamadı', 404)

  const staff = await getStaffForProvider(staffId, id)
  if (!staff) return err('Personel bulunamadı', 404)

  const body = await req.json()
  const { name, title, photo, phone, bio, isActive, sortOrder } = body as {
    name?: string
    title?: string
    photo?: string | null
    phone?: string
    bio?: string
    isActive?: boolean
    sortOrder?: number
  }

  const updated = await db.staff.update({
    where: { id: staffId },
    data: {
      ...(name !== undefined && name.trim() ? { name: name.trim() } : {}),
      ...(title !== undefined ? { title: title?.trim() || null } : {}),
      ...(photo !== undefined ? { photo: photo || null } : {}),
      ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
      ...(bio !== undefined ? { bio: bio?.trim() || null } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'staff',
    entityId: staffId,
    before: { name: staff.name, title: staff.title },
    after: { name: updated.name, title: updated.title },
  })

  return ok(updated)
}

// ============================================================
// DELETE — personel sil
// ============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; staffId: string }> },
) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, staffId } = await params
  const provider = await getProviderForUser(id, user!.tenantId)
  if (!provider) return err('İşletme bulunamadı', 404)

  const staff = await getStaffForProvider(staffId, id)
  if (!staff) return err('Personel bulunamadı', 404)

  await db.staff.delete({ where: { id: staffId } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'staff',
    entityId: staffId,
    before: { name: staff.name },
  })

  return ok({ success: true })
}
