import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { tenantId: true } })
  if (!customer || customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Müşteri bulunamadı', 404)

  const notes = await db.note.findMany({
    where: { customerId: id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
  })
  return ok(notes)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { tenantId: true } })
  if (!customer || customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Müşteri bulunamadı', 404)

  const body = await req.json()
  if (!body.content) return err('Not içeriği gerekli', 400)

  const note = await db.note.create({
    data: {
      customerId: id,
      userId: user!.id,
      content: body.content,
      isPinned: body.isPinned || false,
    },
    include: { user: { select: { id: true, name: true } } },
  })
  return ok(note)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const body = await req.json()
  const { noteId, content, isPinned } = body

  const note = await db.note.update({
    where: { id: noteId },
    data: { content, isPinned },
    include: { user: { select: { id: true, name: true } } },
  })
  return ok(note)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const noteId = url.searchParams.get('noteId')
  if (!noteId) return err('noteId gerekli', 400)

  await db.note.delete({ where: { id: noteId } })
  return ok({ success: true })
}
