import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err, getSession, requireAuth } from '@/lib/api-utils'

// ============================================================
// ADMIN — Tek portfolyo projesi
// PATCH  /api/portfolio-admin/[id] -> düzenle
// DELETE /api/portfolio-admin/[id] -> sil
// ============================================================

function parseArrayInput(input: unknown): string | null {
  if (input === undefined || input === null || input === '') return null
  if (Array.isArray(input)) {
    const arr = input.map((s) => String(s).trim()).filter(Boolean)
    return arr.length ? JSON.stringify(arr) : null
  }
  const arr = String(input)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return arr.length ? JSON.stringify(arr) : null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (user!.role !== 'admin' && user!.role !== 'superadmin') {
    return err('Bu işlem için yönetici yetkisi gerekli', 403)
  }

  const { id } = await params
  const existing = await db.portfolioProject.findUnique({ where: { id } })
  if (!existing) return err('Proje bulunamadı', 404)

  const body = await req.json().catch(() => null)
  if (!body) return err('Geçersiz istek gövdesi')

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = String(body.title).trim()
  if (body.description !== undefined) data.description = String(body.description).trim()
  if (body.url !== undefined) data.url = body.url ? String(body.url).trim() : null
  if (body.subdomain !== undefined) data.subdomain = body.subdomain ? String(body.subdomain).trim() : null
  if (body.status !== undefined && ['live', 'soon', 'planned'].includes(body.status)) data.status = body.status
  if (body.emoji !== undefined) data.emoji = body.emoji ? String(body.emoji).trim().slice(0, 8) : '🚀'
  if (body.tech !== undefined) data.tech = parseArrayInput(body.tech)
  if (body.features !== undefined) data.features = parseArrayInput(body.features)
  if (body.sortOrder !== undefined && typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder
  if (body.published !== undefined) data.published = Boolean(body.published)

  try {
    const project = await db.portfolioProject.update({ where: { id }, data })
    return ok({ project })
  } catch (error) {
    console.error('[portfolio-admin] PATCH error:', error)
    return err('Proje güncellenemedi', 500)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (user!.role !== 'admin' && user!.role !== 'superadmin') {
    return err('Bu işlem için yönetici yetkisi gerekli', 403)
  }

  const { id } = await params
  try {
    await db.portfolioProject.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (error) {
    console.error('[portfolio-admin] DELETE error:', error)
    return err('Proje silinemedi', 500)
  }
}
