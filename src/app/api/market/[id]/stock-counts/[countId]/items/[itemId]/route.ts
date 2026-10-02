import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// PATCH — sayım kalemi güncelle (countedQty)
// Body: { countedQty, notes? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; countId: string; itemId: string }> },
) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id, countId, itemId } = await params
  const sc = await db.stockCount.findUnique({
    where: { id: countId },
    include: { market: true },
  })
  if (!sc || sc.marketId !== id || sc.market.tenantId !== user!.tenantId) {
    return err('Sayım bulunamadı', 404)
  }
  if (sc.status === 'tamamlandi') return err('Tamamlanmış sayım düzenlenemez', 400)

  const item = await db.stockCountItem.findUnique({ where: { id: itemId } })
  if (!item || item.stockCountId !== countId) return err('Kalem bulunamadı', 404)

  const body = await req.json()
  const { countedQty, notes } = body as { countedQty?: number; notes?: string }

  const updated = await db.stockCountItem.update({
    where: { id: itemId },
    data: {
      ...(countedQty !== undefined ? { countedQty: Number(countedQty) } : {}),
      ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
    },
  })

  return ok(updated)
}
