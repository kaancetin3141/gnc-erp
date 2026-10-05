import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, requirePermission, ok, err,
  getVisibilityFilter, safeJsonParse,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { normalizePhone } from '@/lib/format'
import { hasPermission, getRolePermissions, getAdminPermissionsForTenant } from '@/lib/rbac'
import type { Role, PermissionKey } from '@/types'

// GET — kullanıcı listesi
// users.manage varsa tenant'taki tüm kullanıcılar; yoksa yalnızca görünür kullanıcılar (self + astlar)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const search = url.searchParams.get('search') || ''
  const role = url.searchParams.get('role') || ''
  const status = url.searchParams.get('status') || ''

  const canManage = hasPermission(user!, 'users.manage')
  const visFilter = await getVisibilityFilter(user!)

  const where: Record<string, unknown> = {
    tenantId: user!.tenantId,
  }

  if (canManage) {
    // tüm tenant kullanıcıları
  } else if (visFilter.ownerId) {
    // yalnızca görünür kullanıcılar (self + astlar)
    where.id = { in: visFilter.ownerId.in }
  } else {
    // en azından kendisi
    where.id = user!.id
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
      _count: {
        select: {
          ownedCustomers: true,
          ownedLeads: true,
          ownedDeals: true,
          subordinates: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return ok({
    items: users.map((u) => ({
      ...u,
      permissions: safeJsonParse<PermissionKey[]>(u.permissions, []),
      // GÜVENLİK: şifre hash'i ASLA yanıtta döndürülmez (sızma testi bulgusu)
      passwordHash: undefined,
      hasPassword: Boolean(u.passwordHash),
    })),
    total: users.length,
  })
}

// POST — yeni kullanıcı oluştur
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'users.manage')
  if (permErr) return permErr

  const body = await req.json()
  const { email, name, role, managerId, title, phone, status, permissions } = body

  if (!email || !name) return err('E-posta ve ad gerekli', 400)
  if (!role) return err('Rol gerekli', 400)

  // Email unique kontrol
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) return err('Bu e-posta zaten kayıtlı', 409)

  // Self-reference önle
  if (managerId && managerId === user!.id) {
    // Yeni kullanıcı oluştuğu için astı olamaz; sadece self-reference önle
  }
  // managerId self ile aynı olamaz (yeni kayıt, id yok); ama actor ile aynı olabilir mi? Evet.
  // Burada managerId'nin var olan bir kullanıcı olduğunu basitçe kontrol et
  if (managerId) {
    const manager = await db.user.findFirst({
      where: { id: managerId, tenantId: user!.tenantId },
      select: { id: true },
    })
    if (!manager) return err('Yönetici bulunamadı', 404)
  }

  // Permissions: gönderilmişse validate (actor'ın sahip olduğu yetkiler)
  let permsToStore: PermissionKey[] = []
  if (Array.isArray(permissions) && permissions.length > 0) {
    const actorPerms = user!.permissions
    const invalid = permissions.filter((p: string) => !actorPerms.includes(p as PermissionKey))
    if (invalid.length > 0) {
      return err(`Yetkiniz olmayan yetkiler verilmiş: ${invalid.join(', ')}`, 403)
    }
    permsToStore = permissions as PermissionKey[]
  } else {
    // Rolün varsayılan yetkileri
    // admin rolü İSTİSNA: seed ile aynı şekilde sektör-bazlı yetkiler verilir
    // (getAdminPermissionsForTenant — kafe/market/site/kuaför/CRM ayrımı)
    if (role === 'admin') {
      permsToStore = getAdminPermissionsForTenant(user!.tenant?.name ?? '')
    } else {
      permsToStore = getRolePermissions(role as Role)
    }
  }

  const newUser = await db.user.create({
    data: {
      tenantId: user!.tenantId,
      email,
      name,
      role,
      permissions: JSON.stringify(permsToStore),
      managerId: managerId || null,
      title: title || null,
      phone: phone ? normalizePhone(phone) || phone : null,
      status: status || 'active',
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
    action: 'create',
    entity: 'user',
    entityId: newUser.id,
    after: { ...newUser, permissions: permsToStore, passwordHash: undefined },
  })

  return ok({
    ...newUser,
    permissions: safeJsonParse<PermissionKey[]>(newUser.permissions, []),
    passwordHash: undefined,
    hasPassword: Boolean(newUser.passwordHash),
  }, 201)
}
