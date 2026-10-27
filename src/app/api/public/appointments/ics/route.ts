import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { err } from '@/lib/api-utils'
import { bearerToken, verifyToken, phoneSuffix, rawPhoneDigits, checkRateLimit } from '@/lib/member-auth'

// ============================================================
// PUBLIC — ICS TAKVİM DOSYASI (randevuyu takvime ekle, RFC 5545)
// GET /api/public/appointments/ics?code=XXXXXXXX
//     → misafir akışı: 8 haneli randevu kodu (UPPER(SUBSTR(id,-8)))
//       kodu elinde tutan kişi dosyayı indirebilir (randevu onay
//       ekranında ve Randevularım kartında zaten gösteriliyor)
// GET /api/public/appointments/ics?id=<appointmentId>
//     → üye akışı: Authorization: Bearer <memberToken> zorunlu;
//       sahiplenme kontrolü (memberId FK VEYA telefon abone eki)
// Opsiyonel: &alarm=0 → VALARM (2 saat önce hatırlatma) bloğu
//     eklenmez (üyenin "Hatırlatıcılar" tercihi kapalıysa).
//
// Zaman modeli: Appointment.date "floating local time" saklanır —
// randevunun TR duvar saati Date'in UTC bileşenlerinde durur
// (bkz. /api/reports/summary açıklaması). Bu yüzden DTSTART/DTEND
// değerleri getUTC* metotlarıyla çıkarılır ve TZID=Europe/Istanbul
// ile "yerel duvar saati" olarak yazılır — sunucu saat diliminden
// bağımsız olarak doğru kalır.
//
// Yanıt: text/calendar; charset=utf-8 (CRLF satır sonları, UTF-8),
// Content-Disposition: attachment; filename="randevu-<KOD>.ics",
// Cache-Control: no-store. Bulunamayan randevu → 404 JSON.
// IP rate limit: 15 dakikada 60 istek (checkRateLimit).
// ============================================================

interface IcsAppointment {
  id: string
  memberId: string | null
  providerId: string
  serviceId: string | null
  customerName: string
  customerPhone: string
  customerNote: string | null
  date: Date
  endTime: Date | null
  status: string
}

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Floating local time (TR duvar saati) → YYYYMMDDTHHMMSS */
function icsFloating(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`
  )
}

/** UTC zaman damgası (DTSTAMP) → YYYYMMDDTHHMMSSZ */
function icsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/** RFC 5545 metin kaçışı: \ ; , ve satır sonları (\n literal olarak) */
function escText(v: unknown): string {
  return String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** RFC 5545 §3.1: satırlar 75 okteti geçmemeli; uzun satırlar
 *  CRLF + boşluk ile katlanır. Kod noktası bazlı gezinme sayesinde
 *  UTF-8 çok baytlı karakterler (Türkçe ğ/ş/ö…) bölünmez. */
function foldLine(line: string): string {
  const byteLen = (s: string) => Buffer.byteLength(s, 'utf8')
  if (byteLen(line) <= 75) return line
  const parts: string[] = []
  let cur = ''
  let curLen = 0
  for (const ch of line) {
    const chLen = byteLen(ch)
    if (curLen + chLen > 75) {
      parts.push(cur)
      cur = ' ' + ch // katlanan satır tek boşlukla başlar (o da 75'e dahil)
      curLen = 1 + chLen
    } else {
      cur += ch
      curLen += chLen
    }
  }
  if (cur) parts.push(cur)
  return parts.join('\r\n')
}

export async function GET(req: NextRequest) {
  // IP rate limit — kod brute-force denemelerine karşı ilk savunma
  const ip = clientIp(req)
  if (!checkRateLimit(`public-ics:${ip}`, 60, 15 * 60 * 1000)) {
    return err('Çok fazla istek — lütfen 15 dakika sonra tekrar dene.', 429)
  }

  const url = new URL(req.url)
  const code = (url.searchParams.get('code') || '').replace(/\s+/g, '').toUpperCase()
  const id = (url.searchParams.get('id') || '').trim()
  const noAlarm = url.searchParams.get('alarm') === '0' // varsayılan: alarm VAR

  if (!code && !id) {
    return err('Randevu kodu (code) ya da randevu kimliği (id) gerekli.', 400)
  }

  let appointment: IcsAppointment | null = null

  if (code) {
    // ---- Misafir akışı: 8 haneli kod = id'nin son 8 karakteri (UPPER)
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      return err('Randevu kodu 8 karakter olmalı — randevu onayındaki kodu kontrol et.', 400)
    }
    const rows = await db.$queryRaw<Array<{
      id: string
      memberId: string | null
      providerId: string
      serviceId: string | null
      customerName: string
      customerPhone: string
      customerNote: string | null
      date: bigint
      endTime: bigint | null
      status: string
    }>>`
      SELECT a."id", a."memberId", a."providerId", a."serviceId", a."customerName",
             a."customerPhone", a."customerNote", a."date", a."endTime", a."status"
      FROM "Appointment" a
      WHERE UPPER(SUBSTR(a."id", -8)) = ${code}
      LIMIT 2
    `
    if (rows.length > 1) {
      return err('Randevu kodu benzersiz değil — lütfen randevu numaranı kontrol et.', 409)
    }
    const r = rows[0]
    if (r) {
      appointment = {
        id: r.id,
        memberId: r.memberId,
        providerId: r.providerId,
        serviceId: r.serviceId,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        customerNote: r.customerNote,
        date: new Date(Number(r.date)),
        endTime: r.endTime != null ? new Date(Number(r.endTime)) : null,
        status: r.status,
      }
    }
  } else {
    // ---- Üye akışı: id + Bearer memberToken (sahiplik kontrolüyle)
    const token = bearerToken(req)
    const memberId = token ? verifyToken(token) : null
    if (!memberId) {
      return err('Bu randevu için takvim dosyası indirmek üzere giriş yapman gerekir.', 401)
    }
    const member = await db.member.findUnique({ where: { id: memberId } })
    if (!member || !member.isActive) return err('Üyelik bulunamadı', 401)

    const found = await db.appointment.findFirst({
      where: { id },
      select: {
        id: true, memberId: true, providerId: true, serviceId: true,
        customerName: true, customerPhone: true, customerNote: true,
        date: true, endTime: true, status: true,
      },
    })
    // Başka birinin randevusuysa sessizce 404 (bilgi sızması yok)
    const suffix = phoneSuffix(member.phone)
    const owns = found
      && (found.memberId === member.id
        || (suffix.length >= 10 && rawPhoneDigits(found.customerPhone).endsWith(suffix)))
    if (!found || !owns) return err('Randevu bulunamadı', 404)
    appointment = found
  }

  if (!appointment) return err('Bu koda ait randevu bulunamadı — kodu kontrol edip tekrar dene.', 404)

  // İlişkiler: hizmet (ad + süre) ve işletme (ad + adres)
  const [service, provider] = await Promise.all([
    appointment.serviceId
      ? db.service.findUnique({
          where: { id: appointment.serviceId },
          select: { name: true, duration: true },
        })
      : Promise.resolve(null),
    db.serviceProvider.findUnique({
      where: { id: appointment.providerId },
      select: { name: true, address: true, city: true, district: true },
    }),
  ])

  const code8 = appointment.id.slice(-8).toUpperCase()

  // Bitiş: hizmet süresi öncelikli; hizmet silinmişse kayıtlı endTime,
  // o da yoksa 30 dk varsayılan (randevu API'sinin varsayımıyla uyumlu)
  const end = service
    ? new Date(appointment.date.getTime() + service.duration * 60_000)
    : (appointment.endTime ?? new Date(appointment.date.getTime() + 30 * 60_000))

  const summary = `${service?.name ?? 'Randevu'} — ${provider?.name ?? 'GNC Randevu'}`

  const descLines = [
    `Randevu Kodu: ${code8}`,
    `Müşteri: ${appointment.customerName}`,
    `Telefon: ${appointment.customerPhone}`,
  ]
  if (appointment.customerNote) descLines.push(`Not: ${appointment.customerNote}`)
  const description = descLines.join('\n')

  const location = provider?.address
    || [provider?.district, provider?.city].filter(Boolean).join(', ')
    || ''

  // iptal/reddedilmiş randevu → CANCELLED (takvimde iptal olarak görünür)
  const statusLine = appointment.status === 'iptal' || appointment.status === 'reddedildi'
    ? 'CANCELLED'
    : 'CONFIRMED'

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GNC CRM//Randevu//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${appointment.id}@gncinc.online`,
    `DTSTAMP:${icsUtc(new Date())}`,
    `DTSTART;TZID=Europe/Istanbul:${icsFloating(appointment.date)}`,
    `DTEND;TZID=Europe/Istanbul:${icsFloating(end)}`,
    `SUMMARY:${escText(summary)}`,
    `DESCRIPTION:${escText(description)}`,
    `LOCATION:${escText(location)}`,
    `STATUS:${statusLine}`,
  ]
  if (!noAlarm) {
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Randevu hatırlatması',
      'END:VALARM',
    )
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')

  const ics = lines.map(foldLine).join('\r\n') + '\r\n'

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="randevu-${code8}.ics"`,
      'cache-control': 'no-store',
    },
  })
}
