import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err, getVisibilityFilter, safeJsonParse } from '@/lib/api-utils'
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

// Fatura numarası üret: FAT-2025-001
async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.invoice.count({ where: { tenantId } })
  return `FAT-${year}-${String(count + 1).padStart(3, '0')}`
}

// ============================================================
// GET — fatura listesi
// ============================================================
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  // PRIVACY-TEMPLATES (#3): depo rolü faturaları GÖREMEZ (yalnızca üretim listesi)
  if (user!.role === 'stock') {
    return ok({ items: [], total: 0, limit: 0, offset: 0 })
  }

  const url = new URL(req.url)
  const search = url.searchParams.get('search') || ''
  const status = url.searchParams.get('status') || ''
  const customerId = url.searchParams.get('customerId') || ''
  const limit = parseInt(url.searchParams.get('limit') || '200')
  const offset = parseInt(url.searchParams.get('offset') || '0')

  const visFilter = await getVisibilityFilter(user!)

  const where: Record<string, unknown> = user!.role === 'superadmin'
    ? {}
    : { tenantId: user!.tenantId }

  // Görünürlük: müşteri sahibi üzerinden
  if (visFilter.ownerId) {
    where.customer = { ownerId: visFilter.ownerId }
  }

  if (search) {
    where.OR = [
      { number: { contains: search } },
      { customer: { name: { contains: search } } },
    ]
  }
  if (status) where.status = status
  if (customerId) where.customerId = customerId

  const [items, total] = await Promise.all([
    db.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, segment: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.invoice.count({ where }),
  ])

  return ok({ items, total, limit, offset })
}

// ============================================================
// POST — yeni fatura (direkt veya tekliften dönüştürme)
// ============================================================
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const body = await req.json()
  const {
    fromQuoteId, customerId, currency, issueDate, dueDate, lines,
  } = body as {
    fromQuoteId?: string
    customerId?: string
    currency?: string
    issueDate?: string
    dueDate?: string
    lines?: LineInput[]
  }

  // --- Tekliften dönüştürme modu ---
  if (fromQuoteId) {
    const quote = await db.quote.findUnique({
      where: { id: fromQuoteId },
      include: { lines: true, customer: true },
    })
    if (!quote) return err('Teklif bulunamadı', 404)
    if (quote.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)
    if (quote.status === 'faturalandi' && quote.invoiceId) {
      return err('Bu teklif zaten faturalandırılmış', 400)
    }

    const number = await generateInvoiceNumber(quote.tenantId)
    const invoice = await db.invoice.create({
      data: {
        // SUPERADMIN çapraz-tenant yazımında fatura, teklifin tenantına ait olmalı
        tenantId: quote.tenantId,
        customerId: quote.customerId,
        number,
        status: 'odeme_bekliyor',
        subtotal: quote.subtotal,
        taxTotal: quote.taxTotal,
        total: quote.total,
        currency: quote.currency,
        issueDate: new Date(),
        dueDate: dueDate ? new Date(dueDate) : null,
        // Teklif satırlarını fatura satırları olarak kopyala (ağırlık dahil — F4)
        lines: {
          create: quote.lines.map((l) => ({
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
      include: { customer: { select: { id: true, name: true } }, lines: true },
    })

    // Teklif durumunu 'faturalandi' yap ve invoiceId bağla
    await db.quote.update({
      where: { id: fromQuoteId },
      data: { status: 'faturalandi', invoiceId: invoice.id },
    })

    // Otomatik stok çıkışı: productId olan teklif satırları için
    for (const line of quote.lines) {
      if (line.productId) {
        const product = await db.product.findUnique({
          where: { id: line.productId },
          select: { id: true, stock: true },
        })
        if (product && product.stock >= line.qty) {
          await db.$transaction([
            db.stockMovement.create({
              data: {
                productId: line.productId,
                quantity: line.qty,
                type: 'cikis',
                reason: `Fatura (tekliften): ${number}`,
                refType: 'invoice',
                refId: invoice.id,
              },
            }),
            db.product.update({
              where: { id: line.productId },
              data: { stock: { decrement: line.qty } },
            }),
          ])
        }
      }
    }

    await writeAuditLog({
      tenantId: user!.tenantId,
      actorId: user!.id,
      action: 'create',
      entity: 'invoice',
      entityId: invoice.id,
      after: safeJsonParse(JSON.stringify(invoice), null),
    })

    return ok(invoice)
  }

  // --- Doğrudan oluşturma modu ---
  if (!customerId) return err('Müşteri seçimi gerekli', 400)
  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    return err('En az bir kalem gereki', 400)
  }

  const customer = await db.customer.findUnique({ where: { id: customerId } })
  if (!customer) return err('Müşteri bulunamadı', 404)
  if (customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const totals = calcTotals(lines)
  const number = await generateInvoiceNumber(customer.tenantId)

  // Satır hesaplamaları (lineTotal + ağırlık dahil — F4)
  const linesWithTotals = lines.map((l) => {
    const qty = toNum(l.qty, 1)
    const unitPrice = toNum(l.unitPrice, 0)
    const taxRate = toNum(l.taxRate, 0)
    const lineTotal = Math.round(qty * unitPrice * 100) / 100
    const wpu = l.weightPerUnit != null
      ? (typeof l.weightPerUnit === 'number' ? l.weightPerUnit : parseFloat(l.weightPerUnit))
      : null
    const weightPerUnit = (wpu != null && Number.isFinite(wpu) && wpu > 0) ? wpu : null
    const weightUnit = l.weightUnit && ['gr', 'kg', 'ton'].includes(l.weightUnit) ? l.weightUnit : 'kg'
    const totalWeight = weightPerUnit != null
      ? Math.round(qty * weightPerUnit * 1000) / 1000
      : null
    return {
      productId: l.productId || null,
      description: l.description || '',
      qty,
      unitPrice,
      taxRate,
      lineTotal,
      weightPerUnit,
      weightUnit,
      totalWeight,
      color: l.color || null,
    }
  })

  const invoice = await db.invoice.create({
    data: {
      // SUPERADMIN çapraz-tenant yazımında fatura, müşterinin tenantına ait olmalı
      tenantId: customer.tenantId,
      customerId,
      number,
      status: 'odeme_bekliyor',
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      currency: currency || user!.tenant.defaultCurrency || 'TRY',
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      lines: { create: linesWithTotals.map((l) => ({
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
      })) },
    },
    include: { customer: { select: { id: true, name: true } }, lines: true },
  })

  // Otomatik stok çıkışı: productId olan satırlar için
  for (const line of linesWithTotals) {
    if (line.productId) {
      const product = await db.product.findUnique({
        where: { id: line.productId },
        select: { id: true, stock: true },
      })
      if (product && product.stock >= line.qty) {
        // Stok hareketi oluştur ve ürün stokunu düş
        await db.$transaction([
          db.stockMovement.create({
            data: {
              productId: line.productId,
              quantity: line.qty,
              type: 'cikis',
              reason: `Fatura: ${number}`,
              refType: 'invoice',
              refId: invoice.id,
            },
          }),
          db.product.update({
            where: { id: line.productId },
            data: { stock: { decrement: line.qty } },
          }),
        ])
      }
    }
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'invoice',
    entityId: invoice.id,
    after: safeJsonParse(JSON.stringify(invoice), null),
  })

  return ok(invoice)
}
