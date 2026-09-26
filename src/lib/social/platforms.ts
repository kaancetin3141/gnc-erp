// ============================================================
// SOSYAL MEDYA PLATFORM TANIMLARI
//
// 11 platform: Twitter/X, Facebook, Instagram, LinkedIn,
// YouTube, TikTok, WhatsApp Business, Telegram, Pinterest,
// Reddit, Bluesky
// ============================================================

export type PlatformKey =
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
  | 'whatsapp'
  | 'telegram'
  | 'pinterest'
  | 'reddit'
  | 'bluesky'

export interface PlatformDef {
  key: PlatformKey
  label: string
  shortLabel: string
  gradient: string
  accent: string
  bgClass: string
  textClass: string
  emoji: string
  charLimit: number
  mediaTypes: ('image' | 'video' | 'link' | 'text' | 'carousel')[]
  maxMedia: number
  supportsHashtags: boolean
  supportsLinkPreview: boolean
  supportsScheduling: boolean
  supportsAnalytics: boolean
  supportsInbox: boolean
  description: string
}

export const PLATFORMS: Record<PlatformKey, PlatformDef> = {
  twitter: {
    key: 'twitter', label: 'Twitter / X', shortLabel: 'X',
    gradient: 'from-slate-700 to-black', accent: '#000000',
    bgClass: 'bg-slate-100 dark:bg-slate-800', textClass: 'text-slate-700 dark:text-slate-200',
    emoji: '𝕏', charLimit: 280,
    mediaTypes: ['image', 'video', 'link', 'text'], maxMedia: 4,
    supportsHashtags: true, supportsLinkPreview: true, supportsScheduling: true,
    supportsAnalytics: true, supportsInbox: true,
    description: 'Kısa metin, hızlı paylaşım, gündem takibi',
  },
  facebook: {
    key: 'facebook', label: 'Facebook', shortLabel: 'FB',
    gradient: 'from-blue-600 to-blue-700', accent: '#1877F2',
    bgClass: 'bg-blue-100 dark:bg-blue-950/40', textClass: 'text-blue-700 dark:text-blue-300',
    emoji: 'f', charLimit: 63206,
    mediaTypes: ['image', 'video', 'link', 'text', 'carousel'], maxMedia: 10,
    supportsHashtags: true, supportsLinkPreview: true, supportsScheduling: true,
    supportsAnalytics: true, supportsInbox: true,
    description: 'Sayfa yönetimi, gruplar, uzun içerik',
  },
  instagram: {
    key: 'instagram', label: 'Instagram', shortLabel: 'IG',
    gradient: 'from-purple-500 via-pink-500 to-amber-500', accent: '#E1306C',
    bgClass: 'bg-gradient-to-br from-purple-100 to-amber-100 dark:from-purple-950/40 dark:to-amber-950/40',
    textClass: 'text-pink-700 dark:text-pink-300',
    emoji: '📸', charLimit: 2200,
    mediaTypes: ['image', 'video', 'carousel'], maxMedia: 10,
    supportsHashtags: true, supportsLinkPreview: false, supportsScheduling: true,
    supportsAnalytics: true, supportsInbox: true,
    description: 'Görsel ağırlıklı, hashtag önemli, story/reel',
  },
  linkedin: {
    key: 'linkedin', label: 'LinkedIn', shortLabel: 'in',
    gradient: 'from-blue-700 to-blue-900', accent: '#0A66C2',
    bgClass: 'bg-blue-100 dark:bg-blue-950/40', textClass: 'text-blue-800 dark:text-blue-300',
    emoji: 'in', charLimit: 3000,
    mediaTypes: ['image', 'video', 'link', 'text'], maxMedia: 9,
    supportsHashtags: true, supportsLinkPreview: true, supportsScheduling: true,
    supportsAnalytics: true, supportsInbox: true,
    description: 'B2B networking, profesyonel içerik, iş ilanları',
  },
  youtube: {
    key: 'youtube', label: 'YouTube', shortLabel: 'YT',
    gradient: 'from-red-600 to-red-700', accent: '#FF0000',
    bgClass: 'bg-red-100 dark:bg-red-950/40', textClass: 'text-red-700 dark:text-red-300',
    emoji: '▶', charLimit: 5000,
    mediaTypes: ['video', 'link'], maxMedia: 1,
    supportsHashtags: true, supportsLinkPreview: true, supportsScheduling: true,
    supportsAnalytics: true, supportsInbox: true,
    description: 'Video paylaşımı, Shorts, kanal yönetimi',
  },
  tiktok: {
    key: 'tiktok', label: 'TikTok', shortLabel: 'TT',
    gradient: 'from-slate-900 via-pink-500 to-cyan-400', accent: '#000000',
    bgClass: 'bg-gradient-to-br from-slate-100 to-cyan-100 dark:from-slate-900 dark:to-cyan-950',
    textClass: 'text-slate-800 dark:text-cyan-300',
    emoji: '♪', charLimit: 2200,
    mediaTypes: ['video'], maxMedia: 1,
    supportsHashtags: true, supportsLinkPreview: false, supportsScheduling: true,
    supportsAnalytics: true, supportsInbox: true,
    description: 'Kısa video, trend sesler, hashtag kritik',
  },
  whatsapp: {
    key: 'whatsapp', label: 'WhatsApp Business', shortLabel: 'WA',
    gradient: 'from-green-500 to-emerald-600', accent: '#25D366',
    bgClass: 'bg-green-100 dark:bg-green-950/40', textClass: 'text-green-700 dark:text-green-300',
    emoji: '💬', charLimit: 65536,
    mediaTypes: ['image', 'video', 'link', 'text'], maxMedia: 1,
    supportsHashtags: false, supportsLinkPreview: true, supportsScheduling: false,
    supportsAnalytics: false, supportsInbox: true,
    description: 'Status, business mesajlaşma, müşteri desteği',
  },
  telegram: {
    key: 'telegram', label: 'Telegram', shortLabel: 'TG',
    gradient: 'from-sky-500 to-cyan-600', accent: '#0088CC',
    bgClass: 'bg-sky-100 dark:bg-sky-950/40', textClass: 'text-sky-700 dark:text-sky-300',
    emoji: '✈', charLimit: 4096,
    mediaTypes: ['image', 'video', 'link', 'text'], maxMedia: 10,
    supportsHashtags: false, supportsLinkPreview: true, supportsScheduling: true,
    supportsAnalytics: false, supportsInbox: true,
    description: 'Kanal yönetimi, bot entegrasyonu, broadcast',
  },
  pinterest: {
    key: 'pinterest', label: 'Pinterest', shortLabel: 'P',
    gradient: 'from-red-500 to-rose-600', accent: '#E60023',
    bgClass: 'bg-red-100 dark:bg-red-950/40', textClass: 'text-red-700 dark:text-red-300',
    emoji: '📌', charLimit: 500,
    mediaTypes: ['image', 'video'], maxMedia: 1,
    supportsHashtags: true, supportsLinkPreview: false, supportsScheduling: true,
    supportsAnalytics: true, supportsInbox: false,
    description: 'Görsel pin, board yönetimi, SEO odaklı',
  },
  reddit: {
    key: 'reddit', label: 'Reddit', shortLabel: 'R',
    gradient: 'from-orange-500 to-red-600', accent: '#FF4500',
    bgClass: 'bg-orange-100 dark:bg-orange-950/40', textClass: 'text-orange-700 dark:text-orange-300',
    emoji: '👽', charLimit: 40000,
    mediaTypes: ['image', 'video', 'link', 'text'], maxMedia: 1,
    supportsHashtags: false, supportsLinkPreview: true, supportsScheduling: false,
    supportsAnalytics: true, supportsInbox: true,
    description: 'Subreddit yönetimi, AMA, topluluk etkileşimi',
  },
  bluesky: {
    key: 'bluesky', label: 'Bluesky', shortLabel: 'BS',
    gradient: 'from-sky-400 to-blue-500', accent: '#0085FF',
    bgClass: 'bg-sky-100 dark:bg-sky-950/40', textClass: 'text-sky-700 dark:text-sky-300',
    emoji: '☁', charLimit: 300,
    mediaTypes: ['image', 'link', 'text'], maxMedia: 4,
    supportsHashtags: true, supportsLinkPreview: true, supportsScheduling: true,
    supportsAnalytics: false, supportsInbox: true,
    description: 'AT Protocol, merkeziyetsiz, açık sosyal ağ',
  },
}

export const ALL_PLATFORMS: PlatformKey[] = Object.keys(PLATFORMS) as PlatformKey[]
export const PLATFORM_LIST: PlatformDef[] = ALL_PLATFORMS.map((k) => PLATFORMS[k])

export function platformBadgeClass(p: PlatformKey): string {
  const def = PLATFORMS[p]
  return `${def.bgClass} ${def.textClass}`
}

// Hesabın genel profil linki — kartlardan tek tıkla platforma geçiş
export function platformProfileUrl(p: PlatformKey, handle: string): string {
  const clean = handle.replace(/^@/, '')
  switch (p) {
    case 'twitter': return `https://x.com/${clean}`
    case 'facebook': return `https://facebook.com/${clean}`
    case 'instagram': return `https://instagram.com/${clean}`
    case 'linkedin': return `https://linkedin.com/in/${clean}`
    case 'youtube': return `https://youtube.com/@${clean}`
    case 'tiktok': return `https://tiktok.com/@${clean}`
    case 'whatsapp': return `https://wa.me/${clean.replace(/\D/g, '')}`
    case 'telegram': return `https://t.me/${clean}`
    case 'pinterest': return `https://pinterest.com/${clean}`
    case 'reddit': return `https://reddit.com/user/${clean}`
    case 'bluesky': return `https://bsky.app/profile/${clean}`
    default: return `https://${clean}`
  }
}

// Token bitiş durumu — uyarı renkleri için
export function tokenExpiryStatus(expiresAt: string | null | undefined): 'none' | 'expired' | 'soon' | 'ok' {
  if (!expiresAt) return 'none'
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  if (diff < 7 * 24 * 60 * 60 * 1000) return 'soon' // 7 günden az
  return 'ok'
}

export function platformInfo(p: PlatformKey): string {
  const def = PLATFORMS[p]
  return `${def.label} · ${def.charLimit} karakter · ${def.description}`
}

export function truncateForPlatform(text: string, platform: PlatformKey): { text: string; truncated: boolean } {
  const def = PLATFORMS[platform]
  if (text.length <= def.charLimit) return { text, truncated: false }
  return { text: text.slice(0, def.charLimit - 3) + '…', truncated: true }
}

export function isCompatibleWith(post: {
  content: string
  mediaType: string
  mediaCount: number
  hasLink: boolean
}, platform: PlatformKey): { compatible: boolean; reason?: string } {
  const def = PLATFORMS[platform]
  if (post.content.length > def.charLimit) {
    return { compatible: false, reason: `${post.content.length}/${def.charLimit} karakter — limit aşıldı` }
  }
  if (post.mediaCount > def.maxMedia) {
    return { compatible: false, reason: `${post.mediaCount}/${def.maxMedia} medya — limit aşıldı` }
  }
  if (post.mediaType === 'video' && !def.mediaTypes.includes('video')) {
    return { compatible: false, reason: 'Bu platform video desteklemiyor' }
  }
  if (post.mediaType === 'image' && !def.mediaTypes.includes('image')) {
    return { compatible: false, reason: 'Bu platform görsel desteklemiyor' }
  }
  if (post.hasLink && !def.supportsLinkPreview && post.mediaType === 'link') {
    return { compatible: false, reason: 'Bu platform link önizleme desteklemiyor' }
  }
  return { compatible: true }
}
