// Session yönetimi — GERÇEK auth: bcrypt şifre + rastgele session token + Session tablosu
// Geçici uyumluluk: eski demo oturumlar (token = user id) hâlâ çözümlenir.

import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { db } from './db'
import { getRolePermissions } from './rbac'
import type { SessionUser } from '@/types'

const SESSION_COOKIE = 'gnc_session'
const SESSION_HEADER = 'x-gnc-session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 gün

// ─── Oturum yaşam döngüsü ────────────────────────────────────

// Yeni oturum oluştur — rastgele token, Session tablosuna yazılır
export async function createSession(userId: string, userAgent?: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({
    data: { token, userId, userAgent: userAgent ?? null, expiresAt },
  })
  // Süresi geçmiş oturumları temizle (fırsatçı temizlik)
  db.session
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => null)
  return token
}

// Bir kullanıcının tüm oturumlarını iptal et (şifre değişimi sonrası)
export async function revokeUserSessions(userId: string, exceptToken?: string): Promise<number> {
  const sessions = await db.session.findMany({
    where: { userId },
    select: { id: true, token: true },
  })
  const toDelete = sessions
    .filter((s) => s.token !== exceptToken)
    .map((s) => s.id)
  if (toDelete.length === 0) return 0
  const r = await db.session.deleteMany({ where: { id: { in: toDelete } } })
  return r.count
}

// Oturum token'ını iptal et (logout)
export async function revokeSession(token: string): Promise<void> {
  try {
    await db.session.deleteMany({ where: { token } })
  } catch {
    // sessiz geç
  }
}

// ─── Session çözümleme ───────────────────────────────────────

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

// Session token'ını kullanıcıya çözümle:
// 1) Session tablosu (gerçek oturum — rastgele token)
// 2) Geçici uyumluluk: eski demo oturumlar — token = user id
async function resolveSession(token: string): Promise<SessionUser | null> {
  // 1) Gerçek Session tablosu
  try {
    const session = await db.session.findUnique({
      where: { token },
      include: { user: { include: { tenant: true } } },
    })
    if (session) {
      if (session.expiresAt < new Date()) {
        db.session.delete({ where: { id: session.id } }).catch(() => null)
        return null
      }
      return buildSessionUser(session.user)
    }
  } catch {
    // Session tablosu henüz yoksa (eski şema) — legacy'e düş
  }

  // 2) Geçici uyumluluk: eski demo oturum — token = user id
  try {
    const legacyUser = await db.user.findUnique({
      where: { id: token },
      include: { tenant: true },
    })
    if (legacyUser) return buildSessionUser(legacyUser)
  } catch {
    // token user id formatında değil — geç
  }
  return null
}

// ─── Kullanıcı → SessionUser dönüşümü (izin zenginleştirme) ──

function buildSessionUser(user: {
  id: string
  tenantId: string
  email: string
  name: string
  role: string
  permissions: string
  managerId: string | null
  title: string | null
  phone: string | null
  avatarUrl: string | null
  status: string
  tenant: {
    id: string
    name: string
    plan: string
    defaultCurrency: string
    country: string
  } | null
}): SessionUser | null {
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
