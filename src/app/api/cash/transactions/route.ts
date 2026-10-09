import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — kasa hareketleri (hesap/tip/tarih filtreli)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const accountId = url.searchParams.get('accountId') || ''
  const type = url.searchParams.get('type') || ''
  const startDate = url.searchParams.get('startDate') || ''
  const endDate = url.searchParams.get('endDate') || ''
  const limit = parseInt(url.searchParams.get('limit') || '200')

  const where: Record<string, unknown> = user!.role === 'superadmin' ? {} : { tenantId: user!.tenantId }
  if (accountId) where.accountId = accountId
  if (type === 'gelir' || type === 'gider') where.type = type
  if (startDate || endDate) {
    where.date = {}
    if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate)
    if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate + 'T23:59:59')
  }

  const [items, totals] = await Promise.all([
    db.cashTransaction.findMany({
      where,
      include: { account: { select: { id: true, name: true, type: true } } },
      orderBy: { date: 'desc' },
      take: Math.min(limit, 500),
    }),
    db.cashTransaction.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
    }),
  ])

  const income = totals.find((t) => t.type === 'gelir')?._sum.amount ?? 0
  const outcome = totals.find((t) => t.type === 'gider')?._sum.amount ?? 0

  return ok({ items, summary: { income, outcome, net: income - outcome } })
}

// POST — manuel gelir/gider kaydı
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'expenses.manage')
  if (permErr) return permErr

  const body = await req.json().catch(() => null)
  if (!body?.accountId) return err('Hesap seçilmelidir')
  if (!body?.description?.trim()) return err('Açıklama zorunludur')
  if (body.type !== 'gelir' && body.type !== 'gider') return err('Geçersiz hareket tipi')
  const amount = parseFloat(body.amount)
  if (isNaN(amount) || amount <= 0) return err('Geçersiz tutar')

  const account = await db.cashAccount.findFirst({
    where: { id: body.accountId, tenantId: user!.tenantId, archived: false },
  })
  if (!account) return err('Hesap bulunamadı', 404)

  const tx = await db.cashTransaction.create({
    data: {
      tenantId: user!.tenantId,
      accountId: account.id,
      type: body.type,
      category: body.category?.trim() || null,
      amount,
      description: String(body.description).trim(),
      date: body.date ? new Date(body.date) : new Date(),
      refType: 'manual',
      userId: user!.id,
    },
    include: { account: { select: { id: true, name: true, type: true } } },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'cash_transaction',
    entityId: tx.id,
    after: { type: tx.type, amount, description: tx.description },
  })

  return ok(tx, 201)
}
