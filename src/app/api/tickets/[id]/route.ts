import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']

// GET — talep detayı + yorumlar
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const viewErr = requirePermission(user, 'tickets.view')
  if (viewErr) return viewErr

  const { id } = await params
  const ticket = await db.ticket.findFirst({
    where: { id, tenantId: user!.tenantId },
    include: {
      customer: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      comments: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!ticket) return err('Talep bulunamadı', 404)

  return ok(ticket)
}

// PATCH — talebi güncelle (durum/öncelik/atama)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'tickets.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.ticket.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!existing) return err('Talep bulunamadı', 404)

  const body = await req.json().catch(() => null)
  if (!body) return err('Geçersiz istek')

  const data: Record<string, unknown> = {}
  if (body.status) {
    if (!STATUSES.includes(body.status)) return err('Geçersiz durum')
    data.status = body.status
    if (body.status === 'resolved' || body.status === 'closed') {
      data.resolvedAt = existing.resolvedAt ?? new Date()
    } else {
      data.resolvedAt = null
    }
  }
  if (body.priority) {
    if (!PRIORITIES.includes(body.priority)) return err('Geçersiz öncelik')
    data.priority = body.priority
  }
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null
  if (typeof body.subject === 'string' && body.subject.trim()) data.subject = body.subject.trim()
  if (typeof body.description === 'string') data.description = body.description.trim() || null

  const ticket = await db.ticket.update({
    where: { id },
    data,
    include: {
      customer: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'ticket',
    entityId: id,
    before: { status: existing.status, priority: existing.priority },
    after: data,
  })

  return ok(ticket)
}

// DELETE — talebi sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'tickets.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.ticket.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!existing) return err('Talep bulunamadı', 404)

  await db.ticket.delete({ where: { id } })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'ticket',
    entityId: id,
    before: { code: existing.code, subject: existing.subject },
  })

  return ok({ deleted: true })
}
