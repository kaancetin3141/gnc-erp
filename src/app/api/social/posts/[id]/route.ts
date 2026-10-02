import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/auth'

// PATCH — post güncelle (sadece taslak/zamanlandi durumunda)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.manage')) return err('Sosyal medya yönetme yetkiniz yok', 403)

  const { id } = await params
  const post = await db.socialPost.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!post) return err('Post bulunamadı', 404)
  if (post.status === 'yayinlandi') return err('Yayınlanmış post düzenlenemez', 400)

  const body = await req.json().catch(() => ({}))
  const {
    content, mediaUrls, mediaType, linkUrl, linkPreview,
    hashtags, mentions, platforms, perPlatformContent,
    scheduledAt, status, campaignName, notes,
  } = body as Record<string, unknown>

  const updateData: Record<string, unknown> = {}
  if (typeof content === 'string') updateData.content = content.trim()
  if (Array.isArray(mediaUrls)) updateData.mediaUrls = JSON.stringify(mediaUrls)
  if (typeof mediaType === 'string') updateData.mediaType = mediaType
  if (linkUrl !== undefined) updateData.linkUrl = linkUrl
  if (linkPreview !== undefined) updateData.linkPreview = linkPreview ? JSON.stringify(linkPreview) : null
  if (Array.isArray(hashtags)) updateData.hashtags = JSON.stringify(hashtags)
  if (Array.isArray(mentions)) updateData.mentions = JSON.stringify(mentions)
  if (Array.isArray(platforms)) updateData.platforms = JSON.stringify(platforms)
  if (perPlatformContent && typeof perPlatformContent === 'object') updateData.perPlatformContent = JSON.stringify(perPlatformContent)
  if (scheduledAt !== undefined) updateData.scheduledAt = scheduledAt ? new Date(scheduledAt as string) : null
  if (typeof status === 'string') updateData.status = status
  if (typeof campaignName === 'string') updateData.campaignName = campaignName
  if (typeof notes === 'string') updateData.notes = notes

  const updated = await db.socialPost.update({ where: { id }, data: updateData })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'social.post.update',
    entity: 'social_post',
    entityId: id,
    before: post,
    after: updateData,
  })

  return ok(updated)
}

// DELETE — post sil (cascade targets)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.manage')) return err('Sosyal medya yönetme yetkiniz yok', 403)

  const { id } = await params
  const post = await db.socialPost.findFirst({ where: { id, tenantId: user!.tenantId } })
  if (!post) return err('Post bulunamadı', 404)

  await db.socialPost.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'social.post.delete',
    entity: 'social_post',
    entityId: id,
  })

  return ok({ success: true })
}
