import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — izin talepleri
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const viewErr = requirePermission(user, 'hr.view')
  if (viewErr) return viewErr

  const url = new URL(req.url)
  const status = url.searchParams.get('status') || ''
  const employeeId = url.searchParams.get('employeeId') || ''

  const where: Record<string, unknown> = user!.role === 'superadmin' ? {} : { tenantId: user!.tenantId }
  if (status) where.status = status
  if (employeeId) where.employeeId = employeeId

  const leaves = await db.hrLeaveRequest.findMany({
    where,
    include: { employee: { select: { id: true, name: true, position: true } } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  const pending = leaves.filter((l) => l.status === 'pending').length

  return ok({ items: leaves, pendingCount: pending })
}

// POST — yeni izin talebi
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'hr.manage')
  if (permErr) return permErr

  const body = await req.json().catch(() => null)
  if (!body?.employeeId) return err('Personel seçilmelidir')
  const validTypes = ['yillik', 'mazeret', 'hastalik', 'dogum', 'ucretsiz']
  if (!validTypes.includes(body.type)) return err('Geçersiz izin tipi')
  if (!body.startDate || !body.endDate) return err('Başlangıç ve bitiş tarihi zorunludur')

  const start = new Date(body.startDate)
  const end = new Date(body.endDate)
  if (end < start) return err('Bitiş tarihi başlangıçtan önce olamaz')

  const employee = await db.hrEmployee.findFirst({
    where: { id: body.employeeId, tenantId: user!.tenantId },
  })
  if (!employee) return err('Personel bulunamadı', 404)

  // Çakışan onaylı izin kontrolü
  const overlap = await db.hrLeaveRequest.findFirst({
    where: {
      tenantId: user!.tenantId,
      employeeId: body.employeeId,
      status: 'approved',
      startDate: { lte: end },
      endDate: { gte: start },
    },
  })
  if (overlap) return err('Bu tarihlerde onaylı bir izin zaten var')

  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1

  const leave = await db.hrLeaveRequest.create({
    data: {
      tenantId: user!.tenantId,
      employeeId: employee.id,
      type: body.type,
      startDate: start,
      endDate: end,
      days,
      reason: body.reason?.trim() || null,
    },
    include: { employee: { select: { id: true, name: true, position: true } } },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'hr_leave',
    entityId: leave.id,
    after: { employee: employee.name, type: leave.type, days },
  })

  return ok(leave, 201)
}
