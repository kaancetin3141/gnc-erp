// ============================================================
// REDDIT API — Subreddit'e post
//
// Reddit OAuth 2.0 kullanır (permanent token).
// Kullanıcı OAuth ile bağlanır → access token alırız.
//
// Gereksinimler:
//   1. https://www.reddit.com/prefs/apps → create app
//   2. App type: "script" (kişisel kullanım için)
//   3. Permissions: identity, submit, read
//   4. OAuth callback URL'i ekle
//
// Doküman: https://www.reddit.com/dev/api/
// ============================================================

import type { PublishParams, PublishResult, VerifyResult } from './types'

export async function verifyRedditToken(accessToken: string, apiKey?: string, apiSecret?: string): Promise<VerifyResult> {
  try {
    // Reddit Basic Auth: client_id:secret + Bearer token
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    const res = await fetch('https://oauth.reddit.com/api/v1/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'GNC-CRM/1.0',
      },
    })
    if (!res.ok) return { success: false, errorMessage: `Reddit token geçersiz (HTTP ${res.status})` }
    const data = await res.json()
    return {
      success: true,
      handle: `u/${data.name}`,
      displayName: data.name,
      isVerified: data.is_gold,
      followerCount: data.total_karma,
    }
  } catch (e) {
    return { success: false, errorMessage: e instanceof Error ? e.message : String(e) }
  }
}

export async function publishToReddit(params: PublishParams): Promise<PublishResult> {
  const { accessToken, content, mediaUrls = [], username } = params

  if (!accessToken) {
    return { success: false, externalId: null, externalUrl: null, errorMessage: 'Access token gerekli' }
  }
  if (!username) {
    return { success: false, externalId: null, externalUrl: null, errorMessage: 'Subreddit adı gerekli (username alanına)' }
  }

  const subreddit = username.startsWith('r/') ? username.slice(2) : username

  try {
    // Link post mu yoksa metin post mu?
    const hasMediaUrl = mediaUrls.length > 0
    const body = new URLSearchParams({
      kind: hasMediaUrl ? 'link' : 'self',
      sr: `r/${subreddit}`,
      title: content.split('\n')[0].slice(0, 300) || 'Post',
      api_type: 'json',
    })

    if (hasMediaUrl) {
      body.set('url', mediaUrls[0])
    } else {
      body.set('text', content)
    }

    if (params.linkUrl) body.set('url', params.linkUrl)

    const res = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'GNC-CRM/1.0',
      },
      body: body.toString(),
    })

    const data = await res.json()
    if (!res.ok || data.json?.errors?.length > 0) {
      const errMsg = data.json?.errors?.[0]?.[1] || `Reddit API hatası (HTTP ${res.status})`
      return { success: false, externalId: null, externalUrl: null, errorMessage: errMsg }
    }

    const postId = data.json?.data?.id
    return {
      success: true,
      externalId: postId,
      externalUrl: `https://reddit.com/r/${subreddit}/comments/${postId}`,
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
