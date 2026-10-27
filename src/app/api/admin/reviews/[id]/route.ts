import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, requirePermission, ok, err,
} from '@/lib/api-utils'
import { isSuperAdmin } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// ADMIN — DEĞERLENDİRME MODERASYONU (tek kayıt)
// PATCH   { status: 'approved'|'rejected', staffReply? }
// DELETE  — değerlendirmeyi kalıcı sil (confirm UI tarafında)
// Yetki: users.manage · kapsam: superadmin tümü, admin kendi
// tenant'ının işletmeleri (provider.tenantId) — aksi halde 404.
// ============================================================

async function getScopedReview(id: string, user: { role: string; tenantId: string }) {
  const review = await db.review.findUnique({
    where: { id },
    include: { provider: { select: { id: true, name: true, tenantId: true, slug: true } } },
  })
  if (!review) return null
  if (!isSuperAdmin(user.role) && review.provider.tenantId !== user.tenantId) {
    // Bilgi sızması olmasın — var ama yetki dışıysa da 404
    return null
  }
  return review
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'users.manage')
  if (permErr) return permErr
  const { id } = await params

  const body = (await req.json().catch(() => null)) as {
    status?: unknown
    staffReply?: unknown
  } | null
  if (!body) return err('İstek gövdesi okunamadı.', 400)

  const status = typeof body.status === 'string' ? body.status.trim() : ''
  if (status !== 'approved' && status !== 'rejected') {
    return err('status yalnız "approved" ya da "rejected" olabilir.', 400)
  }
  let staffReply = typeof body.staffReply === 'string' ? body.staffReply.trim() : ''
  if (staffReply.length > 1000) staffReply = staffReply.slice(0, 1000)

  const review = await getScopedReview(id, user!)
  if (!review) return err('Değerlendirme bulunamadı', 404)

  const updated = await db.review.update({
    where: { id: review.id },
    data: {
      status,
      ...(typeof body.staffReply === 'string' && staffReply
        ? { staffReply, repliedAt: new Date() }
        : {}),
    },
    select: {
      id: true, status: true, staffReply: true, repliedAt: true,
    },
  })

  try {
    await writeAuditLog({
      tenantId: review.provider.tenantId,
      actorId: user!.id,
      action: 'update',
      entity: 'review',
      entityId: review.id,
      before: JSON.stringify({ status: review.status, staffReply: review.staffReply ?? null }),
      after: JSON.stringify({ status: updated.status, staffReply: updated.staffReply ?? null }),
    })
  } catch {
    // audit başarısızlığı işlemi bozmasın
  }

  return ok({ ok: true, review: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'users.manage')
  if (permErr) return permErr
  const { id } = await params

  const review = await getScopedReview(id, user!)
  if (!review) return err('Değerlendirme bulunamadı', 404)

  await db.review.delete({ where: { id: review.id } })

  try {
    await writeAuditLog({
      tenantId: review.provider.tenantId,
      actorId: user!.id,
      action: 'delete',
      entity: 'review',
      entityId: review.id,
      before: JSON.stringify({
        provider: review.provider.name,
        authorName: review.authorName,
        rating: review.rating,
        status: review.status,
      }),
      after: JSON.stringify({ deletedBy: user!.email }),
    })
  } catch {
    // sessiz geç
  }

  return ok({ ok: true, deleted: review.id })
}
