import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, getVisibilityFilter } from '@/lib/api-utils'

// GET — harita "Müşteri Katmanı" için konumlu müşteri noktaları (hafif, max 200)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  // PRIVACY: depo rolü müşteri verisi görmez (customers route ile aynı kural)
  if (user!.role === 'stock') {
    return ok({ items: [] })
  }

  const url = new URL(req.url)
  const max = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '200')))

  const visFilter = await getVisibilityFilter(user!)

  const customers = await db.customer.findMany({
    where: {
      tenantId: user!.tenantId,
      lat: { not: null },
      lng: { not: null },
      ...(visFilter.ownerId ? { ownerId: visFilter.ownerId } : {}),
    },
    select: {
      id: true,
      name: true,
      lat: true,
      lng: true,
      city: true,
      address: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: max,
  })

  return ok({ items: customers })
}
