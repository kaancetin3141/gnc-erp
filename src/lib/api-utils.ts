// API yardımcıları — standart yanıtlar, RBAC kontrolü

import { NextResponse } from 'next/server'
import type { SessionUser, PermissionKey } from '@/types'
import { getServerSessionFromRequest } from './auth'
import { hasPermission, getViewScope, getVisibleUserIds, isSuperAdmin } from './rbac'
import { db } from './db'

// Generic: çağıranlar ok<BulkImportResponse>({...}) gibi yanıt tipini
// derleme zamanında doğrulayabilir (data: unknown kaybını önler)
export function ok<T = unknown>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function err(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status })
}

export async function getSession(req: Request): Promise<SessionUser | null> {
  return getServerSessionFromRequest(req)
}

export function requireAuth(user: SessionUser | null) {
  if (!user) return err('Oturum açmanız gerekli', 401)
  return null
}

export function requirePermission(user: SessionUser | null, perm: PermissionKey) {
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, perm)) return err('Bu işlem için yetkiniz yok', 403)
  return null
}

// Tenant okuma kapsamı — liste/detay sorgularında kullanılır.
// SUPERADMIN (Program Admini): platform geneli — tenant kısıtlaması YOK.
// Diğer roller: yalnız kendi tenantı. (Yazma işlemlerinde kullanmayın —
// kayıt oluşturmada superadmin'in kendi tenantı atanmalıdır.)
export function tenantScope(user: SessionUser): { tenantId?: string } {
  return isSuperAdmin(user.role) ? {} : { tenantId: user.tenantId }
}

// Görünürlük filtresi — customerId veya ownerId alanına göre
// SUPERADMIN (Program Admini): platform geneli — tüm tenantların verisini görür.
// Dönen filtre boş olur → sorgular tenant kısıtlaması olmadan platform toplamını gösterir.
export async function getVisibilityFilter(user: SessionUser): Promise<{ ownerId?: { in: string[] }; tenantId?: string }> {
  // Program Admini platform işletenidir: tüm şirketleri görür
  if (isSuperAdmin(user.role)) {
    return {}
  }
  const scope = getViewScope(user)
  if (scope === 'all') {
    return { tenantId: user.tenantId }
  }
  // team veya own: görünen kullanıcıları bul
  const users = await db.user.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, managerId: true },
  })
  const visibleIds = getVisibleUserIds(
    users.map((u) => ({ id: u.id, managerId: u.managerId })),
    user.id,
  )
  return { tenantId: user.tenantId, ownerId: { in: visibleIds } }
}

// Belirli bir kaynağın sahibinin görünür olup olmadığını kontrol et
export async function canAccessResource(
  user: SessionUser,
  resourceOwnerId: string | null,
): Promise<boolean> {
  if (getViewScope(user) === 'all') return true
  if (!resourceOwnerId) return false
  if (resourceOwnerId === user.id) return true
  // Takım görünürlüğü: resourceOwner, kullanıcının astı mı?
  const users = await db.user.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, managerId: true },
  })
  const visibleIds = getVisibleUserIds(
    users.map((u) => ({ id: u.id, managerId: u.managerId })),
    user.id,
  )
  return visibleIds.includes(resourceOwnerId)
}

// JSON parse güvenli
export function safeJsonParse<T>(str: string | null, fallback: T): T {
  if (!str) return fallback
  try {
    return JSON.parse(str) as T
  } catch {
    return fallback
  }
}
