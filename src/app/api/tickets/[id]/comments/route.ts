import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'

// POST — talebe yorum ekle
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'tickets.view')
  if (permErr) return permErr

  const { id } = await params
  const ticket = await db.ticket.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!ticket) return err('Talep bulunamadı', 404)

  const body = await req.json().catch(() => null)
  if (!body?.body?.trim()) return err('Yorum metni zorunludur')

  const comment = await db.ticketComment.create({
    data: {
      ticketId: ticket.id,
      userId: user!.id,
      authorName: user!.name,
      body: String(body.body).trim(),
      internal: body.internal === true,
    },
  })

  // Talep "closed" ise yorum eklenince yeniden açılsın
  if (ticket.status === 'closed') {
    await db.ticket.update({ where: { id: ticket.id }, data: { status: 'open', resolvedAt: null } })
  }

  return ok(comment, 201)
}
