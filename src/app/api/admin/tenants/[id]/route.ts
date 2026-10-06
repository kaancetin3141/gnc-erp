import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err, safeJsonParse } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { getTenantSector } from '@/lib/tenant-sector'

// ============================================================
// ADMIN — İşletme (tenant) detayı ve güncelleme
// GET   /api/admin/tenants/[id]  → bilgi + kullanıcılar + roller + sağlayıcılar + ayarlar + sayaçlar
// PATCH /api/admin/tenants/[id]  → name/country/defaultCurrency (kendi) · plan (sadece superadmin)
// Yetki: admin.access + rol admin|superadmin; admin SADECE kendi tenant'ını görür
// ============================================================

async function resolveTenant(req: NextRequest, id: string) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return { authErr }
  const permErr = requirePermission(user, 'admin.access')
  if (permErr) return { authErr: permErr }
  if (user!.role !== 'superadmin' && user!.role !== 'admin') {
    return { authErr: err('Bu işlem için yönetici yetkisi gerekli', 403) }
  }
  const tenant = await db.tenant.findUnique({ where: { id } })
  if (!tenant) return { authErr: err('İşletme bulunamadı', 404) }
  // Güvenlik: şirket admini SADECE kendi tenant'ını yönetebilir
  if (user!.role !== 'superadmin' && tenant.id !== user!.tenantId) {
    return { authErr: err('Başka bir işletmeye erişim yetkiniz yok', 403) }
  }
  return { user: user! }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { authErr, user } = await resolveTenant(req, id)
  if (authErr || !user) return authErr

  const tenant = await db.tenant.findUnique({
    where: { id },
    include: {
      users: {
        select: {
          id: true, name: true, email: true, role: true, status: true,
          title: true, phone: true, createdAt: true,
          _count: { select: { ownedCustomers: true, assignedTasks: true } },
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      },
      serviceProviders: {
        select: {
          id: true, name: true, slug: true, type: true, city: true, district: true,
          address: true, phone: true, isActive: true, lat: true, lng: true,
          _count: { select: { services: true, staff: true, appointments: true } },
        },
        orderBy: { name: 'asc' },
      },
      settings: true,
      _count: {
        select: {
          customers: true, leads: true, deals: true, tasks: true,
          orders: true, invoices: true, products: true, expenses: true,
        },
      },
    },
  })
  if (!tenant) return err('İşletme bulunamadı', 404)

  const recentAudit = await db.auditLog.findMany({
    where: { tenantId: id },
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: { actor: { select: { id: true, name: true } } },
  })

  // Kullanıcı rollerine göre gruplama (rol yönetimi görünümü için)
  const roleGroups: Record<string, number> = {}
  for (const u of tenant.users) roleGroups[u.role] = (roleGroups[u.role] ?? 0) + 1

  return ok({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      plan: tenant.plan,
      defaultCurrency: tenant.defaultCurrency,
      country: tenant.country,
      createdAt: tenant.createdAt,
      sector: getTenantSector(tenant.name),
    },
    roleGroups,
    users: tenant.users,
    providers: tenant.serviceProviders,
    settings: tenant.settings.map((s) => ({
      key: s.key,
      value: safeJsonParse<unknown>(s.value, s.value),
      updatedAt: s.updatedAt,
    })),
    counts: tenant._count,
    recentAudit,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { authErr, user } = await resolveTenant(req, id)
  if (authErr || !user) return authErr

  const body = (await req.json().catch(() => null)) as {
    name?: string
    country?: string
    defaultCurrency?: string
    plan?: string
  } | null
  if (!body) return err('Geçersiz istek gövdesi', 400)

  const before = await db.tenant.findUnique({ where: { id } })
  if (!before) return err('İşletme bulunamadı', 404)

  const data: Record<string, string> = {}
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (name.length < 2 || name.length > 80) return err('İşletme adı 2-80 karakter olmalı', 400)
    data.name = name
  }
  if (body.country !== undefined) {
    const c = body.country.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(c)) return err('Ülke kodu 2 harf olmalı (örn. TR)', 400)
    data.country = c
  }
  if (body.defaultCurrency !== undefined) {
    const cur = body.defaultCurrency.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(cur)) return err('Para birimi 3 harf olmalı (örn. TRY)', 400)
    data.defaultCurrency = cur
  }
  if (body.plan !== undefined) {
    // plan yalnızca platform sahibi (superadmin) tarafından değiştirilir
    if (user.role !== 'superadmin') return err('Plan değişikliği için program yöneticisi olmalısınız', 403)
    if (!['free', 'business', 'enterprise'].includes(body.plan)) {
      return err('Geçersiz plan (free | business | enterprise)', 400)
    }
    data.plan = body.plan
  }
  if (Object.keys(data).length === 0) return err('Güncellenecek alan yok', 400)

  const updated = await db.tenant.update({ where: { id }, data })

  await writeAuditLog({
    tenantId: id,
    actorId: user.id,
    action: 'tenant.update',
    entity: 'Tenant',
    entityId: id,
    before: { name: before.name, plan: before.plan, country: before.country, defaultCurrency: before.defaultCurrency },
    after: data,
  })

  return ok({
    tenant: {
      id: updated.id,
      name: updated.name,
      plan: updated.plan,
      defaultCurrency: updated.defaultCurrency,
      country: updated.country,
      sector: getTenantSector(updated.name),
    },
  })
}
