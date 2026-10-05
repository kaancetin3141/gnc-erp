import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// DELETE — manuel kasa hareketini sil (otomatik hareketler silinemez)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'expenses.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.cashTransaction.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!existing) return err('Hareket bulunamadı', 404)
  if (existing.refType && existing.refType !== 'manual') {
    return err('Otomatik oluşturulan hareket silinemez; kaynak kayıttan işlem yapın')
  }

  await db.cashTransaction.delete({ where: { id } })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'cash_transaction',
    entityId: id,
    before: { type: existing.type, amount: existing.amount, description: existing.description },
  })

  return ok({ deleted: true })
}
