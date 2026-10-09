import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — paket listesi
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const providerId = url.searchParams.get('providerId') || ''
  const includeInactive = url.searchParams.get('includeInactive') === '1'

  const where: Record<string, unknown> = user!.role === 'superadmin' ? {} : { tenantId: user!.tenantId }
  if (!includeInactive) where.active = true
  if (providerId) where.providerId = providerId

  const packages = await db.membershipPackage.findMany({
    where,
    include: {
      _count: { select: { packages: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return ok({ items: packages })
}

// POST — yeni paket tanımla
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'appointments.manage')
  if (permErr) return permErr

  const body = await req.json().catch(() => null)
  if (!body?.name?.trim()) return err('Paket adı zorunludur')

  const sessionCount = parseInt(body.sessionCount ?? 1)
  const validityDays = parseInt(body.validityDays ?? 30)
  if (isNaN(sessionCount) || sessionCount < 0) return err('Geçersiz seans sayısı')
  if (isNaN(validityDays) || validityDays < 1) return err('Geçerlilik en az 1 gün olmalı')
  const price = parseFloat(body.price ?? 0)
  if (isNaN(price) || price < 0) return err('Geçersiz fiyat')

  const pkg = await db.membershipPackage.create({
    data: {
      tenantId: user!.tenantId,
      providerId: body.providerId || null,
      name: String(body.name).trim(),
      description: body.description?.trim() || null,
      price,
      currency: body.currency || 'TRY',
      sessionCount, // 0 = sınırsız
      validityDays,
      active: body.active !== false,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'membership_package',
    entityId: pkg.id,
    after: { name: pkg.name, price: pkg.price, sessionCount: pkg.sessionCount },
  })

  return ok(pkg, 201)
}
