import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// GET — şikayetler
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const { id } = await params
  const url = new URL(req.url)
  const status = url.searchParams.get('status') || ''
  const where: Record<string, unknown> = { siteId: id }
  if (status) where.status = status
  const complaints = await db.complaint.findMany({
    where,
    include: { resident: { select: { name: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return ok(complaints)
}

// POST — şikayet ekle
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const { id } = await params
  const body = await req.json()
  if (!body.title || !body.description) return err('Başlık ve açıklama gerekli', 400)
  const complaint = await db.complaint.create({
    data: {
      siteId: id,
      residentId: body.residentId || null,
      title: body.title,
      description: body.description,
      category: body.category || 'diger',
      priority: body.priority || 'normal',
    },
  })
  return ok(complaint)
}
