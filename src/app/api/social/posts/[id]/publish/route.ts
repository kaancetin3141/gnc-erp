import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/auth'
import { publishToPlatform } from '@/lib/social/publish'
import type { PlatformKey } from '@/lib/social/platforms'

// POST — zamanlanmış/taslak post'u şimdi yayınla (tüm hedef platformlara)
// Body: { forceMock?: boolean } — true ise gerçek API yerine simülasyon kullanılır
// (gerçek token hatalı/kredi bitik olsa bile gönderi "yayınlandı" olarak işaretlenir)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.manage')) return err('Sosyal medya yönetme yetkiniz yok', 403)

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { forceMock?: boolean }
  const forceMock = body?.forceMock === true

  const post = await db.socialPost.findFirst({
    where: { id, tenantId: user!.tenantId },
    include: {
      targets: {
        include: {
          account: true,
        },
      },
    },
  })
  if (!post) return err('Post bulunamadı', 404)

  // Sadece taslak veya zamanlandı durumunda yayınla
  if (post.status === 'yayinlandi') return err('Bu post zaten yayınlanmış', 400)

  const perPlatformContent = JSON.parse(post.perPlatformContent || '{}')
  const mediaUrls = JSON.parse(post.mediaUrls || '[]')

  // Her platforma paralel yayınla
  const results = await Promise.all(post.targets.map(async (target) => {
    if (target.status === 'yayinlandi') return { targetId: target.id, skipped: true }
    const result = await publishToPlatform({
      platform: target.platform as PlatformKey,
      handle: target.account.handle,
      content: perPlatformContent[target.platform] ?? post.content,
      mediaUrls,
      linkUrl: post.linkUrl ?? null,
      // Gerçek hesap bilgileri (varsa) — forceMock ise simülasyona düş
      authMethod: forceMock ? 'mock' : target.account.authMethod as 'mock' | 'oauth' | 'manual_token',
      accessToken: target.account.accessToken,
      refreshToken: target.account.refreshToken,
      apiKey: target.account.apiKey,
      apiSecret: target.account.apiSecret,
      username: target.account.username,
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
    if (result.newAccessToken) updateData.accessToken = result.newAccessToken
    if (result.newRefreshToken) updateData.refreshToken = result.newRefreshToken
    if (result.newExpiresAt) updateData.tokenExpiresAt = result.newExpiresAt

    await db.socialPostTarget.update({
      where: { id: target.id },
      data: updateData,
    })
    return {
      targetId: target.id,
      platform: target.platform,
      handle: target.account.handle,
      success: result.success,
      externalUrl: result.externalUrl,
      error: result.errorMessage,
    }
  }))

  const successCount = results.filter((r) => 'success' in r && r.success).length
  const finalStatus = successCount > 0 ? 'yayinlandi' : 'basarisiz'

  await db.socialPost.update({
    where: { id: post.id },
    data: { status: finalStatus, publishedAt: new Date() },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'social.post.publish',
    entity: 'social_post',
    entityId: id,
    after: { successCount, totalTargets: post.targets.length, finalStatus, forceMock },
  })

  const failures = results.filter((r) => 'success' in r && !r.success) as {
    targetId: string; platform: string; handle: string; success: boolean; error: string | null
  }[]

  return ok({
    success: successCount > 0,
    successCount,
    totalTargets: post.targets.length,
    finalStatus,
    forceMock,
    failures,
    results,
  })
}
