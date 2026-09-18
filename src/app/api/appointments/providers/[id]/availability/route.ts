import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err, safeJsonParse } from '@/lib/api-utils'
import {
  type WorkingHours,
  type DaySchedule,
  dayKeyFromDate,
  generateSlots,
  timeToMinutes,
  slotToDateTime,
  minutesToTime,
} from '@/lib/appointment-utils'

async function getProviderForUser(providerId: string, tenantId: string) {
  const provider = await db.serviceProvider.findUnique({ where: { id: providerId } })
  if (!provider || provider.tenantId !== tenantId) return null
  return provider
}

// ============================================================
// GET — belirli bir gün için müsait slot listesi
// Query: date (YYYY-MM-DD), staffId?, serviceId?
// Dönüş: { slots: string[], workingHours: DaySchedule }
//   - "any" personel için: en az bir personel müsaitse slot gösterilir
//   - Belirli personel için: o personelin dolu slot'ları çıkarılır
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await getProviderForUser(id, user!.tenantId)
  if (!provider) return err('İşletme bulunamadı', 404)

  const { searchParams } = new URL(req.url)
  const dateStr = searchParams.get('date') // YYYY-MM-DD
  const staffId = searchParams.get('staffId') // "any" veya staffId
  const serviceId = searchParams.get('serviceId')
  const slotIntervalStr = searchParams.get('interval')
  const slotInterval = slotIntervalStr ? parseInt(slotIntervalStr) : 30

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return err('date parametresi YYYY-MM-DD formatında olmalı', 400)
  }

  // Çalışma saatleri
  const wh = safeJsonParse<WorkingHours>(provider.workingHours, {})
  const dateObj = new Date(dateStr + 'T12:00:00')
  const dayKey = dayKeyFromDate(dateObj)
  const daySched: DaySchedule | undefined = wh[dayKey]

  if (!daySched || daySched.closed || !daySched.start || !daySched.end) {
    return ok({ slots: [], workingHours: daySched ?? { closed: true }, dayKey })
  }

  // Hizmetin süresi — slot'lar serviceId ile geldiğinde o süreye göre hesaplanır
  let serviceDuration = 30
  if (serviceId) {
    const service = await db.service.findUnique({ where: { id: serviceId } })
    if (!service || service.providerId !== id) return err('Hizmet bulunamadı', 400)
    serviceDuration = service.duration
  }

  // Tüm potansiyel slot'ları üret (slotInterval dk'lık ama hizmet süresi sığmalı)
  const allSlots = generateSlots(daySched, slotInterval)

  // Geçmiş tarih kontrolü: bugünün geçmiş slot'larını çıkar
  const now = new Date()
  const isToday = dateStr === now.toISOString().slice(0, 10)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  // Slot'a hizmet sığıyor mu? (slot.start + serviceDuration <= end)
  const dayEndMin = timeToMinutes(daySched.end!)

  // Personel bazlı doluluk hesabı
  let staffIds: string[] = []
  if (staffId && staffId !== 'any') {
    const staff = await db.staff.findUnique({ where: { id: staffId } })
    if (!staff || staff.providerId !== id) return err('Personel bulunamadı', 400)
    if (!staff.isActive) return ok({ slots: [], workingHours: daySched, dayKey })
    staffIds = [staffId]
  } else {
    // "any" — tüm aktif personeli al
    const staffList = await db.staff.findMany({
      where: { providerId: id, isActive: true },
      select: { id: true },
    })
    staffIds = staffList.map((s) => s.id)
    // Hizmetle sınırla (personel bu hizmeti verebiliyorsa)
    if (serviceId) {
      const links = await db.staffService.findMany({
        where: { serviceId, staffId: { in: staffIds } },
        select: { staffId: true },
      })
      staffIds = links.map((l) => l.staffId)
    }
  }

  // O gün için tüm ilgili randevuları çek
  const dayStart = slotToDateTime(dateStr, daySched.start)
  const dayEnd = slotToDateTime(dateStr, daySched.end)
  const appointments = await db.appointment.findMany({
    where: {
      providerId: id,
      staffId: { in: staffIds.length > 0 ? staffIds : undefined },
      status: { notIn: ['iptal', 'reddedildi', 'gelmedi'] },
      date: { gte: dayStart, lte: dayEnd },
    },
    select: { staffId: true, date: true, endTime: true, serviceId: true },
  })

  // Her slot için: en az bir personel müsait mi?
  const availableSlots: string[] = []
  for (const slot of allSlots) {
    const slotStartMin = timeToMinutes(slot)
    const slotEndMin = slotStartMin + serviceDuration

    // Hizmet gün sonuna sığmalı
    if (slotEndMin > dayEndMin) continue
    // Geçmiş saat kontrolü
    if (isToday && slotStartMin < nowMinutes) continue

    // Personel bazında: en az biri müsait mi?
    if (staffIds.length === 0) {
      // Personel yoksa boş slot gösterme
      continue
    }
    let anyAvailable = false
    for (const sId of staffIds) {
      const staffAppts = appointments.filter((a) => a.staffId === sId)
      const slotStart = slotToDateTime(dateStr, slot)
      const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60_000)
      const conflict = staffAppts.some((a) => {
        const aEnd = a.endTime ? new Date(a.endTime) : new Date(a.date.getTime() + 30 * 60_000)
        return a.date < slotEnd && slotStart < aEnd
      })
      if (!conflict) {
        anyAvailable = true
        break
      }
    }
    if (anyAvailable) availableSlots.push(slot)
  }

  return ok({
    slots: availableSlots,
    workingHours: daySched,
    dayKey,
    nextAvailable: availableSlots[0] ?? null,
    nextAvailableLabel: availableSlots[0] ? `${availableSlots[0]} (${minutesToTime(timeToMinutes(availableSlots[0]) + serviceDuration)} bitiş)` : null,
  })
}
