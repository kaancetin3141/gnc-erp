// ============================================================
// Herkese açık PDF paylaşım token'ı — stateless HMAC imzası
// Şema değişikliği gerektirmez: token = exp.sğraf
// token doğrulaması: exp henüz geçmemiş + HMAC eşleşiyor
// ============================================================

import crypto from 'crypto'
import type { DocType } from './generate-doc'

const SECRET = process.env.PDF_SHARE_SECRET || 'gnc-pdf-share-2026-secret'
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

/** Token doğrula — geçerliyse true */
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
  const expected = sign(`${type}:${docId}:${exp}`)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
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
