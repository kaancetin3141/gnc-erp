import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

// ============================================================
// POST — sakin girişi (telefon + şifre)
// GÜVENLİK (sızma testi bulgusu):
// 1) Eski kod şifreyi DÜZ METİN karşılaştırıyordu (where: {phone, password})
// 2) Rate limit yoktu → telefon+şifre brute-force'a açıktı
// 3) Admin route SHA-256 kaydediyordu ama giriş düz metin arıyordu →
//    şifreli sakinler GİREMEYİYORDU (fonksiyonel bug)
//
// Yeni akış (progressive migration):
// 1) passwordHash (bcrypt) varsa → bcrypt.compare
// 2) Yoksa legacy password alanı: 64-hex ise sha256 karşılaştır,
//    değilse düz metin → başarılıysa bcrypt'e MİGRE edilir
// 3) Telefon bazlı basit rate limit (10 deneme / 15 dk)
// ============================================================

const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 10
const WINDOW_MS = 15 * 60 * 1000

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const rec = loginAttempts.get(key)
  if (!rec || rec.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  rec.count += 1
  return rec.count <= MAX_ATTEMPTS
}

function isSha256Hex(s: string): boolean {
  return /^[0-9a-f]{64}$/i.test(s)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!phone || !password) return err('Telefon ve şifre gerekli', 400)

  if (!checkRateLimit(phone)) {
    return err('Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.', 429)
  }

  const resident = await db.resident.findFirst({
    where: { phone, isActive: true },
    include: {
      apartment: { include: { block: { select: { name: true, site: { select: { id: true, name: true, address: true, city: true } } } } } },
    },
  })

  if (!resident) return err('Geçersiz telefon veya şifre', 401)

  // ── Şifre doğrulama + progressive bcrypt migrasyonu ──
  let passwordOk = false
  if (resident.passwordHash) {
    passwordOk = await bcrypt.compare(password, resident.passwordHash)
  } else if (resident.password) {
    const legacy = resident.password
    if (isSha256Hex(legacy)) {
      passwordOk = crypto.createHash('sha256').update(password).digest('hex') === legacy
    } else {
      passwordOk = legacy === password
    }
    // Başarılı girişte bcrypt'e migrasyon + legacy alanı temizle
    if (passwordOk) {
      try {
        const hash = await bcrypt.hash(password, 10)
        await db.resident.update({
          where: { id: resident.id },
          data: { passwordHash: hash, password: null },
        })
      } catch {
        // migrasyon başarısız olsa da giriş devam eder
      }
    }
  }

  if (!passwordOk) return err('Geçersiz telefon veya şifre', 401)

  return ok({
    sessionId: resident.id,
    resident: {
      id: resident.id,
      name: resident.name,
      phone: resident.phone,
      email: resident.email,
      type: resident.type,
      apartment: resident.apartment ? {
        number: resident.apartment.number,
        block: resident.apartment.block.name,
        site: resident.apartment.block.site,
      } : null,
    },
  })
}
