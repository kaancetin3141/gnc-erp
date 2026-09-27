import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err, safeJsonParse } from '@/lib/api-utils'
import { upsertCustomerForAppointment } from '@/lib/appointment-customer-server'
import { timeOffCoversRange } from '@/lib/appointment-timeoff'
import {
  type WorkingHours,
  dayKeyFromDate,
  rangesOverlap,
} from '@/lib/appointment-utils'

// ============================================================
// PUBLIC (auth gerektirmez) — müşteri randevu oluşturma
// Body: { staffId?, serviceId, customerName, customerPhone, customerEmail?, date, customerNote? }
// Honeypot alanı 'website' — bot koruması (doldurulursa 400)
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const provider = await db.serviceProvider.findUnique({
    where: { id },
    select: { id: true, workingHours: true, isActive: true, tenantId: true, autoApprove: true, name: true, phone: true },
  })
  if (!provider || !provider.isActive) return err('İşletme bulunamadı', 404)

  const body = await req.json()
  const {
    staffId, serviceId, customerName, customerPhone, customerEmail,
    date, customerNote, website,
  } = body as {
    staffId?: string
    serviceId?: string
    customerName?: string
    customerPhone?: string
    customerEmail?: string
    date?: string
    customerNote?: string
    website?: string
  }

  // Honeypot: bot ise reddet
  if (website) return err('Geçersiz istek', 400)

  if (!customerName || !customerName.trim()) return err('Ad soyad gerekli', 400)
  if (!customerPhone || !customerPhone.trim()) return err('Telefon gerekli', 400)
  if (!date) return err('Tarih/saat gerekli', 400)
  if (!serviceId) return err('Hizmet seçimi gerekli', 400)

  // Hizmet kontrolü
  const service = await db.service.findUnique({ where: { id: serviceId } })
  if (!service || service.providerId !== id || !service.isActive) {
    return err('Hizmet bulunamadı', 400)
  }

  let finalStaffId: string | null = null
  if (staffId && staffId !== 'any') {
    const staff = await db.staff.findUnique({ where: { id: staffId } })
    if (!staff || staff.providerId !== id || !staff.isActive) {
      return err('Personel bulunamadı', 400)
    }
    const canProvide = await db.staffService.findUnique({
      where: { staffId_serviceId: { staffId, serviceId } },
    })
    if (!canProvide) return err('Bu personel seçilen hizmeti veremiyor', 400)
    finalStaffId = staffId
  } else {
    // "any" — bu hizmeti verebilen ilk müsait personeli seç
    const candidates = await db.staffService.findMany({
      where: { serviceId },
      include: { staff: { select: { id: true, isActive: true } } },
    })
    const activeStaffIds = candidates
      .filter((c) => c.staff.isActive)
      .map((c) => c.staff.id)
    if (activeStaffIds.length === 0) return err('Bu hizmeti verebilecek personel yok', 400)

    // Çakışmayan birini bul
    const startDate = new Date(date)
    if (isNaN(startDate.getTime())) return err('Geçersiz tarih', 400)
    const endDate = new Date(startDate.getTime() + service.duration * 60_000)

    // Geçmiş kontrol
    if (startDate.getTime() < Date.now() - 60_000) {
      return err('Geçmiş tarih için randevu oluşturulamaz', 400)
    }

    const dayStart = new Date(startDate.getTime() - 24 * 60 * 60_000)
    const dayEnd = new Date(startDate.getTime() + 24 * 60 * 60_000)
    const dayAppts = await db.appointment.findMany({
      where: {
        staffId: { in: activeStaffIds },
        status: { notIn: ['iptal', 'reddedildi', 'gelmedi'] },
        date: { gte: dayStart, lte: dayEnd },
      },
      select: { staffId: true, date: true, endTime: true },
    })

    // İzinli personel aday listesinden çıkar (tam gün veya bu saat aralığı)
    const staffTimeOffs = await db.staffTimeOff.findMany({
      where: { providerId: id, staffId: { in: activeStaffIds } },
    })
    const availableCandidates = activeStaffIds.filter((sId) => {
      const onLeave = staffTimeOffs.some(
        (t) => t.staffId === sId && timeOffCoversRange(t, startDate.getTime(), endDate.getTime()),
      )
      return !onLeave
    })
    if (availableCandidates.length === 0) {
      return err('Seçilen zaman için müsait personel yok', 409)
    }

    const freeStaff = availableCandidates.find((sId) => {
      const staffAppts = dayAppts.filter((a) => a.staffId === sId)
      return !staffAppts.some((a) => {
        const aEnd = a.endTime ? new Date(a.endTime) : new Date(a.date.getTime() + service.duration * 60_000)
        return rangesOverlap(startDate, endDate, a.date, aEnd)
      })
    })
    if (!freeStaff) return err('Seçilen zaman için müsait personel yok', 409)
    finalStaffId = freeStaff
  }

  // Müşteri kayıt defteri: telefonla eşleştir/oluştur + engelli kontrolü
  const registryCustomer = await upsertCustomerForAppointment({
    providerId: id, name: customerName, phone: customerPhone, email: customerEmail,
  })
  if (registryCustomer?.isBlocked) {
    return err('Randevu oluşturulamadı — lütfen işletmeyle iletişime geçin', 403)
  }

  const startDate = new Date(date)
  if (isNaN(startDate.getTime())) return err('Geçersiz tarih', 400)
  const endDate = new Date(startDate.getTime() + service.duration * 60_000)

  // Çakışma kontrolü (belirli staff seçildiyse)
  if (staffId && staffId !== 'any' && finalStaffId) {
    // İZİN KONTROLÜ — seçilen personel bu saatte izinliyse reddet
    const staffTimeOffs = await db.staffTimeOff.findMany({
      where: { providerId: id, staffId: finalStaffId },
    })
    const onLeave = staffTimeOffs.some(
      (t) => timeOffCoversRange(t, startDate.getTime(), endDate.getTime()),
    )
    if (onLeave) {
      return err('Seçtiğiniz personel bu saatte müsait değil, lütfen başka bir saat veya personel deneyin', 409)
    }

    const candidates = await db.appointment.findMany({
      where: {
        staffId: finalStaffId,
        status: { notIn: ['iptal', 'reddedildi', 'gelmedi'] },
        date: {
          gte: new Date(startDate.getTime() - 24 * 60 * 60_000),
          lte: new Date(startDate.getTime() + 24 * 60 * 60_000),
        },
      },
    })
    for (const c of candidates) {
      const cEnd = c.endTime ? new Date(c.endTime) : new Date(c.date.getTime() + service.duration * 60_000)
      if (rangesOverlap(startDate, endDate, c.date, cEnd)) {
        return err('Seçilen zaman dolu, lütfen başka saat deneyin', 409)
      }
    }
  }

  // Çalışma saatleri içinde mi?
  const wh = safeJsonParse<WorkingHours>(provider.workingHours, {})
  const dayKey = dayKeyFromDate(startDate)
  const daySched = wh[dayKey]
  const inWorkingHours = !!daySched && !daySched.closed && !!daySched.start && !!daySched.end &&
    startDate.getHours() * 60 + startDate.getMinutes() >=
      (daySched.start ? parseInt(daySched.start.split(':')[0]) * 60 + parseInt(daySched.start.split(':')[1] || '0') : 0) &&
    endDate.getHours() * 60 + endDate.getMinutes() <=
      (daySched.end ? parseInt(daySched.end.split(':')[0]) * 60 + parseInt(daySched.end.split(':')[1] || '0') : 24 * 60)
  // OTOMATİK ONAY ANAHTARI (işletme ayarı):
  // · autoApprove=true  → çalışma saatleri içindeyse randevu anında onaylanır
  // · autoApprove=false → randevu BEKLEMEDE oluşur; işletme onayladıktan
  //   sonra müşteriye WhatsApp ile bilgi gönderilir.
  const status = provider.autoApprove && inWorkingHours ? 'onaylandi' : 'beklemede'

  const appointment = await db.appointment.create({
    data: {
      providerId: id,
      customerId: registryCustomer?.id ?? null,
      staffId: finalStaffId,
      serviceId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail?.trim() || null,
      customerNote: customerNote?.trim() || null,
      date: startDate,
      endTime: endDate,
      status,
      price: service.price,
      source: 'web',
    },
    include: {
      staff: { select: { id: true, name: true, title: true, photo: true } },
      service: { select: { id: true, name: true, duration: true, price: true } },
    },
  })

  // Audit log (tenant'lı)
  try {
    await db.auditLog.create({
      data: {
        tenantId: provider.tenantId,
        actorId: null,
        action: 'public_booking',
        entity: 'appointment',
        entityId: appointment.id,
        after: JSON.stringify({
          customerName: appointment.customerName,
          customerPhone: appointment.customerPhone,
          date: appointment.date.toISOString(),
          staffId: appointment.staffId,
          serviceId: appointment.serviceId,
          status,
          autoApproved: status === 'onaylandi',
        }),
      },
    })
  } catch {
    // sessiz geç
  }

  return ok(appointment)
}
