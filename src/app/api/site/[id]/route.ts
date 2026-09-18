import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// GET — site detayı (blocks + apartments + staff + stats)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const site = await db.site.findUnique({
    where: { id },
    include: {
      blocks: { include: { _count: { select: { apartments: true } } }, orderBy: { name: 'asc' } },
      siteStaff: { orderBy: { name: 'asc' } },
      announcements: { orderBy: { publishDate: 'desc' }, take: 10 },
      _count: { select: { dues: true, complaints: true } },
    },
  })
  if (!site || site.tenantId !== user!.tenantId) return err('Site bulunamadı', 404)

  // Aidat istatistikleri
  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()
  const duesStats = await db.dues.groupBy({
    by: ['status'],
    where: { siteId: id, month: currentMonth, year: currentYear },
    _count: true,
    _sum: { amount: true },
  })

  return ok({ ...site, duesStats })
}

// PATCH
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const existing = await db.site.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== user!.tenantId) return err('Site bulunamadı', 404)

  const body = await req.json()
  const allowed = ['name', 'address', 'city', 'district', 'phone', 'email', 'managerName', 'dueDay', 'defaultDueAmount', 'currency', 'isActive']
  const updateData: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updateData[key] = key === 'dueDay' || key === 'defaultDueAmount' ? (body[key] ? parseFloat(body[key]) : 0) : body[key]
  }

  const updated = await db.site.update({ where: { id }, data: updateData })
  return ok(updated)
}

// DELETE
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const existing = await db.site.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== user!.tenantId) return err('Site bulunamadı', 404)

  await db.site.delete({ where: { id } })
  return ok({ success: true })
}
