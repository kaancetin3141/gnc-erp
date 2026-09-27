import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// PATCH — randevu güncelle (durum + tüm düzenleme alanları)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; appointmentId: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, appointmentId } = await params

  // Tenant sahipliği kontrolü
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const existing = await db.appointment.findUnique({ where: { id: appointmentId } })
  if (!existing || existing.providerId !== id) return err('Randevu bulunamadı', 404)

  const body = await req.json()
  const {
    status, notes, reminderSent,
    staffId, serviceId, customerName, customerPhone, customerEmail, customerNote, date,
  } = body as {
    status?: string
    notes?: string
    reminderSent?: boolean
    staffId?: string | null
    serviceId?: string | null
    customerName?: string
    customerPhone?: string
    customerEmail?: string | null
    customerNote?: string | null
    date?: string
  }

  const validStatuses = ['beklemede', 'onaylandi', 'reddedildi', 'tamamlandi', 'iptal', 'gelmedi']
  if (status && !validStatuses.includes(status)) return err('Geçersiz durum', 400)

  const updateData: Record<string, unknown> = {}
  if (status) updateData.status = status
  if (notes !== undefined) updateData.notes = notes
  if (typeof reminderSent === 'boolean') updateData.reminderSent = reminderSent
  if (customerName !== undefined) updateData.customerName = customerName
  if (customerPhone !== undefined) updateData.customerPhone = customerPhone
  if (customerEmail !== undefined) updateData.customerEmail = customerEmail || null
  if (customerNote !== undefined) updateData.customerNote = customerNote || null

  // Personel — 'any' → null (herhangi biri)
  if (staffId !== undefined) {
    if (!staffId || staffId === 'any') {
      updateData.staffId = null
    } else {
      const staff = await db.staff.findUnique({ where: { id: staffId } })
      if (!staff || staff.providerId !== id) return err('Personel bulunamadı', 400)
      updateData.staffId = staffId
    }
  }

  // Hizmet + tarih — bitiş zamanı ve fiyat yeniden hesaplanır
  let service = null
  if (serviceId !== undefined) {
    if (!serviceId) {
      updateData.serviceId = null
    } else {
      service = await db.service.findUnique({ where: { id: serviceId } })
      if (!service || service.providerId !== id) return err('Hizmet bulunamadı', 400)
      updateData.serviceId = serviceId
    }
  } else if (existing.serviceId) {
    service = await db.service.findUnique({ where: { id: existing.serviceId } })
  }

  if (date !== undefined) {
    const startTime = new Date(date)
    if (isNaN(startTime.getTime())) return err('Geçersiz tarih', 400)
    const duration = service?.duration || 30
    updateData.date = startTime
    updateData.endTime = new Date(startTime.getTime() + duration * 60 * 1000)
  }
  if (service && serviceId !== undefined) updateData.price = service.price

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

  // Tenant sahipliği kontrolü
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const existing = await db.appointment.findUnique({ where: { id: appointmentId } })
  if (!existing || existing.providerId !== id) return err('Randevu bulunamadı', 404)

  await db.appointment.update({
    where: { id: appointmentId },
    data: { status: 'iptal' },
  })

  return ok({ success: true })
}
