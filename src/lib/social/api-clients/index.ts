// ============================================================
// PUBLISHER DISPATCHER — Platform'a göre doğru API çağırır
//
// Her platform için gerçek API client'ı var. Eğer hesap bağlantısı
// gerçek (authMethod !== 'mock') ise gerçek API çağrılır.
// Aksi halde mock publisher kullanılır.
// ============================================================

import type { PublishParams, PublishResult, VerifyResult } from './types'
import { publishToTwitter, verifyTwitterToken } from './twitter'
import { publishToFacebook, verifyFacebookToken } from './facebook'
import { publishToInstagram, verifyInstagramToken } from './instagram'
import { publishToLinkedIn, verifyLinkedInToken } from './linkedin'
import { publishToTelegram, verifyTelegramToken } from './telegram'
import { publishToReddit, verifyRedditToken } from './reddit'
import { publishToBluesky, verifyBlueskyToken, loginToBluesky } from './bluesky'
import type { PlatformKey } from '../platforms'

export interface PublishDispatcherParams extends PublishParams {
  platform: PlatformKey
  authMethod: 'mock' | 'oauth' | 'manual_token'
}

// ============================================================
// HATA ÇEVİRİCİ — Platform API'lerinin ham hata mesajlarını
// kullanıcı dostu Türkçe açıklamalara çevirir ve çözüm önerisi ekler.
// (kullanıcı raporu: "gönderi yayınlamıyor sebebi nedir" — ham hata
//  'credits depleted' UI'a hiç yansımıyordu)
// ============================================================
export function friendlyApiError(platform: PlatformKey, raw: string | null | undefined): string {
  if (!raw) return 'Bilinmeyen hata'
  const msg = raw.toLowerCase()

  // X (Twitter) API kredileri — HTTP 402 Payment Required (credits-depleted)
  if (msg.includes('credits depleted') || msg.includes('quota') || msg.includes('monthly post cap')) {
    return 'X API kredisi bitti (HTTP 402 — Ödeme Gerekli): token geçerli ama hesabın X API kredi bakiyesi sıfır. Bu bir kullanım kotası değil ödeme sorunudur — developer panelde "Usage" yerine Billing / API Credits bölümüne bakın. Ücretsiz planın aylık kredisi yenilenene kadar bekleyin, plan yükseltin ya da "Simülasyon olarak yayınla" kullanın. (Hesaplar sekmesindeki "Test Et" ile doğrulayabilirsiniz.)'
  }
  // Token geçersiz / süresi bitmiş
  if (
    msg.includes('invalid access token') || msg.includes('expired') ||
    msg.includes('unauthorized') || msg.includes('error validating access token') ||
    msg.includes('token revoked') || msg.includes('authentication')
  ) {
    return 'Erişim token\'ı geçersiz veya süresi dolmuş — Hesaplar sekmesinden bu hesabı yeniden bağla.'
  }
  // Yetki / izin eksik
  if (
    msg.includes('forbidden') || msg.includes('permission') || msg.includes('oauth2') && msg.includes('scope') ||
    msg.includes('not authorized') || msg.includes('( #200 )') || msg.includes('#200')
  ) {
    return 'Yetki eksik — token\'ın gönderi yayınlama izni yok. App\'in "write" izinlerini kontrol et ve hesabı yeniden bağla.'
  }
  // Duplicate content
  if (msg.includes('duplicate') || msg.includes('already been posted') || msg.includes('same content')) {
    return 'Aynı içerik yakın zamanda paylaşıldı — platform kopya gönderiyi reddediyor. Metni biraz değiştirip tekrar dene.'
  }
  // Rate limit
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429')) {
    return 'Hız limiti aşıldı — birkaç dakika bekleyip tekrar dene.'
  }
  // Instagram görsel zorunluluğu
  if (platform === 'instagram' && (msg.includes('media') || msg.includes('image') || msg.includes('görsel'))) {
    return 'Instagram görsel/video gerektirir — metin-only gönderi yayınlanamaz. Görsel ekleyip tekrar dene.'
  }
  // Ağ / DNS
  if (msg.includes('fetch failed') || msg.includes('network') || msg.includes('enotfound') || msg.includes('timeout')) {
    return 'Platform API\'sine ulaşılamıyor (ağ hatası) — internet bağlantısını ve DNS\'i kontrol et.'
  }
  return raw
}

export async function publishToRealPlatform(params: PublishDispatcherParams): Promise<PublishResult> {
  const { platform, authMethod, ...rest } = params

  // Mock hesap — gerçek API çağrısı yapma
  if (authMethod === 'mock' || !rest.accessToken) {
    return {
      success: false,
      externalId: null,
      externalUrl: null,
      errorMessage: 'Bu hesap mock — gerçek API çağrısı için "Gerçek Hesap Bağla" ile token girin',
    }
  }

  const result = await (async (): Promise<PublishResult> => {
    switch (platform) {
      case 'twitter': return publishToTwitter(rest)
      case 'facebook': return publishToFacebook(rest)
      case 'instagram': return publishToInstagram(rest)
      case 'linkedin': return publishToLinkedIn(rest)
      case 'telegram': return publishToTelegram(rest)
      case 'reddit': return publishToReddit(rest)
      case 'bluesky': return publishToBluesky(rest)
      // TODO: youtube, tiktok, whatsapp, pinterest — gerçek API client'ları eklenecek
      default:
        return {
          success: false,
          externalId: null,
          externalUrl: null,
          errorMessage: `${platform} platformu için gerçek API henüz eklenmedi — mock publisher kullanılıyor`,
        }
    }
  })()

  // Başarısız sonuçları kullanıcı dostu Türkçe mesaja çevir
  if (!result.success && result.errorMessage) {
    return { ...result, errorMessage: friendlyApiError(platform, result.errorMessage) }
  }
  return result
}

// Verify dispatcher — her platform için doğru verify fonksiyonu
export async function verifyPlatformAccount(
  platform: PlatformKey,
  accessToken: string,
  apiKey?: string,
  apiSecret?: string,
  username?: string,
): Promise<VerifyResult> {
  switch (platform) {
    case 'twitter': return verifyTwitterToken(accessToken)
    case 'facebook': return verifyFacebookToken(accessToken)
    case 'instagram': return verifyInstagramToken(accessToken)
    case 'linkedin': return verifyLinkedInToken(accessToken)
    case 'telegram': return verifyTelegramToken(accessToken, username)
    case 'reddit': return verifyRedditToken(accessToken, apiKey, apiSecret)
    case 'bluesky': return verifyBlueskyToken(accessToken, username || '')
    default:
      return { success: false, errorMessage: `${platform} için verify fonksiyonu yok` }
  }
}

// Re-export Bluesky login (App Password ile session açma)
export { loginToBluesky }
