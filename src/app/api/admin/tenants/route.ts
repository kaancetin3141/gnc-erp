import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { isSuperAdmin, getAdminPermissionsForTenant } from '@/lib/rbac'
import { getTenantSector } from '@/lib/tenant-sector'

// ============================================================
// ADMIN — İşletme (tenant) listesi
// GET /api/admin/tenants
// - superadmin: TÜM işletmeler + modül sayaçları
// - admin: SADECE kendi işletmesi
// Yetki: admin.access + rol admin|superadmin
// ============================================================
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'admin.access')
  if (permErr) return permErr
  if (user!.role !== 'superadmin' && user!.role !== 'admin') {
    return err('Bu işlem için yönetici yetkisi gerekli', 403)
  }

  const isSuper = user!.role === 'superadmin'
  const where = isSuper ? {} : { id: user!.tenantId }

  const tenants = await db.tenant.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: {
      _count: {
        select: {
          users: true,
          customers: true,
          serviceProviders: true,
          orders: true,
          invoices: true,
          tasks: true,
          products: true,
        },
      },
    },
  })

  // Randevu sayıları: ServiceProvider üzerinden (tenant'ta doğrudan relation yok)
  const tenantIds = tenants.map((t) => t.id)
  const providerRows = await db.serviceProvider.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { id: true, tenantId: true, _count: { select: { appointments: true } } },
  })
  const appointmentCountByTenant: Record<string, number> = {}
  for (const p of providerRows) {
    appointmentCountByTenant[p.tenantId] =
      (appointmentCountByTenant[p.tenantId] ?? 0) + p._count.appointments
  }

  const items = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    plan: t.plan,
    defaultCurrency: t.defaultCurrency,
    country: t.country,
    createdAt: t.createdAt,
    sector: getTenantSector(t.name),
    counts: {
      users: t._count.users,
      customers: t._count.customers,
      providers: t._count.serviceProviders,
      orders: t._count.orders,
      invoices: t._count.invoices,
      tasks: t._count.tasks,
      products: t._count.products,
      appointments: appointmentCountByTenant[t.id] ?? 0,
    },
  }))

  return ok({ items, total: items.length, scope: isSuper ? 'platform' : 'tenant' })
}

// ============================================================
// ADMIN — Yeni işletme (tenant) oluşturma sihirbazı
// POST /api/admin/tenants
// - Yalnızca superadmin (Program Admini) yeni işletme açabilir.
// Body:
//   name                  (zorunlu, unique — büyük/küçük harf duyarsız)
//   plan?                 'free' | 'business' | 'enterprise'  (default 'business')
//   defaultCurrency?      ISO 4217 3-harf, örn 'TRY'        (default 'TRY')
//   country?              ISO 3166-1 alpha-2, örn 'TR'       (default 'TR')
//   adminUser?            { name, email, password } — ilk şirket admini
//                         (verildiyse üç alan zorunlu; şifre min 8 karakter;
//                         tenant ile birlikte TRANSACTION içinde oluşturulur,
//                         bcrypt hash, role='admin', status='active',
//                         yetkiler = getAdminPermissionsForTenant(name) — sektör bazlı)
// Not: Sektör (industry) ayrı kolon DEĞİL — tenant adından otomatik
// türetilir (getTenantSector) ve yanıtta 'sector' olarak döner.
// Response 201: { tenant: { id, name, plan, defaultCurrency, country, sector, createdAt },
//                 admin?: { id, name, email, role, status } }
// ============================================================
const VALID_PLANS = ['free', 'business', 'enterprise'] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!isSuperAdmin(user!.role)) {
    return err('Yeni işletme açma yetkisi yalnızca Program Admini\u2019ne aittir', 403)
  }

  const body = await req.json().catch(() => ({}))

  // --- Zorlu alan: name (unique) ---
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return err('İşletme adı gerekli', 400)
  if (name.length > 120) return err('İşletme adı en fazla 120 karakter olabilir', 400)

  const nameTaken = await db.tenant.findFirst({ where: { name }, select: { id: true } })
    ?? (await db.tenant.findMany({ select: { name: true } }))
      .some((t) => t.name.trim().toLowerCase() === name.toLowerCase())
  if (nameTaken) return err('Bu işletme adı zaten kayıtlı', 409)

  // --- Opsiyonel alanlar + validasyon ---
  const plan = body.plan === undefined || body.plan === null || body.plan === ''
    ? 'business'
    : String(body.plan)
  if (!VALID_PLANS.includes(plan as typeof VALID_PLANS[number])) {
    return err(`Geçersiz plan: ${plan} (geçerli: ${VALID_PLANS.join(', ')})`, 400)
  }

  const defaultCurrency = body.defaultCurrency === undefined || body.defaultCurrency === null || body.defaultCurrency === ''
    ? 'TRY'
    : String(body.defaultCurrency).trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(defaultCurrency)) {
    return err('Para birimi 3 harf olmalı (örn. TRY, USD, EUR)', 400)
  }

  const country = body.country === undefined || body.country === null || body.country === ''
    ? 'TR'
    : String(body.country).trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) {
    return err('Ülke kodu 2 harf olmalı (örn. TR, US)', 400)
  }

  // --- Opsiyonel: ilk admin kullanıcısı ---
  const au = body.adminUser
  let adminInput: { name: string; email: string; password: string } | null = null
  if (au && typeof au === 'object') {
    const adminName = typeof au.name === 'string' ? au.name.trim() : ''
    const adminEmail = typeof au.email === 'string' ? au.email.trim().toLowerCase() : ''
    const adminPassword = typeof au.password === 'string' ? au.password : ''
    if (!adminName || !adminEmail || !adminPassword) {
      return err('İlk admin için ad, e-posta ve şifre alanlarının tamamı gerekli', 400)
    }
    if (!EMAIL_RE.test(adminEmail)) return err('Geçerli bir e-posta adresi girin', 400)
    if (adminPassword.length < 8) return err('İlk admin şifresi en az 8 karakter olmalı', 400)
    const emailTaken = await db.user.findUnique({ where: { email: adminEmail }, select: { id: true } })
    if (emailTaken) return err('Bu e-posta zaten kayıtlı', 409)
    adminInput = { name: adminName, email: adminEmail, password: adminPassword }
  }

  // --- Tenant + ilk admin birlikte (transaction) ---
  const created = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name, plan, defaultCurrency, country },
    })

    let admin: { id: string; name: string; email: string; role: string; status: string } | undefined
    if (adminInput) {
      // Admin yetkileri: /api/users POST admin akışıyla aynı — sektör bazlı
      const adminPerms = getAdminPermissionsForTenant(tenant.name)
      const u = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: adminInput.email,
          name: adminInput.name,
          role: 'admin',
          status: 'active',
          passwordHash: bcrypt.hashSync(adminInput.password, 10),
          permissions: JSON.stringify(adminPerms),
        },
      })
      admin = { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status }
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: user!.id,
          action: 'create',
          entity: 'user',
          entityId: u.id,
          after: JSON.stringify({
            id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
            tenant: tenant.name, ilkAdmin: true, passwordHash: undefined,
          }),
        },
      })
    }

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: user!.id,
        action: 'create',
        entity: 'tenant',
        entityId: tenant.id,
        after: JSON.stringify({
          name: tenant.name, plan: tenant.plan,
          defaultCurrency: tenant.defaultCurrency, country: tenant.country,
          ilkAdmin: admin ? { email: admin.email } : null,
        }),
      },
    })

    return { tenant, admin }
  })

  return ok({
    tenant: {
      id: created.tenant.id,
      name: created.tenant.name,
      plan: created.tenant.plan,
      defaultCurrency: created.tenant.defaultCurrency,
      country: created.tenant.country,
      createdAt: created.tenant.createdAt,
      sector: getTenantSector(created.tenant.name),
    },
    admin: created.admin ?? null,
  }, 201)
}
