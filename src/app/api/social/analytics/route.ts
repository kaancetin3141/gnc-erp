import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { PLATFORMS, ALL_PLATFORMS } from '@/lib/social/platforms'
import type { PlatformKey } from '@/lib/social/platforms'

// GET — analytics özeti (follower toplam, engagement, per-platform breakdown)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.view')) return err('Sosyal medya görüntüleme yetkiniz yok', 403)

  // Hesapları ve metrikleri topla
  const accounts = await db.socialAccount.findMany({
    where: { tenantId: user!.tenantId, isActive: true },
  })

  const posts = await db.socialPost.findMany({
    where: { tenantId: user!.tenantId, status: 'yayinlandi' },
    include: {
      targets: true,
      author: { select: { id: true, name: true } },
    },
    orderBy: { publishedAt: 'desc' },
    take: 20,
  })

  // Tüm hesaplar için toplam takipçi
  const totalFollowers = accounts.reduce((s, a) => s + a.followerCount, 0)
  const totalPosts = posts.length

  // Per-platform aggregation
  const perPlatform = ALL_PLATFORMS.map((p: PlatformKey) => {
    const platAccounts = accounts.filter((a) => a.platform === p)
    const platTargets = posts.flatMap((post) => post.targets.filter((t) => t.platform === p))
    const likes = platTargets.reduce((s, t) => s + t.likes, 0)
    const comments = platTargets.reduce((s, t) => s + t.comments, 0)
    const shares = platTargets.reduce((s, t) => s + t.shares, 0)
    const views = platTargets.reduce((s, t) => s + t.views, 0)
    const reach = platTargets.reduce((s, t) => s + t.reach, 0)
    const followers = platAccounts.reduce((s, a) => s + a.followerCount, 0)
    const engagement = likes + comments + shares
    const engagementRate = reach > 0 ? (engagement / reach) * 100 : 0
    return {
      platform: p,
      followers,
      posts: platTargets.length,
      likes,
      comments,
      shares,
      views,
      reach,
      engagement,
      engagementRate,
    }
  }).filter((p) => p.posts > 0 || p.followers > 0)

  // Toplamlar
  const totalEngagement = perPlatform.reduce((s, p) => s + p.engagement, 0)
  const totalReach = perPlatform.reduce((s, p) => s + p.reach, 0)
  const totalImpressions = perPlatform.reduce((s, p) => s + p.views, 0)

  // Haftalık trend (son 7 gün, yayınlanan post sayısı + engagement)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentPostsLast7d = posts.filter((p) => p.publishedAt && new Date(p.publishedAt) >= sevenDaysAgo)
  const weeklyTrend: { date: string; posts: number; engagement: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    const dayPosts = recentPostsLast7d.filter((p) => {
      if (!p.publishedAt) return false
      const pd = new Date(p.publishedAt)
      return pd >= dayStart && pd < dayEnd
    })
    const dayEng = dayPosts.flatMap((p) => p.targets).reduce((s, t) => s + t.likes + t.comments + t.shares, 0)
    weeklyTrend.push({
      date: dayStart.toISOString().slice(0, 10),
      posts: dayPosts.length,
      engagement: dayEng,
    })
  }

  return ok({
    totalFollowers,
    totalPosts,
    totalEngagement,
    totalReach,
    totalImpressions,
    perPlatform,
    weeklyTrend,
    recentPosts: posts.slice(0, 10).map((p) => ({
      id: p.id,
      content: p.content,
      publishedAt: p.publishedAt,
      platforms: JSON.parse(p.platforms || '[]'),
      targets: p.targets.map((t) => ({
        platform: t.platform,
        status: t.status,
        externalUrl: t.externalUrl,
        likes: t.likes,
        comments: t.comments,
        shares: t.shares,
        views: t.views,
        reach: t.reach,
      })),
    })),
  })
}
