import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, requirePermission, ok, safeJsonParse,
} from '@/lib/api-utils'
import type { PermissionKey } from '@/types'

// GET — admin için tüm kullanıcılar (tenant bazlı, full data)
// Sadece users.manage yetkisi
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'users.manage')
  if (permErr) return permErr

  const url = new URL(req.url)
  const search = url.searchParams.get('search') || ''
  const role = url.searchParams.get('role') || ''
  const status = url.searchParams.get('status') || ''

  const where: Record<string, unknown> = {
    tenantId: user!.tenantId,
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { title: { contains: search } },
    ]
  }
  if (role) where.role = role
  if (status) where.status = status

  const users = await db.user.findMany({
    where,
    include: {
      manager: { select: { id: true, name: true } },
      subordinates: { select: { id: true, name: true, role: true } },
      _count: {
        select: {
          ownedCustomers: true,
          ownedLeads: true,
          ownedDeals: true,
          subordinates: true,
          assignedTasks: true,
          activities: true,
          auditLogs: true,
        },
      },
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })

  return ok({
    items: users.map((u) => ({
      ...u,
      permissions: safeJsonParse<PermissionKey[]>(u.permissions, []),
    })),
    total: users.length,
  })
}
