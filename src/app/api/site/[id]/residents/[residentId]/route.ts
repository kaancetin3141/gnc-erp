import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import bcrypt from 'bcryptjs'

async function checkResidentForUser(residentId: string, tenantId: string) {
  const r = await db.resident.findUnique({
    where: { id: residentId },
    include: { site: true },
  })
  if (!r || r.tenantId !== tenantId) return null
  return r
}

// ============================================================
// PATCH — sakin güncelle (site.manage)
// ============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; residentId: string }> },
) {
  const user = await getSession(req)
  if (!user || !user.permissions.includes('site.manage')) return err('Bu işlem için yetkiniz yok', 403)

  const { residentId } = await params
  const resident = await checkResidentForUser(residentId, user.tenantId)
  if (!resident) return err('Sakin bulunamadı', 404)

  const body = await req.json()
  const { name, email, phone, password, type, isActive, apartmentId } = body as {
    name?: string; email?: string; phone?: string; password?: string
    type?: string; isActive?: boolean; apartmentId?: string | null
  }

  // Email/telefon benzersizlik kontrolü
  if (email && email.trim() && email !== resident.email) {
    const existing = await db.resident.findFirst({
      where: { email: email.trim(), siteId: resident.siteId, NOT: { id: residentId } },
    })
    if (existing) return err('Bu e-posta adresiyle kayıtlı başka sakin var', 400)
  }
  if (phone && phone.trim() && phone !== resident.phone) {
    const existing = await db.resident.findFirst({
      where: { phone: phone.trim(), siteId: resident.siteId, NOT: { id: residentId } },
    })
    if (existing) return err('Bu telefon ile kayıtlı başka sakin var', 400)
  }

  // Daire değişimi
  if (apartmentId !== undefined) {
    // Eski daireden temizle
    if (resident.apartmentId) {
      await db.apartment.update({
        where: { id: resident.apartmentId },
        data: { residentId: null },
      })
    }
    // Yeni daireye ata
    if (apartmentId) {
      const apt = await db.apartment.findUnique({ where: { id: apartmentId } })
      if (!apt || apt.siteId !== resident.siteId) return err('Daire bu siteye ait değil', 400)
      // Yeni dairede başkası varsa önce onu boşalt
      if (apt.residentId && apt.residentId !== residentId) {
        await db.apartment.update({
          where: { id: apartmentId },
          data: { residentId: null },
        })
      }
      await db.apartment.update({
        where: { id: apartmentId },
        data: { residentId },
      })
    }
  }

  const updated = await db.resident.update({
    where: { id: residentId },
    data: {
      ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}),
      ...(email !== undefined ? { email: email?.trim() || null } : {}),
      ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
      ...(password !== undefined && password && password.trim()
        ? { passwordHash: bcrypt.hashSync(password, 10), password: null }
        : {}),
      ...(type === 'kiraci' ? { type: 'kiraci', isOwner: false } : {}),
      ...(type === 'mal_sahibi' ? { type: 'mal_sahibi', isOwner: true } : {}),
      ...(typeof isActive === 'boolean' ? { isActive } : {}),
    },
    include: {
      apartment: { select: { id: true, number: true, block: { select: { id: true, name: true } } } },
    },
  })

  await writeAuditLog({
    tenantId: user.tenantId, actorId: user.id, action: 'update',
    entity: 'resident', entityId: residentId, before: resident, after: updated,
  })

  const { password: _pw, passwordHash: _pwh, ...safe } = updated
  return ok({ ...safe, hasPassword: !!updated.passwordHash || !!updated.password })
}

// ============================================================
// DELETE — sakin sil (site.manage)
// ============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; residentId: string }> },
) {
  const user = await getSession(req)
  if (!user || !user.permissions.includes('site.manage')) return err('Bu işlem için yetkiniz yok', 403)

  const { residentId } = await params
  const resident = await checkResidentForUser(residentId, user.tenantId)
  if (!resident) return err('Sakin bulunamadı', 404)

  await db.resident.delete({ where: { id: residentId } })

  await writeAuditLog({
    tenantId: user.tenantId, actorId: user.id, action: 'delete',
    entity: 'resident', entityId: residentId, before: { name: resident.name },
  })

  return ok({ success: true })
}
