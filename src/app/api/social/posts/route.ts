import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { ALL_PLATFORMS } from '@/lib/social/platforms'
import { writeAuditLog } from '@/lib/auth'
import { publishToPlatform } from '@/lib/social/publish'
import type { PlatformKey } from '@/lib/social/platforms'

// GET — post listesi (filtreli)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.view')) return err('Sosyal medya görüntüleme yetkiniz yok', 403)

  const url = new URL(req.url)
  const status = url.searchParams.get('status') // taslak | zamanlandi | yayinlandi | basarisiz | iptal
  const platform = url.searchParams.get('platform') // PlatformKey
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)

  const where: { tenantId: string; status?: string; platforms?: { has: string } } = {
    tenantId: user!.tenantId,
  }
  if (status) where.status = status
  if (platform && ALL_PLATFORMS.includes(platform as PlatformKey)) {
    where.platforms = { has: platform }
  }

  const posts = await db.socialPost.findMany({
    where,
    include: {
      author: { select: { id: true, name: true } },
      targets: {
        include: {
          account: { select: { handle: true, displayName: true, avatarUrl: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  })

  return ok(posts.map((p) => ({
    id: p.id,
    tenantId: p.tenantId,
    authorId: p.authorId,
    author: p.author,
    content: p.content,
    mediaUrls: JSON.parse(p.mediaUrls || '[]'),
    mediaType: p.mediaType,
    linkUrl: p.linkUrl,
    linkPreview: p.linkPreview ? JSON.parse(p.linkPreview) : null,
    hashtags: p.hashtags ? JSON.parse(p.hashtags) : [],
    mentions: p.mentions ? JSON.parse(p.mentions) : [],
    platforms: JSON.parse(p.platforms || '[]'),
    perPlatformContent: JSON.parse(p.perPlatformContent || '{}'),
    status: p.status,
    scheduledAt: p.scheduledAt,
    publishedAt: p.publishedAt,
    campaignName: p.campaignName,
    notes: p.notes,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    targets: p.targets.map((t) => ({
      id: t.id,
      postId: t.postId,
      accountId: t.accountId,
      platform: t.platform,
      externalId: t.externalId,
      externalUrl: t.externalUrl,
      status: t.status,
      errorMessage: t.errorMessage,
      publishedAt: t.publishedAt,
      likes: t.likes,
      comments: t.comments,
      shares: t.shares,
      views: t.views,
      reach: t.reach,
      impressions: t.impressions,
      lastSyncedAt: t.lastSyncedAt,
      account: t.account,
    })),
  })))
}

// POST — yeni post oluştur (taslak veya zamanlandı, opsiyonel hemen yayınla)
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.manage')) return err('Sosyal medya yönetme yetkiniz yok', 403)

  const body = await req.json().catch(() => ({}))
  const {
    content, mediaUrls, mediaType, linkUrl, linkPreview,
    hashtags, mentions, platforms, perPlatformContent,
    scheduledAt, publishNow, campaignName, notes,
  } = body as {
    content: string
    mediaUrls?: string[]
    mediaType?: string
    linkUrl?: string
    linkPreview?: { title: string; description: string; image: string }
    hashtags?: string[]
    mentions?: string[]
    platforms: string[]
    perPlatformContent?: Record<string, string>
    scheduledAt?: string
    publishNow?: boolean
    campaignName?: string
    notes?: string
  }

  if (!content?.trim()) return err('İçerik gerekli', 400)
  if (!platforms?.length) return err('En az bir platform seçin', 400)
  for (const p of platforms) {
    if (!ALL_PLATFORMS.includes(p as PlatformKey)) {
      return err(`Geçersiz platform: ${p}`, 400)
    }
  }

  // Hesapları kontrol et — seçili platformlarda bağlı hesap olmalı
  const accounts = await db.socialAccount.findMany({
    where: {
      tenantId: user!.tenantId,
      isActive: true,
      platform: { in: platforms },
    },
  })
  if (accounts.length === 0) {
    return err('Seçili platformlar için bağlı hesap yok. Önce hesap bağlayın.', 400)
  }

  // Hemen yayınla veya zamanla
  const isPublishNow = publishNow === true
  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null
  const status: string = isPublishNow ? 'yayinlandi' : scheduledDate ? 'zamanlandi' : 'taslak'

  // Post oluştur
  const post = await db.socialPost.create({
    data: {
      tenantId: user!.tenantId,
      authorId: user!.id,
      content: content.trim(),
      mediaUrls: JSON.stringify(mediaUrls ?? []),
      mediaType: mediaType ?? 'text',
      linkUrl: linkUrl ?? null,
      linkPreview: linkPreview ? JSON.stringify(linkPreview) : null,
      hashtags: hashtags ? JSON.stringify(hashtags) : null,
      mentions: mentions ? JSON.stringify(mentions) : null,
      platforms: JSON.stringify(platforms),
      perPlatformContent: JSON.stringify(perPlatformContent ?? {}),
      status,
      scheduledAt: scheduledDate,
      publishedAt: isPublishNow ? new Date() : null,
      campaignName: campaignName ?? null,
      notes: notes ?? null,
    },
  })

  // Her hesap için target oluştur
  const targetData = accounts.map((a) => ({
    postId: post.id,
    accountId: a.id,
    platform: a.platform,
    status: isPublishNow ? 'bekliyor' : (scheduledDate ? 'bekliyor' : 'bekliyor'),
  }))
  await db.socialPostTarget.createMany({ data: targetData })

  // Hemen yayınla isteği — her platforma paralel gönder
  if (isPublishNow) {
    await Promise.all(accounts.map(async (account) => {
      const perPlatformText = perPlatformContent?.[account.platform] ?? content
      const result = await publishToPlatform({
        platform: account.platform as PlatformKey,
        handle: account.handle,
        content: perPlatformText,
        mediaUrls: mediaUrls ?? [],
        linkUrl: linkUrl ?? null,
        // Gerçek hesap bilgileri (varsa)
        authMethod: account.authMethod as 'mock' | 'oauth' | 'manual_token',
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        apiKey: account.apiKey,
        apiSecret: account.apiSecret,
        username: account.username,
      })

      const updateData: Record<string, unknown> = {
        status: result.success ? 'yayinlandi' : 'basarisiz',
        externalId: result.externalId,
        externalUrl: result.externalUrl,
        errorMessage: result.errorMessage,
        publishedAt: result.success ? new Date() : null,
        likes: result.initialLikes,
        reach: result.initialReach,
        impressions: result.initialImpressions,
        lastSyncedAt: new Date(),
      }
      // Eğer refresh sonrası yeni token geldiyse kaydet
      if (result.newAccessToken) updateData.accessToken = result.newAccessToken
      if (result.newRefreshToken) updateData.refreshToken = result.newRefreshToken
      if (result.newExpiresAt) updateData.tokenExpiresAt = result.newExpiresAt

      await db.socialPostTarget.updateMany({
        where: { postId: post.id, accountId: account.id },
        data: updateData,
      })
    }))

    // Post'un status'unu güncelle (en az 1 başarılı ise yayinlandi)
    const successCount = await db.socialPostTarget.count({
      where: { postId: post.id, status: 'yayinlandi' },
    })
    const failedCount = await db.socialPostTarget.count({
      where: { postId: post.id, status: 'basarisiz' },
    })
    const finalStatus = successCount > 0 ? 'yayinlandi' : (failedCount === accounts.length ? 'basarisiz' : 'yayinlandi')
    await db.socialPost.update({ where: { id: post.id }, data: { status: finalStatus, publishedAt: new Date() } })
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'social.post.create',
    entity: 'social_post',
    entityId: post.id,
    after: { platforms, status, scheduledAt: scheduledDate, publishNow: isPublishNow },
  })

  return ok({ id: post.id, status, publishedAt: isPublishNow ? new Date() : null }, 201)
}
