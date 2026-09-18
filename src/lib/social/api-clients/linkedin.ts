// ============================================================
// LINKEDIN API — Profil/Şirket sayfasına post
//
// LinkedIn Marketing API kullanır.
// Kullanıcı OAuth ile bağlanır → access token alırız.
// Profil veya şirket sayfasına post atabiliriz.
//
// Gereksinimler:
//   1. https://www.linkedin.com/developers/ → app oluştur
//   2. Products: "Share on LinkedIn", "Marketing Developer"
//   3. Permissions: w_member_social, r_organization_social, w_organization_social
//   4. OAuth callback URL'i ekle
//
// Doküman: https://learn.microsoft.com/en-us/linkedin/marketing/
// ============================================================

import type { PublishParams, PublishResult, VerifyResult } from './types'

const LI_API = 'https://api.linkedin.com/v2'

export async function verifyLinkedInToken(accessToken: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${LI_API}/userinfo`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      return { success: false, errorMessage: `LinkedIn token geçersiz (HTTP ${res.status})` }
    }
    const data = await res.json()
    return {
      success: true,
      handle: data.name || data.given_name,
      displayName: `${data.given_name} ${data.family_name}`.trim() || data.name,
      avatarUrl: data.picture,
      isVerified: data.email_verified,
    }
  } catch (e) {
    return { success: false, errorMessage: e instanceof Error ? e.message : String(e) }
  }
}

export async function publishToLinkedIn(params: PublishParams): Promise<PublishResult> {
  const { accessToken, content, mediaUrls = [], username } = params

  if (!accessToken) {
    return { success: false, externalId: null, externalUrl: null, errorMessage: 'Access token gerekli' }
  }

  try {
    // 1. Kullanıcı URN al
    const meRes = await fetch(`${LI_API}/userinfo`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    const meData = await meRes.json()
    if (!meRes.ok) {
      return { success: false, externalId: null, externalUrl: null, errorMessage: 'LinkedIn profil bilgisi alınamadı' }
    }
    const authorUrn = `urn:li:person:${meData.sub}`
    // Şirket sayfası (username parametre olarak verildiyse)
    // const authorUrn = username ? `urn:li:organization:${username}` : `urn:li:person:${meData.sub}`

    // 2. Post oluştur
    const body: Record<string, unknown> = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: mediaUrls.length > 0 ? 'IMAGE' : 'NONE',
          media: mediaUrls.slice(0, 9).map((url) => ({
            status: 'READY',
            description: { text: 'Image' },
            media: url,
          })),
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }

    const res = await fetch(`${LI_API}/ugcPosts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) {
      return {
        success: false,
        externalId: null,
        externalUrl: null,
        errorMessage: data.message || `LinkedIn API hatası (HTTP ${res.status})`,
      }
    }

    const postId = data.id || data.value?.id
    return {
      success: true,
      externalId: postId,
      externalUrl: `https://linkedin.com/feed/update/${postId}`,
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
