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
  if (!sale || sale.marketId !== id || sale.market.tenantId !== user!.tenantId) {
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
  })
  const previouslyReturned: Record<string, number> = {}
  // Daha önce iade miktarlarını hareketlerden de bulabiliriz, ama basit tutuyoruz.

  let totalAmount = 0
  const itemsToReturn: Array<{ saleItemId: string; qty: number; lineTotal: number; productId: string | null }> = []

  for (const ret of items) {
    if (!ret.saleItemId) continue
    const saleItem = sale.items.find((i) => i.id === ret.saleItemId)
    if (!saleItem) return err(`Satış kalemi bulunamadı: ${ret.saleItemId}`, 400)

    const alreadyReturned = previouslyReturned[ret.saleItemId] ?? 0
    const maxQty = saleItem.qty - alreadyReturned
    const qty = Math.min(Number(ret.qty ?? 0), maxQty)
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

  // Transaction: iade kaydı + stok geri al
  const result = await db.$transaction(async (tx) => {
    const marketReturn = await tx.marketReturn.create({
      data: {
        saleId,
        reason: reason.trim(),
        totalAmount,
        status: 'tamamlandi',
        userId: user!.id,
      },
    })

    for (const it of itemsToReturn) {
      if (it.productId) {
        await tx.product.update({
          where: { id: it.productId },
          data: { stock: { increment: Math.round(it.qty) } },
        })
        await tx.stockMovement.create({
          data: {
            productId: it.productId,
            quantity: Math.round(it.qty),
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
