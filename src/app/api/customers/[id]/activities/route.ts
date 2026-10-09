import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — müşteri aktiviteleri
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { tenantId: true, ownerId: true } })
  if (!customer || customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Müşteri bulunamadı', 404)

  const activities = await db.activity.findMany({
    where: { customerId: id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { date: 'desc' },
  })

  return ok(activities)
}

// POST — yeni aktivite
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { tenantId: true } })
  if (!customer || customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Müşteri bulunamadı', 404)

  const body = await req.json()
  const { type, subject, detail, date, durationMin, outcome } = body

  if (!type || !subject) return err('Tip ve konu gerekli', 400)

  const activity = await db.activity.create({
    data: {
      tenantId: user!.tenantId,
      customerId: id,
      type,
      subject,
      detail: detail || null,
      date: date ? new Date(date) : new Date(),
      durationMin: durationMin || 0,
      outcome: outcome || null,
      userId: user!.id,
    },
  })

  // lastActivityAt güncelle
  await db.customer.update({
    where: { id },
    data: { lastActivityAt: activity.date },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'activity',
    entityId: activity.id,
    after: activity,
  })

  return ok(activity)
}
