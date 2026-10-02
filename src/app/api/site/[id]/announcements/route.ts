import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// GET — duyurular
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const { id } = await params
  const announcements = await db.announcement.findMany({ where: { siteId: id }, orderBy: { publishDate: 'desc' } })
  return ok(announcements)
}

// POST — duyuru ekle
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const { id } = await params
  const body = await req.json()
  if (!body.title || !body.content) return err('Başlık ve içerik gerekli', 400)
  const ann = await db.announcement.create({
    data: { siteId: id, title: body.title, content: body.content, type: body.type || 'genel', isPinned: body.isPinned || false, createdById: user!.id },
  })
  return ok(ann)
}
