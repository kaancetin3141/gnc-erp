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
