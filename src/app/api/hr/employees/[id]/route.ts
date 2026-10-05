import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// PATCH — personel düzenle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'hr.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.hrEmployee.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!existing) return err('Personel bulunamadı', 404)

  const body = await req.json().catch(() => null)
  if (!body) return err('Geçersiz istek')

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (typeof body.position === 'string' && body.position.trim()) data.position = body.position.trim()
  if (typeof body.department === 'string') data.department = body.department.trim() || null
  if (typeof body.phone === 'string') data.phone = body.phone.trim() || null
  if (typeof body.email === 'string') data.email = body.email.trim() || null
  if (body.hireDate !== undefined) data.hireDate = body.hireDate ? new Date(body.hireDate) : null
  if (body.monthlySalary !== undefined) {
    data.monthlySalary = body.monthlySalary === null || body.monthlySalary === ''
      ? null
      : parseFloat(body.monthlySalary)
  }
  if (body.status === 'active' || body.status === 'passive') data.status = body.status
  if (typeof body.notes === 'string') data.notes = body.notes.trim() || null

  const employee = await db.hrEmployee.update({ where: { id }, data })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'hr_employee',
    entityId: id,
    before: { name: existing.name, status: existing.status },
    after: data,
  })

  return ok(employee)
}

// DELETE — personel sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'hr.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.hrEmployee.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!existing) return err('Personel bulunamadı', 404)

  await db.hrEmployee.delete({ where: { id } })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'hr_employee',
    entityId: id,
    before: { name: existing.name },
  })

  return ok({ deleted: true })
}
