import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// PATCH — mal kabul kalemi güncelle
// Body: { qty?, unitPrice?, accepted? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; purchaseId: string; itemId: string }> },
) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id, purchaseId, itemId } = await params
  const p = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { market: true, items: true },
  })
  if (!p || p.marketId !== id || p.market.tenantId !== user!.tenantId) {
    return err('Mal kabul bulunamadı', 404)
  }
  if (p.status === 'kabul_edildi') return err('Kabul edilmiş mal kabul düzenlenemez', 400)

  const item = p.items.find((i) => i.id === itemId)
  if (!item) return err('Kalem bulunamadı', 404)

  const body = await req.json()
  const { qty, unitPrice, accepted } = body as {
    qty?: number
    unitPrice?: number
    accepted?: boolean
  }

  const newQty = qty !== undefined ? Number(qty) : item.qty
  const newPrice = unitPrice !== undefined ? Number(unitPrice) : item.unitPrice
  const lineTotal = newQty * newPrice

  const updated = await db.purchaseItem.update({
    where: { id: itemId },
    data: {
      ...(qty !== undefined ? { qty: newQty } : {}),
      ...(unitPrice !== undefined ? { unitPrice: newPrice } : {}),
      ...(accepted !== undefined ? { accepted } : {}),
      lineTotal,
    },
  })

  // Purchase totalAmount güncelle
  const allItems = await db.purchaseItem.findMany({ where: { purchaseId } })
  const total = allItems.reduce((s, x) => s + x.lineTotal, 0)
  await db.purchase.update({
    where: { id: purchaseId },
    data: { totalAmount: total },
  })

  return ok(updated)
}
