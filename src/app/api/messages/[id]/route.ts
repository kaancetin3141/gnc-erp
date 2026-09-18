import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// PATCH /api/messages/[id] — okundu olarak işaretle
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const message = await db.message.findUnique({ where: { id } })
  if (!message) return err('Mesaj bulunamadı', 404)
  if (message.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  // Sadece alıcı okundu olarak işaretleyebilir
  if (message.receiverId !== user!.id) {
    return err('Bu mesajı okundu olarak işaretleyemezsiniz', 403)
  }

  const updated = await db.message.update({
    where: { id },
    data: { isRead: true },
  })

  return ok(updated)
}

// DELETE /api/messages/[id] — yalnızca gönderen silebilir
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const message = await db.message.findUnique({ where: { id } })
  if (!message) return err('Mesaj bulunamadı', 404)
  if (message.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)
  if (message.senderId !== user!.id) {
    return err('Sadece kendi gönderdiğiniz mesajları silebilirsiniz', 403)
  }

  await db.message.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'message',
    entityId: id,
    before: { contentPreview: message.content.slice(0, 80) },
  })

  return ok({ success: true })
}
