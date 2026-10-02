import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, requirePermission, ok, err,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { mockMapsSearch } from '@/lib/maps-mock'

// GET — son harita aramaları (geçmiş)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const limit = parseInt(url.searchParams.get('limit') || '20')

  const searches = await db.mapsSearch.findMany({
    where: { tenantId: user!.tenantId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return ok({ items: searches })
}

// POST — yeni harita araması
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'maps.search')
  if (permErr) return permErr

  const body = await req.json()
  const { query, city, country, radius } = body

  if (!query) return err('Arama sorgusu gerekli', 400)
  if (!city) return err('Şehir gerekli', 400)

  // Mevcut placeId'leri topla (lead + customer) — existInCrm işaretle
  const [existingLeads, existingCustomers] = await Promise.all([
    db.lead.findMany({
      where: { tenantId: user!.tenantId, placeId: { not: null } },
      select: { placeId: true },
    }),
    db.customer.findMany({
      where: { tenantId: user!.tenantId, placeId: { not: null } },
      select: { placeId: true },
    }),
  ])
  const existingPlaceIds = new Set<string>([
    ...existingLeads.map((l) => l.placeId).filter(Boolean) as string[],
    ...existingCustomers.map((c) => c.placeId).filter(Boolean) as string[],
  ])

  // Mock arama
  const results = mockMapsSearch({
    query,
    city,
    country: country || 'TR',
    radius: radius || 5000,
    existingPlaceIds: Array.from(existingPlaceIds),
  })

  // MapsSearch kaydı oluştur
  const search = await db.mapsSearch.create({
    data: {
      tenantId: user!.tenantId,
      userId: user!.id,
      query,
      city,
      country: country || 'TR',
      radius: radius || null,
      resultCount: results.length,
    },
    include: { user: { select: { id: true, name: true } } },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'maps_search',
    entityId: search.id,
    after: { query, city, resultCount: results.length },
  })

  return ok({ results, searchId: search.id, search })
}
