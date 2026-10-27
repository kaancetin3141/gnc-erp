import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import {
  bearerToken, verifyToken, normalizePhoneDigits, checkRateLimit,
} from '@/lib/member-auth'

// ============================================================
// PUBLIC — BEKLEME LİSTESİ (Fresha/Booksy "waitlist")
// POST /api/public/waitlist — dolu randevu slotu isteyen müşteri
//   beklemeye girer. Gövde:
//   { providerSlug, customerName (2-120), customerPhone (normalize
//     → 905XXXXXXXXX, geçersizse 400), serviceName? (≤120),
//     preferredDate (YYYY-MM-DD, geçerli takvim, bugünden ileri),
//     preferredSlot? (^([01]?\d|2[0-3]):[0-5]\d$, 24 sa),
//     note? (≤500), appointmentCode? (8 haneli randevu kodu —
//     dolu randevuya bağlanır), memberToken? }
//   · Üye token'ı (Bearer ya da gövde) GEÇERLİyse memberId FK bağlanır
//   · Aynı telefon + aynı gün + aynı işletme için 'waiting' kayıt → 409
//   · IP rate limit: 15 dakikada 10 kayıt → 429
// GET /api/public/waitlist?phone=&providerSlug= — müşterinin kendi
//   bekleme durumu sorgusu (yalnız waiting/notified/booked döner;
//   telefon TAM eşleşme 905XXXXXXXXX; rate limit 30/15dk)
// ============================================================

const SLOT_RE = /^([01]?\d|2[0-3]):[0-5]\d$/
const PUBLIC_STATUSES = ['waiting', 'notified', 'booked']

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
}

/** YYYY-MM-DD → floating local Date (new Date(y,m,d) deseni —
 *  randevu tarihiyle aynı model, gün karşılaştırmaları duvar saatine göre). */
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  if (y < 2020 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const probe = new Date(y, mo - 1, d) // floating local time
  if (probe.getMonth() !== mo - 1 || probe.getDate() !== d) return null
  return probe
}

/** Bugünün floating local gün başı. */
function todayStart(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  if (!checkRateLimit(`public-waitlist:${ip}`, 10, 15 * 60 * 1000)) {
    return err('Çok fazla deneme — lütfen 15 dakika sonra tekrar dene.', 429)
  }

  const body = (await req.json().catch(() => null)) as {
    providerSlug?: unknown
    customerName?: unknown
    customerPhone?: unknown
    serviceName?: unknown
    preferredDate?: unknown
    preferredSlot?: unknown
    note?: unknown
    appointmentCode?: unknown
    memberToken?: unknown
  } | null
  if (!body) return err('İstek gövdesi okunamadı.', 400)

  // ---- alan doğrulamaları ----
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : ''
  if (customerName.length < 2 || customerName.length > 120) {
    return err('Ad soyad 2-120 karakter olmalı.', 400)
  }

  const phoneRaw = typeof body.customerPhone === 'string' ? body.customerPhone : ''
  const customerPhone = normalizePhoneDigits(phoneRaw)
  if (customerPhone.length !== 12 || !customerPhone.startsWith('90')) {
    return err('Geçerli bir telefon numarası gir (örn. 0555 111 22 33).', 400)
  }

  let serviceName = typeof body.serviceName === 'string' ? body.serviceName.trim() : ''
  if (serviceName.length > 120) return err('Hizmet adı en fazla 120 karakter olabilir.', 400)

  const preferredDateStr = typeof body.preferredDate === 'string' ? body.preferredDate.trim() : ''
  const preferredDate = preferredDateStr ? parseLocalDate(preferredDateStr) : null
  if (!preferredDate) return err('Geçerli bir tarih gerekli (YYYY-MM-DD).', 400)
  if (preferredDate.getTime() < todayStart().getTime()) {
    return err('İstenen tarih bugünden ileri olmalı.', 400)
  }

  let preferredSlot = typeof body.preferredSlot === 'string' ? body.preferredSlot.trim() : ''
  if (preferredSlot && !SLOT_RE.test(preferredSlot)) {
    return err('Saat biçimi geçersiz (örn. 14:00).', 400)
  }
  preferredSlot = preferredSlot.replace(/^(\d):/, '0$1:') // "9:30" → "09:30"

  let note = typeof body.note === 'string' ? body.note.trim() : ''
  if (note.length > 500) return err('Not en fazla 500 karakter olabilir.', 400)
  note = note.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

  const appointmentCode = typeof body.appointmentCode === 'string'
    ? body.appointmentCode.replace(/\s+/g, '').toUpperCase() : ''
  if (appointmentCode && !/^[A-Z0-9]{8}$/.test(appointmentCode)) {
    return err('Randevu kodu 8 karakterli olmalı.', 400)
  }

  // ---- işletme ----
  const providerSlugRaw = typeof body.providerSlug === 'string' ? body.providerSlug.trim() : ''
  if (!providerSlugRaw) return err('İşletme bilgisi eksik (providerSlug).', 400)
  const provider = await db.serviceProvider.findFirst({
    where: { slug: providerSlugRaw, isActive: true },
    select: { id: true, name: true },
  })
  if (!provider) return err('İşletme bulunamadı.', 404)

  // ---- üye bağlama (varsa) ----
  const token = bearerToken(req)
    || (typeof body.memberToken === 'string' && body.memberToken.trim() ? body.memberToken.trim() : null)
  let memberId: string | null = null
  if (token) {
    const mid = verifyToken(token)
    if (mid) {
      const m = await db.member.findUnique({ where: { id: mid }, select: { id: true, isActive: true } })
      if (m?.isActive) memberId = m.id
    }
    // token var ama üye bulunamadı → misafir akışı (randevu API deseni)
  }

  // ---- dolu randevuya bağlanma (opsiyonel appointmentCode) ----
  let appointmentId: string | null = null
  if (appointmentCode) {
    const rows = await db.$queryRaw<Array<{ id: string; providerId: string }>>`
      SELECT a."id", a."providerId" FROM "Appointment" a
      WHERE UPPER(SUBSTR(a."id", -8)) = ${appointmentCode}
      LIMIT 2
    `
    if (rows.length > 1) return err('Randevu kodu benzersiz değil — kodu kontrol et.', 409)
    const r = rows[0]
    if (!r) return err('Bu koda ait randevu bulunamadı.', 404)
    if (r.providerId !== provider.id) {
      return err('Bu randevu bu işletmeye ait değil.', 403)
    }
    appointmentId = r.id
  }

  // ---- mükerrer kayıt: aynı telefon + aynı gün + aynı işletme + waiting ----
  const dayEnd = new Date(preferredDate.getTime() + 24 * 60 * 60_000)
  const dup = await db.waitlistEntry.findFirst({
    where: {
      providerId: provider.id,
      customerPhone,
      status: 'waiting',
      preferredDate: { gte: preferredDate, lt: dayEnd },
    },
    select: { id: true },
  })
  if (dup) {
    return err('Bu telefon için aynı güne ait zaten bekleyen bir kayıt var.', 409)
  }

  const entry = await db.waitlistEntry.create({
    data: {
      providerId: provider.id,
      appointmentId,
      memberId,
      customerName,
      customerPhone,
      serviceName: serviceName || null,
      preferredDate,
      preferredSlot: preferredSlot || null,
      note: note || null,
      status: 'waiting',
    },
    select: { id: true },
  })

  return ok({
    ok: true,
    id: entry.id,
    status: 'waiting',
    message: 'Bekleme listesine eklendiniz — randevu açılır açılmaz sizi arayacağız.',
  }, 201)
}

export async function GET(req: NextRequest) {
  const ip = clientIp(req)
  if (!checkRateLimit(`public-waitlist-get:${ip}`, 30, 15 * 60 * 1000)) {
    return err('Çok fazla deneme — lütfen 15 dakika sonra tekrar dene.', 429)
  }

  const url = new URL(req.url)
  const phoneRaw = (url.searchParams.get('phone') || '').trim()
  const providerSlug = (url.searchParams.get('providerSlug') || '').trim()
  const phone = normalizePhoneDigits(phoneRaw)
  if (!phone) return err('Telefon numarası gerekli.', 400)
  if (phone.length !== 12 || !phone.startsWith('90')) {
    return err('Geçerli bir telefon numarası gir (örn. 0555 111 22 33).', 400)
  }

  const items = await db.waitlistEntry.findMany({
    where: {
      customerPhone: phone, // TAM eşleşme — normalize edilmiş 905XXXXXXXXX
      status: { in: PUBLIC_STATUSES },
      ...(providerSlug ? { provider: { slug: providerSlug } } : {}),
    },
    orderBy: [{ preferredDate: 'asc' }, { createdAt: 'asc' }],
    take: 50,
    select: {
      id: true,
      serviceName: true,
      preferredDate: true,
      preferredSlot: true,
      status: true,
      notifiedAt: true,
      createdAt: true,
      provider: { select: { name: true, slug: true } },
    },
  })

  return ok({
    items: items.map((w) => ({
      id: w.id,
      providerName: w.provider.name,
      providerSlug: w.provider.slug,
      serviceName: w.serviceName,
      preferredDate: w.preferredDate,
      preferredSlot: w.preferredSlot,
      status: w.status,
      notifiedAt: w.notifiedAt,
      createdAt: w.createdAt,
    })),
    total: items.length,
  })
}
