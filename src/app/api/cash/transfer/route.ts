import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// POST — kasa hesapları arası transfer
// İki bağlı hareket oluşur: kaynak hesaba "gider", hedef hesaba "gelir".
// refType='transfer', refId=paylaşım grubu → iki bacak birlikte silinebilir.
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'expenses.manage')
  if (permErr) return permErr

  const body = await req.json().catch(() => null)
  if (!body?.fromAccountId || !body?.toAccountId) return err('Kaynak ve hedef hesap seçilmelidir')
  if (body.fromAccountId === body.toAccountId) return err('Kaynak ve hedef hesap aynı olamaz')
  if (!body?.description?.trim()) return err('Açıklama zorunludur')
  const amount = parseFloat(body.amount)
  if (isNaN(amount) || amount <= 0) return err('Geçersiz tutar')

  const accounts = await db.cashAccount.findMany({
    where: { id: { in: [body.fromAccountId, body.toAccountId] }, tenantId: user!.tenantId, archived: false },
  })
  const from = accounts.find((a) => a.id === body.fromAccountId)
  const to = accounts.find((a) => a.id === body.toAccountId)
  if (!from || !to) return err('Hesap bulunamadı', 404)
  if (from.currency !== to.currency) return err('Farklı para birimleri arasında transfer yapılamaz')

  const date = body.date ? new Date(body.date) : new Date()
  const description = String(body.description).trim()
  const groupId = `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  const result = await db.$transaction(async (tx) => {
    const out = await tx.cashTransaction.create({
      data: {
        tenantId: user!.tenantId,
        accountId: from.id,
        type: 'gider',
        category: 'transfer',
        amount,
        description: `Transfer → ${to.name}: ${description}`,
        date,
        refType: 'transfer',
        refId: groupId,
        userId: user!.id,
      },
    })
    const inc = await tx.cashTransaction.create({
      data: {
        tenantId: user!.tenantId,
        accountId: to.id,
        type: 'gelir',
        category: 'transfer',
        amount,
        description: `Transfer ← ${from.name}: ${description}`,
        date,
        refType: 'transfer',
        refId: groupId,
        userId: user!.id,
      },
    })
    return { out, inc }
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'cash_transfer',
    entityId: groupId,
    after: { from: from.name, to: to.name, amount, description },
  })

  return ok({ groupId, out: result.out, in: result.inc }, 201)
}
