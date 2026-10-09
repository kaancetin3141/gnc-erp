import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — müşteri detayı + cari hareketler
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; customerId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id, customerId } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Market bulunamadı', 404)

  const customer = await db.creditCustomer.findUnique({
    where: { id: customerId },
    include: {
      entries: {
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { refSale: { select: { id: true, number: true, total: true } } },
      },
    },
  })
  if (!customer || customer.marketId !== id) return err('Veresiye müşterisi bulunamadı', 404)

  let balance = 0
  for (const e of customer.entries) balance += e.type === 'borc' ? e.amount : -e.amount

  return ok({
    ...customer,
    entries: customer.entries.map((e) => ({
      ...e,
      refSaleNumber: e.refSale?.number ?? null,
      refSale: undefined,
    })),
    balance: Math.round(balance * 100) / 100,
  })
}

// POST — manuel cari hareket ekle (borc veya ödeme)
// Body: { type: 'borc'|'odeme', amount, method?, dueDate?, note? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; customerId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.pos')
  if (permErr) return permErr

  const { id, customerId } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Market bulunamadı', 404)

  const customer = await db.creditCustomer.findUnique({ where: { id: customerId } })
  if (!customer || customer.marketId !== id) return err('Veresiye müşterisi bulunamadı', 404)

  const body = await req.json()
  const { type, amount, method, dueDate, note } = body as {
    type?: string; amount?: number; method?: string; dueDate?: string; note?: string
  }

  if (type !== 'borc' && type !== 'odeme') return err("Hareket türü 'borc' veya 'odeme' olmalı", 400)
  const amt = Number(amount)
  if (!amt || amt <= 0) return err('Tutar 0 dan büyük olmalı', 400)

  // Kredi limiti kontrolü (borç girişinde)
  if (type === 'borc' && customer.creditLimit != null) {
    const entries = await db.creditEntry.findMany({ where: { customerId } })
    let balance = 0
    for (const e of entries) balance += e.type === 'borc' ? e.amount : -e.amount
    if (balance + amt > customer.creditLimit) {
      return err(
        `Kredi limiti aşılıyor (mevcut borç ${balance.toFixed(2)} + ${amt.toFixed(2)} > limit ${customer.creditLimit.toFixed(2)})`,
        409,
      )
    }
  }

  const entry = await db.creditEntry.create({
    data: {
      customerId,
      type,
      amount: amt,
      method: type === 'odeme' ? (method || 'nakit') : null,
      dueDate: type === 'borc' && dueDate ? new Date(dueDate) : null,
      note: note?.trim() || null,
      createdById: user!.id,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'credit_entry',
    entityId: entry.id,
    after: { customer: customer.name, type, amount: amt },
  })

  return ok(entry, 201)
}

// PATCH — müşteri bilgisi güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; customerId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.manage')
  if (permErr) return permErr

  const { id, customerId } = await params
  const customer = await db.creditCustomer.findUnique({ where: { id: customerId } })
  if (!customer || customer.marketId !== id) return err('Veresiye müşterisi bulunamadı', 404)

  const body = await req.json()
  const { name, phone, note, creditLimit, isActive } = body as {
    name?: string; phone?: string; note?: string; creditLimit?: number | null; isActive?: boolean
  }

  const data: Record<string, unknown> = {}
  if (name !== undefined) {
    if (!name.trim()) return err('Müşteri adı boş olamaz', 400)
    data.name = name.trim()
  }
  if (phone !== undefined) data.phone = phone?.trim() || null
  if (note !== undefined) data.note = note?.trim() || null
  if (creditLimit !== undefined) data.creditLimit = creditLimit != null && Number(creditLimit) > 0 ? Number(creditLimit) : null
  if (isActive !== undefined) data.isActive = Boolean(isActive)

  const updated = await db.creditCustomer.update({ where: { id: customerId }, data })
  return ok(updated)
}

// DELETE — müşteri sil (yalnızca bakiye 0 ise)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; customerId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.manage')
  if (permErr) return permErr

  const { id, customerId } = await params
  const customer = await db.creditCustomer.findUnique({ where: { id: customerId }, include: { entries: true } })
  if (!customer || customer.marketId !== id) return err('Veresiye müşterisi bulunamadı', 404)

  let balance = 0
  for (const e of customer.entries) balance += e.type === 'borc' ? e.amount : -e.amount
  if (Math.abs(balance) > 0.009) {
    return err(`Bakiye sıfır değil (${balance.toFixed(2)} ₺) — silmeden önce ödemeleri tahsil edin`, 409)
  }

  await db.creditCustomer.delete({ where: { id: customerId } })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'credit_customer',
    entityId: customerId,
    before: { name: customer.name },
  })
  return ok({ deleted: true })
}
