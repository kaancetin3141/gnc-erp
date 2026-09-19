// ============================================================
// WhatsApp Mesaj Merkezi API — tekil mesaj
// PATCH  /api/whatsapp/messages/[id] — durum güncelle
//        (gonderildi | kuyrukta | iptal), sentAt otomatik
// DELETE /api/whatsapp/messages/[id] — kayıt sil
// Yetki: messages.view — tenant izolasyonlu
// ============================================================

import { db } from '@/lib/db'
import { ok, err, requirePermission, getSession } from '@/lib/api-utils'

const VALID_STATUSES = ['kuyrukta', 'gonderildi', 'iptal']

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'messages.view')
  if (permErr) return permErr
  if (!user) return err('Oturum gerekli', 401)

  const { id } = await params
  const existing = await db.whatsAppMessage.findFirst({
    where: { id, tenantId: user.tenantId },
  })
  if (!existing) return err('Mesaj bulunamadı', 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.status !== 'string' || !VALID_STATUSES.includes(body.status)) {
    return err('Geçersiz durum')
  }

  const msg = await db.whatsAppMessage.update({
    where: { id },
    data: {
      status: body.status,
      sentAt: body.status === 'gonderildi' ? (existing.sentAt ?? new Date()) : null,
    },
  })

  return ok({ id: msg.id, status: msg.status, sentAt: msg.sentAt })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'messages.view')
  if (permErr) return permErr
  if (!user) return err('Oturum gerekli', 401)

  const { id } = await params
  const existing = await db.whatsAppMessage.findFirst({
    where: { id, tenantId: user.tenantId },
  })
  if (!existing) return err('Mesaj bulunamadı', 404)

  await db.whatsAppMessage.delete({ where: { id } })
  return ok({ success: true })
}
