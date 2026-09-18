import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const CATEGORIES = ['kira','personel','fatura','malzeme','pazarlama','sigorta','vergi','diger']
const STATUSES = ['odendi','beklemedi','odeme_yapilmedi']

// PATCH — gider güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const existing = await db.expense.findUnique({ where: { id } })
  if (!existing) return err('Gider bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const body = await req.json()
  const updateData: Record<string, unknown> = {}

  if (body.category !== undefined && CATEGORIES.includes(body.category)) updateData.category = body.category
  if (body.description !== undefined) updateData.description = body.description
  if (body.amount !== undefined) updateData.amount = parseFloat(body.amount)
  if (body.currency !== undefined) updateData.currency = body.currency
  if (body.date !== undefined) updateData.date = new Date(body.date)
  if (body.recurring !== undefined) updateData.recurring = body.recurring || null
  if (body.vendor !== undefined) updateData.vendor = body.vendor || null
  if (body.invoiceNo !== undefined) updateData.invoiceNo = body.invoiceNo || null
  if (body.status !== undefined && STATUSES.includes(body.status)) updateData.status = body.status

  const updated = await db.expense.update({ where: { id }, data: updateData })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'expense',
    entityId: id,
    before: existing,
    after: updated,
  })

  return ok(updated)
}

// DELETE — gider sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const existing = await db.expense.findUnique({ where: { id } })
  if (!existing) return err('Gider bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  await db.expense.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'expense',
    entityId: id,
    before: existing,
  })

  return ok({ success: true })
}
