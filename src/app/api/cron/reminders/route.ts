import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { whatsappLink } from '@/lib/format'

// ============================================================
// RANDEVU HATIRLATICI CRON — mini-services/appointment-reminders
// POST /api/cron/reminders   (x-cron-secret header zorunlu)
//
// · Önümüzdeki 24 saatteki ONAYLI randevulara hatırlatma işareti
//   (reminderSent=true) + WhatsApp hatırlatma linki üretir.
// · 2+ saattir onay bekleyen randevuları işaretler — işletmeye
//   in-app bildirim (notifications feed) üzerinden görünür.
// · Her işlem için audit log tutar (actor: system).
// ============================================================

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function dateLabel(d: Date) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}
function timeLabel(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export async function POST(req: NextRequest) {
  // Secret doğrulaması — sadece cron servisi çağırabilir
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('x-cron-secret')
  if (!secret || provided !== secret) {
    return err('Yetkisiz erişim', 403)
  }

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const stalePendingBefore = new Date(now.getTime() - 2 * 60 * 60 * 1000)

  // 1) Hatırlatma gönderilecek onaylı randevular (reminderSent=false)
  const toRemind = await db.appointment.findMany({
    where: {
      status: 'onaylandi',
      reminderSent: false,
      date: { gte: now, lte: in24h },
    },
    include: {
      provider: { select: { id: true, name: true, phone: true, tenantId: true } },
      staff: { select: { id: true, name: true } },
      service: { select: { id: true, name: true } },
    },
    orderBy: { date: 'asc' },
    take: 100,
  })

  const reminders: Array<Record<string, unknown>> = []
  for (const appt of toRemind) {
    await db.appointment.update({
      where: { id: appt.id },
      data: { reminderSent: true },
    })

    // Müşteriye WhatsApp hatırlatma linki (Business API entegre edilince
    // bu link doğrudan gönderilir; şimdilik audit log + yanıt içinde)
    const waText =
      `Randevu Hatırlatması 🔔\n${appt.provider.name}\n` +
      `${dateLabel(appt.date)} ${timeLabel(appt.date)}\n` +
      `Hizmet: ${appt.service?.name ?? '—'}` +
      (appt.staff ? `\nPersonel: ${appt.staff.name}` : '') +
      `\nRandevu No: ${appt.id.slice(-8).toUpperCase()}\n` +
      `Görüşmek üzere!`
    const customerWaLink = whatsappLink(appt.customerPhone, waText)

    // İşletme içi bilgi linki (provider telefonuna)
    const bizWaText =
      `Hatırlatma: Yaklaşan randevu\n` +
      `Müşteri: ${appt.customerName} (${appt.customerPhone})\n` +
      `${dateLabel(appt.date)} ${timeLabel(appt.date)} · ${appt.service?.name ?? '—'}` +
      (appt.staff ? `\nPersonel: ${appt.staff.name}` : '')
    const businessWaLink = whatsappLink(appt.provider.phone, bizWaText)

    await writeAuditLog({
      tenantId: appt.provider.tenantId,
      actorId: null,
      action: 'reminder',
      entity: 'appointment',
      entityId: appt.id,
      after: {
        source: 'cron_reminder',
        appointmentNo: appt.id.slice(-8).toUpperCase(),
        customerName: appt.customerName,
        date: appt.date.toISOString(),
        customerWaLink,
        businessWaLink,
      },
    })

    reminders.push({
      appointmentId: appt.id,
      appointmentNo: appt.id.slice(-8).toUpperCase(),
      tenantId: appt.provider.tenantId,
      providerName: appt.provider.name,
      customerName: appt.customerName,
      customerPhone: appt.customerPhone,
      serviceName: appt.service?.name ?? null,
      staffName: appt.staff?.name ?? null,
      date: appt.date.toISOString(),
      customerWaLink,
      businessWaLink,
    })
  }

  // 2) Onay bekleyen (beklemede) ve 2+ saat eski randevular — işletme uyarısı
  const stalePending = await db.appointment.findMany({
    where: {
      status: 'beklemede',
      createdAt: { lt: stalePendingBefore },
      date: { gte: now },
    },
    include: {
      provider: { select: { id: true, name: true, tenantId: true } },
      service: { select: { id: true, name: true } },
    },
    orderBy: { date: 'asc' },
    take: 100,
  })

  if (stalePending.length > 0) {
    await writeAuditLog({
      tenantId: stalePending[0].provider.tenantId,
      actorId: null,
      action: 'reminder',
      entity: 'appointment_pending_escalation',
      entityId: stalePending[0].id,
      after: {
        source: 'cron_reminder',
        count: stalePending.length,
        appointmentNos: stalePending.map((a) => a.id.slice(-8).toUpperCase()),
      },
    })
  }

  return ok({
    ranAt: now.toISOString(),
    reminderCount: reminders.length,
    reminders,
    stalePendingCount: stalePending.length,
    stalePending: stalePending.map((a) => ({
      appointmentId: a.id,
      appointmentNo: a.id.slice(-8).toUpperCase(),
      tenantId: a.provider.tenantId,
      providerName: a.provider.name,
      customerName: a.customerName,
      serviceName: a.service?.name ?? null,
      date: a.date.toISOString(),
      waitingSince: a.createdAt.toISOString(),
    })),
  })
}

// GET — sağlık kontrolü (cron servisi bağlantı testi)
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('x-cron-secret')
  if (!secret || provided !== secret) {
    return err('Yetkisiz erişim', 403)
  }
  const [upcoming, pending] = await Promise.all([
    db.appointment.count({
      where: { status: 'onaylandi', reminderSent: false, date: { gte: new Date() } },
    }),
    db.appointment.count({ where: { status: 'beklemede' } }),
  ])
  return ok({ service: 'appointment-reminders', status: 'ready', upcomingUnreminded: upcoming, pending })
}
