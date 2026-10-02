import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err, getVisibilityFilter, safeJsonParse } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// Yardımcılar
// ============================================================

const INVOICE_STATUSES = ['odeme_bekliyor', 'odendi', 'gecikti', 'iptal']

// ============================================================
// GET — tekil fatura
// erp.manage VEYA invoices.view yetkisi yeterli (fiyatlı)
// irsaliye.view sahipleri (depocu) ÇEKİ LİSTESİ için fiyatsız
// sürümü görür — kullanıcının depocu talebi gereği.
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!user) return err('Oturum açmanız gerekli', 401)
  const canSeePrices = user.permissions.includes('erp.manage') || user.permissions.includes('invoices.view')
  const canViewPacking = user.permissions.includes('irsaliye.view')
  if (!canSeePrices && !canViewPacking) return err('Fatura görüntüleme yetkiniz yok', 403)

  const { id } = await params
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true, name: true, segment: true, status: true,
          email: true, phone: true, address: true, city: true, taxNumber: true,
        },
      },
      lines: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
      },
      order: { select: { id: true, number: true, status: true } },
    },
  })

  if (!invoice) return err('Fatura bulunamadı', 404)
  if (invoice.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  // Depo rolü — fiyat alanlarını temizle (çeki listesi fiyat içermez)
  if (!canSeePrices) {
    invoice.subtotal = 0
    invoice.taxTotal = 0
    invoice.total = 0
    invoice.lines = invoice.lines.map((l) => ({
      ...l,
      unitPrice: 0,
      taxRate: 0,
      lineTotal: 0,
    }))
  }

  return ok(invoice)
}

// ============================================================
// PATCH — fatura güncelle (status, dueDate, paidDate)
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.invoice.findUnique({ where: { id } })
  if (!existing) return err('Fatura bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const body = await req.json()
  const { status, dueDate, paidDate, packingListNo, packingListDate, dispatchNo, dispatchDate, orderId } = body as {
    status?: string
    dueDate?: string | null
    paidDate?: string | null
    packingListNo?: string | null
    packingListDate?: string | null
    dispatchNo?: string | null
    dispatchDate?: string | null
    orderId?: string | null
  }

  const updateData: Record<string, unknown> = {}

  if (status && INVOICE_STATUSES.includes(status)) {
    updateData.status = status
    if (status === 'odendi' && !existing.paidDate) {
      updateData.paidDate = new Date()
    }
    if (status === 'iptal' || status === 'odeme_bekliyor') {
      updateData.paidDate = null
    }
  }

  if (paidDate !== undefined) {
    updateData.paidDate = paidDate ? new Date(paidDate) : null
  }
  if (dueDate !== undefined) {
    updateData.dueDate = dueDate ? new Date(dueDate) : null
  }
  // Çeki listesi (packing list)
  if (packingListNo !== undefined) {
    updateData.packingListNo = packingListNo || null
  }
  if (packingListDate !== undefined) {
    updateData.packingListDate = packingListDate ? new Date(packingListDate) : null
  }
  // İrsaliye (dispatch note)
  if (dispatchNo !== undefined) {
    updateData.dispatchNo = dispatchNo || null
  }
  if (dispatchDate !== undefined) {
    updateData.dispatchDate = dispatchDate ? new Date(dispatchDate) : null
  }
  // Sipariş bağlantısı
  if (orderId !== undefined) {
    updateData.orderId = orderId || null
  }

  const updated = await db.invoice.update({
    where: { id },
    data: updateData,
    include: {
      customer: { select: { id: true, name: true } },
      order: { select: { id: true, number: true, status: true } },
    },
  })

  // ---- Müşteri 360 aktivite kayıtları (tahsilat hareketleri zaman tüneliğine düşer) ----
  const activityCreates: { type: string; subject: string; detail: string; outcome?: string }[] = []

  if (updateData.status && updateData.status !== existing.status) {
    const money = `${existing.total.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${existing.currency}`
    if (updateData.status === 'odendi') {
      activityCreates.push({
        type: 'not',
        subject: `Ödeme alındı: ${existing.number}`,
        detail: `${money} tahsil edildi`,
        outcome: 'basarili',
      })
    } else if (updateData.status === 'odeme_bekliyor' && existing.status === 'odendi') {
      activityCreates.push({
        type: 'not',
        subject: `Ödeme geri alındı: ${existing.number}`,
        detail: `${money} ödendi işareti geri çekildi`,
      })
    } else if (updateData.status === 'iptal') {
      activityCreates.push({
        type: 'not',
        subject: `Fatura iptal edildi: ${existing.number}`,
        detail: `${money} tutarlı fatura iptal edildi`,
      })
    }
  }

  if (updateData.dueDate !== undefined) {
    const oldDue = existing.dueDate
      ? existing.dueDate.toLocaleDateString('tr-TR')
      : '—'
    const newDue = updateData.dueDate
      ? (updateData.dueDate as Date).toLocaleDateString('tr-TR')
      : '—'
    if (oldDue !== newDue) {
      activityCreates.push({
        type: 'not',
        subject: `Vade güncellendi: ${existing.number}`,
        detail: `Vade ${oldDue} → ${newDue}`,
      })
    }
  }

  if (activityCreates.length > 0 && existing.customerId) {
    const now = new Date()
    await db.activity.createMany({
      data: activityCreates.map((a) => ({
        tenantId: user!.tenantId,
        customerId: existing.customerId!,
        type: a.type,
        subject: a.subject,
        detail: a.detail,
        outcome: a.outcome ?? null,
        userId: user!.id,
        date: now,
      })),
    })
    // Müşterinin son aktivite zamanını güncelle
    await db.customer.update({
      where: { id: existing.customerId },
      data: { lastActivityAt: now },
    })
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'invoice',
    entityId: id,
    before: safeJsonParse(JSON.stringify(existing), null),
    after: safeJsonParse(JSON.stringify(updated), null),
  })

  return ok(updated)
}

// ============================================================
// DELETE — fatura sil
// ============================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.invoice.findUnique({ where: { id } })
  if (!existing) return err('Fatura bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  // Görünürlük kontrolü
  const visFilter = await getVisibilityFilter(user!)
  if (visFilter.ownerId) {
    const customer = await db.customer.findUnique({
      where: { id: existing.customerId },
      select: { ownerId: true },
    })
    if (customer && customer.ownerId && !visFilter.ownerId.in.includes(customer.ownerId)) {
      return err('Bu faturayı silme yetkiniz yok', 403)
    }
  }

  await db.invoice.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'invoice',
    entityId: id,
    before: safeJsonParse(JSON.stringify(existing), null),
  })

  return ok({ success: true })
}
