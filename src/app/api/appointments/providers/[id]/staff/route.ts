import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// GET — personel listesi (aktif + pasif; yönetici pasifleri tekrar aktifleştirebilmeli)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const staff = await db.staff.findMany({
    where: { providerId: id },
    include: { staffServices: { include: { service: true } } },
    orderBy: { sortOrder: 'asc' },
  })

  // Client-friendly: staffServices → services düzleştirme
  const mapped = staff.map((s) => ({
    ...s,
    services: s.staffServices.map((ss) => ({
      id: ss.service.id,
      name: ss.service.name,
      category: ss.service.category,
    })),
  }))

  return ok(mapped)
}

// POST — personel ekle
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const body = await req.json()
  const { name, title, photo, phone, bio } = body

  if (!name) return err('Personel adı gerekli', 400)

  const staff = await db.staff.create({
    data: { providerId: id, name, title: title || null, photo: photo || null, phone: phone || null, bio: bio || null },
  })
  return ok(staff)
}
