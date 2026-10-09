import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { isSuperAdmin } from '@/lib/rbac'

// GET — hizmet verenler listesi
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const type = url.searchParams.get('type') || ''

  // SUPERADMIN: platform geneli — tüm şirketlerin işletmeleri
  const where: Record<string, unknown> = isSuperAdmin(user!.role)
    ? {}
    : { tenantId: user!.tenantId }
  if (type) where.type = type

  const providers = await db.serviceProvider.findMany({
    where,
    include: {
      tenant: { select: { id: true, name: true } },
      _count: { select: { staff: true, services: true, appointments: true } },
    },
    orderBy: { name: 'asc' },
  })

  return ok({ items: providers, total: providers.length })
}

// POST — yeni hizmet veren
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const body = await req.json()
  const { name, type, address, city, district, phone, email, photo, workingHours } = body

  if (!name) return err('İşletme adı gerekli', 400)

  const provider = await db.serviceProvider.create({
    data: {
      tenantId: user!.tenantId,
      name,
      type: type || 'berber',
      address: address || null,
      city: city || null,
      district: district || null,
      phone: phone || null,
      email: email || null,
      photo: photo || null,
      workingHours: workingHours || JSON.stringify({
        mon: { start: '09:00', end: '18:00' },
        tue: { start: '09:00', end: '18:00' },
        wed: { start: '09:00', end: '18:00' },
        thu: { start: '09:00', end: '18:00' },
        fri: { start: '09:00', end: '18:00' },
        sat: { start: '09:00', end: '18:00' },
        sun: { closed: true },
      }),
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'serviceprovider',
    entityId: provider.id,
    after: provider,
  })

  return ok(provider)
}
