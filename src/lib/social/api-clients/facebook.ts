// ============================================================
// FACEBOOK GRAPH API — Sayfaya post atma
//
// Facebook Graph API v19.0
// Kullanıcı kendi Facebook sayfasına post atmak için:
//   1. https://developers.facebook.com/ → app oluştur
//   2. Permissions: pages_manage_posts, pages_read_engagement
//   3. Kullanıcı OAuth ile bağlanır → user_access_token
//   4. /me/accounts ile page_access_token alırız
//   5. Sayfaya post atarız
//
// Doküman: https://developers.facebook.com/docs/graph-api
// ============================================================

import type { PublishParams, PublishResult, VerifyResult } from './types'

const FB_API = 'https://graph.facebook.com/v19.0'

export async function verifyFacebookToken(accessToken: string): Promise<VerifyResult> {
  try {
    // /me/accounts → sayfaları listele
    const res = await fetch(`${FB_API}/me/accounts?access_token=${accessToken}&fields=name,access_token,followers_count,picture`)
    if (!res.ok) {
      const err = await res.json()
      return { success: false, errorMessage: err.error?.message || `HTTP ${res.status}` }
    }
    const data = await res.json()
    if (!data.data?.length) {
      return { success: false, errorMessage: 'Bu kullanıcıya bağlı sayfa bulunamadı' }
    }
    const page = data.data[0]
    return {
      success: true,
      handle: page.name,
      displayName: page.name,
      followerCount: page.followers_count,
      avatarUrl: page.picture?.data?.url,
    }
  } catch (e) {
    return { success: false, errorMessage: e instanceof Error ? e.message : String(e) }
  }
}

export async function publishToFacebook(params: PublishParams): Promise<PublishResult> {
  const { accessToken, content, mediaUrls = [], username } = params

  if (!accessToken) {
    return { success: false, externalId: null, externalUrl: null, errorMessage: 'Access token gerekli' }
  }

  try {
    // 1. Page access token al
    const accountsRes = await fetch(`${FB_API}/me/accounts?access_token=${accessToken}&fields=name,access_token`)
    const accountsData = await accountsRes.json()
    if (!accountsData.data?.length) {
      return { success: false, externalId: null, externalUrl: null, errorMessage: 'Bağlı sayfa yok' }
    }
    // Username verilmişse onu seç, yoksa ilkini
    const page = username
      ? accountsData.data.find((p: { name?: string; username?: string }) => p.name === username || p.username === username)
      : accountsData.data[0]
    if (!page) {
      return { success: false, externalId: null, externalUrl: null, errorMessage: 'Sayfa bulunamadı: ' + username }
    }

    const pageId = page.id
    const pageAccessToken = page.access_token

    // 2. Post at
    const fields: Record<string, string> = { message: content }

    // Tek görsel — picture URL'i ile
    if (mediaUrls.length === 1 && mediaUrls[0].match(/\.(jpg|jpeg|png|gif|webp)/i)) {
      fields.url = mediaUrls[0]
    } else if (mediaUrls.length > 0) {
      // Çoklu görsel — önce uploaded_media ile yükle, sonra attached_media ile bağla
      // Şimdilik ilk görseli kullan (basit)
      fields.url = mediaUrls[0]
    }

    // Link varsa
    if (params.linkUrl) fields.link = params.linkUrl

    const postRes = await fetch(`${FB_API}/${pageId}/feed?access_token=${pageAccessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })

    const postData = await postRes.json()
    if (!postRes.ok || postData.error) {
      return {
        success: false,
        externalId: null,
        externalUrl: null,
        errorMessage: postData.error?.message || `Facebook API hatası (HTTP ${postRes.status})`,
      }
    }

    return {
      success: true,
      externalId: postData.id,
      externalUrl: `https://facebook.com/${postData.id.split('_')[0]}/posts/${postData.id.split('_')[1]}`,
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
