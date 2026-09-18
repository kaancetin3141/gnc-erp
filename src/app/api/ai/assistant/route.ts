import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { askAssistant } from '@/lib/ai/crm-ai'

// POST — AI asistanına soru sor
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const body = await req.json().catch(() => ({}))
  const { question } = body as { question?: string }
  if (!question?.trim()) return err('Soru gerekli', 400)

  // Kullanıcı bağlamını topla
  const now = new Date()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [
    customerCount,
    openDeals,
    pipelineValue,
    pendingTasks,
    recentActivities,
  ] = await Promise.all([
    db.customer.count({ where: { tenantId: user!.tenantId } }),
    db.deal.findMany({
      where: { tenantId: user!.tenantId, stage: { notIn: ['kazanıldı', 'kaybedildi'] } },
      select: { value: true },
    }),
    db.deal.findMany({
      where: { tenantId: user!.tenantId, stage: { notIn: ['kazanıldı', 'kaybedildi'] } },
      select: { value: true },
    }),
    db.task.count({
      where: { tenantId: user!.tenantId, status: 'acik', assigneeId: user!.id },
    }),
    db.activity.findMany({
      where: { tenantId: user!.tenantId, date: { gte: lastMonthStart } },
      select: { type: true, subject: true, date: true },
      orderBy: { date: 'desc' },
      take: 5,
    }),
  ])

  const totalPipeline = pipelineValue.reduce((s, d) => s + d.value, 0)

  const response = await askAssistant(question, {
    userName: user!.name,
    tenantName: user!.tenant.name,
    customerCount,
    openDeals: openDeals.length,
    pipelineValue: totalPipeline,
    pendingTasks,
    recentActivities: recentActivities.map((a) => ({
      type: a.type,
      subject: a.subject,
      date: a.date.toISOString().slice(0, 10),
    })),
  })

  return ok({ response, question })
}
