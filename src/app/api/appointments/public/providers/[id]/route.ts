import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'

// ============================================================
// PUBLIC (auth gerektirmez) — tekil sağlayıcı detayı
// Aktif personel + aktif hizmetler + çalışma saatleri döner
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const provider = await db.serviceProvider.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      address: true,
      city: true,
      district: true,
      phone: true,
      email: true,
      photo: true,
      workingHours: true,
      isActive: true,
    },
  })

  if (!provider || !provider.isActive) return err('İşletme bulunamadı', 404)

  const [staff, services] = await Promise.all([
    db.staff.findMany({
      where: { providerId: id, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        title: true,
        photo: true,
        bio: true,
        staffServices: { select: { serviceId: true } },
      },
    }),
    db.service.findMany({
      where: { providerId: id, isActive: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        duration: true,
        price: true,
        currency: true,
        category: true,
        photo: true,
      },
    }),
  ])

  return ok({
    provider,
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      photo: s.photo,
      bio: s.bio,
      serviceIds: s.staffServices.map((ss) => ss.serviceId),
    })),
    services,
  })
}
