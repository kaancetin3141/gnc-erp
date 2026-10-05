import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — kasa/banka hesapları + bakiyeleri
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const accounts = await db.cashAccount.findMany({
    where: { tenantId: user!.tenantId, archived: false },
    include: {
      transactions: {
        select: { type: true, amount: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const items = accounts.map((a) => {
    const income = a.transactions.filter((t) => t.type === 'gelir').reduce((s, t) => s + t.amount, 0)
    const outcome = a.transactions.filter((t) => t.type === 'gider').reduce((s, t) => s + t.amount, 0)
    const { transactions: _t, ...rest } = a
    return {
      ...rest,
      income,
      outcome,
      balance: a.initialBalance + income - outcome,
      txCount: a.transactions.length,
    }
  })

  const totalBalance = items.reduce((s, a) => s + a.balance, 0)
  return ok({ items, totalBalance })
}

// POST — yeni hesap aç
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'expenses.manage')
  if (permErr) return permErr

  const body = await req.json().catch(() => null)
  if (!body?.name?.trim()) return err('Hesap adı zorunludur')
  const type = body.type === 'banka' ? 'banka' : 'kasa'
  const initialBalance = parseFloat(body.initialBalance ?? 0)
  if (isNaN(initialBalance) || initialBalance < 0) return err('Geçersiz başlangıç bakiyesi')

  const account = await db.cashAccount.create({
    data: {
      tenantId: user!.tenantId,
      name: String(body.name).trim(),
      type,
      currency: body.currency || 'TRY',
      initialBalance,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'cash_account',
    entityId: account.id,
    after: { name: account.name, type: account.type },
  })

  return ok(account, 201)
}
