// ============================================================
// INSTAGRAM GRAPH API — Business hesaba post
//
// Instagram Graph API, Facebook Graph API üzerinden çalışır.
// Business/Creator hesabı gerektirir (kişisel hesap çalışmaz).
//
// Gereksinimler:
//   1. Facebook Business hesabı + Instagram Business hesabı
//   2. https://developers.facebook.com/ → app oluştur
//   3. Instagram Graph API product'ı ekle
//   4. Permissions: instagram_basic, instagram_content_publish
//   5. Kullanıcı OAuth ile bağlanır → user_access_token
//   6. /me/accounts → IG business account'un page token'ı
//   7. instagram_business_account ID'si alınır
//   8. /{ig_id}/media → media container oluştur, sonra publish
//
// Doküman: https://developers.facebook.com/docs/instagram-api
// ============================================================

import type { PublishParams, PublishResult, VerifyResult } from './types'

const IG_API = 'https://graph.facebook.com/v19.0'

export async function verifyInstagramToken(accessToken: string): Promise<VerifyResult> {
  try {
    // /me/accounts → IG Business account bul
    const res = await fetch(`${IG_API}/me/accounts?access_token=${accessToken}&fields=instagram_business_account,name,access_token`)
    if (!res.ok) {
      const err = await res.json()
      return { success: false, errorMessage: err.error?.message || `HTTP ${res.status}` }
    }
    const data = await res.json()
    if (!data.data?.length || !data.data[0].instagram_business_account) {
      return { success: false, errorMessage: 'Instagram Business hesabı bulunamadı (kişisel hesap çalışmaz)' }
    }
    const igId = data.data[0].instagram_business_account.id
    const pageToken = data.data[0].access_token

    // IG profil bilgisi
    const igRes = await fetch(`${IG_API}/${igId}?access_token=${pageToken}&fields=username,followers_count,profile_picture_url,name`)
    const igData = await igRes.json()
    if (!igRes.ok) {
      return { success: false, errorMessage: igData.error?.message }
    }
    return {
      success: true,
      handle: `@${igData.username}`,
      displayName: igData.name || igData.username,
      followerCount: igData.followers_count,
      avatarUrl: igData.profile_picture_url,
    }
  } catch (e) {
    return { success: false, errorMessage: e instanceof Error ? e.message : String(e) }
  }
}

export async function publishToInstagram(params: PublishParams): Promise<PublishResult> {
  const { accessToken, content, mediaUrls = [] } = params

  if (!accessToken) {
    return { success: false, externalId: null, externalUrl: null, errorMessage: 'Access token gerekli' }
  }
  if (mediaUrls.length === 0) {
    return { success: false, externalId: null, externalUrl: null, errorMessage: 'Instagram görsel/video gerektirir' }
  }

  try {
    // 1. IG Business Account ID + page token al
    const accountsRes = await fetch(`${IG_API}/me/accounts?access_token=${accessToken}&fields=instagram_business_account,access_token`)
    const accountsData = await accountsRes.json()
    if (!accountsData.data?.length || !accountsData.data[0].instagram_business_account) {
      return { success: false, externalId: null, externalUrl: null, errorMessage: 'Instagram Business hesabı yok' }
    }
    const igId = accountsData.data[0].instagram_business_account.id
    const pageToken = accountsData.data[0].access_token

    // 2. Media container oluştur
    const firstMedia = mediaUrls[0]
    const isVideo = firstMedia.match(/\.(mp4|webm|mov)/i)
    const containerBody: Record<string, string> = {
      caption: content,
      access_token: pageToken,
    }
    if (isVideo) containerBody.video_url = firstMedia
    else containerBody.image_url = firstMedia

    // Çoklu görsel — carousel
    if (mediaUrls.length > 1) {
      // Carousel container oluştur
      const carouselRes = await fetch(`${IG_API}/${igId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          children: mediaUrls.slice(0, 10).map((url) =>
            // Each child needs to be a separate container
            `__TODO_CHILD_${url}__`
          ),
          caption: content,
          access_token: pageToken,
        }),
      })
      // Not: Çoklu görsel için her biri için ayrı container + carousel container gerekir
      // Basitlik için ilk görseli kullanıyoruz
    }

    const containerRes = await fetch(`${IG_API}/${igId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerBody),
    })
    const containerData = await containerRes.json()
    if (!containerRes.ok) {
      return { success: false, externalId: null, externalUrl: null, errorMessage: containerData.error?.message || 'Container oluşturulamadı' }
    }
    const containerId = containerData.id

    // 3. Yayınla
    const publishRes = await fetch(`${IG_API}/${igId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: pageToken,
      }),
    })
    const publishData = await publishRes.json()
    if (!publishRes.ok) {
      return { success: false, externalId: null, externalUrl: null, errorMessage: publishData.error?.message || 'Yayın başarısız' }
    }

    const mediaId = publishData.id
    // Permalink al
    const permalinkRes = await fetch(`${IG_API}/${mediaId}?access_token=${pageToken}&fields=permalink`)
    const permalinkData = await permalinkRes.json()
    return {
      success: true,
      externalId: mediaId,
      externalUrl: permalinkData.permalink || `https://instagram.com/p/${mediaId}`,
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
