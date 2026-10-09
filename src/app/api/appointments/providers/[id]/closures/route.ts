import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { timeOffCoversRange, timeOffWindowMs, timeOffLabel } from '@/lib/appointment-timeoff'

// ============================================================
// İŞLETME TATİLİ / KAPANIŞ GÜNLERİ (PROVIDER CLOSURE)
// GET  ?startDate=&endDate=  → tatil kayıtları
// POST { date, isFullDay, startTime?, endTime?, reason?, force? }
//   · Tatil aralığında aktif randevu varsa 409 — randevu bilgileriyle
//     liste döner; force=true ile yine de oluşturulabilir (randevular
//     korunur, yalnızca YENİ randevular engellenir)
// DELETE .../closures/[closureId] → kaydı sil
// ============================================================

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const url = new URL(req.url)
  const startDate = url.searchParams.get('startDate')
  const endDate = url.searchParams.get('endDate')

  const where: Record<string, unknown> = { providerId: id }
  if (startDate && endDate) {
    where.date = { gte: new Date(startDate), lte: new Date(endDate) }
  }

  const closures = await db.providerClosure.findMany({
    where,
    orderBy: [{ date: 'desc' }, { isFullDay: 'desc' }],
    take: 300,
  })

  return ok(closures)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const body = await req.json()
  const { date, isFullDay, startTime, endTime, reason, force } = body as {
    date?: string
    isFullDay?: boolean
    startTime?: string
    endTime?: string
    reason?: string
    force?: boolean
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return err('Tarih YYYY-MM-DD formatında olmalı', 400)
  }

  // Kısmi gün ise saatleri doğrula
  const fullDay = isFullDay !== false
  if (!fullDay) {
    if (!startTime || !endTime) return err('Kısmi tatil için başlangıç ve bitiş saati gerekli', 400)
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return err('Geçersiz saat formatı', 400)
    if (sh * 60 + sm >= eh * 60 + em) return err('Bitiş saati başlangıçtan sonra olmalı', 400)
  }

  const dayDate = new Date(date + 'T00:00:00')
  if (isNaN(dayDate.getTime())) return err('Geçersiz tarih', 400)

  // Aynı günde üst üste kapanış kaydı engelle
  const dayEnd = new Date(dayDate.getTime() + 24 * 60 * 60_000)
  const sameDay = await db.providerClosure.findMany({
    where: { providerId: id, date: { gte: dayDate, lt: dayEnd } },
  })
  if (sameDay.length > 0) {
    const covered = sameDay.some((c) => {
      if (c.isFullDay || fullDay) return true
      const w = timeOffWindowMs(c)
      return timeOffCoversRange({ date, isFullDay: fullDay, startTime, endTime }, w.start, w.end)
    })
    if (covered) {
      return err(`Bu tarihte zaten işletme tatili var (${timeOffLabel(sameDay[0])})`, 409)
    }
  }

  // Tatil aralığında aktif randevu var mı?
  const win = timeOffWindowMs({ date, isFullDay: fullDay, startTime, endTime })
  const overlapping = await db.appointment.findMany({
    where: {
      providerId: id,
      status: { in: ['beklemede', 'onaylandi'] },
      date: { lt: new Date(win.end) },
      endTime: { gt: new Date(win.start) },
    },
    select: { customerName: true, date: true, staff: { select: { name: true } } },
  })
  if (overlapping.length > 0 && !force) {
    const list = overlapping
      .slice(0, 4)
      .map((a) => {
        const staffPart = a.staff?.name ? ` · ${a.staff.name}` : ''
        return `${a.customerName} (${new Date(a.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}${staffPart})`
      })
      .join(', ')
    return err(
      `Tatil aralığında ${overlapping.length} aktif randevu var: ${list}${overlapping.length > 4 ? '…' : ''}. Randevuları taşıyın/iptal edin veya "Yine de kapat" seçin.`,
      409,
    )
  }

  const closure = await db.providerClosure.create({
    data: {
      providerId: id,
      date: dayDate,
      isFullDay: fullDay,
      startTime: fullDay ? null : startTime,
      endTime: fullDay ? null : endTime,
      reason: reason?.trim() || null,
    },
  })

  return ok(closure)
}
