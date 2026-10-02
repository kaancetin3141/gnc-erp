import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { tenantId: true } })
  if (!customer || customer.tenantId !== user!.tenantId) return err('Müşteri bulunamadı', 404)

  const deals = await db.deal.findMany({
    where: { customerId: id },
    include: { owner: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
  })
  return ok(deals)
}
