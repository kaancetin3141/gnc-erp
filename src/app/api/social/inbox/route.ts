import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { ALL_PLATFORMS } from '@/lib/social/platforms'
import { generateMockInboxMessage } from '@/lib/social/publish'
import type { PlatformKey } from '@/lib/social/platforms'

// GET — birleşik inbox (DM, yorum, mention, review)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.view')) return err('Sosyal medya görüntüleme yetkiniz yok', 403)

  const url = new URL(req.url)
  const platform = url.searchParams.get('platform')
  const type = url.searchParams.get('type')
  const unreadOnly = url.searchParams.get('unread') === '1'
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)

  const where: {
    tenantId?: string
    platform?: string
    type?: string
    isRead?: boolean
  } = user!.role === 'superadmin' ? {} : { tenantId: user!.tenantId }
  if (platform && ALL_PLATFORMS.includes(platform as PlatformKey)) where.platform = platform
  if (type) where.type = type
  if (unreadOnly) where.isRead = false

  const messages = await db.socialInboxMessage.findMany({
    where,
    include: {
      account: {
        select: { id: true, platform: true, handle: true, displayName: true, avatarUrl: true },
      },
    },
    orderBy: { receivedAt: 'desc' },
    take: Math.min(limit, 200),
  })

  return ok(messages.map((m) => ({
    id: m.id,
    tenantId: m.tenantId,
    accountId: m.accountId,
    account: m.account,
    platform: m.platform,
    senderName: m.senderName,
    senderHandle: m.senderHandle,
    senderAvatar: m.senderAvatar,
    type: m.type,
    content: m.content,
    mediaUrls: m.mediaUrls ? JSON.parse(m.mediaUrls) : null,
    parentId: m.parentId,
    postExternalId: m.postExternalId,
    postUrl: m.postUrl,
    isRead: m.isRead,
    isReplied: m.isReplied,
    replyText: m.replyText,
    repliedAt: m.repliedAt,
    priority: m.priority,
    tags: m.tags ? JSON.parse(m.tags) : null,
    externalCreatedAt: m.externalCreatedAt,
    receivedAt: m.receivedAt,
  })))
}

// POST — mock inbox mesajları üret (test için) veya gerçek mesaj gönder
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.manage')) return err('Sosyal medya yönetme yetkiniz yok', 403)

  const body = await req.json().catch(() => ({}))
  const { action } = body as { action?: string }

  // generateMock — test için rastgele mesaj üret
  if (action === 'generate-mock') {
    const accounts = await db.socialAccount.findMany({
      where: { tenantId: user!.tenantId, isActive: true },
    })
    if (accounts.length === 0) return err('Önce hesap bağlayın', 400)

    // Her hesap için 1-3 mock mesaj üret
    const created: string[] = []
    for (const account of accounts) {
      const count = Math.floor(Math.random() * 3) + 1
      for (let i = 0; i < count; i++) {
        const mock = generateMockInboxMessage(account.platform as PlatformKey, account.handle)
        const msg = await db.socialInboxMessage.create({
          data: {
            tenantId: user!.tenantId,
            accountId: account.id,
            ...mock,
            // Hesap platformu esas alınır (mock'takini geçersiz kılar)
            platform: account.platform,
            tags: mock.tags ? JSON.stringify(mock.tags) : null,
          },
        })
        created.push(msg.id)
      }
    }
    return ok({ generated: created.length })
  }

  return err('Geçersiz action', 400)
}
