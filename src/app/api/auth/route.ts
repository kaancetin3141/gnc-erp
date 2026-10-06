import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRolePermissions } from '@/lib/rbac'
import {
  createSession, revokeSession, getServerSessionFromRequest, writeAuditLog,
} from '@/lib/auth'
import { ok, err } from '@/lib/api-utils'
import bcrypt from 'bcryptjs'

const SESSION_COOKIE = 'gnc_session'

// ─── Basit brute-force koruması (memory, email+IP bazlı) ──────
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 10
const WINDOW_MS = 15 * 60 * 1000

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
}

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const rec = loginAttempts.get(key)
  if (!rec || rec.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  rec.count += 1
  return rec.count <= MAX_ATTEMPTS
}

function clearRateLimit(key: string) {
  loginAttempts.delete(key)
}

// GET — seed durumu kontrolü (login ekranı için; kullanıcı listesi SIZMAYIZ)
export async function GET() {
  const userCount = await db.user.count({ where: { status: 'active' } })
  return ok({ seeded: userCount > 0 })
}

// POST — gerçek giriş: email + şifre (bcrypt)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  let email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  // IDN normalizasyonu: tarayıcılar Türkçe karakterli domain'leri punycode'a çevirebilir
  // (örn. admin@sikkuaför.com → admin@xn--sikkuaf-r-t4a.com) — unicode'a geri çevir
  const atIdx = email.lastIndexOf('@')
  if (atIdx > 0 && email.slice(atIdx + 1).includes('xn--')) {
    try {
      const { domainToUnicode } = await import('url')
      const local = email.slice(0, atIdx)
      const domain = domainToUnicode(email.slice(atIdx + 1))
      email = `${local}@${domain}`
    } catch {
      // punycode çözülemezse olduğu gibi devam
    }
  }
  email = email.normalize('NFC')

  // Kullanıcı adı ile giriş: "@" içermiyorsa platform admin alan adına tamamlanır
  // (örn. "admin" → admin@gnccrm.app) — Program Admini kısa kullanıcı adıyla girer
  if (!email.includes('@')) {
    email = `${email}@gnccrm.app`
  }

  if (!email || !password) {
    return err('E-posta ve şifre gerekli', 400)
  }

  // GÜVENLİK: rate limit email+IP kombinasyonu — saldırgan tek hesabı
  // dağıtık deneyemez, kurbanın hesabı tek IP ile kilitlenemez
  const rlKey = `${email}|${clientIp(req)}`
  if (!checkRateLimit(rlKey)) {
    return err('Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.', 429)
  }

  const user = await db.user.findUnique({
    where: { email },
    include: { tenant: true },
  })

  if (!user || user.status !== 'active') {
    return err('E-posta veya şifre hatalı', 401)
  }

  if (!user.passwordHash) {
    // Şifresi henüz atanmamış hesap — yönetici şifre vermelidir
    return err('Bu hesapta şifre tanımlı değil. Yöneticinizle görüşün.', 403)
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash)
  if (!passwordOk) {
    return err('E-posta veya şifre hatalı', 401)
  }

  clearRateLimit(rlKey)

  const rolePerms = getRolePermissions(user.role as 'admin' | 'manager' | 'rep' | 'superadmin' | 'readonly' | 'stock')
  const userPerms = JSON.parse(user.permissions || '[]') as string[]
  // 'admin.access' (Admin Paneli + Dağıtım Merkezi) yalnızca Program Admini'nde —
  // eski kayıtlardaki kalıntı yetkiler de burada süzülür (buildSessionUser ile aynı kural)
  const permissions = Array.from(new Set([...userPerms, ...rolePerms]))
    .filter((p) => p !== 'admin.access' || user.role === 'superadmin')

  const userAgent = req.headers.get('user-agent') ?? undefined
  const token = await createSession(user.id, userAgent)
  await writeAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    action: 'login',
    entity: 'session',
  })

  const res = NextResponse.json({
    sessionId: token,
    mustChangePassword: password === '1234', // varsayılan şifre kullanılıyorsa uyar
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
  }, { status: 200 })

  // Cookie yedeği (server component / tam sayfa yenileme akışları için)
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
  return res
}

// DELETE — logout: oturumu iptal et + cookie sil
export async function DELETE(req: NextRequest) {
  const user = await getServerSessionFromRequest(req)
  const token =
    req.headers.get('x-gnc-session') ||
    req.cookies.get(SESSION_COOKIE)?.value ||
    new URL(req.url).searchParams.get('session')

  if (token) await revokeSession(token)
  if (user) {
    await writeAuditLog({
      tenantId: user.tenantId,
      actorId: user.id,
      action: 'logout',
      entity: 'session',
    })
  }

  const res = NextResponse.json({ success: true }, { status: 200 })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
