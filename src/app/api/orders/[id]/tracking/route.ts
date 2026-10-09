import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err, safeJsonParse } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// Yardımcılar
// ============================================================

const ORDER_STEPS = ['hazirlaniyor', 'onaylandi', 'uretimde', 'sevk_yapildi', 'teslim_edildi', 'iptal']

// ============================================================
// GET — siparişin takip adımları listesi
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const order = await db.order.findUnique({
    where: { id },
    select: { id: true, tenantId: true, number: true },
  })

  if (!order) return err('Sipariş bulunamadı', 404)
  if (order.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const steps = await db.orderTrackingStep.findMany({
    where: { orderId: id },
    orderBy: { createdAt: 'asc' },
  })

  return ok({ items: steps, total: steps.length })
}

// ============================================================
// POST — siparişe manuel takip adımı ekle
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const order = await db.order.findUnique({
    where: { id },
    select: { id: true, tenantId: true, number: true, status: true },
  })

  if (!order) return err('Sipariş bulunamadı', 404)
  if (order.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const body = await req.json()
  const { step, note } = body as { step?: string; note?: string }

  if (!step || !ORDER_STEPS.includes(step)) {
    return err(`Geçersiz adım. İzin verilenler: ${ORDER_STEPS.join(', ')}`, 400)
  }

  // Adımı kaydet
  const trackingStep = await db.orderTrackingStep.create({
    data: {
      orderId: id,
      step,
      note: note || null,
      userId: user!.id,
    },
  })

  // Eğer adım siparişin mevcut durumundan farklıysa, sipariş durumunu da güncelle
  let orderUpdated = false
  if (step !== order.status) {
    const patchData: Record<string, unknown> = { status: step }
    if (step === 'teslim_edildi') patchData.deliveredAt = new Date()
    if (step === 'iptal' || step === 'hazirlaniyor') patchData.deliveredAt = null
    await db.order.update({ where: { id }, data: patchData })
    orderUpdated = true
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'order_tracking_step',
    entityId: trackingStep.id,
    after: safeJsonParse(JSON.stringify(trackingStep), null),
  })

  return ok({ trackingStep, orderUpdated })
}
