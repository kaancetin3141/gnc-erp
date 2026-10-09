import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { timeOffCoversRange, timeOffLabel } from '@/lib/appointment-timeoff'

// PATCH — randevu güncelle (durum + tüm düzenleme alanları)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; appointmentId: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, appointmentId } = await params

  // Tenant sahipliği kontrolü
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const existing = await db.appointment.findUnique({ where: { id: appointmentId } })
  if (!existing || existing.providerId !== id) return err('Randevu bulunamadı', 404)

  const body = await req.json()
  const {
    status, notes, reminderSent,
    staffId, serviceId, customerName, customerPhone, customerEmail, customerNote, date, force,
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
    force?: boolean
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
  // Tip: `let service = null` yerine Prisma dönen gerçek tip (never tuzağını önler)
  let service: Awaited<ReturnType<typeof db.service.findUnique>> = null
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
    const newEnd = new Date(startTime.getTime() + duration * 60 * 1000)
    updateData.date = startTime
    updateData.endTime = newEnd

    // Çakışma kontrolü — taşımada aynı personelde örtüşen randevu var mı?
    // (force=true ile atlanır; sürükle-bırak güvenli taşima için önce reddeder)
    const effStaffId = (updateData.staffId !== undefined ? updateData.staffId : existing.staffId) as string | null
    if (effStaffId && !force) {
      const conflicts = await db.appointment.findMany({
        where: {
          providerId: id,
          staffId: effStaffId,
          id: { not: appointmentId },
          status: { in: ['beklemede', 'onaylandi'] },
          date: { lt: newEnd },
          endTime: { gt: startTime },
        },
        select: { customerName: true, date: true },
      })
      if (conflicts.length > 0) {
        const c = conflicts[0]
        const cTime = new Date(c.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        return err(`Çakışma: ${c.customerName} (${cTime}) randevusu ile örtüşüyor`, 409)
      }
    }

    // PERSONEL İZİN KONTROLÜ — taşınan/atanan personel bu aralıkta izinliyse engelle
    if (effStaffId) {
      const timeOffs = await db.staffTimeOff.findMany({
        where: {
          providerId: id,
          staffId: effStaffId,
          date: {
            gte: new Date(startTime.getTime() - 24 * 60 * 60_000),
            lte: new Date(newEnd.getTime() + 24 * 60 * 60_000),
          },
        },
      })
      const hit = timeOffs.find((t) => timeOffCoversRange(t, startTime.getTime(), newEnd.getTime()))
      if (hit) {
        return err(`Personel bu saatte izinli (${timeOffLabel(hit)}) — randevu izinli personele taşınamaz`, 409)
      }
    }
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

  // Üyelik entegrasyonu: randevu tamamlandığında müşterinin aktif paketinden 1 seans düş
  let packageUsed: { id: string; remaining: number; packageName: string } | null = null
  if (status === 'tamamlandi' && existing.status !== 'tamamlandi') {
    try {
      const candidate = await db.memberPackage.findFirst({
        where: {
          tenantId: user!.tenantId,
          status: 'aktif',
          expiryDate: { gte: new Date() },
          ...(existing.customerId ? { customerId: existing.customerId } : {}),
          ...(existing.customerId
            ? {}
            : { customerName: { equals: existing.customerName } }),
        },
        orderBy: { expiryDate: 'asc' }, // en erken biten paketi harca
        include: { package: { select: { name: true } } },
      })
      if (
        candidate &&
        (candidate.sessionsTotal === 0 || candidate.sessionsUsed < candidate.sessionsTotal)
      ) {
        const [upd] = await db.$transaction([
          db.memberPackage.update({
            where: { id: candidate.id },
            data: {
              sessionsUsed: { increment: 1 },
              ...(candidate.sessionsTotal > 0 &&
              candidate.sessionsUsed + 1 >= candidate.sessionsTotal
                ? { status: 'bitti' }
                : {}),
            },
          }),
          db.memberPackageUsage.create({
            data: {
              packageId: candidate.id,
              appointmentId: existing.id,
              note: `Randevu tamamlandı: ${existing.customerName}`,
            },
          }),
        ])
        packageUsed = {
          id: upd.id,
          remaining: upd.sessionsTotal === 0 ? -1 : upd.sessionsTotal - upd.sessionsUsed,
          packageName: candidate.package.name,
        }
      }
    } catch {
      // Üyelik entegrasyonu randevu akışını bloklamaz
    }
  }

  return ok({ ...updated, packageUsed })
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
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const existing = await db.appointment.findUnique({ where: { id: appointmentId } })
  if (!existing || existing.providerId !== id) return err('Randevu bulunamadı', 404)

  await db.appointment.update({
    where: { id: appointmentId },
    data: { status: 'iptal' },
  })

  return ok({ success: true })
}
