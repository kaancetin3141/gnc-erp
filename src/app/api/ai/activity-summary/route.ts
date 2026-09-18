import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { summarizeActivities } from '@/lib/ai/crm-ai'

// POST — belirli müşteri için AI aktivite özeti
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'customers.view.own')) return err('Müşteri görüntüleme yetkiniz yok', 403)

  const body = await req.json().catch(() => ({}))
  const { customerId } = body as { customerId?: string }
  if (!customerId) return err('customerId gerekli', 400)

  const customer = await db.customer.findFirst({
    where: { id: customerId, tenantId: user!.tenantId },
    include: {
      activities: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take: 30,
      },
    },
  })
  if (!customer) return err('Müşteri bulunamadı', 404)

  const summary = await summarizeActivities(
    customer.activities.map((a) => ({
      type: a.type,
      subject: a.subject,
      date: a.date.toISOString(),
      outcome: a.outcome,
      customerName: customer.name,
      userName: a.user?.name,
    })),
  )

  return ok({
    customerId,
    customerName: customer.name,
    activityCount: customer.activities.length,
    summary,
  })
}
