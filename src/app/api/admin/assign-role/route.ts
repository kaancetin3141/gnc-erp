import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, requirePermission, ok, err, safeJsonParse,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { getRolePermissions } from '@/lib/rbac'
import type { Role, PermissionKey } from '@/types'

const VALID_ROLES: Role[] = ['superadmin', 'admin', 'manager', 'rep', 'readonly', 'stock']

// POST — kullanıcıya rol ata
// Body: { userId, role }
// Sadece admin/superadmin (users.manage)
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'users.manage')
  if (permErr) return permErr

  const body = await req.json()
  const { userId, role } = body as { userId?: string; role?: string }

  if (!userId || !role) {
    return err('userId ve role gerekli', 400)
  }
  if (!VALID_ROLES.includes(role as Role)) {
    return err(`Geçersiz rol. Geçerli roller: ${VALID_ROLES.join(', ')}`, 400)
  }

  const targetRole = role as Role

  // Hedef kullanıcı tenant'ta mi?
  const target = await db.user.findFirst({
    where: { id: userId, tenantId: user!.tenantId },
  })
  if (!target) return err('Kullanıcı bulunamadı', 404)

  // Self-role değişikliği engelle (admin kendinin rolünü düşüremez)
  if (target.id === user!.id) {
    return err('Kendi rolünüzü değiştiremezsiniz', 400)
  }

  // Süper admin rolünü yalnızca süper admin yönetebilir
  if (targetRole === 'superadmin' && user!.role !== 'superadmin') {
    return err('Süper admin rolü atamak için süper admin olmalısınız', 403)
  }
  if (target.role === 'superadmin' && user!.role !== 'superadmin') {
    return err('Süper admin kullanıcısının rolünü değiştiremezsiniz', 403)
  }

  // Rol değişince permissions da rolün varsayılan yetkileriyle sıfırlansın
  // (admin sonradan ince ayar yapabilir)
  const newPerms = getRolePermissions(targetRole)

  const before = {
    ...target,
    permissions: safeJsonParse<PermissionKey[]>(target.permissions, []),
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      role: targetRole,
      permissions: JSON.stringify(newPerms),
    },
    include: {
      manager: { select: { id: true, name: true } },
      _count: {
        select: {
          ownedCustomers: true,
          ownedLeads: true,
          ownedDeals: true,
          subordinates: true,
        },
      },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'user',
    entityId: userId,
    before,
    after: {
      ...updated,
      permissions: newPerms,
      _roleChanged: { from: target.role, to: targetRole },
    },
  })

  return ok({
    ...updated,
    permissions: newPerms,
  })
}
