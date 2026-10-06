import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { slugify } from '@/lib/slug'

// ============================================================
// ADMIN — Alt alan adı (subdomain) yönetimi
// GET   /api/admin/domains  → base_domain + işletmelerin slug/koordinat listesi
// PATCH /api/admin/domains  → { providerId, slug?, lat?, lng?, isActive? }
// Yetki: admin.access + rol admin|superadmin; admin SADECE kendi tenant'ının işletmelerini düzenler
// Alt alan adı şeması: {slug}.{base_domain} → customer-page (port 3002)
// ============================================================

const BASE_DOMAIN_KEY = 'base_domain'

export async function getBaseDomain(): Promise<string> {
  const row = await db.systemSetting.findUnique({ where: { key: BASE_DOMAIN_KEY } })
  return row?.value ?? ''
}

async function resolveScope(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return { authErr }
  const permErr = requirePermission(user, 'admin.access')
  if (permErr) return { authErr: permErr }
  if (user!.role !== 'superadmin' && user!.role !== 'admin') {
    return { authErr: err('Bu işlem için yönetici yetkisi gerekli', 403) }
  }
  return { user: user!, isSuper: user!.role === 'superadmin' }
}

export async function GET(req: NextRequest) {
  const { authErr, user, isSuper } = await resolveScope(req)
  if (authErr || !user) return authErr

  const baseDomain = await getBaseDomain()
  const providers = await db.serviceProvider.findMany({
    where: isSuper ? {} : { tenantId: user.tenantId },
    orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
    select: {
      id: true, tenantId: true, name: true, slug: true, type: true,
      city: true, district: true, address: true, isActive: true,
      lat: true, lng: true, geoCheckedAt: true,
      tenant: { select: { name: true } },
      _count: { select: { services: true, appointments: true } },
    },
  })

  return ok({
    baseDomain,
    scheme: '{slug}.{base_domain} → customer-page (port 3002)',
    items: providers.map((p) => ({
      id: p.id,
      tenantId: p.tenantId,
      tenantName: p.tenant.name,
      name: p.name,
      slug: p.slug,
      type: p.type,
      city: p.city,
      district: p.district,
      address: p.address,
      isActive: p.isActive,
      lat: p.lat,
      lng: p.lng,
      geoCheckedAt: p.geoCheckedAt,
      services: p._count.services,
      appointments: p._count.appointments,
    })),
  })
}

export async function PATCH(req: NextRequest) {
  const { authErr, user, isSuper } = await resolveScope(req)
  if (authErr || !user) return authErr

  const body = (await req.json().catch(() => null)) as {
    providerId?: string
    slug?: string
    lat?: number | null
    lng?: number | null
    isActive?: boolean
  } | null
  if (!body?.providerId) return err('providerId gerekli', 400)

  const provider = await db.serviceProvider.findUnique({
    where: { id: body.providerId },
    include: { tenant: { select: { name: true } } },
  })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (!isSuper && provider.tenantId !== user.tenantId) {
    return err('Başka bir işletmenin alan adını düzenleme yetkiniz yok', 403)
  }

  const data: { slug?: string; lat?: number | null; lng?: number | null; isActive?: boolean } = {}

  if (body.slug !== undefined) {
    const s = slugify(body.slug)
    if (s.length < 3) return err('Alt alan adı en az 3 karakter olmalı (a-z, 0-9, tire)', 400)
    if (s !== provider.slug) {
      const clash = await db.serviceProvider.findUnique({ where: { slug: s } })
      if (clash) return err(`"${s}" alt alan adı başka bir işletme tarafından kullanılıyor`, 409)
      data.slug = s
    }
  }
  if (body.lat !== undefined) {
    if (body.lat === null) data.lat = null
    else if (typeof body.lat !== 'number' || body.lat < -90 || body.lat > 90) {
      return err('Enlem (lat) -90 ile 90 arasında olmalı', 400)
    } else data.lat = body.lat
  }
  if (body.lng !== undefined) {
    if (body.lng === null) data.lng = null
    else if (typeof body.lng !== 'number' || body.lng < -180 || body.lng > 180) {
      return err('Boylam (lng) -180 ile 180 arasında olmalı', 400)
    } else data.lng = body.lng
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive)

  if (Object.keys(data).length === 0) return err('Güncellenecek alan yok', 400)

  const updated = await db.serviceProvider.update({
    where: { id: provider.id },
    data,
  })

  await writeAuditLog({
    tenantId: provider.tenantId,
    actorId: user.id,
    action: 'domain.update',
    entity: 'ServiceProvider',
    entityId: provider.id,
    before: { slug: provider.slug, lat: provider.lat, lng: provider.lng, isActive: provider.isActive },
    after: data,
  })

  return ok({
    provider: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      lat: updated.lat,
      lng: updated.lng,
      isActive: updated.isActive,
      tenantName: provider.tenant.name,
    },
  })
}
