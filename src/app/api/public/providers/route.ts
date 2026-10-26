import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err, safeJsonParse } from '@/lib/api-utils'
import { slugify } from '@/lib/slug'
import type { WorkingHours } from '@/lib/appointment-utils'

// ============================================================
// PUBLIC (auth gerektirmez) — tüm aktif sağlayıcıları listele
// Query: type?, city?
// Returns: [{ id, slug, name, type, address, city, photo, workingHours,
//   services: [{ id, name, duration, price }], ratingAvg, ratingCount }]
// Slug URL'de kullanılır (e.g. /?booking=provider&slug=sik-kuafor)
// ratingAvg/ratingCount: ONAYLI değerlendirmelerden hesaplanır (ana sayfa kart ★)
// ============================================================
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || undefined
  const city = searchParams.get('city') || undefined

  const where: {
    isActive: boolean
    type?: string
    city?: string
  } = { isActive: true }
  if (type) where.type = type
  if (city) where.city = city

  const providers = await db.serviceProvider.findMany({
    where,
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    include: {
      services: {
        where: { isActive: true },
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          duration: true,
          price: true,
          currency: true,
          category: true,
        },
      },
    },
  })

  // Onaylı değerlendirme özeti (işletme başına ortalama + adet)
  const ratingRows = await db.review.groupBy({
    by: ['providerId'],
    where: { status: 'approved' },
    _avg: { rating: true },
    _count: { _all: true },
  })
  const ratingByProvider = new Map(ratingRows.map((r) => [r.providerId, r]))

  // Slug backfill: eğer provider'ın slug'ı yoksa otomatik üret (best-effort, çakışma kontrolü yok)
  // Asıl backfill scripts/backfill-slugs.ts'te yapılır; bu son çare olarak burada.
  const items = providers.map((p) => {
    const r = ratingByProvider.get(p.id)
    return {
      id: p.id,
      slug: p.slug ?? slugify(p.name),
      name: p.name,
      type: p.type,
      address: p.address,
      city: p.city,
      district: p.district,
      photo: p.photo,
      phone: p.phone,
      email: p.email,
      lat: p.lat,
      lng: p.lng,
      workingHours: safeJsonParse<WorkingHours>(p.workingHours, {}),
      services: p.services.map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
        price: s.price,
        currency: s.currency,
        category: s.category,
      })),
      ratingAvg: r && r._avg.rating ? Math.round(r._avg.rating * 10) / 10 : 0,
      ratingCount: r ? r._count._all : 0,
    }
  })

  return ok({ items })
}

void err // keep import for future use
