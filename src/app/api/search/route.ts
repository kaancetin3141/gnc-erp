import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, getVisibilityFilter, safeJsonParse } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'

// GET /api/search?q=query — global search across customers, deals, tasks, leads
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  if (q.length < 1) return ok({ customers: [], deals: [], tasks: [], leads: [] })

  const visFilter = await getVisibilityFilter(user!)

  const [customers, deals, tasks, leads] = await Promise.all([
    db.customer.findMany({
      where: {
        ...visFilter,
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
          { taxNumber: { contains: q } },
          { city: { contains: q } },
        ],
      },
      select: { id: true, name: true, sector: true, city: true, phone: true, status: true, segment: true, ownerId: true, owner: { select: { name: true } } },
      take: 8,
      orderBy: { updatedAt: 'desc' },
    }),
    hasPermission(user!, 'deals.manage')
      ? db.deal.findMany({
          where: {
            tenantId: user!.tenantId,
            ...(visFilter.ownerId ? { ownerId: visFilter.ownerId } : {}),
            OR: [{ title: { contains: q } }, { customer: { name: { contains: q } } }],
          },
          select: { id: true, title: true, value: true, currency: true, stage: true, customerId: true, customer: { select: { id: true, name: true } } },
          take: 6,
          orderBy: { updatedAt: 'desc' },
        })
      : Promise.resolve([]),
    hasPermission(user!, 'tasks.view')
      ? db.task.findMany({
          where: {
            tenantId: user!.tenantId,
            ...(visFilter.ownerId ? { assigneeId: visFilter.ownerId } : {}),
            OR: [{ title: { contains: q } }, { customer: { name: { contains: q } } }],
          },
          select: { id: true, title: true, dueDate: true, priority: true, status: true, customerId: true, customer: { select: { id: true, name: true } } },
          take: 6,
          orderBy: { dueDate: 'asc' },
        })
      : Promise.resolve([]),
    hasPermission(user!, 'leads.view')
      ? db.lead.findMany({
          where: {
            tenantId: user!.tenantId,
            ...(visFilter.ownerId ? { ownerId: visFilter.ownerId } : {}),
            OR: [{ name: { contains: q } }, { category: { contains: q } }, { city: { contains: q } }, { phone: { contains: q } }],
          },
          select: { id: true, name: true, category: true, city: true, status: true, phone: true },
          take: 6,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
  ])

  return ok({
    customers: customers.map((c) => ({ ...c, tags: safeJsonParse<string[]>(c.tags ?? '[]', []) })),
    deals,
    tasks,
    leads,
  })
}
