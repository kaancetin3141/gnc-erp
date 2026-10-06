import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// ADMIN — Ana alan adı (base domain) ayarı
// PUT /api/admin/domains/settings  body: { baseDomain: "randevu.example.com" | "" }
// Boş değer → anahtar silinir (alt alan adı özelliği kapalı olur)
// Yetki: admin.access + rol admin|superadmin (platform geneli ayar — pratikte superadmin)
// ============================================================

const BASE_DOMAIN_KEY = 'base_domain'

export async function PUT(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'admin.access')
  if (permErr) return permErr
  if (user!.role !== 'superadmin' && user!.role !== 'admin') {
    return err('Bu işlem için yönetici yetkisi gerekli', 403)
  }

  const body = (await req.json().catch(() => null)) as { baseDomain?: string } | null
  if (!body || typeof body.baseDomain !== 'string') return err('baseDomain gerekli', 400)

  // Temizleme: protokol/yol/kuyruk nokta kaldır, küçült
  let value = body.baseDomain.trim().toLowerCase()
  value = value.replace(/^https?:\/\//, '').split('/')[0].replace(/\.$/, '')

  if (value === '') {
    await db.systemSetting.deleteMany({ where: { key: BASE_DOMAIN_KEY } })
    await writeAuditLog({
      tenantId: user.tenantId,
      actorId: user.id,
      action: 'domain.settings',
      entity: 'SystemSetting',
      entityId: BASE_DOMAIN_KEY,
      after: { baseDomain: '' },
    })
    return ok({ baseDomain: '' })
  }

  // basit hostname doğrulaması
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value) || value.length > 253) {
    return err('Geçerli bir alan adı girin (örn. randevu.example.com)', 400)
  }

  await db.systemSetting.upsert({
    where: { key: BASE_DOMAIN_KEY },
    create: { key: BASE_DOMAIN_KEY, value },
    update: { value },
  })

  await writeAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    action: 'domain.settings',
    entity: 'SystemSetting',
    entityId: BASE_DOMAIN_KEY,
    after: { baseDomain: value },
  })

  return ok({ baseDomain: value })
}

export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'admin.access')
  if (permErr) return permErr

  const row = await db.systemSetting.findUnique({ where: { key: BASE_DOMAIN_KEY } })
  return ok({ baseDomain: row?.value ?? '' })
}
