import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err, safeJsonParse } from '@/lib/api-utils'
import { slugify } from '@/lib/slug'
import type { WorkingHours } from '@/lib/appointment-utils'

// ============================================================
// PUBLIC (auth gerektirmez) — slug-bazlı provider detayı
// Returns: provider + services + staff + workingHours
// ============================================================
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // Önce slug ile bul; yoksa slugify(name) ile match et (backfill henüz yapılmamışsa)
  let provider = await db.serviceProvider.findFirst({
    where: { slug },
    include: {
      services: {
        where: { isActive: true },
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
      },
      staff: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          title: true,
          photo: true,
          bio: true,
          staffServices: { select: { serviceId: true } },
        },
      },
    },
  })
  if (!provider) {
    // Fallback: ismi slugify edenle eşleşen (backfill olmayan provider için)
    const all = await db.serviceProvider.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
    })
    const match = all.find((p) => (p.slug ?? slugify(p.name)) === slug)
    if (!match) return err('İşletme bulunamadı', 404)

    provider = await db.serviceProvider.findFirst({
      where: { id: match.id },
      include: {
        services: {
          where: { isActive: true },
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
        },
        staff: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            title: true,
            photo: true,
            bio: true,
            staffServices: { select: { serviceId: true } },
          },
        },
      },
    })
    if (!provider) return err('İşletme bulunamadı', 404)
  }

  return ok({
    provider: {
      id: provider.id,
      slug: provider.slug ?? slugify(provider.name),
      name: provider.name,
      type: provider.type,
      address: provider.address,
      city: provider.city,
      district: provider.district,
      phone: provider.phone,
      email: provider.email,
      photo: provider.photo,
      lat: provider.lat,
      lng: provider.lng,
      workingHours: safeJsonParse<WorkingHours>(provider.workingHours, {}),
    },
    services: provider.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      duration: s.duration,
      price: s.price,
      currency: s.currency,
      category: s.category,
      photo: s.photo,
    })),
    staff: provider.staff.map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      photo: s.photo,
      bio: s.bio,
      serviceIds: s.staffServices.map((ss) => ss.serviceId),
    })),
  })
}
