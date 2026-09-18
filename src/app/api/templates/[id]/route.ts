import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, ok, err,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_TYPES = ['whatsapp', 'email', 'sms']
const VALID_CATEGORIES = ['genel', 'satis', 'takip', 'teklif', 'tesekkur']

// ============================================================
// GET — tekil şablon
// ============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const template = await db.messageTemplate.findUnique({ where: { id } })
  if (!template || template.tenantId !== user!.tenantId) {
    return err('Şablon bulunamadı', 404)
  }
  return ok(template)
}

// ============================================================
// PATCH — şablon güncelle
// ============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const existing = await db.messageTemplate.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== user!.tenantId) {
    return err('Şablon bulunamadı', 404)
  }

  const body = await req.json()
  const { name, type, category, subject, content, isDefault } = body as {
    name?: string
    type?: string
    category?: string
    subject?: string | null
    content?: string
    isDefault?: boolean
  }

  const updateData: Record<string, unknown> = {}
  if (name !== undefined) {
    if (!name.trim()) return err('Şablon adı boş olamaz', 400)
    updateData.name = name.trim()
  }
  if (type !== undefined) {
    if (!VALID_TYPES.includes(type)) return err('Geçersiz tip', 400)
    updateData.type = type
  }
  if (category !== undefined) {
    if (!VALID_CATEGORIES.includes(category)) return err('Geçersiz kategori', 400)
    updateData.category = category
  }
  if (subject !== undefined) {
    updateData.subject = subject?.trim() || null
  }
  if (content !== undefined) {
    if (!content.trim()) return err('Şablon içeriği boş olamaz', 400)
    updateData.content = content.trim()
  }
  if (isDefault !== undefined) {
    updateData.isDefault = !!isDefault
    // Bu şablon default yapılıyorsa, aynı tip içindeki diğerlerini temizle
    if (isDefault) {
      const finalType = type && VALID_TYPES.includes(type) ? type : existing.type
      await db.messageTemplate.updateMany({
        where: {
          tenantId: user!.tenantId,
          type: finalType,
          id: { not: id },
        },
        data: { isDefault: false },
      })
    }
  }

  const updated = await db.messageTemplate.update({
    where: { id },
    data: updateData,
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'message_template',
    entityId: id,
    before: existing,
    after: updated,
  })

  return ok(updated)
}

// ============================================================
// DELETE — şablon sil
// ============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const existing = await db.messageTemplate.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== user!.tenantId) {
    return err('Şablon bulunamadı', 404)
  }

  await db.messageTemplate.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'message_template',
    entityId: id,
    before: existing,
  })

  return ok({ success: true })
}
