import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// TENANT İZOLASYONU: site bu tenant'a ait mi?
async function checkSite(siteId: string, tenantId: string, isSuperadmin: boolean) {
  const site = await db.site.findUnique({ where: { id: siteId } })
  if (!site) return null
  if (site.tenantId !== tenantId && !isSuperadmin) return null
  return site
}

// GET — duyurular
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!user!.permissions.includes('site.view') && user!.role !== 'superadmin') {
    return err('Bu modül için yetkiniz yok', 403)
  }

  const { id } = await params
  const site = await checkSite(id, user!.tenantId, user!.role === 'superadmin')
  if (!site) return err('Site bulunamadı', 404)

  const announcements = await db.announcement.findMany({ where: { siteId: id }, orderBy: { publishDate: 'desc' } })
  return ok(announcements)
}

// POST — duyuru ekle
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!user!.permissions.includes('site.manage') && user!.role !== 'superadmin') {
    return err('Bu işlem için yetkiniz yok', 403)
  }

  const { id } = await params
  const site = await checkSite(id, user!.tenantId, user!.role === 'superadmin')
  if (!site) return err('Site bulunamadı', 404)

  const body = await req.json()
  if (!body.title || !body.content) return err('Başlık ve içerik gerekli', 400)
  const ann = await db.announcement.create({
    data: { siteId: id, title: body.title, content: body.content, type: body.type || 'genel', isPinned: body.isPinned || false, createdById: user!.id },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'announcement',
    entityId: ann.id,
    after: { title: ann.title, siteId: id },
  })

  return ok(ann)
}
