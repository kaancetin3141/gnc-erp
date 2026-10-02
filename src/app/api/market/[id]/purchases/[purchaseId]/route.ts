import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

async function checkPurchase(marketId: string, purchaseId: string, tenantId: string) {
  const p = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { market: true },
  })
  if (!p || p.marketId !== marketId || p.market.tenantId !== tenantId) return null
  return p
}

// ============================================================
// GET — tekil mal kabul + kalemler
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; purchaseId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr

  const { id, purchaseId } = await params
  const p = await checkPurchase(id, purchaseId, user!.tenantId)
  if (!p) return err('Mal kabul bulunamadı', 404)

  const detailed = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, sku: true, stock: true } } },
      },
    },
  })

  return ok(detailed)
}

// ============================================================
// PATCH — mal kabul et (accept) veya güncelle
// Body: { action: 'accept' | 'reject', supplier?, invoiceNo?, notes? }
// accept → stoğa ekle + hareket oluştur
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; purchaseId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id, purchaseId } = await params
  const p = await checkPurchase(id, purchaseId, user!.tenantId)
  if (!p) return err('Mal kabul bulunamadı', 404)

  const body = await req.json()
  const { action, supplier, invoiceNo, notes } = body as {
    action?: string
    supplier?: string
    invoiceNo?: string
    notes?: string
  }

  // Sadece bilgi güncelleme
  if (!action) {
    const updated = await db.purchase.update({
      where: { id: purchaseId },
      data: {
        ...(supplier !== undefined ? { supplier: supplier?.trim() || null } : {}),
        ...(invoiceNo !== undefined ? { invoiceNo: invoiceNo?.trim() || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      },
    })
    return ok(updated)
  }

  if (action === 'accept') {
    if (p.status === 'kabul_edildi') return err('Mal kabul zaten tamamlanmış', 400)

    // Tüm bekleyen kalemleri stoğa ekle
    const items = await db.purchaseItem.findMany({ where: { purchaseId, accepted: false } })

    await db.$transaction(async (tx) => {
      for (const it of items) {
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
              reason: `Mal Kabul (${p.number})`,
              refType: 'purchase',
              refId: purchaseId,
            },
          })
        }
        await tx.purchaseItem.update({
          where: { id: it.id },
          data: { accepted: true },
        })
      }

      await tx.purchase.update({
        where: { id: purchaseId },
        data: { status: 'kabul_edildi' },
      })
    })

    const final = await db.purchase.findUnique({
      where: { id: purchaseId },
      include: { items: true },
    })
    return ok(final)
  }

  if (action === 'reject') {
    const updated = await db.purchase.update({
      where: { id: purchaseId },
      data: { status: 'reddedildi' },
    })
    return ok(updated)
  }

  return err('Geçersiz işlem', 400)
}

// ============================================================
// DELETE — mal kabul sil (sadece bekliyor/reddedildi)
// ============================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; purchaseId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.stock')
  if (permErr) return permErr

  const { id, purchaseId } = await params
  const p = await checkPurchase(id, purchaseId, user!.tenantId)
  if (!p) return err('Mal kabul bulunamadı', 404)
  if (p.status === 'kabul_edildi') return err('Kabul edilmiş mal kabul silinemez', 400)

  await db.purchase.delete({ where: { id: purchaseId } })
  return ok({ success: true })
}
