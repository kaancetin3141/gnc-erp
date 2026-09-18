// Session yönetimi — demo auth (localStorage tabanlı)
// Gerçek production'da NextAuth/Supabase Auth ile değiştirilebilir.

import { cookies } from 'next/headers'
import { db } from './db'
import { getRolePermissions } from './rbac'
import type { SessionUser } from '@/types'

const SESSION_COOKIE = 'gnc_session'
const SESSION_HEADER = 'x-gnc-session'

// Server-side: request'ten session al
export async function getServerSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value
    if (!sessionToken) return null
    return await resolveSession(sessionToken)
  } catch {
    return null
  }
}

// Header'dan session al (client API çağrıları için)
export async function getServerSessionFromRequest(req: Request): Promise<SessionUser | null> {
  try {
    const sessionToken =
      req.headers.get(SESSION_HEADER) ||
      new URL(req.url).searchParams.get('session') ||
      req.headers.get('cookie')?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1]
    if (!sessionToken) return null
    return await resolveSession(sessionToken)
  } catch {
    return null
  }
}

async function resolveSession(token: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({
    where: { id: token },
    include: { tenant: true },
  })
  if (!user || user.status !== 'active') return null
  const permissions = JSON.parse(user.permissions || '[]') as string[]
  // Rolün varsayılan yetkileri yoksa ekle (minimum garanti)
  const rolePerms = getRolePermissions(user.role as SessionUser['role'])
  let allPerms = Array.from(new Set([...permissions, ...rolePerms])) as SessionUser['permissions']

  // HER KULLANICIYA dashboard.view ve messages.view garantile —
  // hiçbir kullanıcı "yetkisiz erişim" görmesin
  const guaranteedPerms: string[] = ['dashboard.view', 'messages.view']
  allPerms = Array.from(new Set([...allPerms, ...guaranteedPerms])) as SessionUser['permissions']

  // Admin rolü için tenant adına göre sektörel yetkileri otomatik ekle
  if (user.role === 'admin' && user.tenant) {
    const tName = user.tenant.name.toLowerCase()
    const sectorPerms: string[] = []
    if (tName.includes('kafe') || tName.includes('restoran') || tName.includes('cafe')) {
      sectorPerms.push('cafe.view', 'cafe.manage', 'cafe.orders', 'cafe.bar', 'cafe.kitchen')
    }
    if (tName.includes('market') || tName.includes('bakkal')) {
      sectorPerms.push('market.view', 'market.pos', 'market.stock', 'market.manage', 'production.view', 'production.manage', 'erp.manage')
    }
    if (tName.includes('site') || tName.includes('apartman')) {
      sectorPerms.push('site.view', 'site.manage')
    }
    if (tName.includes('kuaför') || tName.includes('berber') || tName.includes('güzellik') || tName.includes('diş')) {
      sectorPerms.push('appointments.view', 'appointments.manage')
    }
    // CRM/ERP şirketleri
    if (sectorPerms.length === 0) {
      sectorPerms.push(
        'customers.view.own', 'customers.view.team', 'customers.view.all',
        'customers.edit', 'customers.delete',
        'leads.import', 'leads.view', 'leads.edit', 'maps.search',
        'deals.manage', 'tasks.manage', 'tasks.view',
        'erp.manage', 'production.view', 'production.manage',
      )
    }
    allPerms = Array.from(new Set([...allPerms, ...sectorPerms])) as SessionUser['permissions']
  }

  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role as SessionUser['role'],
    permissions: allPerms,
    managerId: user.managerId,
    title: user.title,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    employeeCode: (user as { employeeCode?: string }).employeeCode ?? null,
    tenant: {
      id: user.tenant.id,
      name: user.tenant.name,
      plan: user.tenant.plan,
      defaultCurrency: user.tenant.defaultCurrency,
      country: user.tenant.country,
    },
  }
}

// Session oluştur (login)
export async function createSession(userId: string): Promise<string> {
  return userId // demo: token = userId
}

// Audit log yazma yardımcısı
export async function writeAuditLog(params: {
  tenantId: string
  actorId: string | null
  action: string
  entity: string
  entityId?: string | null
  before?: unknown
  after?: unknown
}) {
  try {
    await db.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        before: params.before ? JSON.stringify(params.before) : null,
        after: params.after ? JSON.stringify(params.after) : null,
      },
    })
  } catch (e) {
    console.error('Audit log yazılamadı:', e)
  }
}
