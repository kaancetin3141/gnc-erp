import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// ============================================================
// GET — market raporları
// Query: ?date=YYYY-MM-DD (varsayılan: bugün, sunucu yerel tarihi)
// ============================================================

/** Sunucunun yerel tarihini YYYY-MM-DD olarak döndürür (TZ=Europe/Istanbul). */
function localDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Market bulunamadı', 404)

  const sp = Object.fromEntries(new URL(req.url).searchParams)
  // M15: toISOString() UTC günü veriyordu — Türkiye'de 00:00-03:00 arası
  // satışlar dünkü güne düşüyordu. Artık sunucu yerel tarihi (Europe/Istanbul).
  const dateStr = sp.date ?? localDateISO(new Date())
  const dayStart = new Date(dateStr + 'T00:00:00')
  const dayEnd = new Date(dateStr + 'T23:59:59')

  // 1. Günlük satışlar
  const daySales = await db.marketSale.findMany({
    where: {
      marketId: id,
      createdAt: { gte: dayStart, lte: dayEnd },
      type: 'satis',
      status: 'tamamlandi',
    },
    select: {
      subtotal: true,
      taxTotal: true,
      total: true,
      cashAmount: true,
      cardAmount: true,
      paymentMethod: true,
      createdAt: true,
      items: { select: { productId: true, name: true, qty: true, lineTotal: true, product: { select: { category: true, costPrice: true } } } },
    },
  })

  const dailySummary = daySales.reduce(
    (acc, s) => {
      acc.subtotal += s.subtotal
      acc.taxTotal += s.taxTotal
      acc.total += s.total
      acc.cashAmount += s.cashAmount
      acc.cardAmount += s.cardAmount
      acc.count += 1
      if (s.paymentMethod === 'cash') acc.cashCount += 1
      else if (s.paymentMethod === 'card') acc.cardCount += 1
      else if (s.paymentMethod === 'veresiye') acc.veresiyeCount += 1
      else acc.mixedCount += 1
      return acc
    },
    {
      subtotal: 0, taxTotal: 0, total: 0,
      cashAmount: 0, cardAmount: 0, count: 0,
      cashCount: 0, cardCount: 0, mixedCount: 0, veresiyeCount: 0,
    },
  )

  // 2. Saatlik satış (00-23)
  const hourly: Array<{ hour: number; total: number; count: number }> = []
  for (let h = 0; h < 24; h++) {
    const hourTotal = daySales
      .filter((s) => new Date(s.createdAt).getHours() === h)
      .reduce((sum, s) => sum + s.total, 0)
    const hourCount = daySales.filter((s) => new Date(s.createdAt).getHours() === h).length
    hourly.push({ hour: h, total: hourCount > 0 ? Math.round(hourTotal * 100) / 100 : 0, count: hourCount })
  }

  // 3. En çok satan ürünler (top 10) — gün içinde
  const productAgg: Record<string, { name: string; qty: number; total: number }> = {}
  for (const s of daySales) {
    for (const it of s.items) {
      const key = it.productId ?? it.name
      if (!productAgg[key]) {
        productAgg[key] = { name: it.name, qty: 0, total: 0 }
      }
      productAgg[key].qty += it.qty
      productAgg[key].total += it.lineTotal
    }
  }
  const topProducts = Object.entries(productAgg)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10)

  // 4. Kategori bazlı satış (pie chart)
  const categoryAgg: Record<string, number> = {}
  for (const s of daySales) {
    for (const it of s.items) {
      const cat = it.product?.category ?? 'Diğer'
      categoryAgg[cat] = (categoryAgg[cat] ?? 0) + it.lineTotal
    }
  }
  const byCategory = Object.entries(categoryAgg)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // M5 — SATILAN MALIN MALİYETİ (COGS): kalemlerin (güncel) maliyet fiyatı
  // üzerinden tahmini maliyet; brüt kâr = ciro - COGS.
  let cogs = 0
  for (const s of daySales) {
    for (const it of s.items) {
      const cost = it.product?.costPrice ?? 0
      // Maliyeti hiç girilmemiş ürünler için satış fiyatından %25 varsayılan
      // marj varsayımı YAPILMAZ — 0 sayılır (aşırı kâr göstermemek için).
      if (cost > 0) cogs += cost * it.qty
    }
  }

  // 5. Stok değeri (tüm tenant ürünleri)
  const products = await db.product.findMany({
    where: { tenantId: user!.tenantId },
    select: { id: true, name: true, stock: true, price: true, costPrice: true, minStock: true, category: true, sku: true },
  })

  let stockValue = 0 // satış fiyatıyla stok değeri
  let stockCost = 0 // M5: MALİYETLE stok değeri — artık price ile aynı formül değil
  let productsWithCost = 0
  const lowStock: Array<{ id: string; name: string; sku: string | null; stock: number; minStock: number; category: string | null }> = []
  for (const p of products) {
    stockValue += p.price * p.stock
    if (p.costPrice > 0) {
      stockCost += p.costPrice * p.stock
      productsWithCost += 1
    } else {
      // Maliyeti olmayan ürünlerde stok maliyeti 0 sayılır (şişirilmiş kâr önlenir)
      stockCost += 0
    }
    if (p.minStock > 0 && p.stock <= p.minStock) {
      lowStock.push({
        id: p.id, name: p.name, sku: p.sku,
        stock: p.stock, minStock: p.minStock, category: p.category,
      })
    }
  }

  // 6. Vardiya özetleri (bugün)
  const shifts = await db.posShift.findMany({
    where: {
      marketId: id,
      openingTime: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { openingTime: 'desc' },
    include: { _count: { select: { sales: true } } },
  })

  // 7. İade özeti (bugün)
  const returns = await db.marketReturn.findMany({
    where: {
      sale: { marketId: id },
      createdAt: { gte: dayStart, lte: dayEnd },
    },
    select: { totalAmount: true, reason: true, createdAt: true },
  })
  const returnsTotal = returns.reduce((s, r) => s + r.totalAmount, 0)

  return ok({
    date: dateStr,
    dailySummary,
    hourly,
    topProducts,
    byCategory,
    // M16: veresiye satışlar ayrı raporlanır — "Günlük Satış" ile
    // Nakit+Kart toplamı artık tutar (fark = veresiye)
    veresiye: {
      count: dailySummary.veresiyeCount,
      amount: daySales
        .filter((s) => s.paymentMethod === 'veresiye')
        .reduce((s, x) => s + x.total, 0),
    },
    // Net ciro = brüt satış - iadeler
    netRevenue: dailySummary.total - returnsTotal,
    grossProfit: {
      cogs: Math.round(cogs * 100) / 100,
      // Brüt kâr yalnız maliyeti bilinen kalemler üzerinden yorumlanabilir
      estimated: dailySummary.subtotal > 0 ? Math.round((dailySummary.subtotal - cogs) * 100) / 100 : 0,
      marginPct: dailySummary.subtotal > 0 && cogs > 0
        ? Math.round(((dailySummary.subtotal - cogs) / dailySummary.subtotal) * 1000) / 10
        : null,
    },
    stockValue,
    stockCost,
    productsWithCost,
    productCount: products.length,
    lowStock,
    lowStockCount: lowStock.length,
    shifts,
    returns: { total: returnsTotal, count: returns.length, items: returns },
  })
}
