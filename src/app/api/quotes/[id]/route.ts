import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err, getVisibilityFilter, safeJsonParse } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// Yardımcılar
// ============================================================

interface LineInput {
  id?: string
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

const QUOTE_STATUSES = ['taslak', 'gonderildi', 'onaylandi', 'reddedildi', 'faturalandi']

async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.invoice.count({ where: { tenantId } })
  return `FAT-${year}-${String(count + 1).padStart(3, '0')}`
}

// Teklif numarası üret: TKL-2025-001 (proforma → teklif dönüşümünde kullanılır)
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
// GET — tekil teklif
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const quote = await db.quote.findUnique({
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
      invoice: { select: { id: true, number: true, status: true } },
    },
  })

  if (!quote) return err('Teklif bulunamadı', 404)
  if (quote.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  return ok(quote)
}

// ============================================================
// PATCH — teklif güncelle (status, lines, dates, customer)
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
  if (!existing) return err('Teklif bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const body = await req.json()
  const {
    status, lines, customerId, currency, issueDate, validUntil, createInvoice,
  } = body as {
    status?: string
    lines?: LineInput[]
    customerId?: string
    currency?: string
    issueDate?: string
    validUntil?: string
    createInvoice?: boolean
  }

  const updateData: Record<string, unknown> = {}

  if (status && QUOTE_STATUSES.includes(status)) {
    updateData.status = status
    // PROFORMA → TEKLİF DÖNÜŞÜMÜ:
    // Gönderim anında (status=gonderildi) kayıt artık resmi TEKLİF olur.
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

  // Kalemler güncelleniyorsa totals yeniden hesapla
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

  // Kalemleri güncelle (sil + yeniden oluştur en güvenli yaklaşım)
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
    entity: 'quote',
    entityId: id,
    before: safeJsonParse(JSON.stringify(existing), null),
    after: safeJsonParse(JSON.stringify(updated), null),
  })

  // Teklif/proforma ONAYLANIRSA ve henüz siparişe bağlı değilse otomatik Order oluştur
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
        notes: `${updated.isProforma ? 'Proforma' : 'Teklif'} ${updated.number} onaylanarak oluşturuldu.`,
      },
    })
    await db.orderTrackingStep.create({
      data: {
        orderId: order.id,
        step: 'onaylandi',
        note: `${updated.isProforma ? 'Proforma' : 'Teklif'} ${updated.number} onaylandı`,
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
  }

  // Opsiyonel: teklifi faturaya dönüştür
  let createdInvoice: unknown = null
  if (createInvoice && updated.status === 'faturalandi') {
    const number = await generateInvoiceNumber(user!.tenantId)
    // Teklif satırlarını da çek (ağırlık dahil)
    const quoteLines = await db.quoteLine.findMany({ where: { quoteId: id } })
    const invoice = await db.invoice.create({
      data: {
        tenantId: user!.tenantId,
        customerId: updated.customerId,
        number,
        status: 'odeme_bekliyor',
        subtotal: updated.subtotal,
        taxTotal: updated.taxTotal,
        total: updated.total,
        currency: updated.currency,
        issueDate: new Date(),
        dueDate: null,
        lines: {
          create: quoteLines.map((l) => ({
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
    })
    await writeAuditLog({
      tenantId: user!.tenantId,
      actorId: user!.id,
      action: 'create',
      entity: 'invoice',
      entityId: invoice.id,
      after: safeJsonParse(JSON.stringify(invoice), null),
    })
    createdInvoice = invoice
  }

  return ok({ ...updated, createdOrder, createdInvoice })
}

// ============================================================
// DELETE — teklif sil (lines cascade)
// ============================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.quote.findUnique({ where: { id } })
  if (!existing) return err('Teklif bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  // Silmeden önce görünürlük kontrolü
  const visFilter = await getVisibilityFilter(user!)
  if (visFilter.ownerId) {
    const customer = await db.customer.findUnique({
      where: { id: existing.customerId },
      select: { ownerId: true },
    })
    if (customer && customer.ownerId && !visFilter.ownerId.in.includes(customer.ownerId)) {
      return err('Bu teklifi silme yetkiniz yok', 403)
    }
  }

  // QuoteLine cascade silinir (şema: onDelete: Cascade)
  await db.quote.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'quote',
    entityId: id,
    before: safeJsonParse(JSON.stringify(existing), null),
  })

  return ok({ success: true })
}
