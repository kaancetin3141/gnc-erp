import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err, getVisibilityFilter, safeJsonParse } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// Yardımcılar
// ============================================================

const ORDER_STATUSES = ['hazirlaniyor', 'onaylandi', 'uretimde', 'sevk_yapildi', 'teslim_edildi', 'iptal']

// ============================================================
// GET — tekil sipariş (takip adımları dahil)
// 'orders.view' veya 'erp.manage' yetkisi gerekir
// Depo rolü için fiyat alanları gizlenir (quote/invoice lines'ları alır)
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!user) return err('Oturum açmanız gerekli', 401)
  const hasView = user.permissions.includes('orders.view')
  const hasManage = user.permissions.includes('erp.manage')
  if (!hasView && !hasManage) return err('Bu işlem için yetkiniz yok', 403)

  const { id } = await params
  const isDepoRole = user.role === 'stock' || user.role === 'depo_sorumlusu'

  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true, name: true, segment: true, status: true,
          email: true, phone: true, address: true, city: true,
        },
      },
      quote: {
        select: {
          id: true, number: true, status: true, isProforma: true,
          lines: { select: { productId: true, description: true, qty: true } },
        },
      },
      invoice: {
        select: {
          id: true, number: true, status: true,
          lines: { select: { productId: true, description: true, qty: true } },
        },
      },
      trackingSteps: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!order) return err('Sipariş bulunamadı', 404)
  if (order.tenantId !== user.tenantId) return err('Erişim reddedildi', 403)

  // Depo rolü için fiyat alanlarını gizle (totalAmount, currency, totals)
  if (isDepoRole) {
    return ok({
      id: order.id,
      tenantId: order.tenantId,
      customerId: order.customerId,
      quoteId: order.quoteId,
      number: order.number,
      status: order.status,
      orderDate: order.orderDate,
      expectedDelivery: order.expectedDelivery,
      deliveredAt: order.deliveredAt,
      notes: order.notes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customer: order.customer,
      quote: order.quote ? {
        id: order.quote.id,
        number: order.quote.number,
        status: order.quote.status,
        isProforma: order.quote.isProforma,
        lines: order.quote.lines,
      } : null,
      invoice: order.invoice ? {
        id: order.invoice.id,
        number: order.invoice.number,
        status: order.invoice.status,
        lines: order.invoice.lines,
      } : null,
      trackingSteps: order.trackingSteps,
      // totalAmount ve currency bilinçli olarak DAHİL DEĞİL
    })
  }

  return ok(order)
}

// ============================================================
// PATCH — sipariş güncelle (status, expectedDelivery, notes)
// Durum değişince otomatik OrderTrackingStep oluştur
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.order.findUnique({
    where: { id },
    include: { trackingSteps: true },
  })
  if (!existing) return err('Sipariş bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const body = await req.json()
  const { status, expectedDelivery, notes, note } = body as {
    status?: string
    expectedDelivery?: string | null
    notes?: string | null
    note?: string
  }

  const updateData: Record<string, unknown> = {}
  let trackingStep: { step: string; note: string | null } | null = null

  if (status && ORDER_STATUSES.includes(status) && status !== existing.status) {
    updateData.status = status
    if (status === 'teslim_edildi' && !existing.deliveredAt) {
      updateData.deliveredAt = new Date()
    }
    if (status === 'iptal' || status === 'hazirlaniyor') {
      updateData.deliveredAt = null
    }
    trackingStep = { step: status, note: note ?? null }
  }

  if (expectedDelivery !== undefined) {
    updateData.expectedDelivery = expectedDelivery ? new Date(expectedDelivery) : null
  }
  if (notes !== undefined) {
    updateData.notes = notes || null
  }

  const updated = await db.order.update({
    where: { id },
    data: updateData,
    include: {
      customer: { select: { id: true, name: true } },
      trackingSteps: { orderBy: { createdAt: 'asc' } },
    },
  })

  // Tracking adımı ekle
  if (trackingStep) {
    await db.orderTrackingStep.create({
      data: {
        orderId: id,
        step: trackingStep.step,
        note: trackingStep.note,
        userId: user!.id,
      },
    })

    // Sipariş 'uretimde' durumuna geçtiyse ve henüz üretim kalemleri yoksa,
    // fatura/teklif kalemlerinden üretim kalemlerini otomatik oluştur.
    // Eğer bağlı fatura/teklif yoksa, sipariş için tek bir genel üretim kalemi oluştur.
    if (trackingStep.step === 'uretimde') {
      const existingProdCount = await db.productionItem.count({
        where: { orderId: id, tenantId: existing.tenantId },
      })
      if (existingProdCount === 0) {
        const orderWithLines = await db.order.findUnique({
          where: { id },
          include: {
            quote: { include: { lines: { select: { productId: true, description: true, qty: true } } } },
            invoice: { include: { lines: { select: { productId: true, description: true, qty: true } } } },
          },
        })
        const sourceLines =
          (orderWithLines?.invoice?.lines?.length ?? 0) > 0
            ? orderWithLines!.invoice!.lines
            : orderWithLines?.quote?.lines ?? []

        if (sourceLines.length > 0) {
          await db.$transaction(
            sourceLines.map((line) =>
              db.productionItem.create({
                data: {
                  // SUPERADMIN: siparişin tenantı kullanılır (çapraz-tenant tutarlılığı)
                  tenantId: existing.tenantId,
                  orderId: id,
                  productId: line.productId,
                  description: line.description,
                  qty: line.qty ?? 1,
                  status: 'bekliyor',
                },
              }),
            ),
          )
        } else {
          // Manuel sipariş — bağlı fatura/teklif yoksa genel üretim kalemi oluştur
          await db.productionItem.create({
            data: {
              // SUPERADMIN: siparişin tenantı kullanılır (çapraz-tenant tutarlılığı)
              tenantId: existing.tenantId,
              orderId: id,
              productId: null,
              description: `Sipariş ${orderWithLines?.number ?? id} - Üretim`,
              qty: 1,
              status: 'bekliyor',
            },
          })
        }
      }
    }
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'order',
    entityId: id,
    before: safeJsonParse(JSON.stringify(existing), null),
    after: safeJsonParse(JSON.stringify(updated), null),
  })

  return ok(updated)
}

// ============================================================
// DELETE — sipariş sil (trackingSteps cascade)
// ============================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.order.findUnique({ where: { id } })
  if (!existing) return err('Sipariş bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const visFilter = await getVisibilityFilter(user!)
  if (visFilter.ownerId) {
    const customer = await db.customer.findUnique({
      where: { id: existing.customerId },
      select: { ownerId: true },
    })
    if (customer && customer.ownerId && !visFilter.ownerId.in.includes(customer.ownerId)) {
      return err('Bu siparişi silme yetkiniz yok', 403)
    }
  }

  await db.order.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'order',
    entityId: id,
    before: safeJsonParse(JSON.stringify(existing), null),
  })

  return ok({ success: true })
}
