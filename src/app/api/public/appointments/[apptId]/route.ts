import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import { whatsappLink } from '@/lib/format'

// ============================================================
// PUBLIC (auth gerektirmez) — randevu detayı (onay sayfası için)
// Returns: { id, status, providerName, serviceName, staffName, date, time, whatsappLink }
// ============================================================
export async function GET(_req: NextRequest, { params }: { params: Promise<{ apptId: string }> }) {
  const { apptId } = await params

  const appointment = await db.appointment.findUnique({
    where: { id: apptId },
    include: {
      provider: { select: { id: true, name: true, phone: true, address: true, city: true, slug: true } },
      service: { select: { id: true, name: true, duration: true, price: true, currency: true } },
      staff: { select: { id: true, name: true, title: true } },
    },
  })

  if (!appointment) return err('Randevu bulunamadı', 404)

  const startDate = appointment.date
  const dateLabel = `${String(startDate.getDate()).padStart(2, '0')}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${startDate.getFullYear()}`
  const timeLabel = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`

  // WhatsApp link (provider'a bildirim metni)
  const waText = `Merhaba, ${appointment.provider.name} için ${dateLabel} ${timeLabel} tarihinde randevum var.\n` +
    `Hizmet: ${appointment.service?.name ?? '-'}\n` +
    `Ad Soyad: ${appointment.customerName}\n` +
    `Telefon: ${appointment.customerPhone}\n` +
    (appointment.staff ? `Personel: ${appointment.staff.name}\n` : '') +
    `Durum: ${appointment.status === 'onaylandi' ? 'Onaylandı' : appointment.status === 'beklemede' ? 'Beklemede' : appointment.status}\n` +
    `Randevu No: ${appointment.id.slice(-8).toUpperCase()}`

  return ok({
    id: appointment.id,
    appointmentCode: appointment.id.slice(-8).toUpperCase(),
    status: appointment.status,
    providerName: appointment.provider.name,
    providerPhone: appointment.provider.phone,
    providerAddress: appointment.provider.address,
    providerCity: appointment.provider.city,
    providerSlug: appointment.provider.slug,
    serviceName: appointment.service?.name ?? null,
    serviceDuration: appointment.service?.duration ?? null,
    servicePrice: appointment.service?.price ?? appointment.price,
    serviceCurrency: appointment.service?.currency ?? 'TRY',
    staffName: appointment.staff?.name ?? null,
    staffTitle: appointment.staff?.title ?? null,
    date: dateLabel,
    time: timeLabel,
    isoDate: appointment.date.toISOString(),
    customerName: appointment.customerName,
    customerPhone: appointment.customerPhone,
    customerEmail: appointment.customerEmail,
    customerNote: appointment.customerNote,
    whatsappLink: whatsappLink(appointment.provider.phone, waText),
  })
}
