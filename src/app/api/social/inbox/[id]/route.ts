import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'

// PATCH — inbox mesajı güncelle (okundu / yanıtla / öncelik)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.manage')) return err('Sosyal medya yönetme yetkiniz yok', 403)

  const { id } = await params
  const msg = await db.socialInboxMessage.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!msg) return err('Mesaj bulunamadı', 404)

  const body = await req.json().catch(() => ({}))
  const { isRead, isReplied, replyText, priority } = body as {
    isRead?: boolean
    isReplied?: boolean
    replyText?: string
    priority?: string
  }

  const updateData: Record<string, unknown> = {}
  if (typeof isRead === 'boolean') updateData.isRead = isRead
  if (typeof isReplied === 'boolean') updateData.isReplied = isReplied
  if (typeof replyText === 'string') {
    updateData.replyText = replyText
    updateData.isReplied = true
    updateData.repliedAt = new Date()
  }
  if (typeof priority === 'string') updateData.priority = priority

  const updated = await db.socialInboxMessage.update({
    where: { id },
    data: updateData,
  })

  return ok(updated)
}

// DELETE — inbox mesajı sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.manage')) return err('Sosyal medya yönetme yetkiniz yok', 403)

  const { id } = await params
  const msg = await db.socialInboxMessage.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!msg) return err('Mesaj bulunamadı', 404)

  await db.socialInboxMessage.delete({ where: { id } })
  return ok({ success: true })
}
