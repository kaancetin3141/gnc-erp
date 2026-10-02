// ============================================================
// BLUESKY AT PROTOCOL — Post atma
//
// Bluesky, merkeziyetsiz AT Protocol kullanır.
// OAuth 2.0 veya App Password ile bağlanılabilir.
//
// Gereksinimler:
//   1. https://bsky.app/ → hesap oluştur
//   2. https://bsky.app/settings/app-passwords → app password oluştur
//   3. Kullanıcı adı (örn: gnccrm.bsky.social) + app password
//
// Doküman: https://atproto.com/
// ============================================================

import type { PublishParams, PublishResult, VerifyResult } from './types'

const BSKY_API = 'https://bsky.social/xrpc'

export async function verifyBlueskyToken(accessToken: string, username: string): Promise<VerifyResult> {
  try {
    // Bluesky uses JWT tokens. Access token = JWT.
    // /com.atproto.server.getSession → user info
    const res = await fetch(`${BSKY_API}/com.atproto.server.getSession`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      return { success: false, errorMessage: `Bluesky token geçersiz (HTTP ${res.status})` }
    }
    const data = await res.json()
    return {
      success: true,
      handle: data.handle,
      displayName: data.email || data.handle,
      isVerified: false,
    }
  } catch (e) {
    return { success: false, errorMessage: e instanceof Error ? e.message : String(e) }
  }
}

// App password ile session aç → access token al
export async function loginToBluesky(username: string, appPassword: string): Promise<{ accessToken: string | null; did: string | null; error?: string }> {
  try {
    const res = await fetch(`${BSKY_API}/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: username,
        password: appPassword,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      return { accessToken: null, did: null, error: data.message || data.error || `HTTP ${res.status}` }
    }
    return {
      accessToken: data.accessJwt,
      did: data.did,
    }
  } catch (e) {
    return { accessToken: null, did: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function publishToBluesky(params: PublishParams): Promise<PublishResult> {
  const { accessToken, content, mediaUrls = [], username } = params

  if (!accessToken) {
    return { success: false, externalId: null, externalUrl: null, errorMessage: 'Access token gerekli' }
  }

  try {
    // DID al
    const sessionRes = await fetch(`${BSKY_API}/com.atproto.server.getSession`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    const sessionData = await sessionRes.json()
    if (!sessionRes.ok) {
      return { success: false, externalId: null, externalUrl: null, errorMessage: 'Oturum bilgisi alınamadı' }
    }
    const did = sessionData.did

    // Post record oluştur
    const now = new Date().toISOString()
    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text: content,
      createdAt: now,
    }

    // Embed görsel varsa
    if (mediaUrls.length > 0) {
      // Önce görselleri yükle
      const uploadedBlobs = await Promise.all(mediaUrls.slice(0, 4).map(async (url) => {
        try {
          const imgRes = await fetch(url)
          const blob = await imgRes.blob()
          const uploadRes = await fetch(`${BSKY_API}/com.atproto.repo.uploadBlob`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': imgRes.headers.get('Content-Type') || 'image/jpeg',
            },
            body: blob,
          })
          const uploadData = await uploadRes.json()
          return uploadRes.ok ? uploadData.blob : null
        } catch {
          return null
        }
      }))

      const validBlobs = uploadedBlobs.filter((b) => b !== null)
      if (validBlobs.length > 0) {
        record.embed = {
          $type: 'app.bsky.embed.images',
          images: validBlobs.map((blob) => ({
            alt: '',
            image: blob,
          })),
        }
      }
    }

    // Record oluştur
    const createRes = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: did,
        collection: 'app.bsky.feed.post',
        record,
      }),
    })
    const createData = await createRes.json()
    if (!createRes.ok) {
      return { success: false, externalId: null, externalUrl: null, errorMessage: createData.message || createData.error || `HTTP ${createRes.status}` }
    }

    const rkey = createData.uri.split('/').pop()
    const userHandle = username?.replace(/^@/, '') || sessionData.handle
    return {
      success: true,
      externalId: rkey,
      externalUrl: `https://bsky.app/profile/${userHandle}/post/${rkey}`,
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
