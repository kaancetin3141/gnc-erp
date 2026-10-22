import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import bcrypt from 'bcryptjs'
import { normalizePhoneDigits, signToken, checkRateLimit } from '@/lib/member-auth'

// ============================================================
// PUBLIC (auth gerektirmez) — ÜYE KAYDI (telefon + şifre)
// Body: { name, phone, email?, password }
// · Telefon tekil kimliktir (normalize: 905XXXXXXXXX)
// · Telefon bazlı rate limit: 5 deneme / 15 dk (abuse koruması)
// · Aynı telefonla tekrar kayıt → 409 ("zaten" mesajlı)
// Returns: { token, member: { id, name, phone, email } }
// ============================================================

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    name?: string
    phone?: string
    email?: string
    password?: string
  } | null
  if (!body) return err('Geçersiz istek gövdesi', 400)

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (name.length < 2) return err('Ad soyad en az 2 karakter olmalı', 400)

  const phone = normalizePhoneDigits(phoneRaw)
  if (phone.length < 10 || phone.length > 13) return err('Geçerli bir telefon numarası girin', 400)

  if (password.length < 6) return err('Şifre en az 6 karakter olmalı', 400)

  if (!checkRateLimit(`register:${phone}`, 5, 15 * 60 * 1000)) {
    return err('Çok fazla deneme. 15 dakika sonra tekrar dene.', 429)
  }

  const existing = await db.member.findUnique({ where: { phone } })
  if (existing) {
    return err('Bu telefon numarasıyla kayıtlı bir üyelik zaten var. Giriş yapmayı dene.', 409)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  try {
    const member = await db.member.create({
      data: { name, phone, email: email || null, passwordHash },
    })
    return ok({
      token: signToken(member.id),
      member: { id: member.id, name: member.name, phone: member.phone, email: member.email },
    })
  } catch (e: unknown) {
    // P2002: unique constraint — eşzamanlı kayıt yarışı
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
      return err('Bu telefon numarasıyla kayıtlı bir üyelik zaten var. Giriş yapmayı dene.', 409)
    }
    throw e
  }
}
