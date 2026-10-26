import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, ok, err,
} from '@/lib/api-utils'
import { isSuperAdmin, hasPermission } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// ADMIN — BEKLEME LİSTESİ (tek kayıt)
// PATCH   { status: 'notified'|'booked'|'cancelled'|'expired' }
//         · notified → notifiedAt set edilir
// DELETE  — kaydı kalıcı sil (confirm UI tarafında)
// Yetki: appointments.view VEYA users.manage · kapsam:
//   superadmin tümü, admin kendi tenant'ının işletmeleri
//   (provider.tenantId) — aksi halde 404 (bilgi sızması yok).
// ============================================================

const NEXT_STATUSES = ['notified', 'booked', 'cancelled', 'expired'] as const

async function getScopedEntry(id: string, user: { role: string; tenantId: string }) {
  const entry = await db.waitlistEntry.findUnique({
    where: { id },
    include: { provider: { select: { id: true, name: true, tenantId: true } } },
  })
  if (!entry) return null
  if (!isSuperAdmin(user.role) && entry.provider.tenantId !== user.tenantId) {
    // Bilgi sızması olmasın — var ama yetki dışıysa da 404
    return null
  }
  return entry
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'appointments.view') && !hasPermission(user!, 'users.manage')) {
    return err('Bu işlem için yetkiniz yok', 403)
  }
  const { id } = await params

  const body = (await req.json().catch(() => null)) as { status?: unknown } | null
  if (!body) return err('İstek gövdesi okunamadı.', 400)

  const status = typeof body.status === 'string' ? body.status.trim() : ''
  if (!(NEXT_STATUSES as readonly string[]).includes(status)) {
    return err('status yalnız "notified", "booked", "cancelled" ya da "expired" olabilir.', 400)
  }

  const entry = await getScopedEntry(id, user!)
  if (!entry) return err('Bekleme kaydı bulunamadı', 404)

  const updated = await db.waitlistEntry.update({
    where: { id: entry.id },
    data: {
      status,
      // Bildirildi işareti — müşteri "Aranacağınızı bildirdik" durumuna geçer
      ...(status === 'notified' && !entry.notifiedAt ? { notifiedAt: new Date() } : {}),
    },
    select: {
      id: true, status: true, notifiedAt: true,
    },
  })

  try {
    await writeAuditLog({
      tenantId: entry.provider.tenantId,
      actorId: user!.id,
      action: 'update',
      entity: 'waitlist',
      entityId: entry.id,
      before: JSON.stringify({ status: entry.status, customerName: entry.customerName }),
      after: JSON.stringify({ status: updated.status, notifiedAt: updated.notifiedAt ?? null }),
    })
  } catch {
    // audit başarısızlığı işlemi bozmasın
  }

  return ok({ ok: true, entry: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'appointments.view') && !hasPermission(user!, 'users.manage')) {
    return err('Bu işlem için yetkiniz yok', 403)
  }
  const { id } = await params

  const entry = await getScopedEntry(id, user!)
  if (!entry) return err('Bekleme kaydı bulunamadı', 404)

  await db.waitlistEntry.delete({ where: { id: entry.id } })

  try {
    await writeAuditLog({
      tenantId: entry.provider.tenantId,
      actorId: user!.id,
      action: 'delete',
      entity: 'waitlist',
      entityId: entry.id,
      before: JSON.stringify({
        provider: entry.provider.name,
        customerName: entry.customerName,
        customerPhone: entry.customerPhone,
        preferredDate: entry.preferredDate,
        status: entry.status,
      }),
      after: JSON.stringify({ deletedBy: user!.email }),
    })
  } catch {
    // sessiz geç
  }

  return ok({ ok: true, deleted: entry.id })
}
