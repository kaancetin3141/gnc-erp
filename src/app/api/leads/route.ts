import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, requirePermission, ok, err,
  getVisibilityFilter, safeJsonParse,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { normalizePhone } from '@/lib/format'

// GET — lead listesi (filtreli)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const search = url.searchParams.get('search') || ''
  const status = url.searchParams.get('status') || ''
  const city = url.searchParams.get('city') || ''
  const source = url.searchParams.get('source') || ''
  const ownerId = url.searchParams.get('ownerId') || ''
  const limit = parseInt(url.searchParams.get('limit') || '50')
  const offset = parseInt(url.searchParams.get('offset') || '0')

  const visFilter = await getVisibilityFilter(user!)

  const where: Record<string, unknown> = {
    tenantId: user!.tenantId,
    ...(visFilter.ownerId ? { ownerId: visFilter.ownerId } : {}),
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { address: { contains: search } },
      { phone: { contains: search } },
      { web: { contains: search } },
      { category: { contains: search } },
    ]
  }
  if (status) where.status = status
  if (city) where.city = city
  if (source) where.source = source
  if (ownerId) where.ownerId = ownerId

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        convertedCustomer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.lead.count({ where }),
  ])

  return ok({
    items: leads.map((l) => ({
      ...l,
      notes: safeJsonParse<unknown[]>(l.notes, []),
    })),
    total,
    limit,
    offset,
  })
}

// POST — yeni lead (genellikle maps import eder)
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'leads.import')
  if (permErr) return permErr

  const body = await req.json()
  const {
    name, placeId, category, address, city, lat, lng, phone, web,
    ownerId, source, mapsSearchId, rating, reviewCount, email,
  } = body

  if (!name) return err('Lead adı gerekli', 400)

  const lead = await db.lead.create({
    data: {
      tenantId: user!.tenantId,
      name,
      placeId: placeId || null,
      category: category || null,
      address: address || null,
      city: city || null,
      lat: lat ?? null,
      lng: lng ?? null,
      phone: phone ? normalizePhone(phone) || phone : null,
      web: web || null,
      email: email || null,
      rating: rating ?? null,
      reviewCount: reviewCount ?? null,
      ownerId: ownerId || user!.id,
      source: source || 'google_maps',
      status: 'yeni',
      notes: JSON.stringify([]),
      mapsSearchId: mapsSearchId || null,
    },
    include: {
      owner: { select: { id: true, name: true } },
      convertedCustomer: { select: { id: true, name: true } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'lead',
    entityId: lead.id,
    after: lead,
  })

  return ok({
    ...lead,
    notes: safeJsonParse<unknown[]>(lead.notes, []),
  }, 201)
}
