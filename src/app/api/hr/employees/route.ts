import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — personel listesi
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const viewErr = requirePermission(user, 'hr.view')
  if (viewErr) return viewErr

  const url = new URL(req.url)
  const q = url.searchParams.get('q') || ''
  const status = url.searchParams.get('status') || ''
  const department = url.searchParams.get('department') || ''

  const where: Record<string, unknown> = { tenantId: user!.tenantId }
  if (status) where.status = status
  if (department) where.department = department
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { position: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
    ]
  }

  const employees = await db.hrEmployee.findMany({
    where,
    include: {
      leaves: { orderBy: { createdAt: 'desc' }, take: 3 },
      shifts: { where: { date: { gte: new Date() } }, orderBy: { date: 'asc' }, take: 3 },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  const departments = await db.hrEmployee.findMany({
    where: { tenantId: user!.tenantId },
    select: { department: true },
    distinct: ['department'],
  })

  const active = employees.filter((e) => e.status === 'active').length
  const monthlyPayroll = employees
    .filter((e) => e.status === 'active')
    .reduce((s, e) => s + (e.monthlySalary ?? 0), 0)

  return ok({
    items: employees,
    departments: departments.map((d) => d.department).filter(Boolean),
    summary: { total: employees.length, active, monthlyPayroll },
  })
}

// POST — yeni personel ekle
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'hr.manage')
  if (permErr) return permErr

  const body = await req.json().catch(() => null)
  if (!body?.name?.trim()) return err('Ad soyad zorunludur')
  if (!body?.position?.trim()) return err('Pozisyon zorunludur')

  const employee = await db.hrEmployee.create({
    data: {
      tenantId: user!.tenantId,
      userId: body.userId || null,
      name: String(body.name).trim(),
      position: String(body.position).trim(),
      department: body.department?.trim() || null,
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      hireDate: body.hireDate ? new Date(body.hireDate) : null,
      monthlySalary: body.monthlySalary !== undefined && body.monthlySalary !== '' && body.monthlySalary !== null
        ? parseFloat(body.monthlySalary)
        : null,
      notes: body.notes?.trim() || null,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'hr_employee',
    entityId: employee.id,
    after: { name: employee.name, position: employee.position },
  })

  return ok(employee, 201)
}
