import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// ADMIN — VİTRİN PORTFÖY FOTOĞRAFI (tek kayıt)
// PATCH  { title?, caption?, category?, isActive? }  → meta güncelle
// DELETE — fotoğrafı kalıcı sil (confirm UI tarafında)
// Yetki: appointments.view VEYA users.manage · kapsam:
//   superadmin tümü, admin kendi tenant'ı (photo.provider.tenantId)
//   — aksi halde 404 (bilgi sızması yok).
// Not: sıralama ayrı uç nokta /api/admin/provider-photos/reorder
// ============================================================

const MAX_TITLE = 80
const MAX_CAPTION = 200
const CATEGORIES = ['kesim', 'sac-boyama', 'sakal', 'stil', 'salon', 'ekip', 'diger']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const existing = await db.providerPhoto.findUnique({ include: { provider: true }, where: { id } })
  if (!existing) return err('Fotoğraf bulunamadı', 404)
  if (existing.provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') {
    return err('Fotoğraf bulunamadı', 404)
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Geçersiz istek gövdesi', 400)
  const b = body as Record<string, unknown>

  const update: Record<string, unknown> = {}
  if ('title' in b) update.title = String(b.title ?? '').trim().slice(0, MAX_TITLE) || null
  if ('caption' in b) update.caption = String(b.caption ?? '').trim().slice(0, MAX_CAPTION) || null
  if ('category' in b) {
    const cat = String(b.category ?? '').trim()
    update.category = (CATEGORIES as readonly string[]).includes(cat) ? cat : null
  }
  if ('isActive' in b) update.isActive = Boolean(b.isActive)
  if (Object.keys(update).length === 0) return err('Güncellenecek alan yok', 400)

  const updated = await db.providerPhoto.update({ where: { id }, data: update })

  await writeAuditLog({
    tenantId: existing.provider.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'provider_photo',
    entityId: id,
    before: JSON.stringify({ title: existing.title, caption: existing.caption, category: existing.category, isActive: existing.isActive }),
    after: JSON.stringify({ title: updated.title, caption: updated.caption, category: updated.category, isActive: updated.isActive }),
  }).catch(() => {})

  return ok({ photo: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const existing = await db.providerPhoto.findUnique({ include: { provider: true }, where: { id } })
  if (!existing) return err('Fotoğraf bulunamadı', 404)
  if (existing.provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') {
    return err('Fotoğraf bulunamadı', 404)
  }

  await db.providerPhoto.delete({ where: { id } })

  await writeAuditLog({
    tenantId: existing.provider.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'provider_photo',
    entityId: id,
    before: JSON.stringify({ title: existing.title, category: existing.category, provider: existing.provider.name }),
    after: 'null',
  }).catch(() => {})

  return ok({ success: true })
}
