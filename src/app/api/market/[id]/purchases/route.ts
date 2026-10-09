import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// ============================================================
// GET — mal kabul listesi (filtre: ?status=)
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Market bulunamadı', 404)

  const { status } = Object.fromEntries(new URL(req.url).searchParams)
  const where: Record<string, unknown> = { marketId: id }
  if (status) where.status = status

  const purchases = await db.purchase.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { items: true } } },
    take: 100,
  })

  return ok({ items: purchases })
}

// ============================================================
// POST — yeni mal kabul (supplier, invoiceNo, items)
// items: [{ barcode, qty, unitPrice }]
// Barkod ile ürün bul, yoksa uyarı ver
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Market bulunamadı', 404)

  const body = await req.json()
  const { supplier, invoiceNo, items, notes } = body as {
    supplier?: string
    invoiceNo?: string
    items?: Array<{ barcode?: string; productId?: string; qty?: number; unitPrice?: number; name?: string }>
    notes?: string
  }

  if (!items || !Array.isArray(items) || items.length === 0) return err('Mal kabul kalemleri gerekli', 400)

  // Her kalem için ürünü çöz
  const lineItems: Array<{
    productId: string | null
    barcode: string | null
    name: string
    qty: number
    unitPrice: number
    lineTotal: number
    accepted: boolean
  }> = []

  let totalAmount = 0

  for (const item of items) {
    const qty = Number(item.qty ?? 0)
    if (qty <= 0) continue
    const unitPrice = Number(item.unitPrice ?? 0)

    let productId: string | null = null
    let name = item.name ?? ''
    let barcodeCode: string | null = null

    if (item.barcode) {
      barcodeCode = item.barcode.trim()
      const b = await db.barcode.findUnique({
        where: { code: barcodeCode },
        include: { product: true },
      })
      if (b && b.product && b.product.tenantId === user!.tenantId) {
        productId = b.product.id
        name = b.product.name
      } else {
        // Barkod bulunamadı: ürünü yok say (name gerekli)
        if (!name) return err(`Barkod için ürün bulunamadı: ${barcodeCode}`, 400)
      }
    } else if (item.productId) {
      const p = await db.product.findUnique({ where: { id: item.productId } })
      if (p && p.tenantId === user!.tenantId) {
        productId = p.id
        name = p.name
      }
    }

    if (!name) return err('Kalem adı gerekli', 400)

    const lineTotal = qty * unitPrice
    totalAmount += lineTotal

    lineItems.push({
      productId,
      barcode: barcodeCode,
      name,
      qty,
      unitPrice,
      lineTotal,
      accepted: false,
    })
  }

  if (lineItems.length === 0) return err('Geçerli kalem yok', 400)

  const cnt = await db.purchase.count({ where: { marketId: id } })
  const number = `MK-${String(cnt + 1).padStart(3, '0')}`

  const purchase = await db.purchase.create({
    data: {
      marketId: id,
      number,
      supplier: supplier?.trim() || null,
      invoiceNo: invoiceNo?.trim() || null,
      status: 'bekliyor',
      totalAmount,
      notes: notes?.trim() || null,
      createdById: user!.id,
      items: { create: lineItems },
    },
    include: { items: true },
  })

  return ok(purchase)
}
