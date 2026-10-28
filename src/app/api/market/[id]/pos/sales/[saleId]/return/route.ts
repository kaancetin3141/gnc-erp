import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// POST — satış iadesi
// Body: { reason, items: [{ saleItemId, qty }] }
// - İade kalemlerini stoğa geri ekle
// - MarketReturn kaydı oluştur
// - Toplam iade tutarını hesapla
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; saleId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.pos')
  if (permErr) return permErr

  const { id, saleId } = await params
  const sale = await db.marketSale.findUnique({
    where: { id: saleId },
    include: { market: true, items: true },
  })
  if (!sale || sale.marketId !== id || sale.market.tenantId !== user!.tenantId && user!.role !== 'superadmin') {
    return err('Satış bulunamadı', 404)
  }

  const body = await req.json()
  const { reason, items } = body as {
    reason?: string
    items?: Array<{ saleItemId?: string; qty?: number }>
  }

  if (!reason || !reason.trim()) return err('İade sebebi gerekli', 400)
  if (!items || !Array.isArray(items) || items.length === 0) return err('İade kalemleri gerekli', 400)

  // Hali hazırda var olan iadeleri çek (önceden iade edilen miktarlar için)
  const existingReturns = await db.marketReturn.findMany({
    where: { saleId, status: 'tamamlandi' },
    include: { items: true },
  })
  // Satır bazında daha önce iade edilen miktarı hesapla — aynı fişin
  // aynı kalemi ikinci kez iade edilemez, stok şişirilemez.
  const previouslyReturned: Record<string, number> = {}
  for (const ret of existingReturns) {
    for (const it of ret.items) {
      previouslyReturned[it.saleItemId] = (previouslyReturned[it.saleItemId] ?? 0) + it.qty
    }
  }

  let totalAmount = 0
  const itemsToReturn: Array<{ saleItemId: string; qty: number; lineTotal: number; productId: string | null }> = []

  for (const ret of items) {
    if (!ret.saleItemId) continue
    const saleItem = sale.items.find((i) => i.id === ret.saleItemId)
    if (!saleItem) return err(`Satış kalemi bulunamadı: ${ret.saleItemId}`, 400)

    const alreadyReturned = previouslyReturned[ret.saleItemId] ?? 0
    const maxQty = saleItem.qty - alreadyReturned
    const requestedQty = Number(ret.qty ?? 0)
    // NaN / sonlu olmayan miktarlar DB'ye yazılamaz — lineTotal=NaN fiş bozar
    if (!Number.isFinite(requestedQty)) {
      return err(`Geçersiz miktar: ${ret.saleItemId}`, 400)
    }
    if (requestedQty > maxQty) {
      return err(
        `"${saleItem.name}" için iade edilebilir maksimum miktar ${maxQty} ` +
        `(satılan ${saleItem.qty}, daha önce iade edilen ${alreadyReturned})`,
        400,
      )
    }
    const qty = requestedQty
    if (qty <= 0) continue

    // İade tutarı (orantılı)
    const lineTotal = (saleItem.lineTotal / saleItem.qty) * qty
    totalAmount += lineTotal

    itemsToReturn.push({
      saleItemId: ret.saleItemId,
      qty,
      lineTotal,
      productId: saleItem.productId,
    })

    previouslyReturned[ret.saleItemId] = alreadyReturned + qty
  }

  if (itemsToReturn.length === 0) return err('İade edilecek geçerli kalem yok', 400)

  // Transaction: iade kaydı + iade kalemleri + stok geri al
  const result = await db.$transaction(async (tx) => {
    const marketReturn = await tx.marketReturn.create({
      data: {
        saleId,
        reason: reason.trim(),
        totalAmount,
        status: 'tamamlandi',
        userId: user!.id,
        items: {
          create: itemsToReturn.map((it) => ({
            saleItemId: it.saleItemId,
            qty: it.qty,
            lineTotal: it.lineTotal,
          })),
        },
      },
    })

    for (const it of itemsToReturn) {
      if (it.productId) {
        await tx.product.update({
          where: { id: it.productId },
          data: { stock: { increment: it.qty } },
        })
        await tx.stockMovement.create({
          data: {
            productId: it.productId,
            quantity: it.qty,
            type: 'giris',
            reason: 'Satış İadesi',
            refType: 'market_return',
            refId: marketReturn.id,
          },
        })
      }
    }

    return marketReturn
  })

  // VERESİYE İADESİ: veresiyle satılan malın iadesi müşterinin borcunu azaltır.
  // Yazılmazsa müşteri iade ettiği malın parasını ödemeye devam eder.
  if (sale.paymentMethod === 'veresiye') {
    const cc = await db.creditCustomer.findFirst({
      where: { marketId: id, isActive: true },
      orderBy: { createdAt: 'asc' },
    })
    // Satışın bağlı olduğu veresiye carisi CreditEntry.refSaleId üzerinden bulunur
    const linkedEntry = await db.creditEntry.findFirst({
      where: { refSaleId: saleId, type: 'borc' },
      select: { customerId: true },
    })
    const targetCustomerId = linkedEntry?.customerId ?? cc?.id ?? null
    if (targetCustomerId) {
      await db.creditEntry.create({
        data: {
          customerId: targetCustomerId,
          type: 'alacak',
          amount: totalAmount,
          refSaleId: saleId,
          note: `İade — ${sale.number} (${reason.trim()})`,
          createdById: user!.id,
        },
      })
    }
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'market_return',
    entityId: result.id,
    after: { saleId, totalAmount },
  })

  return ok(result)
}
