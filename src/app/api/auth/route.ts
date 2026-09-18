import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getRolePermissions } from '@/lib/rbac'
import { createSession, writeAuditLog } from '@/lib/auth'
import { ok, err } from '@/lib/api-utils'

// GET — demo kullanıcıları listele (login ekranı için)
export async function GET() {
  const users = await db.user.findMany({
    where: { status: 'active' },
    include: { tenant: true },
    orderBy: [{ tenantId: 'asc' }, { role: 'asc' }],
  })
  return ok(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      title: u.title,
      tenantId: u.tenantId,
      tenantName: u.tenant.name,
      avatarUrl: u.avatarUrl,
      employeeCode: u.employeeCode,
    })),
  )
}

// POST — login (demo: userId ile)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { userId } = body as { userId?: string }
  if (!userId) return err('userId gerekli', 400)

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { tenant: true },
  })
  if (!user || user.status !== 'active') return err('Geçersiz kullanıcı', 404)

  const rolePerms = getRolePermissions(user.role as 'admin' | 'manager' | 'rep' | 'superadmin' | 'readonly' | 'stock')
  const userPerms = JSON.parse(user.permissions || '[]') as string[]
  const permissions = Array.from(new Set([...userPerms, ...rolePerms]))

  const token = await createSession(user.id)
  await writeAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    action: 'login',
    entity: 'session',
  })

  return ok({
    sessionId: token,
    user: {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions,
      managerId: user.managerId,
      title: user.title,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        plan: user.tenant.plan,
        defaultCurrency: user.tenant.defaultCurrency,
        country: user.tenant.country,
      },
    },
  })
}
