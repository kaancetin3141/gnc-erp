import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import {
  bearerToken, verifyToken, phoneSuffix, rawPhoneDigits, checkRateLimit,
} from '@/lib/member-auth'

// ============================================================
// PUBLIC — RANDEVU SONRASI DEĞERLENDİRME OLUŞTUR
// Gövde: { providerSlug, rating (1-5), comment? (max 1000),
//          appointmentId? (üye akışı) | appointmentCode? (misafir) }
// · Üye akışı: Bearer token (ya da gövdede memberToken) → appointmentId
//   üyenin randevularından (memberId FK VEYA telefon eki) olmalı
// · Misafir akışı: appointmentCode (randevu id'sinin son 8 karakteri,
//   büyük harf — randevu onay ekranında gösterilen "Randevu No")
// · Uygunluk: randevu tarihi geçmiş OLMALI ya da status='tamamlandi';
//   iptal/reddedildi randevular değerlendirilemez
// · Tek randevuya tek değerlendirme → 409
// · status 'pending' başlar (admin moderasyonu sonrası yayınlanır)
// · IP bazlı rate limit: 15 dakikada 5 değerlendirme
// ============================================================

const BLOCKED_STATUSES = ['iptal', 'reddedildi']

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
}

/** Randevu değerlendirilebilir mi: geçmiş tarih ya da tamamlandı. */
function isEligible(a: { date: Date; status: string }): boolean {
  if (BLOCKED_STATUSES.includes(a.status)) return false
  return a.status === 'tamamlandi' || a.date.getTime() < Date.now()
}

export async function POST(req: NextRequest) {
  // IP rate limit (yayın öncesi spam'e karşı)
  const ip = clientIp(req)
  if (!checkRateLimit(`public-review:${ip}`, 5, 15 * 60 * 1000)) {
    return err('Çok fazla deneme — lütfen 15 dakika sonra tekrar dene.', 429)
  }

  const body = (await req.json().catch(() => null)) as {
    providerSlug?: unknown
    rating?: unknown
    comment?: unknown
    appointmentId?: unknown
    appointmentCode?: unknown
    memberToken?: unknown
  } | null
  if (!body) return err('İstek gövdesi okunamadı.', 400)

  const providerSlug = typeof body.providerSlug === 'string' ? body.providerSlug.trim() : ''
  if (!providerSlug) return err('İşletme bilgisi eksik (providerSlug).', 400)

  const ratingRaw = Number(body.rating)
  if (!Number.isInteger(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
    return err('Puan 1 ile 5 arasında olmalı.', 400)
  }
  const rating = ratingRaw

  let comment = typeof body.comment === 'string' ? body.comment.trim() : ''
  if (comment.length > 1000) comment = comment.slice(0, 1000)
  if (comment) comment = comment.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

  const appointmentId = typeof body.appointmentId === 'string' ? body.appointmentId.trim() : ''
  const appointmentCodeRaw = typeof body.appointmentCode === 'string' ? body.appointmentCode.trim() : ''
  // Kod, randevu id'sinin son 8 karakteri (büyük harf) — normalize: boşluk temizle, büyük harf
  const appointmentCode = appointmentCodeRaw.replace(/\s+/g, '').toUpperCase()
  if (!appointmentId && !appointmentCode) {
    return err('Değerlendirme için randevu kodu gerekli — randevundan sonra gelen koddan devam edebilirsin.', 400)
  }

  // İşletme
  const provider = await db.serviceProvider.findFirst({
    where: { slug: providerSlug, isActive: true },
    select: { id: true, name: true },
  })
  if (!provider) return err('İşletme bulunamadı.', 404)

  // Üye (varsa) — Bearer başlığı ya da gövdedeki memberToken
  const token = bearerToken(req)
    || (typeof body.memberToken === 'string' && body.memberToken.trim() ? body.memberToken.trim() : null)
  const memberIdFromToken = token ? verifyToken(token) : null
  const member = memberIdFromToken
    ? await db.member.findUnique({ where: { id: memberIdFromToken } })
    : null
  if (token && !member) return err('Oturum geçersiz veya süresi dolmuş — tekrar giriş yap.', 401)
  const suffix = member ? phoneSuffix(member.phone) : ''

  // Randevuyu bul
  let appointment: {
    id: string
    providerId: string
    memberId: string | null
    customerName: string
    customerPhone: string
    date: Date
    status: string
  } | null = null

  if (appointmentId) {
    // Üye akışı — appointmentId yalnız üyenin kendi randevusu olabilir
    if (!member) {
      return err('Randevu numarasıyla değerlendirme için giriş yapman ya da randevu kodunu girmen gerekir.', 401)
    }
    appointment = await db.appointment.findFirst({
      where: { id: appointmentId },
      select: {
        id: true, providerId: true, memberId: true, customerName: true,
        customerPhone: true, date: true, status: true,
      },
    })
    const owns = appointment
      && (appointment.memberId === member.id
        || (suffix.length >= 10 && rawPhoneDigits(appointment.customerPhone).endsWith(suffix)))
    if (!appointment || !owns) {
      return err('Bu randevu hesabına ait değil — kendi randevularını değerlendirebilirsin.', 403)
    }
  } else {
    // Misafir akışı — randevu kodu = id'nin son 8 karakteri (UPPER)
    const rows = await db.$queryRaw<Array<{
      id: string; providerId: string; memberId: string | null
      customerName: string; customerPhone: string; date: bigint; status: string
    }>>`
      SELECT a."id", a."providerId", a."memberId", a."customerName", a."customerPhone", a."date", a."status"
      FROM "Appointment" a
      WHERE UPPER(SUBSTR(a."id", -8)) = ${appointmentCode}
      LIMIT 2
    `
    if (rows.length > 1) return err('Randevu kodu benzersiz değil — lütfen randevu numaranı kontrol et.', 409)
    const r = rows[0]
    if (r) {
      appointment = {
        id: r.id, providerId: r.providerId, memberId: r.memberId,
        customerName: r.customerName, customerPhone: r.customerPhone,
        date: new Date(Number(r.date)), status: r.status,
      }
    }
  }

  if (!appointment) return err('Bu koda ait randevu bulunamadı — kodu kontrol edip tekrar dene.', 404)
  if (appointment.providerId !== provider.id) {
    return err('Bu randevu bu işletmeye ait değil.', 403)
  }
  if (!isEligible(appointment)) {
    return err('Bu randevu henüz değerlendirilemez — randevu tarihi geçmeli ya da tamamlanmış olmalı.', 400)
  }

  // Tek randevuya tek değerlendirme
  const existing = await db.review.findFirst({
    where: { appointmentId: appointment.id },
    select: { id: true },
  })
  if (existing) {
    return err('Bu randevu zaten değerlendirilmiş — her randevu bir kez puanlanabilir.', 409)
  }

  // Görünen ad: üyeyse üye adı, misafirse randevu müşteri adı
  const authorName = (member ? member.name : appointment.customerName) || 'Misafir'

  const review = await db.review.create({
    data: {
      providerId: provider.id,
      appointmentId: appointment.id,
      memberId: member ? member.id : null,
      authorName: authorName.slice(0, 80),
      rating,
      comment: comment || null,
      status: 'pending',
    },
    select: { id: true },
  })

  return ok({
    ok: true,
    id: review.id,
    status: 'pending',
    message: 'Teşekkürler! Değerlendirmen incelemeden sonra yayınlanacak.',
  })
}
