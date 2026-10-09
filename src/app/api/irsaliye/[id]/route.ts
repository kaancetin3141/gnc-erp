import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err, safeJsonParse } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const IRS_STATUSES = ['taslak', 'hazir', 'sevk_edildi', 'teslim_edildi', 'iptal']

interface LineInput {
  id?: string
  productId?: string | null
  description: string
  qty: number
  unit?: string
  weightPerUnit?: number | null
  notes?: string | null
}

// ============================================================
// GET — irsaliye detayı (kalemler dahil)
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'irsaliye.view')
  if (permErr) return permErr

  const { id } = await params
  const irsaliye = await db.irsaliye.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true, name: true, segment: true, status: true,
          email: true, phone: true, address: true, city: true,
          taxNumber: true,
        },
      },
      order: { select: { id: true, number: true, status: true } },
      lines: {
        include: { product: { select: { id: true, name: true, sku: true, unit: true } } },
        orderBy: { id: 'asc' },
      },
    },
  })

  if (!irsaliye) return err('İrsaliye bulunamadı', 404)
  if (irsaliye.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  return ok(irsaliye)
}

// ============================================================
// PATCH — irsaliye güncelle (kalemler dahil)
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'irsaliye.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.irsaliye.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!existing) return err('İrsaliye bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)
  if (existing.status === 'iptal') return err('İptal edilmiş irsaliye güncellenemez', 400)

  const body = await req.json()
  const {
    customerId, orderId, lines, carrier, trackingNo,
    shippingAddress, palletCount, palletType, palletWeight,
    notes, status,
  } = body as {
    customerId?: string
    orderId?: string | null
    lines?: LineInput[]
    carrier?: string
    trackingNo?: string
    shippingAddress?: string
    palletCount?: number
    palletType?: string
    palletWeight?: number
    notes?: string
    status?: string
  }

  const updateData: Record<string, unknown> = {}

  if (customerId && customerId !== existing.customerId) {
    const c = await db.customer.findUnique({ where: { id: customerId } })
    if (!c) return err('Müşteri bulunamadı', 404)
    if (c.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)
    updateData.customerId = customerId
  }

  if (orderId !== undefined) {
    if (orderId) {
      const o = await db.order.findUnique({ where: { id: orderId } })
      if (!o) return err('Sipariş bulunamadı', 404)
      if (o.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)
    }
    updateData.orderId = orderId || null
  }

  if (carrier !== undefined) updateData.carrier = carrier || null
  if (trackingNo !== undefined) updateData.trackingNo = trackingNo || null
  if (shippingAddress !== undefined) updateData.shippingAddress = shippingAddress || null
  if (palletCount !== undefined) updateData.palletCount = palletCount ?? null
  if (palletType !== undefined) updateData.palletType = palletType || null
  if (palletWeight !== undefined) updateData.palletWeight = palletWeight ?? null
  if (notes !== undefined) updateData.notes = notes || null

  // Status değişimi
  if (status && IRS_STATUSES.includes(status) && status !== existing.status) {
    updateData.status = status
    if (status === 'teslim_edildi' && !existing.deliveredAt) {
      updateData.deliveredAt = new Date()
    }
    if (status === 'taslak' || status === 'iptal') {
      updateData.deliveredAt = null
    }
  }

  // Yeni kalemler geldiyse: eskileri sil, yenileri oluştur
  let newLines: { qty: number; weightPerUnit: number | null; description: string; productId: string | null; unit: string; notes: string | null; totalWeight: number | null }[] = []
  if (lines !== undefined) {
    const computedLines = lines.map((l) => {
      const wpu = l.weightPerUnit ?? 0
      const qty = l.qty ?? 1
      return { ...l, weightPerUnit: wpu, totalWeight: wpu * qty }
    })

    // Toplam ağırlık yeniden hesapla
    let totalNet = 0
    for (const l of computedLines) {
      totalNet += (l.weightPerUnit ?? 0) * (l.qty ?? 0)
    }
    const palletW = palletWeight ?? existing.palletWeight ?? 20
    updateData.totalNetWeight = totalNet
    updateData.totalPackagingWeight = 0
    updateData.totalGrossWeight = totalNet + (palletW ?? 0)

    newLines = computedLines.map((l) => ({
      productId: l.productId || null,
      description: l.description || '',
      qty: l.qty ?? 1,
      unit: l.unit || 'adet',
      weightPerUnit: l.weightPerUnit ?? null,
      totalWeight: l.weightPerUnit ? l.weightPerUnit * (l.qty ?? 1) : null,
      notes: l.notes || null,
    }))

    // Eski kalemleri sil
    await db.irsaliyeLine.deleteMany({ where: { irsaliyeId: id } })
  }

  const updated = await db.irsaliye.update({
    where: { id },
    data: updateData,
    include: {
      customer: { select: { id: true, name: true } },
      order: { select: { id: true, number: true } },
    },
  })

  // Yeni kalemleri oluştur
  if (newLines.length > 0) {
    await db.irsaliyeLine.createMany({
      data: newLines.map((l) => ({ ...l, irsaliyeId: id })),
    })
  }

  // ==========================================================
  // OTOMATİK STOK HAREKETİ (Faz 8 kalıntısı)
  // · sevk_edildi → kalemlerdeki ürünler için OTOMATİK STOK ÇIKIŞI
  //   (çift düşmeyi önlemek için: önceki durum sevk/teslim değilse)
  // · sevk/teslim'den geri alınca veya iptal edilince → OTOMATİK STOK GİRİŞİ
  // ==========================================================
  let stockAdjustments = 0
  const prevStatus = existing.status
  const nextStatus = (updateData.status as string | undefined) ?? prevStatus

  const shippedToStorage = (prevStatus !== 'sevk_edildi' && prevStatus !== 'teslim_edildi') && nextStatus === 'sevk_edildi'
  const revertedFromShipment = (prevStatus === 'sevk_edildi' || prevStatus === 'teslim_edildi') &&
    (nextStatus === 'taslak' || nextStatus === 'hazir' || nextStatus === 'iptal')

  if (shippedToStorage || revertedFromShipment) {
    // Kalem listesi: güncellenen satırlar varsa onlar, yoksa mevcut satırlar
    const effectiveLines = newLines.length > 0
      ? newLines
      : await db.irsaliyeLine.findMany({ where: { irsaliyeId: id } })

    for (const l of effectiveLines) {
      if (!l.productId) continue
      const qty = Math.floor(Math.abs(l.qty ?? 0))
      if (qty <= 0) continue
      const product = await db.product.findUnique({
        where: { id: l.productId },
        select: { id: true, stock: true },
      })
      if (!product) continue

      if (shippedToStorage) {
        // Stokta olan kadarını düş (negatife düşmez — fatura akışıyla aynı davranış)
        const decrement = Math.min(qty, product.stock)
        if (decrement <= 0) continue
        await db.$transaction([
          db.stockMovement.create({
            data: {
              productId: l.productId,
              quantity: decrement,
              type: 'cikis',
              reason: `İrsaliye sevkıyesi: ${existing.number}`,
              refType: 'irsaliye',
              refId: id,
            },
          }),
          db.product.update({ where: { id: l.productId }, data: { stock: { decrement } } }),
        ])
        stockAdjustments++
      } else {
        // Geri alma: stoka iade
        await db.$transaction([
          db.stockMovement.create({
            data: {
              productId: l.productId,
              quantity: qty,
              type: 'giris',
              reason: `İrsaliye geri alındı: ${existing.number}`,
              refType: 'irsaliye',
              refId: id,
            },
          }),
          db.product.update({ where: { id: l.productId }, data: { stock: { increment: qty } } }),
        ])
        stockAdjustments++
      }
    }
  }

  // ==========================================================
  // SİPARİŞ DURUM SENKRONU — irsaliye sevk/teslim olursa
  // sipariş durumu + takip adımı otomatik güncellenir
  // ==========================================================
  if (updated.orderId && (nextStatus === 'sevk_edildi' || nextStatus === 'teslim_edildi') && nextStatus !== prevStatus) {
    const orderStatus = nextStatus === 'sevk_edildi' ? 'sevk_yapildi' : 'teslim_edildi'
    const order = await db.order.findUnique({ where: { id: updated.orderId }, select: { status: true } })
    if (order && order.status !== orderStatus) {
      await db.order.update({
        where: { id: updated.orderId },
        data: {
          status: orderStatus,
          ...(orderStatus === 'teslim_edildi' ? { deliveredAt: new Date() } : {}),
        },
      })
      await db.orderTrackingStep.create({
        data: {
          orderId: updated.orderId,
          step: orderStatus,
          note: `İrsaliye ${updated.number} ${nextStatus === 'sevk_edildi' ? 'sevk edildi' : 'teslim edildi'}`,
          userId: user!.id,
        },
      })
    }
  }

  const refreshed = await db.irsaliye.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      order: { select: { id: true, number: true } },
      lines: { include: { product: { select: { id: true, name: true, sku: true } } } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'irsaliye',
    entityId: id,
    before: safeJsonParse(JSON.stringify(existing), null),
    after: safeJsonParse(JSON.stringify({ ...(refreshed ?? updated), stockAdjustments }), null),
  })

  return ok({ ...(refreshed ?? updated), stockAdjustments })
}

// ============================================================
// DELETE — irsaliye sil (kalemler cascade)
// ============================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'irsaliye.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.irsaliye.findUnique({ where: { id } })
  if (!existing) return err('İrsaliye bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)
  if (existing.status === 'sevk_edildi' || existing.status === 'teslim_edildi') {
    return err('Sevk edilmiş veya teslim edilmiş irsaliye silinemez. İptal edin.', 400)
  }

  await db.irsaliye.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'irsaliye',
    entityId: id,
    before: safeJsonParse(JSON.stringify(existing), null),
  })

  return ok({ success: true })
}
