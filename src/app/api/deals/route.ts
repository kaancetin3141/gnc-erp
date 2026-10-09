import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, requirePermission, ok, err,
  getVisibilityFilter,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — fırsat listesi
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  // PRIVACY-TEMPLATES (#3): depo ve salt-okunur roller satış verilerini GÖREMEZ
  if (user!.role === 'stock' || user!.role === 'readonly') {
    return ok({ items: [], total: 0, limit: 0, offset: 0 })
  }

  const url = new URL(req.url)
  const stage = url.searchParams.get('stage') || ''
  const customerId = url.searchParams.get('customerId') || ''
  const ownerId = url.searchParams.get('ownerId') || ''
  const search = url.searchParams.get('search') || ''
  const limit = parseInt(url.searchParams.get('limit') || '50')
  const offset = parseInt(url.searchParams.get('offset') || '0')

  const visFilter = await getVisibilityFilter(user!)

  const where: Record<string, unknown> = {
    ...(visFilter.tenantId ? { tenantId: visFilter.tenantId } : {}),
    ...(visFilter.ownerId ? { ownerId: visFilter.ownerId } : {}),
  }

  if (stage) where.stage = stage
  if (customerId) where.customerId = customerId
  if (ownerId) where.ownerId = ownerId
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { customer: { name: { contains: search } } },
    ]
  }

  const [deals, total] = await Promise.all([
    db.deal.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.deal.count({ where }),
  ])

  return ok({ items: deals, total, limit, offset })
}

// POST — yeni fırsat
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'deals.manage')
  if (permErr) return permErr

  const body = await req.json()
  const {
    title, customerId, value, currency, stage, probability,
    expectedCloseDate, ownerId,
  } = body

  if (!title) return err('Fırsat başlığı gerekli', 400)
  if (!customerId) return err('Müşteri seçimi gerekli', 400)

  // Customer tenant'ta mı?
  const customer = await db.customer.findFirst({
    where: { id: customerId, tenantId: user!.tenantId },
    select: { id: true },
  })
  if (!customer) return err('Müşteri bulunamadı', 404)

  // Probability default: stage'den hesapla
  const stageProbMap: Record<string, number> = {
    yeni: 10, iletisim: 25, teklif: 50, muzakere: 70, kazanıldı: 100, kaybedildi: 0,
  }
  const finalProb = probability !== undefined
    ? probability
    : (stageProbMap[stage] ?? 10)

  const deal = await db.deal.create({
    data: {
      tenantId: user!.tenantId,
      title,
      customerId,
      value: value ?? 0,
      currency: currency || 'TRY',
      stage: stage || 'yeni',
      probability: finalProb,
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
      ownerId: ownerId || user!.id,
    },
    include: {
      customer: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'deal',
    entityId: deal.id,
    after: deal,
  })

  return ok(deal, 201)
}
