// ============================================================
// GERÇEK SOSYAL MEDYA API CLIENT'ları
//
// Her platform için gerçek API çağrıları yapar.
// Kullanıcı kendi API anahtarını girdiğinde gerçek hesabına yayar.
//
// Kullanım:
//   import { publishToTwitter } from './api-clients/twitter'
//   const result = await publishToTwitter({ accessToken, content, mediaUrls })
//
// Her fonksiyon aynı sonucu döner:
//   { success: boolean, externalId?, externalUrl?, errorMessage? }
// ============================================================

export interface PublishParams {
  accessToken: string
  // OAuth 2.0 PKCE kullanılan platformlar için refresh token
  refreshToken?: string
  // Bazı platformlar ek kimlik gerektirir (Twitter user_id, FB page_id vb.)
  apiKey?: string
  apiSecret?: string
  username?: string
  // İçerik
  content: string
  mediaUrls: string[]
  linkUrl?: string | null
}

export interface PublishResult {
  success: boolean
  externalId: string | null
  externalUrl: string | null
  errorMessage: string | null
  // Yeni token (refresh sonrası)
  newAccessToken?: string
  newRefreshToken?: string
  newExpiresAt?: Date
}

export interface VerifyResult {
  success: boolean
  handle?: string
  displayName?: string
  avatarUrl?: string
  followerCount?: number
  isVerified?: boolean
  errorMessage?: string
}
