import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// ============================================================
// GET — tekil satış + kalemler
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; saleId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id, saleId } = await params
  const sale = await db.marketSale.findUnique({
    where: { id: saleId },
    include: {
      market: true,
      items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      returns: true,
    },
  })
  if (!sale || sale.marketId !== id || sale.market.tenantId !== user!.tenantId) {
    return err('Satış bulunamadı', 404)
  }

  return ok(sale)
}
