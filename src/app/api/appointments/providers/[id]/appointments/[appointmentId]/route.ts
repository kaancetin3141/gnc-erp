import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// PATCH — randevu durum güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; appointmentId: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, appointmentId } = await params
  const body = await req.json()
  const { status, notes, reminderSent } = body

  const validStatuses = ['beklemede', 'onaylandi', 'reddedildi', 'tamamlandi', 'iptal', 'gelmedi']
  if (status && !validStatuses.includes(status)) return err('Geçersiz durum', 400)

  const updateData: Record<string, unknown> = {}
  if (status) updateData.status = status
  if (notes !== undefined) updateData.notes = notes
  if (typeof reminderSent === 'boolean') updateData.reminderSent = reminderSent

  const updated = await db.appointment.update({
    where: { id: appointmentId },
    data: updateData,
    include: {
      staff: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, duration: true, price: true } },
    },
  })

  return ok(updated)
}

// DELETE — randevu iptal et
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; appointmentId: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, appointmentId } = await params
  await db.appointment.update({
    where: { id: appointmentId },
    data: { status: 'iptal' },
  })

  return ok({ success: true })
}
