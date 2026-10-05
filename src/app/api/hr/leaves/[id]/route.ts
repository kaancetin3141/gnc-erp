import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// PATCH — izin onayla/ret et
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'hr.manage')
  if (permErr) return permErr

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (body?.action !== 'approve' && body?.action !== 'reject') return err('Geçersiz işlem')

  const leave = await db.hrLeaveRequest.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!leave) return err('İzin talebi bulunamadı', 404)
  if (leave.status !== 'pending') return err('Bu talep zaten sonuçlandırılmış')

  const updated = await db.hrLeaveRequest.update({
    where: { id },
    data: {
      status: body.action === 'approve' ? 'approved' : 'rejected',
      decidedById: user!.id,
      decidedAt: new Date(),
      decisionNote: body.note?.trim() || null,
    },
    include: { employee: { select: { id: true, name: true } } },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'hr_leave',
    entityId: id,
    before: { status: 'pending' },
    after: { status: updated.status, employee: updated.employee.name },
  })

  return ok(updated)
}

// DELETE — izin talebini sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'hr.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.hrLeaveRequest.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!existing) return err('İzin talebi bulunamadı', 404)

  await db.hrLeaveRequest.delete({ where: { id } })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'hr_leave',
    entityId: id,
    before: { status: existing.status, days: existing.days },
  })

  return ok({ deleted: true })
}
