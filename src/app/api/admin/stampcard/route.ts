import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { isSuperAdmin, hasPermission } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// ADMIN — DAMGA KARTI (liste + ayar)
// GET  ?providerId=&q=&page=&tenantId=
//   · superadmin: platform geneli (+ opsiyonel ?tenantId=)
//   · admin: kendi tenant'ının işletmeleri (provider.tenantId)
//   · yanıt: { items: kartlar, settings: ayar listesi, total,
//              page, pageSize }
// POST — ayar upsert: { providerId, requiredStamps 3-30,
//   rewardDescription ≤200, isActive }
//   · provider tenantScope — kendi tenant'ının işletmesi
//     değilse 404 (bilgi sızması yok)
// Yetki: appointments.view (randevu sektörü) VEYA users.manage
//   (waitlist/members/reviews deseni — CRM sektörü admini de
//   işletme sahibi olarak panele erişir)
// ============================================================

const PERM_A = 'appointments.view'
const PERM_B = 'users.manage'

export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, PERM_A) && !hasPermission(user!, PERM_B)) {
    return err('Bu işlem için yetkiniz yok', 403)
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const providerId = (url.searchParams.get('providerId') || '').trim()
  const pageRaw = Number(url.searchParams.get('page') ?? '1')
  const page = Math.max(Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1, 1)
  const PAGE_SIZE = 20
  const tenantIdParam = (url.searchParams.get('tenantId') || '').trim()

  // Tenant kapsamı — superadmin ?tenantId= ile daraltabilir; admin zorunlu kendi tenant'ı
  let tenantFilter: string | undefined
  if (isSuperAdmin(user!.role)) {
    tenantFilter = tenantIdParam || undefined
  } else {
    if (tenantIdParam && tenantIdParam !== user!.tenantId) {
      return err('Bu tenantın damga kartlarını görme yetkin yok.', 403)
    }
    tenantFilter = user!.tenantId
  }

  const where: Record<string, unknown> = {}
  if (tenantFilter) where.provider = { tenantId: tenantFilter }
  if (providerId) {
    where.provider = {
      ...(typeof where.provider === 'object' && where.provider ? (where.provider as Record<string, unknown>) : {}),
      id: providerId,
    }
  }
  if (q) {
    const num = q.replace(/\D/g, '')
    where.AND = [
      {
        OR: [
          { member: { name: { contains: q } } },
          ...(num.length >= 3 ? [{ member: { phone: { contains: num } } }] : []),
          { provider: { name: { contains: q } } },
        ],
      },
    ]
  }

  // Ayar listesi (kapsam içindeki işletmeler) + ayarsız işletmeler de
  // (form select'i için — ayar oluşturulacak işletme listesi)
  // StampCardSetting tenant'sız → kapsam provider.tenantId üzerinden
  const settingsWhere: Record<string, unknown> = {}
  if (tenantFilter) settingsWhere.provider = { tenantId: tenantFilter }
  // ServiceProvider ise tenantId doğrudan alan
  const providersWhere: Record<string, unknown> = {}
  if (tenantFilter) providersWhere.tenantId = tenantFilter
  if (providerId) {
    settingsWhere.providerId = providerId
    providersWhere.id = providerId
  }

  const [items, total, settings, providers] = await Promise.all([
    db.stampCard.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        stamps: true,
        redeemedCount: true,
        lastStampAt: true,
        updatedAt: true,
        provider: { select: { id: true, name: true, tenantId: true } },
        member: { select: { id: true, name: true, phone: true } },
      },
    }),
    db.stampCard.count({ where }),
    db.stampCardSetting.findMany({
      where: settingsWhere,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        providerId: true,
        requiredStamps: true,
        rewardDescription: true,
        isActive: true,
        updatedAt: true,
        provider: { select: { id: true, name: true } },
      },
    }),
    db.serviceProvider.findMany({
      where: providersWhere,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        stampCardSetting: {
          select: { id: true, requiredStamps: true, rewardDescription: true, isActive: true },
        },
      },
    }),
  ])

  return ok({
    items: items.map((c) => ({
      id: c.id,
      providerId: c.provider.id,
      providerName: c.provider.name,
      memberId: c.member.id,
      memberName: c.member.name,
      memberPhone: c.member.phone,
      stamps: c.stamps,
      redeemedCount: c.redeemedCount,
      lastStampAt: c.lastStampAt,
      updatedAt: c.updatedAt,
    })),
    settings: settings.map((s) => ({
      id: s.id,
      providerId: s.providerId,
      providerName: s.provider.name,
      requiredStamps: s.requiredStamps,
      rewardDescription: s.rewardDescription,
      isActive: s.isActive,
      updatedAt: s.updatedAt,
    })),
    // form select'i: kapsamdaki TÜM işletmeler (ayarı olmayanlar dahil)
    providers: providers.map((p) => ({
      id: p.id,
      name: p.name,
      hasSetting: !!p.stampCardSetting,
      requiredStamps: p.stampCardSetting?.requiredStamps ?? null,
      rewardDescription: p.stampCardSetting?.rewardDescription ?? null,
      isActive: p.stampCardSetting?.isActive ?? null,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  })
}

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, PERM_A) && !hasPermission(user!, PERM_B)) {
    return err('Bu işlem için yetkiniz yok', 403)
  }

  const body = (await req.json().catch(() => null)) as {
    providerId?: unknown
    requiredStamps?: unknown
    rewardDescription?: unknown
    isActive?: unknown
  } | null
  if (!body) return err('İstek gövdesi okunamadı.', 400)

  const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : ''
  if (!providerId) return err('İşletme (providerId) gerekli.', 400)

  const requiredStamps = Number(body.requiredStamps)
  if (!Number.isInteger(requiredStamps) || requiredStamps < 3 || requiredStamps > 30) {
    return err('Damga sayısı 3 ile 30 arasında bir tam sayı olmalı.', 400)
  }

  const rewardDescription =
    typeof body.rewardDescription === 'string' ? body.rewardDescription.trim() : ''
  if (!rewardDescription) return err('Ödül açıklaması gerekli.', 400)
  if (rewardDescription.length > 200) {
    return err('Ödül açıklaması en fazla 200 karakter olabilir.', 400)
  }

  const isActive = body.isActive === undefined ? true : Boolean(body.isActive)

  // Provider tenantScope — kendi tenant'ının işletmesi değilse 404
  const provider = await db.serviceProvider.findUnique({
    where: { id: providerId },
    select: { id: true, name: true, tenantId: true },
  })
  if (!provider || (!isSuperAdmin(user!.role) && provider.tenantId !== user!.tenantId)) {
    return err('İşletme bulunamadı', 404)
  }

  const setting = await db.stampCardSetting.upsert({
    where: { providerId: provider.id },
    create: {
      providerId: provider.id,
      requiredStamps,
      rewardDescription,
      isActive,
    },
    update: {
      requiredStamps,
      rewardDescription,
      isActive,
    },
    select: {
      id: true,
      providerId: true,
      requiredStamps: true,
      rewardDescription: true,
      isActive: true,
      updatedAt: true,
    },
  })

  try {
    await writeAuditLog({
      tenantId: provider.tenantId,
      actorId: user!.id,
      action: 'update',
      entity: 'stampcard-setting',
      entityId: setting.id,
      before: null,
      after: JSON.stringify({
        provider: provider.name,
        requiredStamps,
        rewardDescription,
        isActive,
      }),
    })
  } catch {
    // audit başarısızlığı işlemi bozmasın
  }

  return ok({ ok: true, setting })
}
