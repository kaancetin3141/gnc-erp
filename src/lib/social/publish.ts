// ============================================================
// PUBLISHER — Mock + Gerçek API dispatcher
//
// Mock publisher: gerçek API anahtarı olmayan hesaplar için
// simülasyon yapar (test/geliştirme amaçlı).
//
// Gerçek API: kullanıcı kendi access token'ını girdiğinde
// ilgili platform'un gerçek API'sine çağrı yapılır.
// ============================================================

import type { PlatformKey } from './platforms'
import { PLATFORMS } from './platforms'
import { publishToRealPlatform } from './api-clients'

export interface PublishInput {
  platform: PlatformKey
  handle: string
  content: string
  mediaUrls: string[]
  linkUrl?: string | null
  // Gerçek hesap bilgileri (varsa)
  authMethod?: 'mock' | 'oauth' | 'manual_token'
  accessToken?: string | null
  refreshToken?: string | null
  apiKey?: string | null
  apiSecret?: string | null
  username?: string | null
}

export interface PublishResult {
  success: boolean
  externalId: string | null
  externalUrl: string | null
  errorMessage: string | null
  initialLikes: number
  initialReach: number
  initialImpressions: number
  // Yeni token (refresh sonrası)
  newAccessToken?: string
  newRefreshToken?: string
  newExpiresAt?: Date
}

function generateId(platform: PlatformKey): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const len = platform === 'twitter' ? 19 : platform === 'instagram' ? 12 : 15
  let id = ''
  for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

function generateUrl(platform: PlatformKey, handle: string, id: string): string {
  switch (platform) {
    case 'twitter': return `https://twitter.com/${handle}/status/${id}`
    case 'facebook': return `https://facebook.com/${handle}/posts/${id}`
    case 'instagram': return `https://instagram.com/p/${id}`
    case 'linkedin': return `https://linkedin.com/posts/${handle}_${id}`
    case 'youtube': return `https://youtube.com/watch?v=${id}`
    case 'tiktok': return `https://tiktok.com/@${handle}/video/${id}`
    case 'whatsapp': return `https://wa.me/${handle}`
    case 'telegram': return `https://t.me/${handle}/${id}`
    case 'pinterest': return `https://pinterest.com/pin/${id}`
    case 'reddit': return `https://reddit.com/r/${handle}/comments/${id}`
    case 'bluesky': return `https://bsky.app/profile/${handle}/post/${id}`
  }
}

// Ana publisher — gerçek hesap varsa gerçek API, yoksa mock
export async function publishToPlatform(input: PublishInput): Promise<PublishResult> {
  // Gerçek hesap bilgileri varsa → gerçek API
  if (input.accessToken && input.authMethod && input.authMethod !== 'mock') {
    const result = await publishToRealPlatform({
      platform: input.platform,
      authMethod: input.authMethod,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken ?? undefined,
      apiKey: input.apiKey ?? undefined,
      apiSecret: input.apiSecret ?? undefined,
      username: input.username ?? undefined,
      content: input.content,
      mediaUrls: input.mediaUrls,
      linkUrl: input.linkUrl,
    })

    return {
      ...result,
      initialLikes: result.success ? Math.floor(Math.random() * 50) + 5 : 0,
      initialReach: result.success ? Math.floor(Math.random() * 1000) + 200 : 0,
      initialImpressions: result.success ? Math.floor(Math.random() * 2500) + 500 : 0,
    }
  }

  // Mock publisher — fallback
  const def = PLATFORMS[input.platform]

  // Karakter limit kontrolü
  if (input.content.length > def.charLimit) {
    return {
      success: false,
      externalId: null,
      externalUrl: null,
      errorMessage: `Karakter limiti aşıldı (${input.content.length}/${def.charLimit})`,
      initialLikes: 0,
      initialReach: 0,
      initialImpressions: 0,
    }
  }

  // Medya tip kontrolü
  if (input.mediaUrls.length > def.maxMedia) {
    return {
      success: false,
      externalId: null,
      externalUrl: null,
      errorMessage: `Medya limiti aşıldı (${input.mediaUrls.length}/${def.maxMedia})`,
      initialLikes: 0,
      initialReach: 0,
      initialImpressions: 0,
    }
  }

  await new Promise((r) => setTimeout(r, 200 + Math.random() * 600))

  if (Math.random() < 0.02) {
    return {
      success: false,
      externalId: null,
      externalUrl: null,
      errorMessage: 'Rate limit aşıldı — biraz bekleyip tekrar deneyin',
      initialLikes: 0,
      initialReach: 0,
      initialImpressions: 0,
    }
  }

  const externalId = generateId(input.platform)
  const externalUrl = generateUrl(input.platform, input.handle, externalId)

  const baseEngagement = {
    twitter: { likes: 50, reach: 500, impressions: 1500 },
    facebook: { likes: 30, reach: 800, impressions: 2000 },
    instagram: { likes: 100, reach: 1200, impressions: 3000 },
    linkedin: { likes: 20, reach: 400, impressions: 1000 },
    youtube: { likes: 80, reach: 2000, impressions: 5000 },
    tiktok: { likes: 200, reach: 3000, impressions: 8000 },
    whatsapp: { likes: 0, reach: 100, impressions: 100 },
    telegram: { likes: 10, reach: 500, impressions: 800 },
    pinterest: { likes: 40, reach: 1500, impressions: 2500 },
    reddit: { likes: 15, reach: 600, impressions: 1200 },
    bluesky: { likes: 25, reach: 300, impressions: 700 },
  }[input.platform]

  const variance = 0.5 + Math.random()

  return {
    success: true,
    externalId,
    externalUrl,
    errorMessage: null,
    initialLikes: Math.floor(baseEngagement.likes * variance),
    initialReach: Math.floor(baseEngagement.reach * variance),
    initialImpressions: Math.floor(baseEngagement.impressions * variance),
  }
}

// Inbox mock üretici
export function generateMockInboxMessage(platform: PlatformKey, handle: string) {
  const senders = [
    { name: 'Ahmet Yılmaz', handle: '@ahmetyilmaz' },
    { name: 'Zeynep Kara', handle: '@zeynepekara' },
    { name: 'Mehmet Demir', handle: '@mehmetdemir' },
    { name: 'Ayşe Çelik', handle: '@aysecelik' },
    { name: 'Can Yıldız', handle: '@canyildiz' },
    { name: 'Elif Şahin', handle: '@elifsahin' },
  ]
  const sender = senders[Math.floor(Math.random() * senders.length)]
  const types: ('dm' | 'comment' | 'mention' | 'review')[] = ['dm', 'comment', 'mention', 'review']
  const type = types[Math.floor(Math.random() * types.length)]
  const contents = [
    'Merhaba! Ürünleriniz hakkında bilgi alabilir miyim?',
    'Harika bir paylaşım, teşekkürler! 👏',
    'Fiyatlarınız nedir?',
    'Bu konuda daha fazla detay verir misiniz?',
    'Çok beğendim, takipteyim! 🔔',
    'Stokta var mı acaba?',
    'Kargo ne kadar sürede gelir?',
    'Bu çok ilginç, paylaşacağım 🙌',
  ]
  const content = contents[Math.floor(Math.random() * contents.length)]
  const priorities: ('dusuk' | 'normal' | 'yuksek' | 'acil')[] = ['normal', 'normal', 'normal', 'yuksek', 'acil']
  const priority = priorities[Math.floor(Math.random() * priorities.length)]

  return {
    platform,
    senderName: sender.name,
    senderHandle: sender.handle,
    senderAvatar: null,
    type,
    content,
    mediaUrls: null,
    parentId: null,
    postExternalId: null,
    postUrl: null,
    isRead: Math.random() < 0.3,
    isReplied: false,
    replyText: null,
    repliedAt: null,
    priority,
    tags: [],
    externalCreatedAt: new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString(),
  }
}
