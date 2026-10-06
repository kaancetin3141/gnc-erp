import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — hesap detayı + hareket geçmişi
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const account = await db.loyaltyAccount.findFirst({
    where: { id, tenantId: user!.tenantId },
    include: {
      transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  })
  if (!account) return err('Sadakat hesabı bulunamadı', 404)

  return ok(account)
}

// PATCH — puan işlemi:
//   action=redeem  → puan harca (yeterli puan varsa)
//   action=adjust  → manuel düzeltme (+/-)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'market.pos')
  if (permErr) return permErr

  const { id } = await params
  const body = await req.json().catch(() => null)
  const action = body?.action
  if (!['redeem', 'adjust'].includes(action)) return err('Geçersiz işlem')

  const account = await db.loyaltyAccount.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!account) return err('Sadakat hesabı bulunamadı', 404)

  const points = parseInt(body?.points)
  if (isNaN(points) || points === 0) return err('Geçersiz puan')

  if (action === 'redeem') {
    if (points <= 0) return err('Harcanacak puan pozitif olmalı')
    if (account.points < points) return err(`Yetersiz puan. Mevcut: ${account.points}`)

    const [updated] = await db.$transaction([
      db.loyaltyAccount.update({ where: { id }, data: { points: { decrement: points } } }),
      db.loyaltyTransaction.create({
        data: {
          accountId: id,
          type: 'harcama',
          points: -points,
          note: body.note?.trim() || 'Kasada harcandı',
          userId: user!.id,
        },
      }),
    ])

    await writeAuditLog({
      tenantId: user!.tenantId,
      actorId: user!.id,
      action: 'update',
      entity: 'loyalty_account',
      entityId: id,
      after: { action: 'redeem', points: -points, newBalance: updated.points },
    })

    return ok(updated)
  }

  // adjust — manuel düzeltme (+/-)
  const updated = await db.$transaction(async (tx) => {
    const acc = await tx.loyaltyAccount.update({
      where: { id },
      data: { points: { increment: points } },
    })
    await tx.loyaltyTransaction.create({
      data: {
        accountId: id,
        type: 'duzeltme',
        points,
        note: body.note?.trim() || 'Manuel düzeltme',
        userId: user!.id,
      },
    })
    return acc
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'loyalty_account',
    entityId: id,
    after: { action: 'adjust', points, newBalance: updated.points },
  })

  return ok(updated)
}

// DELETE — hesabı sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'market.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.loyaltyAccount.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!existing) return err('Sadakat hesabı bulunamadı', 404)

  await db.loyaltyAccount.delete({ where: { id } })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'loyalty_account',
    entityId: id,
    before: { name: existing.name, points: existing.points },
  })

  return ok({ deleted: true })
}
