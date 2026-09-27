import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err, safeJsonParse } from '@/lib/api-utils'
import { timeOffCoversRange } from '@/lib/appointment-timeoff'
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
// PUBLIC (auth gerektirmez) — müsait slot listesi
// Aynı mantık private availability ile, sadece auth yok.
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const provider = await db.serviceProvider.findUnique({
    where: { id },
    select: { id: true, workingHours: true, isActive: true },
  })
  if (!provider || !provider.isActive) return err('İşletme bulunamadı', 404)

  const { searchParams } = new URL(req.url)
  const dateStr = searchParams.get('date')
  const staffId = searchParams.get('staffId')
  const serviceId = searchParams.get('serviceId')
  const slotIntervalStr = searchParams.get('interval')
  const slotInterval = slotIntervalStr ? parseInt(slotIntervalStr) : 30

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return err('date parametresi YYYY-MM-DD formatında olmalı', 400)
  }

  const wh = safeJsonParse<WorkingHours>(provider.workingHours, {})
  const dateObj = new Date(dateStr + 'T12:00:00')
  const dayKey = dayKeyFromDate(dateObj)
  const daySched: DaySchedule | undefined = wh[dayKey]

  if (!daySched || daySched.closed || !daySched.start || !daySched.end) {
    return ok({ slots: [], workingHours: daySched ?? { closed: true }, dayKey })
  }

  let serviceDuration = 30
  if (serviceId) {
    const service = await db.service.findUnique({ where: { id: serviceId } })
    if (!service || service.providerId !== id || !service.isActive) {
      return err('Hizmet bulunamadı', 400)
    }
    serviceDuration = service.duration
  }

  const allSlots = generateSlots(daySched, slotInterval)
  const now = new Date()
  const isToday = dateStr === now.toISOString().slice(0, 10)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const dayEndMin = timeToMinutes(daySched.end!)

  let staffIds: string[] = []
  if (staffId && staffId !== 'any') {
    const staff = await db.staff.findUnique({ where: { id: staffId } })
    if (!staff || staff.providerId !== id || !staff.isActive) {
      return ok({ slots: [], workingHours: daySched, dayKey })
    }
    staffIds = [staffId]
  } else {
    const staffList = await db.staff.findMany({
      where: { providerId: id, isActive: true },
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

  const dayStart = slotToDateTime(dateStr, daySched.start)
  const dayEnd = slotToDateTime(dateStr, daySched.end)
  const appointments = await db.appointment.findMany({
    where: {
      providerId: id,
      staffId: { in: staffIds.length > 0 ? staffIds : undefined },
      status: { notIn: ['iptal', 'reddedildi', 'gelmedi'] },
      date: { gte: dayStart, lte: dayEnd },
    },
    select: { staffId: true, date: true, endTime: true },
  })

  // İzin kayıtları — izinli personel slot üretmez
  const staffTimeOffs = await db.staffTimeOff.findMany({
    where: { providerId: id, staffId: { in: staffIds.length > 0 ? staffIds : undefined } },
  })

  const availableSlots: string[] = []
  for (const slot of allSlots) {
    const slotStartMin = timeToMinutes(slot)
    const slotEndMin = slotStartMin + serviceDuration
    if (slotEndMin > dayEndMin) continue
    if (isToday && slotStartMin < nowMinutes) continue
    if (staffIds.length === 0) continue

    let anyAvailable = false
    for (const sId of staffIds) {
      const staffAppts = appointments.filter((a) => a.staffId === sId)
      const slotStart = slotToDateTime(dateStr, slot)
      const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60_000)
      // İzinli personel bu slot için aday değil
      const onLeave = staffTimeOffs.some(
        (t) => t.staffId === sId && timeOffCoversRange(t, slotStart.getTime(), slotEnd.getTime()),
      )
      if (onLeave) continue
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
    nextAvailableLabel: availableSlots[0]
      ? `${availableSlots[0]} (${minutesToTime(timeToMinutes(availableSlots[0]) + serviceDuration)} bitiş)`
      : null,
    serviceDuration,
  })
}
