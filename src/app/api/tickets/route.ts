import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed']

// GET — destek talepleri
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const viewErr = requirePermission(user, 'tickets.view')
  if (viewErr) return viewErr

  const url = new URL(req.url)
  const status = url.searchParams.get('status') || ''
  const priority = url.searchParams.get('priority') || ''
  const q = url.searchParams.get('q') || ''
  const mine = url.searchParams.get('mine') === '1'

  const where: Record<string, unknown> = user!.role === 'superadmin' ? {} : { tenantId: user!.tenantId }
  if (status) where.status = status
  if (priority) where.priority = priority
  if (mine) where.assigneeId = user!.id
  if (q) {
    where.OR = [
      { subject: { contains: q } },
      { code: { contains: q } },
      { description: { contains: q } },
    ]
  }

  const tickets = await db.ticket.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
    },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: 300,
  })

  const openCount = tickets.filter((t) => ['open', 'in_progress', 'waiting'].includes(t.status)).length
  const urgentCount = tickets.filter((t) => t.priority === 'urgent' && !['resolved', 'closed'].includes(t.status)).length
  const resolvedThisWeek = tickets.filter(
    (t) => t.resolvedAt && new Date(t.resolvedAt).getTime() > Date.now() - 7 * 86400000,
  ).length

  return ok({ items: tickets, summary: { openCount, urgentCount, resolvedThisWeek } })
}

// POST — yeni talep aç
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'tickets.view')
  if (permErr) return permErr

  const body = await req.json().catch(() => null)
  if (!body?.subject?.trim()) return err('Konu zorunludur')
  if (body.priority && !PRIORITIES.includes(body.priority)) return err('Geçersiz öncelik')

  if (body.customerId) {
    const customer = await db.customer.findFirst({
      where: { id: body.customerId, tenantId: user!.tenantId },
    })
    if (!customer) return err('Müşteri bulunamadı', 404)
  }

  const count = await db.ticket.count({ where: { tenantId: user!.tenantId } })
  const code = `TRK-${String(count + 1).padStart(4, '0')}`

  const ticket = await db.ticket.create({
    data: {
      tenantId: user!.tenantId,
      code,
      subject: String(body.subject).trim(),
      description: body.description?.trim() || null,
      category: body.category?.trim() || null,
      priority: body.priority || 'normal',
      customerId: body.customerId || null,
      assigneeId: body.assigneeId || null,
      createdById: user!.id,
    },
    include: {
      customer: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'ticket',
    entityId: ticket.id,
    after: { code: ticket.code, subject: ticket.subject, priority: ticket.priority },
  })

  return ok(ticket, 201)
}
