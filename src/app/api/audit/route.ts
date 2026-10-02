import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, safeJsonParse } from '@/lib/api-utils'

// GET — tenant bazlı denetim kayıtları (audit log)
// Yetki: audit.view (yalnızca admin/superadmin)
// Query: ?entity=customer | ?action=login | ?actorId=xxx | ?limit=100 (maks 500) | ?cursor=
// Cursor: createdAt_ISO (createdAt DESC sıralı; cursor'dan daha eski kayıtlar alınır)
// Response: { items: AuditLogItem[], nextCursor: string | null }
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'audit.view')
  if (permErr) return permErr

  const url = new URL(req.url)
  const entity = url.searchParams.get('entity') || ''
  const action = url.searchParams.get('action') || ''
  const actorId = url.searchParams.get('actorId') || ''
  const cursor = url.searchParams.get('cursor') || ''
  const limitParam = parseInt(url.searchParams.get('limit') || '100', 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(Math.max(limitParam, 1), 500)
    : 100

  const where: Record<string, unknown> = {
    tenantId: user!.tenantId,
  }
  if (entity) where.entity = entity
  if (action) where.action = action
  if (actorId) where.actorId = actorId

  // Cursor-based pagination (createdAt DESC)
  let cursorDate: Date | null = null
  if (cursor) {
    const d = new Date(cursor)
    if (!isNaN(d.getTime())) {
      cursorDate = d
    }
  }

  const items = await db.auditLog.findMany({
    where: {
      ...where,
      ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
    },
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // bir fazla çek → next cursor var mı diye
  })

  const hasMore = items.length > limit
  const slice = hasMore ? items.slice(0, limit) : items
  const nextCursor = hasMore && slice.length > 0
    ? slice[slice.length - 1].createdAt.toISOString()
    : null

  // before/after alanlarını JSON parse et
  const parsed = slice.map((log) => ({
    id: log.id,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    before: log.before ? safeJsonParse<unknown>(log.before, null) : null,
    after: log.after ? safeJsonParse<unknown>(log.after, null) : null,
    createdAt: log.createdAt.toISOString(),
    actor: log.actor
      ? { id: log.actor.id, name: log.actor.name, email: log.actor.email }
      : null,
  }))

  return ok({ items: parsed, nextCursor })
}
