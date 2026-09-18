// ============================================================
// SOSYAL MEDYA TİPLERİ
// Backend (Prisma) ve frontend arasında paylaşılan tipler
// ============================================================

import type { PlatformKey } from './platforms'

export interface SocialAccountItem {
  id: string
  tenantId: string
  platform: PlatformKey
  handle: string
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  followerCount: number
  followingCount: number
  postCount: number
  isVerified: boolean
  isActive: boolean
  connectedAt: string
  lastSyncedAt: string | null
  authMethod: 'mock' | 'oauth' | 'manual_token'
  hasAccessToken: boolean
  hasApiKeys: boolean
  scopes: string[]
}

export interface SocialPostTargetItem {
  id: string
  postId: string
  accountId: string
  platform: PlatformKey
  externalId: string | null
  externalUrl: string | null
  status: 'bekliyor' | 'yayinlandi' | 'basarisiz' | 'silindi'
  errorMessage: string | null
  publishedAt: string | null
  likes: number
  comments: number
  shares: number
  views: number
  reach: number
  impressions: number
  lastSyncedAt: string | null
  account?: { handle: string; displayName: string | null; avatarUrl: string | null }
}

export interface SocialPostItem {
  id: string
  tenantId: string
  authorId: string
  author?: { id: string; name: string }
  content: string
  mediaUrls: string[] // parsed from JSON
  mediaType: 'text' | 'image' | 'video' | 'link' | 'carousel'
  linkUrl: string | null
  linkPreview: { title: string; description: string; image: string } | null
  hashtags: string[]
  mentions: string[]
  platforms: PlatformKey[]
  perPlatformContent: Partial<Record<PlatformKey, string>>
  status: 'taslak' | 'zamanlandi' | 'yayinlandi' | 'basarisiz' | 'iptal'
  scheduledAt: string | null
  publishedAt: string | null
  campaignName: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  targets?: SocialPostTargetItem[]
}

export interface SocialInboxItem {
  id: string
  tenantId: string
  accountId: string
  account?: SocialAccountItem
  platform: PlatformKey
  senderName: string
  senderHandle: string | null
  senderAvatar: string | null
  type: 'dm' | 'comment' | 'mention' | 'review' | 'story_reply'
  content: string
  mediaUrls: string[] | null
  parentId: string | null
  postExternalId: string | null
  postUrl: string | null
  isRead: boolean
  isReplied: boolean
  replyText: string | null
  repliedAt: string | null
  priority: 'dusuk' | 'normal' | 'yuksek' | 'acil'
  tags: string[] | null
  externalCreatedAt: string | null
  receivedAt: string
}

export interface SocialCalendarItem {
  id: string
  scheduledAt: string
  content: string
  platforms: PlatformKey[]
  status: string
  campaignName: string | null
  mediaType: string
}

export interface SocialAnalyticsSummary {
  totalFollowers: number
  totalPosts: number
  totalEngagement: number
  totalReach: number
  totalImpressions: number
  perPlatform: {
    platform: PlatformKey
    followers: number
    posts: number
    likes: number
    comments: number
    shares: number
    views: number
    reach: number
    engagementRate: number
  }[]
  recentPosts: SocialPostItem[]
  weeklyTrend: { date: string; posts: number; engagement: number }[]
}
