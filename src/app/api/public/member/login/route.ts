import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import bcrypt from 'bcryptjs'
import { normalizePhoneDigits, signToken, checkRateLimit } from '@/lib/member-auth'

// ============================================================
// PUBLIC (auth gerektirmez) — ÜYE GİRİŞİ (telefon + şifre)
// Body: { phone, password }
// · Telefon bazlı rate limit: 10 deneme / 15 dk (brute-force koruması)
// · Başarısızsa genel mesaj (telefon/şifre ayrımı sızdırılmaz)
// Returns: { token, member: { id, name, phone, email } }
// ============================================================

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { phone?: string; password?: string } | null
  if (!body) return err('Geçersiz istek gövdesi', 400)

  const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!phoneRaw || !password) return err('Telefon ve şifre gerekli', 400)

  const phone = normalizePhoneDigits(phoneRaw)
  if (!checkRateLimit(`login:${phone}`, 10, 15 * 60 * 1000)) {
    return err('Çok fazla başarısız deneme. 15 dakika sonra tekrar dene.', 429)
  }

  const member = await db.member.findUnique({ where: { phone } })
  if (!member || !member.isActive) return err('Geçersiz telefon veya şifre', 401)

  const passwordOk = await bcrypt.compare(password, member.passwordHash)
  if (!passwordOk) return err('Geçersiz telefon veya şifre', 401)

  return ok({
    token: signToken(member.id),
    member: { id: member.id, name: member.name, phone: member.phone, email: member.email },
  })
}
