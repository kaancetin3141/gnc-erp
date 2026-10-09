import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// DELETE — barkod sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; barcodeId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id, barcodeId } = await params
  const barcode = await db.barcode.findUnique({
    where: { id: barcodeId },
    include: { product: true },
  })
  if (!barcode) return err('Barkod bulunamadı', 404)
  // tenant isolation: product.tenantId veya market.tenantId
  if (barcode.product.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Yetkisiz', 403)
  if (barcode.marketId && barcode.marketId !== id) return err('Barkod bu markete ait değil', 400)

  await db.barcode.delete({ where: { id: barcodeId } })
  return ok({ success: true })
}
