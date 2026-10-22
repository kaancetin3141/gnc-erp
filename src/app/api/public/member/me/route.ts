import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import bcrypt from 'bcryptjs'
import {
  bearerToken, verifyToken, phoneSuffix, rawPhoneDigits, checkRateLimit,
} from '@/lib/member-auth'

// ============================================================
// PUBLIC (Bearer token) — ÜYE PROFİLİ
// Authorization: Bearer <token>
// GET    → { member: { id, name, phone, email, createdAt } }
// DELETE → KVKK self-servis hesap silme:
//          gövdede { password } şifre teyidi ister; bcrypt karşılaştırması
//          başarılıysa üye + telefonuyla eşleşen TÜM randevuları
//          (iptal edilenler dahil) kalıcı olarak siler → { ok: true }
//          Şifre yanlışsa 401.
// ============================================================

export async function GET(req: NextRequest) {
  const token = bearerToken(req)
  const memberId = token ? verifyToken(token) : null
  if (!memberId) return err('Oturum geçersiz veya süresi dolmuş — tekrar giriş yap.', 401)

  const member = await db.member.findUnique({ where: { id: memberId } })
  if (!member || !member.isActive) return err('Üyelik bulunamadı', 401)

  return ok({
    member: {
      id: member.id,
      name: member.name,
      phone: member.phone,
      email: member.email,
      createdAt: member.createdAt,
    },
  })
}

export async function DELETE(req: NextRequest) {
  const token = bearerToken(req)
  const memberId = token ? verifyToken(token) : null
  if (!memberId) return err('Oturum geçersiz veya süresi dolmuş — tekrar giriş yap.', 401)

  const body = (await req.json().catch(() => null)) as { password?: string } | null
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!password) return err('Hesabını silmek için şifreni teyit etmen gerekli', 400)

  const member = await db.member.findUnique({ where: { id: memberId } })
  if (!member || !member.isActive) return err('Üyelik bulunamadı', 401)

  // Brute-force koruması: şifre teyidi denemeleri üye başına 5 / 15 dk
  if (!checkRateLimit(`member-delete:${member.id}`, 5, 15 * 60 * 1000)) {
    return err('Çok fazla deneme. 15 dakika sonra tekrar dene.', 429)
  }

  const passwordOk = await bcrypt.compare(password, member.passwordHash)
  if (!passwordOk) return err('Şifre doğrulanamadı — hesap silinmedi.', 401)

  // Üyenin telefonuyla alınmış TÜM randevular (iptal/reddedilenler dahil).
  // Eşleştirme Randevularım ile aynı kural: ayraç temizlenmiş ham telefon,
  // abone numarasıyla (son 10 hane) biter. Silme yıkıcı olduğu için iki
  // aşamalı: aday id'ler ham SQL ile → JS tarafında kesin endsWith doğrulaması.
  const suffix = phoneSuffix(member.phone)
  let apptIds: string[] = []
  if (suffix.length >= 10) {
    let candidates: Array<{ id: string; customerPhone: string }>
    try {
      candidates = await db.$queryRaw<Array<{ id: string; customerPhone: string }>>`
        SELECT a.id, a."customerPhone"
        FROM "Appointment" a
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(a."customerPhone", ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '') LIKE ${'%' + suffix}
        LIMIT 500
      `
    } catch {
      return err('Hesap silme şu anda tamamlanamıyor — birkaç saniye sonra tekrar dene.', 502)
    }
    apptIds = candidates
      .filter((r) => rawPhoneDigits(r.customerPhone).endsWith(suffix))
      .map((r) => r.id)
  }

  try {
    await db.$transaction([
      db.appointment.deleteMany({ where: { id: { in: apptIds } } }),
      db.member.delete({ where: { id: member.id } }),
    ])
  } catch {
    return err('Hesap silme sırasında bir sorun oluştu — veriler değişmedi.', 500)
  }

  return ok({ ok: true, deletedAppointments: apptIds.length })
}
