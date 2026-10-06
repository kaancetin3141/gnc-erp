import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// GET — veresiye müşterileri + bakiyeler + yaşlandırma özeti
// Query: ?q= (arama) | ?includeInactive=1
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId) return err('Market bulunamadı', 404)

  const sp = Object.fromEntries(new URL(req.url).searchParams)
  const q = (sp.q || '').toLowerCase()
  const includeInactive = sp.includeInactive === '1'

  const where: Record<string, unknown> = { marketId: id }
  if (!includeInactive) where.isActive = true
  if (q) where.OR = [
    { name: { contains: q } },
    { phone: { contains: q } },
  ]

  const customers = await db.creditCustomer.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      entries: { orderBy: { createdAt: 'asc' } },
    },
    take: 500,
  })

  // Bakiye hesabı: borc(+), odeme(-). Pozitif bakiye = müşterinin borcu
  const items = customers.map((c) => {
    let balance = 0
    let lastDebtDate: Date | null = null
    let overdueAmount = 0
    const now = Date.now()
    for (const e of c.entries) {
      if (e.type === 'borc') {
        balance += e.amount
        lastDebtDate = e.createdAt
        // vadesi geçmiş ödenmemiş borç
        if (e.dueDate && new Date(e.dueDate).getTime() < now) overdueAmount += e.amount
      } else if (e.type === 'odeme') {
        balance -= e.amount
        overdueAmount = Math.max(0, overdueAmount - e.amount)
      }
    }
    // Yaşlandırma: en eski kapanmamış borçtan itibaren gün
    let oldestOpenDays: number | null = null
    let running = 0
    const openDebts: { date: number; amount: number }[] = []
    for (const e of c.entries) {
      if (e.type === 'borc') {
        running += e.amount
        openDebts.push({ date: new Date(e.createdAt).getTime(), amount: e.amount })
      } else if (e.type === 'odeme') {
        running -= e.amount
      }
    }
    if (running > 0 && openDebts.length > 0) {
      oldestOpenDays = Math.floor((now - openDebts[0].date) / 86400000)
    }
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      note: c.note,
      creditLimit: c.creditLimit,
      isActive: c.isActive,
      createdAt: c.createdAt,
      entryCount: c.entries.length,
      balance: Math.round(balance * 100) / 100,
      lastEntryAt: c.entries.length ? c.entries[c.entries.length - 1].createdAt : null,
      lastDebtAt: lastDebtDate,
      overdueAmount: Math.round(overdueAmount * 100) / 100,
      oldestOpenDays,
    }
  })

  // Özet: toplam alacak, en yüksek 5 borçlu, yaşlandırma kovaları
  const totalReceivable = items.reduce((s, c) => s + Math.max(0, c.balance), 0)
  const totalOverdue = items.reduce((s, c) => s + c.overdueAmount, 0)
  const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 }
  for (const c of items) {
    if (c.balance <= 0) continue
    const d = c.oldestOpenDays ?? 0
    if (d <= 30) aging.d0_30 += c.balance
    else if (d <= 60) aging.d31_60 += c.balance
    else if (d <= 90) aging.d61_90 += c.balance
    else aging.d90p += c.balance
  }
  const topDebtors = [...items].filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5)

  return ok({
    items,
    summary: {
      customerCount: items.length,
      debtorCount: items.filter((c) => c.balance > 0).length,
      totalReceivable: Math.round(totalReceivable * 100) / 100,
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      aging: {
        d0_30: Math.round(aging.d0_30 * 100) / 100,
        d31_60: Math.round(aging.d31_60 * 100) / 100,
        d61_90: Math.round(aging.d61_90 * 100) / 100,
        d90p: Math.round(aging.d90p * 100) / 100,
      },
    },
    topDebtors,
  })
}

// ============================================================
// POST — veresiye müşterisi oluştur
// Body: { name, phone?, note?, creditLimit? }
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.manage')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId) return err('Market bulunamadı', 404)

  const body = await req.json()
  const { name, phone, note, creditLimit } = body as {
    name?: string; phone?: string; note?: string; creditLimit?: number
  }
  if (!name?.trim()) return err('Müşteri adı gerekli', 400)

  // Aynı isimde aktif müşteri var mı?
  const dupe = await db.creditCustomer.findFirst({
    where: { marketId: id, name: { equals: name.trim() }, isActive: true },
  })
  if (dupe) return err('Bu isimde bir veresiye müşterisi zaten var', 409)

  const customer = await db.creditCustomer.create({
    data: {
      marketId: id,
      name: name.trim(),
      phone: phone?.trim() || null,
      note: note?.trim() || null,
      creditLimit: creditLimit != null && Number(creditLimit) > 0 ? Number(creditLimit) : null,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'credit_customer',
    entityId: customer.id,
    after: { name: customer.name },
  })

  return ok(customer, 201)
}
