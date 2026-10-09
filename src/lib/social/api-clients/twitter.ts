// ============================================================
// TWITTER / X API v2 — Gerçek entegrasyon
//
// Twitter API v2, OAuth 2.0 PKCE akışı kullanır.
// Kullanıcı bir access token ile bağlanır, biz tweet atarız.
//
// Gereksinimler:
//   1. https://developer.twitter.com/ adresinden app oluştur
//   2. App permissions: Read and Write
//   3. OAuth 2.0 PKCE setup — callback URL'ini ekle
//   4. Kullanıcı OAuth ile bağlanır, access token alırız
//
// Doküman: https://developer.twitter.com/en/docs/twitter-api
// ============================================================

import type { PublishParams, PublishResult, VerifyResult } from './types'

const TWITTER_API = 'https://api.twitter.com/2'

export async function verifyTwitterToken(accessToken: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${TWITTER_API}/users/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      const err = await res.json()
      return { success: false, errorMessage: err.detail || err.title || `HTTP ${res.status}` }
    }
    const data = await res.json()
    return {
      success: true,
      handle: data.data?.username ? `@${data.data.username}` : data.data?.name,
      displayName: data.data?.name,
      followerCount: data.data?.public_metrics?.followers_count,
      isVerified: data.data?.verified,
      avatarUrl: data.data?.profile_image_url,
    }
  } catch (e) {
    return { success: false, errorMessage: e instanceof Error ? e.message : String(e) }
  }
}

export async function publishToTwitter(params: PublishParams): Promise<PublishResult> {
  const { accessToken, content, mediaUrls = [] } = params

  if (!accessToken) {
    return { success: false, externalId: null, externalUrl: null, errorMessage: 'Access token gerekli' }
  }

  // 1. Medya yükle (varsa)
  let mediaIds: (string | null)[] = []
  if (mediaUrls.length > 0 && mediaUrls.length <= 4) {
    mediaIds = await Promise.all(mediaUrls.slice(0, 4).map(uploadMediaToTwitter.bind(null, accessToken)))
    if (mediaIds.some((id) => !id)) {
      return { success: false, externalId: null, externalUrl: null, errorMessage: 'Medya yükleme başarısız' }
    }
    // Erken dönüş sonrası tüm id'ler non-null → daralt (string[] bekleniyor)
    mediaIds = mediaIds.filter((id): id is string => !!id)
  }

  // 2. Tweet at
  try {
    const body: Record<string, unknown> = { text: content }
    if (mediaIds.length > 0) body.media = { media_ids: mediaIds }

    const res = await fetch(`${TWITTER_API}/tweets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) {
      return {
        success: false,
        externalId: null,
        externalUrl: null,
        errorMessage: data.detail || data.title || `Twitter API hatası (HTTP ${res.status})`,
      }
    }

    const tweetId = data.data?.id
    const handle = params.username || 'i'
    return {
      success: true,
      externalId: tweetId,
      externalUrl: `https://twitter.com/i/web/status/${tweetId}`,
      errorMessage: null,
    }
  } catch (e) {
    return {
      success: false,
      externalId: null,
      externalUrl: null,
      errorMessage: e instanceof Error ? e.message : String(e),
    }
  }
}

// Twitter medya yükleme (v1.1 — multipart/form-data)
async function uploadMediaToTwitter(accessToken: string, mediaUrl: string): Promise<string | null> {
  try {
    // URL'den medyayı indir
    const mediaRes = await fetch(mediaUrl)
    if (!mediaRes.ok) return null
    const blob = await mediaRes.blob()

    // Twitter v1.1 media/upload endpoint
    const form = new FormData()
    form.append('media', blob)

    const res = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
      body: form,
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.media_id_string ?? null
  } catch {
    return null
  }
}
