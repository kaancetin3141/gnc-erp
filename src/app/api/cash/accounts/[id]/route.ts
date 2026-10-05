import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// PATCH — hesap düzenle (ad/tip/arşiv)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'expenses.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.cashAccount.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!existing) return err('Hesap bulunamadı', 404)

  const body = await req.json().catch(() => null)
  if (!body) return err('Geçersiz istek')

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (body.type === 'kasa' || body.type === 'banka') data.type = body.type
  if (typeof body.archived === 'boolean') data.archived = body.archived
  if (body.initialBalance !== undefined) {
    const b = parseFloat(body.initialBalance)
    if (isNaN(b) || b < 0) return err('Geçersiz başlangıç bakiyesi')
    data.initialBalance = b
  }

  const account = await db.cashAccount.update({ where: { id }, data })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'cash_account',
    entityId: id,
    after: data,
  })

  return ok(account)
}

// DELETE — hesap sil (hareketi varsa arşivle)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'expenses.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.cashAccount.findFirst({
    where: { id, tenantId: user!.tenantId },
    include: { _count: { select: { transactions: true } } },
  })
  if (!existing) return err('Hesap bulunamadı', 404)

  if (existing._count.transactions > 0) {
    await db.cashAccount.update({ where: { id }, data: { archived: true } })
    return ok({ archived: true, message: 'Hareketi olan hesap silinemedi, arşivlendi' })
  }

  await db.cashAccount.delete({ where: { id } })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'cash_account',
    entityId: id,
    before: { name: existing.name },
  })

  return ok({ deleted: true })
}
