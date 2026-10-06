import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — abonelik detayı + kullanım geçmişi
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const sub = await db.memberPackage.findFirst({
    where: { id, tenantId: user!.tenantId },
    include: {
      package: true,
      usages: { orderBy: { usedAt: 'desc' }, take: 50 },
    },
  })
  if (!sub) return err('Abonelik bulunamadı', 404)

  return ok(sub)
}

// PATCH — abonelik işlemi:
//   action=use-session  → 1 seans düş (aktif + süre uygun + seans kalmış olmalı)
//   action=cancel       → iptal et
//   action=extend       → { days } kadar süre uzat
//   action=renew        → yeni dönem: seanslar sıfırlanır, süre paket.validityDays uzatılır
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'appointments.manage')
  if (permErr) return permErr

  const { id } = await params
  const body = await req.json().catch(() => null)
  const action = body?.action
  if (!['use-session', 'cancel', 'extend', 'renew'].includes(action)) return err('Geçersiz işlem')

  const sub = await db.memberPackage.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!sub) return err('Abonelik bulunamadı', 404)

  if (action === 'use-session') {
    if (sub.status !== 'aktif') return err(`Abonelik ${sub.status} durumunda, seans düşülemez`)
    if (sub.expiryDate < new Date()) {
      await db.memberPackage.update({ where: { id }, data: { status: 'suresi_doldu' } })
      return err('Aboneliğin süresi dolmuş, seans düşülemez')
    }
    if (sub.sessionsTotal > 0 && sub.sessionsUsed >= sub.sessionsTotal) {
      return err('Abonelikte kalan seans yok')
    }

    const [updated] = await db.$transaction([
      db.memberPackage.update({
        where: { id },
        data: {
          sessionsUsed: { increment: 1 },
          // sınırlı seansli pakette son seans kullanıldıysa "bitti"
          ...(sub.sessionsTotal > 0 && sub.sessionsUsed + 1 >= sub.sessionsTotal
            ? { status: 'bitti' }
            : {}),
        },
      }),
      db.memberPackageUsage.create({
        data: {
          packageId: id,
          appointmentId: body.appointmentId || null,
          note: body.note?.trim() || null,
        },
      }),
    ])

    await writeAuditLog({
      tenantId: user!.tenantId,
      actorId: user!.id,
      action: 'update',
      entity: 'member_package',
      entityId: id,
      after: { action: 'use-session', sessionsUsed: updated.sessionsUsed },
    })

    return ok(updated)
  }

  if (action === 'cancel') {
    const updated = await db.memberPackage.update({ where: { id }, data: { status: 'iptal' } })
    await writeAuditLog({
      tenantId: user!.tenantId,
      actorId: user!.id,
      action: 'update',
      entity: 'member_package',
      entityId: id,
      before: { status: sub.status },
      after: { status: 'iptal' },
    })
    return ok(updated)
  }

  if (action === 'renew') {
    const pkg = await db.membershipPackage.findUnique({ where: { id: sub.packageId } })
    if (!pkg) return err('Paket tanımı bulunamadı', 404)
    const validity = Math.max(1, pkg.validityDays || 30)
    const now = new Date()
    // Süre: kalan süreden devam (bitmemişse mevcut bitişten), bittiyse bugünden
    const base = sub.expiryDate > now ? sub.expiryDate : now
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.memberPackage.update({
        where: { id },
        data: {
          status: 'aktif',
          sessionsTotal: pkg.sessionCount || sub.sessionsTotal,
          sessionsUsed: 0,
          startDate: sub.status === 'aktif' ? sub.startDate : now,
          expiryDate: new Date(base.getTime() + validity * 24 * 60 * 60 * 1000),
          remindedAt: null, // yeni dönem için hatırlatma yeniden çalışsın
        },
      })
      await tx.memberPackageUsage.create({
        data: { packageId: id, note: 'Yenileme — yeni dönem açıldı' },
      })
      return u
    })
    await writeAuditLog({
      tenantId: user!.tenantId,
      actorId: user!.id,
      action: 'update',
      entity: 'member_package',
      entityId: id,
      before: { status: sub.status, sessionsUsed: sub.sessionsUsed },
      after: { action: 'renew', validityDays: validity, newExpiry: updated.expiryDate },
    })
    return ok(updated)
  }

  // extend
  const days = parseInt(body?.days)
  if (isNaN(days) || days < 1) return err('Uzatma günü geçersiz')
  const base = sub.expiryDate < new Date() ? new Date() : sub.expiryDate
  const updated = await db.memberPackage.update({
    where: { id },
    data: {
      expiryDate: new Date(base.getTime() + days * 24 * 60 * 60 * 1000),
      ...(sub.status === 'suresi_doldu' ? { status: 'aktif' } : {}),
    },
  })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'member_package',
    entityId: id,
    after: { action: 'extend', days },
  })
  return ok(updated)
}

// DELETE — abonelik kaydını sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'appointments.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.memberPackage.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!existing) return err('Abonelik bulunamadı', 404)

  await db.memberPackage.delete({ where: { id } })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'member_package',
    entityId: id,
    before: { customerName: existing.customerName, status: existing.status },
  })

  return ok({ deleted: true })
}
