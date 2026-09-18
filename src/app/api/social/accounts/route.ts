import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { PLATFORMS, ALL_PLATFORMS } from '@/lib/social/platforms'
import { writeAuditLog } from '@/lib/auth'
import { verifyPlatformAccount, loginToBluesky } from '@/lib/social/api-clients'
import type { PlatformKey } from '@/lib/social/platforms'

// GET — tenant'ın bağlı sosyal medya hesapları
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.view')) return err('Sosyal medya görüntüleme yetkiniz yok', 403)

  const accounts = await db.socialAccount.findMany({
    where: { tenantId: user!.tenantId, isActive: true },
    orderBy: [{ platform: 'asc' }, { connectedAt: 'asc' }],
  })

  return ok(accounts.map((a) => ({
    id: a.id,
    tenantId: a.tenantId,
    platform: a.platform,
    handle: a.handle,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl,
    bio: a.bio,
    followerCount: a.followerCount,
    followingCount: a.followingCount,
    postCount: a.postCount,
    isVerified: a.isVerified,
    isActive: a.isActive,
    connectedAt: a.connectedAt,
    lastSyncedAt: a.lastSyncedAt,
    authMethod: a.authMethod,
    hasAccessToken: !!a.accessToken,
    hasApiKeys: !!(a.apiKey && a.apiSecret),
    scopes: a.scopes ? JSON.parse(a.scopes) : [],
  })))
}

// POST — yeni hesap bağla (mock veya gerçek API anahtarı ile)
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.manage')) return err('Sosyal medya yönetme yetkiniz yok', 403)

  const body = await req.json().catch(() => ({}))
  const {
    platform, handle, displayName, bio, avatarUrl, followerCount, isVerified,
    // Gerçek hesap bağlantısı (yeni eklenen)
    authMethod = 'mock', accessToken, refreshToken, tokenExpiresAt,
    apiKey, apiSecret, username, scopes, verify = false,
  } = body as {
    platform: string
    handle: string
    displayName?: string
    bio?: string
    avatarUrl?: string
    followerCount?: number
    isVerified?: boolean
    authMethod?: 'mock' | 'oauth' | 'manual_token'
    accessToken?: string
    refreshToken?: string
    tokenExpiresAt?: string
    apiKey?: string
    apiSecret?: string
    username?: string
    scopes?: string[]
    verify?: boolean
  }

  if (!platform || !handle) return err('platform ve handle gerekli', 400)
  if (!ALL_PLATFORMS.includes(platform as PlatformKey)) {
    return err(`Geçersiz platform: ${platform}`, 400)
  }
  const cleanHandle = handle.trim().replace(/^@/, '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!cleanHandle) return err('Geçersiz handle', 400)

  // Bluesky özel — app password ile login → access token al
  let finalAccessToken = accessToken
  let finalRefreshToken = refreshToken
  let finalExpiresAt: Date | null = tokenExpiresAt ? new Date(tokenExpiresAt) : null
  if (platform === 'bluesky' && apiKey && apiSecret) {
    // apiKey = username, apiSecret = app password
    const login = await loginToBluesky(apiKey, apiSecret)
    if (!login.accessToken) {
      return err(`Bluesky giriş başarısız: ${login.error}`, 400)
    }
    finalAccessToken = login.accessToken
  }

  // Verify et — gerçek hesap mı? (manuel token girişi için)
  let verifiedHandle = cleanHandle
  let verifiedDisplayName = displayName
  let verifiedAvatar = avatarUrl
  let verifiedFollowers = followerCount ?? 0
  let verifiedIsVerified = isVerified ?? false

  if (verify && finalAccessToken && authMethod !== 'mock') {
    const verifyResult = await verifyPlatformAccount(
      platform as PlatformKey,
      finalAccessToken,
      apiKey,
      apiSecret,
      username || cleanHandle,
    )
    if (!verifyResult.success) {
      return err(`Token doğrulanamadı: ${verifyResult.errorMessage}`, 400)
    }
    if (verifyResult.handle) verifiedHandle = verifyResult.handle.replace(/^@/, '')
    if (verifyResult.displayName) verifiedDisplayName = verifyResult.displayName
    if (verifyResult.avatarUrl) verifiedAvatar = verifyResult.avatarUrl
    if (verifyResult.followerCount) verifiedFollowers = verifyResult.followerCount
    if (verifyResult.isVerified) verifiedIsVerified = verifyResult.isVerified
  }

  // Aynı platform + handle var mı?
  const existing = await db.socialAccount.findUnique({
    where: { tenantId_platform_handle: { tenantId: user!.tenantId, platform, handle: verifiedHandle } },
  })
  if (existing) return err('Bu hesap zaten bağlı', 409)

  const account = await db.socialAccount.create({
    data: {
      tenantId: user!.tenantId,
      platform,
      handle: verifiedHandle,
      displayName: verifiedDisplayName ?? null,
      bio: bio ?? null,
      avatarUrl: verifiedAvatar ?? null,
      followerCount: verifiedFollowers,
      isVerified: verifiedIsVerified,
      accessToken: finalAccessToken ?? (authMethod === 'mock' ? `mock_token_${Date.now()}` : null),
      refreshToken: finalRefreshToken ?? null,
      tokenExpiresAt: finalExpiresAt,
      apiKey: apiKey ?? null,
      apiSecret: apiSecret ?? null,
      username: username ?? null,
      authMethod,
      scopes: scopes ? JSON.stringify(scopes) : null,
      lastSyncedAt: authMethod !== 'mock' ? new Date() : null,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'social.connect',
    entity: 'social_account',
    entityId: account.id,
    after: { platform, handle: verifiedHandle, authMethod, verified: verify && !!finalAccessToken },
  })

  return ok({
    id: account.id,
    platform: account.platform,
    handle: account.handle,
    authMethod: account.authMethod,
    hasAccessToken: !!account.accessToken,
  }, 201)
}
