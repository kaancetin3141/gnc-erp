import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err, safeJsonParse } from '@/lib/api-utils'
import { slugify } from '@/lib/slug'
import {
  type WorkingHours,
  type DaySchedule,
  dayKeyFromDate,
  generateSlots,
  timeToMinutes,
  slotToDateTime,
  minutesToTime,
} from '@/lib/appointment-utils'

// ============================================================
// PUBLIC (auth gerektirmez) — slug-bazlı müsait slot listesi
// Query: ?date=YYYY-MM-DD&serviceId=xxx&staffId=yyy
// Returns: [{ time: "09:00", available: true }, ...]
// Slot interval: service.duration'a göre 15/30/60 dk'lık parçalar
//   - duration <= 20 → 15 dk
//   - duration <= 45 → 30 dk
//   - duration >  45 → 60 dk
// Mevcut randevular elenir.
// ============================================================

function slotIntervalForDuration(duration: number): number {
  if (duration <= 20) return 15
  if (duration <= 45) return 30
  return 60
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // Provider lookup: önce slug, sonra slugify(name) fallback
  let provider = await db.serviceProvider.findFirst({
    where: { slug },
    select: { id: true, workingHours: true, isActive: true, name: true },
  })
  if (!provider) {
    const all = await db.serviceProvider.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
    })
    const match = all.find((p) => (p.slug ?? slugify(p.name)) === slug)
    if (!match) return err('İşletme bulunamadı', 404)
    provider = await db.serviceProvider.findFirst({
      where: { id: match.id },
      select: { id: true, workingHours: true, isActive: true, name: true },
    })
    if (!provider) return err('İşletme bulunamadı', 404)
  }
  if (!provider.isActive) return err('İşletme aktif değil', 404)

  const { searchParams } = new URL(req.url)
  const dateStr = searchParams.get('date')
  const serviceId = searchParams.get('serviceId') || undefined
  const staffIdQ = searchParams.get('staffId') || undefined
  // "any" → herhangi bir personel
  const staffIsAny = !staffIdQ || staffIdQ === 'any'

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return err('date parametresi YYYY-MM-DD formatında olmalı', 400)
  }

  const wh = safeJsonParse<WorkingHours>(provider.workingHours, {})
  const dateObj = new Date(dateStr + 'T12:00:00')
  const dayKey = dayKeyFromDate(dateObj)
  const daySched: DaySchedule | undefined = wh[dayKey]

  if (!daySched || daySched.closed || !daySched.start || !daySched.end) {
    return ok({
      slots: [] as { time: string; available: boolean }[],
      workingHours: daySched ?? { closed: true },
      dayKey,
    })
  }

  // Service var mı + duration çek
  let serviceDuration = 30
  if (serviceId) {
    const service = await db.service.findUnique({ where: { id: serviceId } })
    if (!service || service.providerId !== provider.id || !service.isActive) {
      return err('Hizmet bulunamadı', 400)
    }
    serviceDuration = service.duration
  }

  const slotInterval = slotIntervalForDuration(serviceDuration)
  const allSlots = generateSlots(daySched, slotInterval)

  const now = new Date()
  const isToday = dateStr === now.toISOString().slice(0, 10)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const dayEndMin = timeToMinutes(daySched.end!)

  // Hangi personeller bu hizmeti verebilir?
  let staffIds: string[] = []
  if (!staffIsAny && staffIdQ) {
    const staff = await db.staff.findUnique({ where: { id: staffIdQ } })
    if (!staff || staff.providerId !== provider.id || !staff.isActive) {
      return ok({
        slots: [] as { time: string; available: boolean }[],
        workingHours: daySched,
        dayKey,
      })
    }
    staffIds = [staffIdQ]
    // Belirli personel bu hizmeti verebilir mi?
    if (serviceId) {
      const canProvide = await db.staffService.findUnique({
        where: { staffId_serviceId: { staffId: staffIdQ, serviceId } },
      })
      if (!canProvide) {
        return ok({
          slots: [] as { time: string; available: boolean }[],
          workingHours: daySched,
          dayKey,
          reason: 'Bu personel bu hizmeti veremiyor',
        })
      }
    }
  } else {
    const staffList = await db.staff.findMany({
      where: { providerId: provider.id, isActive: true },
      select: { id: true },
    })
    staffIds = staffList.map((s) => s.id)
    if (serviceId) {
      const links = await db.staffService.findMany({
        where: { serviceId, staffId: { in: staffIds } },
        select: { staffId: true },
      })
      staffIds = links.map((l) => l.staffId)
    }
  }

  // Gün içindeki mevcut randevular (bu personellerin)
  const dayStart = slotToDateTime(dateStr, daySched.start)
  const dayEnd = slotToDateTime(dateStr, daySched.end)
  const appointments = await db.appointment.findMany({
    where: {
      providerId: provider.id,
      staffId: { in: staffIds.length > 0 ? staffIds : undefined },
      status: { notIn: ['iptal', 'reddedildi', 'gelmedi'] },
      date: { gte: dayStart, lte: dayEnd },
    },
    select: { staffId: true, date: true, endTime: true },
  })

  const slotsWithAvail = allSlots.map((slot) => {
    const slotStartMin = timeToMinutes(slot)
    const slotEndMin = slotStartMin + serviceDuration
    if (slotEndMin > dayEndMin) return { time: slot, available: false }
    if (isToday && slotStartMin < nowMinutes) return { time: slot, available: false }
    if (staffIds.length === 0) return { time: slot, available: false }

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
    return { time: slot, available: anyAvailable }
  })

  return ok({
    slots: slotsWithAvail,
    workingHours: daySched,
    dayKey,
    serviceDuration,
    slotInterval,
    nextAvailable: slotsWithAvail.find((s) => s.available)?.time ?? null,
    nextAvailableLabel: (() => {
      const first = slotsWithAvail.find((s) => s.available)
      if (!first) return null
      const end = minutesToTime(timeToMinutes(first.time) + serviceDuration)
      return `${first.time} (${end} bitiş)`
    })(),
  })
}
