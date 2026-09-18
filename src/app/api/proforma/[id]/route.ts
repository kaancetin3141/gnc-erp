import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err, getVisibilityFilter, safeJsonParse } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// Yardımcılar
// ============================================================

interface LineInput {
  productId?: string | null
  description?: string
  qty?: number | string
  unitPrice?: number | string
  taxRate?: number | string
  weightPerUnit?: number | string | null
  weightUnit?: string | null
  totalWeight?: number | string | null
  color?: string | null
}

function toNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return isFinite(v) ? v : fallback
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return isFinite(n) ? n : fallback
  }
  return fallback
}

function calcTotals(lines: LineInput[]) {
  let subtotal = 0
  let taxTotal = 0
  for (const l of lines) {
    const qty = toNum(l.qty, 1)
    const unitPrice = toNum(l.unitPrice, 0)
    const taxRate = toNum(l.taxRate, 0)
    const lineTotal = qty * unitPrice
    const lineTax = lineTotal * (taxRate / 100)
    subtotal += lineTotal
    taxTotal += lineTax
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    total: Math.round((subtotal + taxTotal) * 100) / 100,
  }
}

const PROFORMA_STATUSES = ['taslak', 'gonderildi', 'onaylandi', 'reddedildi', 'faturalandi']

// Teklif numarası üret: TKL-2025-001 (proforma gönderilince teklife dönüşür)
async function generateQuoteNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.quote.count({ where: { tenantId, isProforma: false } })
  return `TKL-${year}-${String(count + 1).padStart(3, '0')}`
}

// Sipariş numarası üret: SIP-2025-001
async function generateOrderNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.order.count({ where: { tenantId } })
  return `SIP-${year}-${String(count + 1).padStart(3, '0')}`
}

// ============================================================
// GET — tekil proforma
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const proforma = await db.quote.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true, name: true, segment: true, status: true,
          email: true, phone: true, address: true, city: true, taxNumber: true,
        },
      },
      lines: {
        include: { product: { select: { id: true, name: true, sku: true } } },
      },
      order: { select: { id: true, number: true, status: true } },
    },
  })

  if (!proforma) return err('Proforma bulunamadı', 404)
  if (proforma.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)
  if (!proforma.isProforma) return err('Bu kayıt bir proforma değil', 400)

  return ok(proforma)
}

// ============================================================
// PATCH — proforma güncelle (status, lines, dates, customer)
// Önemli: status 'onaylandi' olursa otomatik Order oluştur.
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.quote.findUnique({
    where: { id },
    include: { lines: true, order: true },
  })
  if (!existing) return err('Proforma bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)
  if (!existing.isProforma) return err('Bu kayıt bir proforma değil', 400)

  const body = await req.json()
  const {
    status, lines, customerId, currency, issueDate, validUntil,
  } = body as {
    status?: string
    lines?: LineInput[]
    customerId?: string
    currency?: string
    issueDate?: string
    validUntil?: string
  }

  const updateData: Record<string, unknown> = {}

  if (status && PROFORMA_STATUSES.includes(status)) {
    updateData.status = status
    // PROFORMA → TEKLİF DÖNÜŞÜMÜ:
    // Gönderim anında (status=gonderildi) kayıt resmi TEKLİFE dönüşür.
    // isProforma=false olur ve yeni TKL- numarası alır.
    if (status === 'gonderildi' && existing.isProforma) {
      updateData.isProforma = false
      updateData.number = await generateQuoteNumber(user!.tenantId)
    }
  }
  if (customerId) {
    const cust = await db.customer.findUnique({ where: { id: customerId } })
    if (!cust || cust.tenantId !== user!.tenantId) {
      return err('Geçersiz müşteri', 400)
    }
    updateData.customerId = customerId
  }
  if (currency) updateData.currency = currency
  if (issueDate) updateData.issueDate = new Date(issueDate)
  if (validUntil !== undefined) {
    updateData.validUntil = validUntil ? new Date(validUntil) : null
  }

  let newTotals: { subtotal: number; taxTotal: number; total: number } | null = null
  if (lines && Array.isArray(lines)) {
    newTotals = calcTotals(lines)
    updateData.subtotal = newTotals.subtotal
    updateData.taxTotal = newTotals.taxTotal
    updateData.total = newTotals.total
  }

  const updated = await db.quote.update({
    where: { id },
    data: updateData,
    include: {
      customer: { select: { id: true, name: true } },
      lines: { include: { product: { select: { id: true, name: true } } } },
      order: { select: { id: true, number: true } },
    },
  })

  if (lines && Array.isArray(lines)) {
    await db.quoteLine.deleteMany({ where: { quoteId: id } })
    if (lines.length > 0) {
      await db.quoteLine.createMany({
        data: lines.map((l) => {
          const qty = toNum(l.qty, 1)
          const wpu = l.weightPerUnit != null
            ? (typeof l.weightPerUnit === 'number' ? l.weightPerUnit : parseFloat(l.weightPerUnit))
            : null
          const wUnit = l.weightUnit && ['gr', 'kg', 'ton'].includes(l.weightUnit) ? l.weightUnit : 'kg'
          const tWeight = (wpu != null && Number.isFinite(wpu) && wpu > 0)
            ? Math.round(qty * wpu * 1000) / 1000
            : null
          return {
            quoteId: id,
            productId: l.productId || null,
            description: (l.description || '').trim(),
            qty,
            unitPrice: toNum(l.unitPrice, 0),
            taxRate: toNum(l.taxRate, 0),
            lineTotal: toNum(l.qty, 1) * toNum(l.unitPrice, 0),
            weightPerUnit: (wpu != null && Number.isFinite(wpu) && wpu > 0) ? wpu : null,
            weightUnit: wUnit,
            totalWeight: tWeight,
            color: l.color || null,
          }
        }),
      })
    }
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'proforma',
    entityId: id,
    before: safeJsonParse(JSON.stringify(existing), null),
    after: safeJsonParse(JSON.stringify(updated), null),
  })

  // Proforma onaylanırsa ve henüz bir siparişe bağlı değilse, otomatik Order oluştur
  let createdOrder: unknown = null
  if (
    updated.status === 'onaylandi' &&
    !existing.order &&
    !updated.order
  ) {
    const orderNumber = await generateOrderNumber(user!.tenantId)
    const order = await db.order.create({
      data: {
        tenantId: user!.tenantId,
        customerId: updated.customerId,
        quoteId: updated.id,
        number: orderNumber,
        status: 'onaylandi',
        totalAmount: updated.total,
        currency: updated.currency,
        orderDate: new Date(),
        notes: `Proforma ${updated.number} onaylanarak oluşturuldu.`,
      },
    })

    // İlk takip adımı
    await db.orderTrackingStep.create({
      data: {
        orderId: order.id,
        step: 'onaylandi',
        note: `Proforma ${updated.number} onaylandı`,
        userId: user!.id,
      },
    })

    await writeAuditLog({
      tenantId: user!.tenantId,
      actorId: user!.id,
      action: 'create',
      entity: 'order',
      entityId: order.id,
      after: safeJsonParse(JSON.stringify(order), null),
    })

    createdOrder = order

    // Otomatik fatura oluştur (proforma onayınınca faturaya geç)
    const invoiceNumber = `FAT-${new Date().getFullYear()}-${String(await db.invoice.count({ where: { tenantId: user!.tenantId } }) + 1).padStart(3, '0')}`
    const invoice = await db.invoice.create({
      data: {
        tenantId: user!.tenantId,
        customerId: updated.customerId,
        number: invoiceNumber,
        status: 'odeme_bekliyor',
        subtotal: updated.subtotal,
        taxTotal: updated.taxTotal,
        total: updated.total,
        currency: updated.currency,
        issueDate: new Date(),
        orderId: order.id,
        // Proforma satırlarını fatura satırları olarak kopyala (ağırlık dahil — F4)
        lines: {
          create: existing.lines.map((l) => ({
            productId: l.productId,
            description: l.description,
            qty: l.qty,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            lineTotal: l.lineTotal,
            weightPerUnit: l.weightPerUnit,
            weightUnit: l.weightUnit,
            totalWeight: l.totalWeight,
            color: l.color,
          })),
        },
      },
      include: { lines: true },
    })

    // Proforma'yı faturalandırıldı olarak işaretle ve invoiceId bağla
    await db.quote.update({
      where: { id: updated.id },
      data: { status: 'faturalandi', invoiceId: invoice.id },
    })

    await writeAuditLog({
      tenantId: user!.tenantId,
      actorId: user!.id,
      action: 'create',
      entity: 'invoice',
      entityId: invoice.id,
      after: { ...invoice, source: 'proforma_approval', proformaId: id, orderId: order.id },
    })
  }

  return ok({ ...updated, createdOrder })
}

// ============================================================
// DELETE — proforma sil
// ============================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.quote.findUnique({ where: { id } })
  if (!existing) return err('Proforma bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)
  if (!existing.isProforma) return err('Bu kayıt bir proforma değil', 400)

  const visFilter = await getVisibilityFilter(user!)
  if (visFilter.ownerId) {
    const customer = await db.customer.findUnique({
      where: { id: existing.customerId },
      select: { ownerId: true },
    })
    if (customer && customer.ownerId && !visFilter.ownerId.in.includes(customer.ownerId)) {
      return err('Bu proformayı silme yetkiniz yok', 403)
    }
  }

  await db.quote.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'proforma',
    entityId: id,
    before: safeJsonParse(JSON.stringify(existing), null),
  })

  return ok({ success: true })
}
