import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// ADMIN — Platform Servisi tek kayıt (superadmin)
// PATCH  /api/admin/services/[id]  → ad/url/port/açıklama/durum güncelle
// DELETE /api/admin/services/[id]  → kaldır
// Yetki: admin.access + rol superadmin
// ============================================================

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'admin.access')
  if (permErr) return permErr
  if (user!.role !== 'superadmin') {
    return err('Servis yönetimi yalnızca program adminine açıktır', 403)
  }

  const { id } = await ctx.params
  const existing = await db.platformService.findUnique({ where: { id } })
  if (!existing) return err('Servis bulunamadı', 404)

  const body = (await req.json().catch(() => null)) as {
    name?: string
    description?: string
    url?: string
    localPort?: number | null
    icon?: string
    color?: string
    enabled?: boolean
    sortOrder?: number
  } | null
  if (!body) return err('Geçersiz gövde', 400)

  // URL temizliği: boşsa boş bırak; doluysa protokolü koru, kırpmayı yap
  let url = existing.url
  if (typeof body.url === 'string') {
    url = body.url.trim()
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`
  }

  const updated = await db.platformService.update({
    where: { id },
    data: {
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing.name,
      description: typeof body.description === 'string' ? body.description.trim() : existing.description,
      url,
      localPort:
        body.localPort === null
          ? null
          : typeof body.localPort === 'number'
            ? Math.max(1, Math.min(65535, Math.trunc(body.localPort)))
            : existing.localPort,
      icon: typeof body.icon === 'string' && body.icon.trim() ? body.icon.trim() : existing.icon,
      color: typeof body.color === 'string' && body.color.trim() ? body.color.trim() : existing.color,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : existing.enabled,
      sortOrder: typeof body.sortOrder === 'number' ? Math.trunc(body.sortOrder) : existing.sortOrder,
    },
  })

  await writeAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    action: 'service.update',
    entity: 'PlatformService',
    entityId: id,
    before: existing,
    after: updated,
  })

  return ok(updated)
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'admin.access')
  if (permErr) return permErr
  if (user!.role !== 'superadmin') {
    return err('Servis yönetimi yalnızca program adminine açıktır', 403)
  }

  const { id } = await ctx.params
  const existing = await db.platformService.findUnique({ where: { id } })
  if (!existing) return err('Servis bulunamadı', 404)

  await db.platformService.delete({ where: { id } })
  await writeAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    action: 'service.delete',
    entity: 'PlatformService',
    entityId: id,
    before: existing,
  })

  return ok({ deleted: true })
}
