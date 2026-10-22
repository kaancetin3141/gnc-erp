import crypto from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// ÜYELİK kimlik yardımcıları — GNC Randevu müşteri sitesi (3002)
// · Telefon normalizasyonu: "0555 111 22 33" / "+90 555..." → 905551112233
// · HMAC-SHA256 imzalı, süreli token (30 gün) — session tablosu yok
// · Secret: env MEMBER_AUTH_SECRET yoksa db/.member-secret dosyasında
//   (ilk kullanımda üretilir; yeniden başlatmalarda sabit kalır)
// ============================================================

function loadSecret(): string {
  const env = process.env.MEMBER_AUTH_SECRET?.trim()
  if (env) return env
  const file = join(process.cwd(), 'db', '.member-secret')
  try {
    if (existsSync(file)) {
      const s = readFileSync(file, 'utf8').trim()
      if (s.length >= 32) return s
    }
  } catch {
    // okunamadıysa yeniden üretilecek
  }
  const secret = crypto.randomBytes(32).toString('hex')
  try {
    writeFileSync(file, secret, { encoding: 'utf8' })
  } catch {
    // yazılamazsa token'lar süreç ömrü boyunca geçerli kalır (dev fallback)
  }
  return secret
}

const SECRET = loadSecret()

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 gün

/** Telefonu rakamlara indirip TR biçimine normalleştirir (905XXXXXXXXX). */
export function normalizePhoneDigits(p: string): string {
  let d = String(p || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('90') && d.length === 12) return d
  if (d.startsWith('0') && d.length === 11) return '90' + d.slice(1)
  if (d.length === 10) return '90' + d
  return d
}

/** Eşleştirme için abone numarası (son 10 hane: 5XXXXXXXXX). */
export function phoneSuffix(p: string): string {
  return normalizePhoneDigits(p).slice(-10)
}

/** Ham telefon metnini yalnızca rakamlara indirir (randevu eşleştirmesi). */
export function rawPhoneDigits(p: string): string {
  return String(p || '').replace(/\D/g, '')
}

export function signToken(memberId: string, ttlMs: number = TOKEN_TTL_MS): string {
  const exp = Date.now() + ttlMs
  const payload = `${memberId}.${exp}`
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** Token geçerliyse memberId döner; değilse null. */
export function verifyToken(token: string): string | null {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return null
  const [id, expStr, sig] = parts
  const exp = Number(expStr)
  if (!id || !Number.isFinite(exp) || exp < Date.now()) return null
  const expected = crypto.createHmac('sha256', SECRET).update(`${id}.${expStr}`).digest('base64url')
  if (typeof sig !== 'string' || sig.length !== expected.length) return null
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  return id
}

/** Authorization: Bearer <token> başlığından token'ı ayıklar. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

// ---- basit IP bazlı rate limit (kayıt + giriş uçları için) ----

const attempts = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const rec = attempts.get(key)
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  rec.count += 1
  if (attempts.size > 500) {
    for (const [k, v] of attempts) if (now > v.resetAt) attempts.delete(k)
  }
  return rec.count <= max
}
