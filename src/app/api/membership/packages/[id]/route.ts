import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// PATCH — paket düzenle (pasifleştir dahil)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'appointments.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.membershipPackage.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!existing) return err('Paket bulunamadı', 404)

  const body = await req.json().catch(() => null)
  if (!body) return err('Geçersiz istek')

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (typeof body.description === 'string') data.description = body.description.trim() || null
  if (body.price !== undefined) {
    const price = parseFloat(body.price)
    if (isNaN(price) || price < 0) return err('Geçersiz fiyat')
    data.price = price
  }
  if (body.sessionCount !== undefined) {
    const sc = parseInt(body.sessionCount)
    if (isNaN(sc) || sc < 0) return err('Geçersiz seans sayısı')
    data.sessionCount = sc
  }
  if (body.validityDays !== undefined) {
    const vd = parseInt(body.validityDays)
    if (isNaN(vd) || vd < 1) return err('Geçerlilik en az 1 gün olmalı')
    data.validityDays = vd
  }
  if (typeof body.active === 'boolean') data.active = body.active

  const pkg = await db.membershipPackage.update({ where: { id }, data })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'membership_package',
    entityId: id,
    before: { name: existing.name, active: existing.active, price: existing.price },
    after: data,
  })

  return ok(pkg)
}

// DELETE — paket sil (satışı olan paket silinemez, pasifleştirilir)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'appointments.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.membershipPackage.findFirst({
    where: { id, tenantId: user!.tenantId },
    include: { _count: { select: { packages: true } } },
  })
  if (!existing) return err('Paket bulunamadı', 404)

  if (existing._count.packages > 0) {
    // Satış geçmişi var — veri bütünlüğü için pasifleştir
    await db.membershipPackage.update({ where: { id }, data: { active: false } })
    return ok({ deactivated: true, message: 'Pakette satış kaydı olduğu için silinmedi, pasifleştirildi' })
  }

  await db.membershipPackage.delete({ where: { id } })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'membership_package',
    entityId: id,
    before: { name: existing.name },
  })

  return ok({ deleted: true })
}
