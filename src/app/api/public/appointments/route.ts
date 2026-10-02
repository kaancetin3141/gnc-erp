import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err, safeJsonParse } from '@/lib/api-utils'
import { slugify } from '@/lib/slug'
import {
  type WorkingHours,
  dayKeyFromDate,
  rangesOverlap,
} from '@/lib/appointment-utils'
import { whatsappLink } from '@/lib/format'

// ============================================================
// PUBLIC (auth gerektirmez) — müşteri randevu oluşturma (slug-bazlı)
// Body: { providerSlug, serviceId, staffId?, date, time, customerName,
//         customerPhone, customerEmail?, customerNote?, website? }
// - "date" YYYY-MM-DD, "time" HH:mm formatında (URL'den gelen parametreler)
// - Çalışma saatleri içindeyse 'onaylandi', değilse 'beklemede'
// - WhatsApp confirmation link döner (wa.me) — provider telefonuna
// - Returns: { id, status, providerName, serviceName, date, time, whatsappLink }
// ============================================================

interface BookBody {
  providerSlug?: string
  serviceId?: string
  staffId?: string | null
  date?: string // YYYY-MM-DD
  time?: string // HH:mm
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  customerNote?: string
  website?: string // honeypot
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as BookBody | null
  if (!body) return err('Geçersiz istek gövdesi', 400)

  const {
    providerSlug,
    serviceId,
    staffId,
    date,
    time,
    customerName,
    customerPhone,
    customerEmail,
    customerNote,
    website,
  } = body

  // Honeypot: bot ise sessizce "başarılıymış" gibi davran (HTTP 400 de dönebilirdik)
  if (website) return err('Geçersiz istek', 400)

  if (!providerSlug) return err('İşletme (providerSlug) gerekli', 400)
  if (!serviceId) return err('Hizmet seçimi (serviceId) gerekli', 400)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return err('Geçerli bir tarih (YYYY-MM-DD) gerekli', 400)
  }
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return err('Geçerli bir saat (HH:mm) gerekli', 400)
  }
  if (!customerName || !customerName.trim()) return err('Ad soyad gerekli', 400)
  if (!customerPhone || !customerPhone.trim()) return err('Telefon gerekli', 400)

  // Provider lookup (slug → id)
  let provider = await db.serviceProvider.findFirst({
    where: { slug: providerSlug },
    select: {
      id: true,
      name: true,
      phone: true,
      workingHours: true,
      isActive: true,
      tenantId: true,
      slug: true,
    },
  })
  if (!provider) {
    // Fallback slugify(name) === providerSlug
    const all = await db.serviceProvider.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
    })
    const match = all.find((p) => (p.slug ?? slugify(p.name)) === providerSlug)
    if (!match) return err('İşletme bulunamadı', 404)
    provider = await db.serviceProvider.findFirst({
      where: { id: match.id },
      select: {
        id: true,
        name: true,
        phone: true,
        workingHours: true,
        isActive: true,
        tenantId: true,
        slug: true,
      },
    })
    if (!provider) return err('İşletme bulunamadı', 404)
  }
  if (!provider.isActive) return err('İşletme aktif değil', 404)

  // Hizmet kontrolü
  const service = await db.service.findUnique({ where: { id: serviceId } })
  if (!service || service.providerId !== provider.id || !service.isActive) {
    return err('Hizmet bulunamadı', 400)
  }

  // Tarih/saat → DateTime
  const startDate = (() => {
    const [y, m, d] = date!.split('-').map(Number)
    const [hh, mm] = time!.split(':').map(Number)
    return new Date(y, m - 1, d, hh, mm, 0, 0)
  })()
  if (isNaN(startDate.getTime())) return err('Geçersiz tarih/saat', 400)
  const endDate = new Date(startDate.getTime() + service.duration * 60_000)

  // Geçmiş kontrolü
  if (startDate.getTime() < Date.now() - 60_000) {
    return err('Geçmiş tarih için randevu oluşturulamaz', 400)
  }

  // Staff çözümle
  let finalStaffId: string | null = null
  const isAny = !staffId || staffId === 'any'
  if (!isAny) {
    const staff = await db.staff.findUnique({ where: { id: staffId! } })
    if (!staff || staff.providerId !== provider.id || !staff.isActive) {
      return err('Personel bulunamadı', 400)
    }
    const canProvide = await db.staffService.findUnique({
      where: { staffId_serviceId: { staffId: staffId!, serviceId } },
    })
    if (!canProvide) return err('Bu personel seçilen hizmeti veremiyor', 400)
    finalStaffId = staffId!
  } else {
    // "any" — bu hizmeti verebilen ilk müsait personeli seç
    const candidates = await db.staffService.findMany({
      where: { serviceId },
      include: { staff: { select: { id: true, isActive: true } } },
    })
    const activeStaffIds = candidates
      .filter((c) => c.staff.isActive)
      .map((c) => c.staff.id)
    if (activeStaffIds.length === 0) {
      return err('Bu hizmeti verebilecek personel yok', 400)
    }

    // Çakışmayan birini bul
    const dayStartQ = new Date(startDate.getTime() - 24 * 60 * 60_000)
    const dayEndQ = new Date(startDate.getTime() + 24 * 60 * 60_000)
    const dayAppts = await db.appointment.findMany({
      where: {
        staffId: { in: activeStaffIds },
        status: { notIn: ['iptal', 'reddedildi', 'gelmedi'] },
        date: { gte: dayStartQ, lte: dayEndQ },
      },
      select: { staffId: true, date: true, endTime: true },
    })
    const freeStaff = activeStaffIds.find((sId) => {
      const staffAppts = dayAppts.filter((a) => a.staffId === sId)
      return !staffAppts.some((a) => {
        const aEnd = a.endTime ? new Date(a.endTime) : new Date(a.date.getTime() + service.duration * 60_000)
        return rangesOverlap(startDate, endDate, a.date, aEnd)
      })
    })
    if (!freeStaff) return err('Seçilen zaman için müsait personel yok', 409)
    finalStaffId = freeStaff
  }

  // Çakışma kontrolü (belirli staff seçildiyse)
  if (!isAny && finalStaffId) {
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
  const startMin = startDate.getHours() * 60 + startDate.getMinutes()
  const endMin = endDate.getHours() * 60 + endDate.getMinutes()
  const inWorkingHours = !!daySched && !daySched.closed && !!daySched.start && !!daySched.end &&
    startMin >= (daySched.start ? parseInt(daySched.start.split(':')[0]) * 60 + parseInt(daySched.start.split(':')[1] || '0') : 0) &&
    endMin <= (daySched.end ? parseInt(daySched.end.split(':')[0]) * 60 + parseInt(daySched.end.split(':')[1] || '0') : 24 * 60)
  const status = inWorkingHours ? 'onaylandi' : 'beklemede'

  // Telefon normalizasyonu (display için)
  const normalize = (p: string) => {
    let cleaned = p.replace(/[\s\-()]/g, '')
    if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2)
    if (cleaned.startsWith('0') && !cleaned.startsWith('+')) cleaned = '+9' + cleaned.slice(1)
    if (!cleaned.startsWith('+')) cleaned = '+90' + cleaned
    return cleaned
  }
  const customerPhoneNorm = normalize(customerPhone!.trim())

  // Oluştur
  const appointment = await db.appointment.create({
    data: {
      providerId: provider.id,
      staffId: finalStaffId,
      serviceId,
      customerName: customerName!.trim(),
      customerPhone: customerPhone!.trim(),
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

  // WhatsApp confirmation link — provider'ın telefonuna müşteri randevuyu bildirir
  // Müşteri de kendi telefonundan açabilir (öne çıkan amaç: provider'a bildirim)
  const dateLabel = `${String(startDate.getDate()).padStart(2, '0')}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${startDate.getFullYear()}`
  const timeLabel = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`
  const waText = `Merhaba, ${provider.name} için ${dateLabel} ${timeLabel} tarihinde randevu oluşturdum.\n` +
    `Hizmet: ${service.name}\n` +
    `Ad Soyad: ${customerName!.trim()}\n` +
    `Telefon: ${customerPhone!.trim()}\n` +
    (appointment.staff ? `Personel: ${appointment.staff.name}\n` : '') +
    `Durum: ${status === 'onaylandi' ? 'Onaylandı' : 'Beklemede'}\n` +
    `Randevu No: ${appointment.id.slice(-8).toUpperCase()}`
  const waLink = whatsappLink(provider.phone, waText)
  // Müşteri telefonuna WhatsApp link (müşteriye hatırlatma)
  const custWaText = `Randevunuz oluşturuldu!\n${provider.name}\n${dateLabel} ${timeLabel}\nHizmet: ${service.name}${appointment.staff ? `\nPersonel: ${appointment.staff.name}` : ''}\nDurum: ${status === 'onaylandi' ? 'Onaylandı' : 'Beklemede'}\nRandevu No: ${appointment.id.slice(-8).toUpperCase()}`
  const customerWaLink = whatsappLink(customerPhoneNorm, custWaText)

  // Audit log
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
          providerSlug: provider.slug ?? providerSlug,
        }),
      },
    })
  } catch {
    // sessiz geç
  }

  return ok({
    id: appointment.id,
    status: appointment.status,
    providerName: provider.name,
    providerPhone: provider.phone,
    serviceName: service.name,
    staffName: appointment.staff?.name ?? null,
    staffTitle: appointment.staff?.title ?? null,
    date: dateLabel,
    time: timeLabel,
    isoDate: appointment.date.toISOString(),
    price: appointment.price,
    currency: service.currency,
    customerName: appointment.customerName,
    customerPhone: appointment.customerPhone,
    whatsappLink: waLink,
    customerWhatsappLink: customerWaLink,
    appointmentCode: appointment.id.slice(-8).toUpperCase(),
  })
}

// GET → 405 placeholder (sadece POST destekleniyor)
export async function GET() {
  return err('Bu endpoint sadece POST destekler', 405)
}
