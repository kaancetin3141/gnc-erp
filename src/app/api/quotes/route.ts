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

// Proforma numarası üret: PRO-2025-001
async function generateProformaNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.quote.count({ where: { tenantId, isProforma: true } })
  return `PRO-${year}-${String(count + 1).padStart(3, '0')}`
}

// Teklif numarası üret: TKL-2025-001
async function generateQuoteNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.quote.count({ where: { tenantId, isProforma: false } })
  return `TKL-${year}-${String(count + 1).padStart(3, '0')}`
}

// ============================================================
// GET — teklif listesi
// ============================================================
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  // PRIVACY-TEMPLATES (#3): depo rolü teklifleri GÖREMEZ
  if (user!.role === 'stock') {
    return ok({ items: [], total: 0, limit: 0, offset: 0 })
  }

  const url = new URL(req.url)
  const search = url.searchParams.get('search') || ''
  const status = url.searchParams.get('status') || ''
  const customerId = url.searchParams.get('customerId') || ''
  const type = url.searchParams.get('type') || '' // proforma | teklif
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
  if (type === 'proforma') where.isProforma = true
  if (type === 'teklif') where.isProforma = false

  const [items, total] = await Promise.all([
    db.quote.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, segment: true, status: true } },
        lines: { include: { product: { select: { id: true, name: true, sku: true } } } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.quote.count({ where }),
  ])

  return ok({ items, total, limit, offset })
}

// ============================================================
// POST — yeni teklif
// ============================================================
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const body = await req.json()
  const { customerId, currency, issueDate, validUntil, lines } = body as {
    customerId?: string
    currency?: string
    issueDate?: string
    validUntil?: string
    lines?: LineInput[]
  }

  if (!customerId) return err('Müşteri seçimi gerekli', 400)
  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    return err('En az bir kalem gereki', 400)
  }

  // Müşteri kontrolü + tenant izolasyonu
  const customer = await db.customer.findUnique({ where: { id: customerId } })
  if (!customer) return err('Müşteri bulunamadı', 404)
  if (customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  // Hesaplamalar
  const totals = calcTotals(lines)

  // VARSAYILAN: her yeni kayıt PROFORMA olarak oluşur.
  // Gönderildikten sonra (status=gonderildi) otomatik olarak TEKLİFE dönüşür.
  const number = await generateProformaNumber(customer.tenantId)

  // Data hazırla — ağırlık alanları dahil (F4)
  const lineData = lines.map((l) => {
    const qty = toNum(l.qty, 1)
    const weightPerUnit = l.weightPerUnit != null
      ? (typeof l.weightPerUnit === 'number' ? l.weightPerUnit : parseFloat(l.weightPerUnit))
      : null
    const weightUnit = l.weightUnit && ['gr', 'kg', 'ton'].includes(l.weightUnit) ? l.weightUnit : 'kg'
    const totalWeight = (weightPerUnit != null && Number.isFinite(weightPerUnit) && weightPerUnit > 0)
      ? Math.round(qty * weightPerUnit * 1000) / 1000
      : null
    return {
      productId: l.productId || null,
      description: (l.description || '').trim(),
      qty,
      unitPrice: toNum(l.unitPrice, 0),
      taxRate: toNum(l.taxRate, 0),
      lineTotal: toNum(l.qty, 1) * toNum(l.unitPrice, 0),
      weightPerUnit: (weightPerUnit != null && Number.isFinite(weightPerUnit) && weightPerUnit > 0) ? weightPerUnit : null,
      weightUnit,
      totalWeight,
      color: l.color || null,
    }
  })

  const quote = await db.quote.create({
    data: {
      // SUPERADMIN çapraz-tenant yazımında kayıt, müşterinin tenantına ait olmalı
      tenantId: customer.tenantId,
      customerId,
      number,
      status: 'taslak',
      isProforma: true,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      currency: currency || user!.tenant.defaultCurrency || 'TRY',
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      validUntil: validUntil ? new Date(validUntil) : null,
      lines: { create: lineData },
    },
    include: {
      customer: { select: { id: true, name: true } },
      lines: { include: { product: { select: { id: true, name: true } } } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'quote',
    entityId: quote.id,
    after: safeJsonParse(JSON.stringify(quote), null),
  })

  return ok(quote)
}
