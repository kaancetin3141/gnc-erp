import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — satılan paketler (abonelik) listesi
// status=aktif|bitti|suresi_doldu|iptal ; q=ad/telefon arama ; expiring=1 → 7 gün içinde bitenler
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const status = url.searchParams.get('status') || ''
  const q = url.searchParams.get('q') || ''
  const expiring = url.searchParams.get('expiring') === '1'

  const where: Record<string, unknown> = { tenantId: user!.tenantId }
  if (status) where.status = status
  if (q) {
    where.OR = [
      { customerName: { contains: q } },
      { customerPhone: { contains: q } },
    ]
  }
  if (expiring) {
    const now = new Date()
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    where.status = 'aktif'
    where.expiryDate = { gte: now, lte: in7 }
  }

  const items = await db.memberPackage.findMany({
    where,
    include: {
      package: { select: { id: true, name: true, sessionCount: true, price: true } },
      usages: { orderBy: { usedAt: 'desc' }, take: 5 },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  // Süresi dolmuş ama hâlâ "aktif" görünenleri otomatik düzelt
  const now = new Date()
  const stale = items.filter((i) => i.status === 'aktif' && i.expiryDate < now)
  if (stale.length > 0) {
    await db.memberPackage.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { status: 'suresi_doldu' },
    })
    for (const s of stale) s.status = 'suresi_doldu'
  }

  return ok({ items })
}

// POST — müşteriye paket sat (abonelik başlat)
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'appointments.manage')
  if (permErr) return permErr

  const body = await req.json().catch(() => null)
  if (!body?.packageId) return err('Paket seçilmelidir')
  if (!body?.customerName?.trim()) return err('Müşteri adı zorunludur')

  const pkg = await db.membershipPackage.findFirst({
    where: { id: body.packageId, tenantId: user!.tenantId, active: true },
  })
  if (!pkg) return err('Paket bulunamadı veya pasif', 404)

  const now = new Date()
  const expiry = new Date(now.getTime() + pkg.validityDays * 24 * 60 * 60 * 1000)

  const sub = await db.memberPackage.create({
    data: {
      tenantId: user!.tenantId,
      packageId: pkg.id,
      customerId: body.customerId || null,
      customerName: String(body.customerName).trim(),
      customerPhone: body.customerPhone?.trim() || null,
      startDate: now,
      expiryDate: expiry,
      sessionsTotal: pkg.sessionCount, // 0 = sınırsız
      sessionsUsed: 0,
      pricePaid: typeof body.pricePaid === 'number' ? body.pricePaid : pkg.price,
      status: 'aktif',
      notes: body.notes?.trim() || null,
    },
    include: { package: true },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'member_package',
    entityId: sub.id,
    after: { customerName: sub.customerName, packageName: pkg.name, pricePaid: sub.pricePaid },
  })

  return ok(sub, 201)
}
