import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err, safeJsonParse } from '@/lib/api-utils'
import { upsertCustomerForAppointment } from '@/lib/appointment-customer-server'
import { timeOffCoversRange, timeOffLabel, findClosureConflict } from '@/lib/appointment-timeoff'

// GET — randevu listesi (tarih/staff/status filtreli)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const url = new URL(req.url)
  const date = url.searchParams.get('date') // YYYY-MM-DD (tek gün)
  const startDate = url.searchParams.get('startDate') // ISO (takvim aralığı)
  const endDate = url.searchParams.get('endDate') // ISO
  const staffId = url.searchParams.get('staffId') || ''
  const status = url.searchParams.get('status') || ''
  const phone = url.searchParams.get('phone') // müşteri randevu geçmişi

  const where: Record<string, unknown> = { providerId: id }
  if (staffId && staffId !== 'all') where.staffId = staffId
  if (status) where.status = status

  // Müşteri geçmişi: telefon numarasına göre ara (tarih filtresi yok)
  // DB'de telefon boşluklu kayıtlı olabilir → iki tarafı da normalize ederek JS'te eşle
  const isHistory = !!phone
  if (isHistory) {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 4) return err('Telefon en az 4 hane olmalı', 400)
    const all = await db.appointment.findMany({
      where: { providerId: id },
      include: {
        staff: { select: { id: true, name: true, title: true, photo: true } },
        service: { select: { id: true, name: true, duration: true, price: true } },
        customer: { select: { id: true, isBlocked: true } },
      },
      orderBy: { date: 'desc' },
      take: 200,
    })
    const matched = all.filter((a) => {
      const storedDigits = (a.customerPhone || '').replace(/\D/g, '')
      return storedDigits.includes(digits)
    })
    return ok(matched.slice(0, 50))
  }
  if (date) {
    const start = new Date(date + 'T00:00:00')
    const end = new Date(date + 'T23:59:59')
    where.date = { gte: start, lte: end }
  } else if (startDate && endDate) {
    where.date = { gte: new Date(startDate), lte: new Date(endDate) }
  }

  const appointments = await db.appointment.findMany({
    where,
    include: {
      staff: { select: { id: true, name: true, title: true, photo: true } },
      service: { select: { id: true, name: true, duration: true, price: true } },
      customer: { select: { id: true, isBlocked: true } },
    },
    orderBy: { date: 'asc' },
    take: 200,
  })

  return ok(appointments)
}

// POST — yeni randevu oluştur (çakışma kontrolü ile)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const body = await req.json()
  const { staffId, serviceId, customerName, customerPhone, customerEmail, customerNote, date, source, force } = body

  if (!customerName || !customerPhone || !date) return err('Müşteri adı, telefon ve tarih gerekli', 400)

  // İşletme ayarı: otomatik onay kapalıysa randevu BEKLEMEDE oluşur
  const provider = await db.serviceProvider.findUnique({
    where: { id },
    select: { id: true, tenantId: true, autoApprove: true },
  })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  // Hizmet süresini al
  const service = serviceId ? await db.service.findUnique({ where: { id: serviceId } }) : null
  const duration = service?.duration || 30
  const startTime = new Date(date)
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000)

  // Müşteri kayıt defteri: telefonla eşleştir/oluştur + engelli kontrolü
  const registryCustomer = await upsertCustomerForAppointment({
    providerId: id, name: customerName, phone: customerPhone, email: customerEmail,
  })
  if (registryCustomer?.isBlocked) {
    return err('Bu müşteri kayıt defterinde engellendi — randevu oluşturulamaz', 403)
  }

  // Çakışma kontrolü (aynı personel, aynı zaman aralığı) — force=true ile atlanır
  if (staffId && !force) {
    const conflicts = await db.appointment.findMany({
      where: {
        providerId: id,
        staffId,
        status: { in: ['beklemede', 'onaylandi'] },
        date: { lt: endTime },
        endTime: { gt: startTime },
      },
    })
    if (conflicts.length > 0) {
      const c = conflicts[0]
      const cTime = new Date(c.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      return err(`Çakışma: ${c.customerName} (${cTime}) randevusu ile örtüşüyor`, 409)
    }
  }

  // PERSONEL İZİN KONTROLÜ — izinli personele randevu verilemez (hard block)
  if (staffId) {
    const timeOffs = await db.staffTimeOff.findMany({
      where: {
        providerId: id,
        staffId,
        date: {
          gte: new Date(startTime.getTime() - 24 * 60 * 60_000),
          lte: new Date(endTime.getTime() + 24 * 60 * 60_000),
        },
      },
    })
    const hit = timeOffs.find((t) => timeOffCoversRange(t, startTime.getTime(), endTime.getTime()))
    if (hit) {
      return err(`Personel bu saatte izinli (${timeOffLabel(hit)}) — başka bir personel seçin veya izin kaydını kaldırın`, 409)
    }
  }

  // İŞLETME TATİLİ KONTROLÜ — bayram/resmi tatil/tadilat: tüm personel kapalı (force bile aşamaz)
  const closures = await db.providerClosure.findMany({
    where: {
      providerId: id,
      date: {
        gte: new Date(startTime.getTime() - 24 * 60 * 60_000),
        lte: new Date(endTime.getTime() + 24 * 60 * 60_000),
      },
    },
  })
  const closureHit = findClosureConflict(closures, startTime.getTime(), endTime.getTime())
  if (closureHit) {
    return err(`İşletme bu saatte kapalı (${timeOffLabel(closureHit)}) — tatil kaydını kaldırın veya başka bir tarih seçin`, 409)
  }

  const appointment = await db.appointment.create({
    data: {
      providerId: id,
      customerId: registryCustomer?.id ?? null,
      staffId: staffId || null,
      serviceId: serviceId || null,
      customerName,
      customerPhone,
      customerEmail: customerEmail || null,
      customerNote: customerNote || null,
      date: startTime,
      endTime,
      status: provider.autoApprove ? 'onaylandi' : 'beklemede',
      price: service?.price || 0,
      source: source || 'web',
    },
    include: {
      staff: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, duration: true, price: true } },
    },
  })

  return ok(appointment)
}
