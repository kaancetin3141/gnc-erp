import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err, safeJsonParse } from '@/lib/api-utils'
import { slugify } from '@/lib/slug'
import type { WorkingHours } from '@/lib/appointment-utils'

// ============================================================
// PUBLIC (auth gerektirmez) — tüm aktif sağlayıcıları listele
// Query: type?, city?
// Returns: [{ id, slug, name, type, address, city, photo, workingHours, services: [{ id, name, duration, price }] }]
// Slug URL'de kullanılır (e.g. /?booking=provider&slug=sik-kuafor)
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

  // Slug backfill: eğer provider'ın slug'ı yoksa otomatik üret (best-effort, çakışma kontrolü yok)
  // Asıl backfill scripts/backfill-slugs.ts'te yapılır; bu son çare olarak burada.
  const items = providers.map((p) => ({
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
    workingHours: safeJsonParse<WorkingHours>(p.workingHours, {}),
    services: p.services.map((s) => ({
      id: s.id,
      name: s.name,
      duration: s.duration,
      price: s.price,
      currency: s.currency,
      category: s.category,
    })),
  }))

  return ok({ items })
}

void err // keep import for future use
