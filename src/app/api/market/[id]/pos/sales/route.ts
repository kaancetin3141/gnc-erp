import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// GET — satış listesi (filtre: ?date=YYYY-MM-DD, ?paymentMethod=, ?type=, ?shiftId=)
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId) return err('Market bulunamadı', 404)

  const sp = Object.fromEntries(new URL(req.url).searchParams)
  const where: Record<string, unknown> = { marketId: id }

  if (sp.date) {
    const d = new Date(sp.date + 'T00:00:00')
    const dEnd = new Date(sp.date + 'T23:59:59')
    where.createdAt = { gte: d, lte: dEnd }
  }
  if (sp.paymentMethod) where.paymentMethod = sp.paymentMethod
  if (sp.type) where.type = sp.type
  if (sp.shiftId) where.posShiftId = sp.shiftId

  const limit = Math.min(Number(sp.limit ?? 100), 500)

  const sales = await db.marketSale.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { items: true, returns: true } },
    },
    take: limit,
  })

  return ok({ items: sales })
}

// ============================================================
// POST — yeni satış (POS fiş kesme)
// Body: {
//   items: [{ barcode?, productId?, qty }],
//   paymentMethod: 'cash' | 'card' | 'mixed' | 'veresiye',
//   cashAmount?, cardAmount?,
//   creditCustomerId?, creditDueDate?,   // veresiye için zorunlu
//   discount?, customerName?, notes?, posShiftId?
// }
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.pos')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId) return err('Market bulunamadı', 404)

  const body = await req.json()
  const {
    items, paymentMethod, cashAmount, cardAmount,
    creditCustomerId, creditDueDate,
    discount, customerName, notes, posShiftId,
  } = body as {
    items?: Array<{ barcode?: string; productId?: string; qty?: number }>
    paymentMethod?: string
    cashAmount?: number
    cardAmount?: number
    creditCustomerId?: string
    creditDueDate?: string
    discount?: number
    customerName?: string
    notes?: string
    posShiftId?: string
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return err('Sepet boş', 400)
  }

  // Vardiya açık mı kontrol et
  let shiftId: string | null = posShiftId ?? null
  if (!shiftId) {
    const openShift = await db.posShift.findFirst({
      where: { marketId: id, status: 'acik' },
    })
    shiftId = openShift?.id ?? null
  }

  // Her bir item için ürün bilgisini çöz
  const lineItems: Array<{
    productId: string | null
    barcode: string | null
    name: string
    qty: number
    unitPrice: number
    taxRate: number
    discount: number
    lineTotal: number
  }> = []

  for (const item of items) {
    const qty = Number(item.qty ?? 1)
    if (qty <= 0) continue

    let product: { id: string; name: string; price: number; taxRate: number; stock: number } | null = null
    let barcodeCode: string | null = null

    if (item.barcode) {
      const b = await db.barcode.findUnique({
        where: { code: item.barcode },
        include: { product: true },
      })
      if (b && b.product && b.product.tenantId === user!.tenantId) {
        product = b.product
        barcodeCode = b.code
      }
    } else if (item.productId) {
      const p = await db.product.findUnique({ where: { id: item.productId } })
      if (p && p.tenantId === user!.tenantId) product = p
    }

    if (!product) {
      return err(`Ürün bulunamadı: ${item.barcode ?? item.productId ?? '?'}`, 400)
    }

    const unitPrice = product.price
    const taxRate = product.taxRate
    const lineTotal = unitPrice * qty

    lineItems.push({
      productId: product.id,
      barcode: barcodeCode,
      name: product.name,
      qty,
      unitPrice,
      taxRate,
      discount: 0,
      lineTotal,
    })
  }

  if (lineItems.length === 0) return err('Sepette geçerli ürün yok', 400)

  // Toplamları hesapla
  const subtotal = lineItems.reduce((s, x) => s + x.lineTotal, 0)
  const totalDiscount = Number(discount ?? 0)
  const taxableBase = Math.max(0, subtotal - totalDiscount)
  // KDV: her satırın taxRate'ine göre (basitleştirilmiş, weighted avg)
  const taxTotal = lineItems.reduce((s, x) => {
    const ratio = subtotal > 0 ? x.lineTotal / subtotal : 0
    const lineAfterDisc = taxableBase * ratio
    return s + lineAfterDisc - lineAfterDisc / (1 + x.taxRate / 100)
  }, 0)
  const total = taxableBase
  const payMethod = (paymentMethod ?? 'cash') as string

  // Ödeme yöntemi kontrol
  let cashAmt = 0
  let cardAmt = 0
  let creditCustomer: { id: string; name: string; creditLimit: number | null } | null = null
  if (payMethod === 'cash') {
    cashAmt = Number(cashAmount ?? total)
  } else if (payMethod === 'card') {
    cardAmt = Number(cardAmount ?? total)
  } else if (payMethod === 'mixed') {
    cashAmt = Number(cashAmount ?? 0)
    cardAmt = Number(cardAmount ?? 0)
    if (cashAmt + cardAmt < total) {
      return err('Ödeme tutarı yetersiz', 400)
    }
  } else if (payMethod === 'veresiye') {
    // Veresiye: müşteri zorunlu + limit kontrolü
    if (!creditCustomerId) return err('Veresiye satışı için müşteri seçin', 400)
    const cc = await db.creditCustomer.findUnique({ where: { id: creditCustomerId } })
    if (!cc || cc.marketId !== id) return err('Veresiye müşterisi bulunamadı', 404)
    if (!cc.isActive) return err('Bu veresiye müşterisi pasif durumda', 409)
    // mevcut bakiye + bu satış limiti aşıyor mu?
    const entries = await db.creditEntry.findMany({ where: { customerId: cc.id } })
    let balance = 0
    for (const e of entries) balance += e.type === 'borc' ? e.amount : -e.amount
    if (cc.creditLimit != null && balance + total > cc.creditLimit) {
      return err(
        `Kredi limiti aşılıyor (borç ${balance.toFixed(2)} + bu satış ${total.toFixed(2)} > limit ${cc.creditLimit.toFixed(2)})`,
        409,
      )
    }
    creditCustomer = { id: cc.id, name: cc.name, creditLimit: cc.creditLimit }
  } else {
    return err('Geçersiz ödeme yöntemi', 400)
  }

  // Fiş numarası: FIS-001
  const saleCount = await db.marketSale.count({ where: { marketId: id } })
  const number = `FIS-${String(saleCount + 1).padStart(3, '0')}`

  // Transaction: satış oluştur + stok düş
  const result = await db.$transaction(async (tx) => {
    const sale = await tx.marketSale.create({
      data: {
        marketId: id,
        posShiftId: shiftId,
        number,
        type: 'satis',
        status: 'tamamlandi',
        subtotal,
        taxTotal,
        discount: totalDiscount,
        total,
        paymentMethod: payMethod,
        cashAmount: cashAmt,
        cardAmount: cardAmt,
        customerName: customerName?.trim() || null,
        userId: user!.id,
        notes: notes?.trim() || null,
        items: {
          create: lineItems.map((li) => ({
            productId: li.productId,
            barcode: li.barcode,
            name: li.name,
            qty: li.qty,
            unitPrice: li.unitPrice,
            taxRate: li.taxRate,
            discount: li.discount,
            lineTotal: li.lineTotal,
          })),
        },
      },
      include: { items: true },
    })

    // Stok düşür + hareket oluştur
    for (const li of lineItems) {
      if (!li.productId) continue
      await tx.product.update({
        where: { id: li.productId },
        data: { stock: { decrement: Math.round(li.qty) } },
      })
      await tx.stockMovement.create({
        data: {
          productId: li.productId,
          quantity: -Math.round(li.qty),
          type: 'cikis',
          reason: 'POS Satış',
          refType: 'market_sale',
          refId: sale.id,
        },
      })
    }

    return sale
  })

  // Veresiye satışı → cari hareket kaydı (satıştan sonra, limit kontrolleri önceden yapıldı)
  if (creditCustomer) {
    await db.creditEntry.create({
      data: {
        customerId: creditCustomer.id,
        type: 'borc',
        amount: total,
        refSaleId: result.id,
        dueDate: creditDueDate ? new Date(creditDueDate) : null,
        note: `POS satış ${result.number}${customerName ? ` — ${customerName}` : ''}`,
        createdById: user!.id,
      },
    })
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'market_sale',
    entityId: result.id,
    after: { number: result.number, total: result.total, paymentMethod: result.paymentMethod, creditCustomer: creditCustomer?.name ?? null },
  })

  return ok(result)
}
