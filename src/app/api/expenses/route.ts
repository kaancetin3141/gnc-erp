import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const CATEGORIES = ['kira','personel','fatura','malzeme','pazarlama','sigorta','vergi','diger']
const STATUSES = ['odendi','beklemedi','odeme_yapilmedi']

// GET — gider listesi (filtreli)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const category = url.searchParams.get('category') || ''
  const status = url.searchParams.get('status') || ''
  const startDate = url.searchParams.get('startDate') || ''
  const endDate = url.searchParams.get('endDate') || ''
  const limit = parseInt(url.searchParams.get('limit') || '200')

  const where: Record<string, unknown> = user!.role === 'superadmin' ? {} : { tenantId: user!.tenantId }
  if (category) where.category = category
  if (status) where.status = status
  if (startDate || endDate) {
    where.date = {}
    if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate)
    if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate + 'T23:59:59')
  }

  const [items, total] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      take: limit,
    }),
    db.expense.count({ where }),
  ])

  // Özet istatistikler
  const totalAmount = items.reduce((s, e) => s + e.amount, 0)
  const byCategory: Record<string, number> = {}
  for (const e of items) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount
  }

  return ok({ items, total, totalAmount, byCategory })
}

// POST — yeni gider
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const body = await req.json()
  const { category, description, amount, currency, date, recurring, vendor, invoiceNo, status } = body

  if (!description || !amount) return err('Açıklama ve tutar gerekli', 400)
  if (!CATEGORIES.includes(category)) return err('Geçersiz kategori', 400)

  const expense = await db.expense.create({
    data: {
      tenantId: user!.tenantId,
      category,
      description,
      amount: parseFloat(amount),
      currency: currency || 'TRY',
      date: date ? new Date(date) : new Date(),
      recurring: recurring || null,
      vendor: vendor || null,
      invoiceNo: invoiceNo || null,
      status: STATUSES.includes(status) ? status : 'odendi',
      createdById: user!.id,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'expense',
    entityId: expense.id,
    after: expense,
  })

  // Kasa & Banka entegrasyonu: ödenmiş gider → kasa çıkışı (otomatik)
  if (expense.status === 'odendi') {
    try {
      let account = await db.cashAccount.findFirst({
        where: { tenantId: user!.tenantId, type: 'kasa', archived: false },
        orderBy: { createdAt: 'asc' },
      })
      if (!account) {
        // İlk kullanımda varsayılan "Ana Kasa"yı aç
        account = await db.cashAccount.create({
          data: { tenantId: user!.tenantId, name: 'Ana Kasa', type: 'kasa' },
        })
      }
      await db.cashTransaction.create({
        data: {
          tenantId: user!.tenantId,
          accountId: account.id,
          type: 'gider',
          category: `Gider/${expense.category}`,
          amount: expense.amount,
          description: expense.description,
          date: expense.date,
          refType: 'expense',
          refId: expense.id,
          userId: user!.id,
        },
      })
    } catch {
      // Kasa entegrasyonu gider kaydını bloklamaz
    }
  }

  return ok(expense)
}
