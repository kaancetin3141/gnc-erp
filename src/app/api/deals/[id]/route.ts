import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requirePermission, ok, err,
  canAccessResource,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// PATCH — fırsat güncelle (drag-drop dahil)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'deals.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.deal.findUnique({ where: { id } })
  if (!existing) return err('Fırsat bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const canAccess = await canAccessResource(user!, existing.ownerId)
  if (!canAccess) return err('Bu fırsatı düzenleme yetkiniz yok', 403)

  const body = await req.json()
  const {
    title, customerId, value, currency, stage, probability,
    expectedCloseDate, ownerId, lossReason, lossNote,
  } = body

  const updateData: Record<string, unknown> = {}

  if (title !== undefined) updateData.title = title
  if (value !== undefined) updateData.value = value
  if (currency !== undefined) updateData.currency = currency
  if (expectedCloseDate !== undefined) {
    updateData.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null
  }
  if (ownerId !== undefined) {
    if (ownerId) {
      const newOwner = await db.user.findFirst({
        where: { id: ownerId, tenantId: user!.tenantId },
        select: { id: true },
      })
      if (!newOwner) return err('Yeni sahip bulunamadı', 404)
      updateData.ownerId = ownerId
    } else {
      updateData.ownerId = null
    }
  }
  if (customerId !== undefined) {
    const cust = await db.customer.findFirst({
      where: { id: customerId, tenantId: user!.tenantId },
      select: { id: true },
    })
    if (!cust) return err('Müşteri bulunamadı', 404)
    updateData.customerId = customerId
  }
  if (lossNote !== undefined) updateData.lossNote = lossNote || null
  if (lossReason !== undefined) updateData.lossReason = lossReason || null

  // Stage değişimi — olasılık ve kayıp nedeni yönetimi
  if (stage !== undefined && stage !== existing.stage) {
    updateData.stage = stage
    if (stage === 'kazanıldı') {
      updateData.probability = 100
    } else if (stage === 'kaybedildi') {
      updateData.probability = 0
      // lossReason zorunlu
      const reason = lossReason !== undefined ? lossReason : existing.lossReason
      if (!reason) {
        return err('Kaybedildi durumunda kayıp nedeni zorunludur', 400)
      }
      updateData.lossReason = reason
      if (lossNote !== undefined) updateData.lossNote = lossNote || null
    } else if (probability !== undefined) {
      updateData.probability = probability
    }
  } else if (probability !== undefined) {
    // Kazanılan/kaybedilen değilse manuel olasılık set edilebilir
    if (existing.stage !== 'kazanıldı' && existing.stage !== 'kaybedildi') {
      updateData.probability = probability
    }
  }

  const updated = await db.deal.update({
    where: { id },
    data: updateData,
    include: {
      customer: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'deal',
    entityId: id,
    before: existing,
    after: updated,
  })

  return ok(updated)
}

// DELETE — fırsat sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'deals.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.deal.findUnique({ where: { id } })
  if (!existing) return err('Fırsat bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  await db.deal.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'deal',
    entityId: id,
    before: existing,
  })

  return ok({ success: true })
}
