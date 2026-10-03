// ============================================================
// Herkese açık PDF paylaşım token'ı — stateless HMAC imzası
// Şema değişikliği gerektirmez: token = exp.sğraf
// token doğrulaması: exp henüz geçmemiş + HMAC eşleşiyor
// ============================================================

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import type { DocType } from './generate-doc'

// GÜVENLİK (sızma testi bulgusu): eski kodda sabit fallback secret
// ('gnc-pdf-share-2026-secret') vardı — kodu okuyan herkes geçerli
// paylaşım linki üretebilir, tüm fatura/teklif PDF'lerine erişebilirdi.
// Yeni yaklaşım: (1) env override, (2) kurulum başına rastgele secret
// db/.pdf-share-secret dosyasına yazılır ve oradan okunur.
const LEGACY_SECRET = 'gnc-pdf-share-2026-secret' // eski linkler için geçiş dönemi

function loadSecret(): string {
  const envSecret = process.env.PDF_SHARE_SECRET
  if (envSecret && envSecret.length >= 16) return envSecret
  try {
    const file = path.join(process.cwd(), 'db', '.pdf-share-secret')
    let existing: string | null = null
    try {
      existing = fs.readFileSync(file, 'utf8').trim()
    } catch {
      // Dosya yok — normal (ilk kurulum), aşağıda oluşturulur
    }
    if (existing && existing.length >= 32) return existing
    const generated = crypto.randomBytes(32).toString('hex')
    fs.writeFileSync(file, generated, { encoding: 'utf8', mode: 0o600 })
    return generated
  } catch {
    // Dosya sistemi yazılamadı — env yoksa legacy'ye düş (eski davranış)
    return LEGACY_SECRET
  }
}

const SECRET = loadSecret()
export const DEFAULT_SHARE_DAYS = 30

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
}

/** Yeni paylaşım token'ı üret (varsayılan 30 gün geçerli) */
export function createShareToken(type: DocType, docId: string, days: number = DEFAULT_SHARE_DAYS): {
  token: string
  exp: number
} {
  const exp = Date.now() + days * 24 * 60 * 60 * 1000
  const sig = sign(`${type}:${docId}:${exp}`)
  return { token: `${exp}.${sig}`, exp }
}

/** Token doğrula — geçerliyse true (kurulum secret'ı + geçiş dönemi legacy secret'ı) */
export function verifyShareToken(type: DocType, docId: string, token: string | null): boolean {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const expPart = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const exp = Number(expPart)
  if (!Number.isFinite(exp) || exp <= 0) return false
  // Süre dolmuş mu?
  if (Date.now() > exp) return false
  const payload = `${type}:${docId}:${exp}`
  // Önce kurulum secret'ı, sonra geçiş dönemi legacy secret'ı denenir
  for (const candidate of [SECRET, LEGACY_SECRET]) {
    const expected = crypto.createHmac('sha256', candidate).update(payload).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
  }
  return false
}

/** Paylaşım URL yolu (origin'siz — client window.location.origin ile birleştirir) */
export function buildSharePath(type: DocType, docId: string, days?: number): {
  path: string
  expiresAt: string
} {
  const { token, exp } = createShareToken(type, docId, days)
  return {
    path: `/api/public/docs/${type}/${docId}?t=${encodeURIComponent(token)}&exp=${exp}`,
    expiresAt: new Date(exp).toISOString(),
  }
}
