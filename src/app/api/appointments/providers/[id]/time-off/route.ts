import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { timeOffCoversRange, timeOffWindowMs, timeOffLabel } from '@/lib/appointment-timeoff'

// ============================================================
// PERSONEL İZİN GÜNLERİ (TIME-OFF) — liste + oluştur
// GET  ?staffId=&startDate=&endDate=  → izin kayıtları (staff include)
// POST { staffId, date, isFullDay, startTime?, endTime?, reason? }
//   · İzin aralığında aktif randevu varsa 409 — önce taşıma/iptal istenir
// ============================================================

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const url = new URL(req.url)
  const staffId = url.searchParams.get('staffId') || ''
  const startDate = url.searchParams.get('startDate')
  const endDate = url.searchParams.get('endDate')

  const where: Record<string, unknown> = { providerId: id }
  if (staffId) where.staffId = staffId
  if (startDate && endDate) {
    where.date = { gte: new Date(startDate), lte: new Date(endDate) }
  }

  const timeOffs = await db.staffTimeOff.findMany({
    where,
    orderBy: [{ date: 'desc' }, { isFullDay: 'desc' }],
    take: 500,
    include: {
      staff: { select: { id: true, name: true, title: true, photo: true } },
    },
  })

  return ok(timeOffs)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const body = await req.json()
  const { staffId, date, isFullDay, startTime, endTime, reason } = body as {
    staffId?: string
    date?: string
    isFullDay?: boolean
    startTime?: string
    endTime?: string
    reason?: string
  }

  if (!staffId) return err('Personel seçimi gerekli', 400)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return err('Tarih YYYY-MM-DD formatında olmalı', 400)
  }

  // Personel bu işletmeye ait mi?
  const staff = await db.staff.findUnique({ where: { id: staffId } })
  if (!staff || staff.providerId !== id) return err('Personel bulunamadı', 400)

  // Kısmi gün ise saatleri doğrula
  const fullDay = isFullDay !== false
  if (!fullDay) {
    if (!startTime || !endTime) return err('Kısmi gün için başlangıç ve bitiş saati gerekli', 400)
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return err('Geçersiz saat formatı', 400)
    if (sh * 60 + sm >= eh * 60 + em) return err('Bitiş saati başlangıçtan sonra olmalı', 400)
  }

  const dayDate = new Date(date + 'T00:00:00')
  if (isNaN(dayDate.getTime())) return err('Geçersiz tarih', 400)

  // Aynı personel + aynı günde zaten izin var mı? (üst üste kaydı engelle)
  const dayEnd = new Date(dayDate.getTime() + 24 * 60 * 60_000)
  const sameDay = await db.staffTimeOff.findMany({
    where: { providerId: id, staffId, date: { gte: dayDate, lt: dayEnd } },
  })
  if (sameDay.length > 0) {
    const covered = sameDay.some((t) => {
      if (t.isFullDay || fullDay) return true
      const w = timeOffWindowMs(t)
      return timeOffCoversRange({ date, isFullDay: fullDay, startTime, endTime }, w.start, w.end)
    })
    if (covered) {
      return err(`Bu personelin bu tarihte zaten izin kaydı var (${timeOffLabel(sameDay[0])})`, 409)
    }
  }

  // İzin aralığında aktif randevu var mı? (tam gün veya kısmi)
  const win = timeOffWindowMs({ date, isFullDay: fullDay, startTime, endTime })
  const overlapping = await db.appointment.findMany({
    where: {
      providerId: id,
      staffId,
      status: { in: ['beklemede', 'onaylandi'] },
      date: { lt: new Date(win.end) },
      endTime: { gt: new Date(win.start) },
    },
    select: { customerName: true, date: true },
  })
  if (overlapping.length > 0) {
    const list = overlapping
      .slice(0, 3)
      .map((a) => `${a.customerName} (${new Date(a.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })})`)
      .join(', ')
    return err(
      `Bu personelin izin aralığında ${overlapping.length} aktif randevu var: ${list}${overlapping.length > 3 ? '…' : ''}. Önce randevuları taşıyın veya iptal edin.`,
      409,
    )
  }

  const timeOff = await db.staffTimeOff.create({
    data: {
      providerId: id,
      staffId,
      date: dayDate,
      isFullDay: fullDay,
      startTime: fullDay ? null : startTime,
      endTime: fullDay ? null : endTime,
      reason: reason?.trim() || null,
    },
    include: {
      staff: { select: { id: true, name: true, title: true, photo: true } },
    },
  })

  return ok(timeOff)
}
