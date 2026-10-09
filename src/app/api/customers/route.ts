import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, requireAuth, ok, err, getVisibilityFilter } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { normalizePhone } from '@/lib/format'
import { hasPermission, isSuperAdmin } from '@/lib/rbac'
import { safeJsonParse } from '@/lib/api-utils'

// GET — müşteri listesi (filtreli)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  // PRIVACY-TEMPLATES (#3): depo rolü müşteri listesini GÖREMEZ
  // (yalnızca üretim listesini görmeli)
  if (user!.role === 'stock') {
    return ok({ items: [], total: 0, limit: 0, offset: 0 })
  }

  const url = new URL(req.url)
  const search = url.searchParams.get('search') || ''
  const sector = url.searchParams.get('sector') || ''
  const city = url.searchParams.get('city') || ''
  const district = url.searchParams.get('district') || ''
  const country = url.searchParams.get('country') || ''
  const segment = url.searchParams.get('segment') || ''
  const status = url.searchParams.get('status') || ''
  const ownerId = url.searchParams.get('ownerId') || ''
  const tag = url.searchParams.get('tag') || ''
  const customerType = url.searchParams.get('customerType') || ''
  const sort = url.searchParams.get('sort') || 'updatedAt'
  const limit = parseInt(url.searchParams.get('limit') || '50')
  const offset = parseInt(url.searchParams.get('offset') || '0')
  const staleOnly = url.searchParams.get('stale') === 'true'

  // Depo rolü tüm müşterileri görebilir (irsaliye/sipariş yönetimi için)
  // CRM rolleri görünürlük filtresine tabi
  // SUPERADMIN: platform geneli — tüm şirketlerin müşterileri
  let visFilter: { ownerId?: { in: string[] }; tenantId?: string }
  if (user!.role === 'depo_sorumlusu') {
    visFilter = { tenantId: user!.tenantId }
  } else {
    visFilter = await getVisibilityFilter(user!)
  }

  const where: Record<string, unknown> = {
    ...(visFilter.tenantId ? { tenantId: visFilter.tenantId } : isSuperAdmin(user!.role) ? {} : { tenantId: user!.tenantId }),
    ...(visFilter.ownerId ? { ownerId: visFilter.ownerId } : {}),
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { phone: { contains: search } },
      { email: { contains: search } },
      { taxNumber: { contains: search } },
      { address: { contains: search } },
      { district: { contains: search } },
    ]
  }
  if (sector) where.sector = sector
  if (city) where.city = city
  if (district) where.district = { contains: district }
  if (country) where.country = country
  if (segment) where.segment = segment
  if (status) where.status = status
  if (ownerId) where.ownerId = ownerId
  if (tag) where.tags = { contains: tag }
  if (customerType) where.customerType = customerType

  if (staleOnly) {
    const staleDate = new Date()
    staleDate.setDate(staleDate.getDate() - 30)
    where.OR = [
      ...(Array.isArray(where.OR) ? where.OR : []),
      { lastActivityAt: { lt: staleDate } },
      { lastActivityAt: null },
    ]
  }

  const orderBy: Record<string, string> =
    sort === 'name' ? { name: 'asc' } :
    sort === 'createdAt' ? { createdAt: 'desc' } :
    sort === 'lastActivity' ? { lastActivityAt: 'desc' } :
    { updatedAt: 'desc' }

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        tenant: { select: { id: true, name: true } },
        _count: { select: { contacts: true, activities: true, deals: true, tasks: true, notes: true } },
      },
      orderBy,
      take: limit,
      skip: offset,
    }),
    db.customer.count({ where }),
  ])

  return ok({
    items: customers.map((c) => ({
      ...c,
      tags: safeJsonParse<string[]>(c.tags, []),
    })),
    total,
    limit,
    offset,
  })
}

// POST — yeni müşteri
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'customers.edit')
  if (permErr) return permErr

  const body = await req.json()
  const {
    name, sector, segment, ownerId, source, address, city, country,
    lat, lng, phone, email, web, taxNumber, status, tags, kvkkConsent,
    annualRevenue, employeeCount, logo, customerType,
  } = body

  if (!name) return err('Müşteri adı gerekli', 400)

  // customerType doğrula
  const validTypes = ['kafe', 'dis_ticaret', 'musteri_hizmetleri', 'musteri']
  const finalType = validTypes.includes(customerType) ? customerType : 'musteri'

  // Logo (base64 data URL) — boyut sınırı 2MB (~2.7M base64 char)
  let logoValue: string | null = null
  if (logo && typeof logo === 'string' && logo.startsWith('data:image/')) {
    if (logo.length > 2_700_000) {
      return err('Logo çok büyük (maks 2MB)', 413)
    }
    logoValue = logo
  }

  const customer = await db.customer.create({
    data: {
      tenantId: user!.tenantId,
      name,
      sector: sector || 'Diğer',
      segment: segment || 'standart',
      ownerId: ownerId || user!.id,
      source: source || 'manuel',
      address: address || null,
      city: city || null,
      country: country || 'TR',
      lat: lat ?? null,
      lng: lng ?? null,
      phone: normalizePhone(phone) || phone || null,
      email: email || null,
      web: web || null,
      taxNumber: taxNumber || null,
      logo: logoValue,
      customerType: finalType,
      status: status || 'aktif',
      tags: JSON.stringify(tags || []),
      kvkkConsent: kvkkConsent || false,
      kvkkConsentAt: kvkkConsent ? new Date() : null,
      annualRevenue: annualRevenue || null,
      employeeCount: employeeCount || null,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'customer',
    entityId: customer.id,
    after: customer,
  })

  return ok({ ...customer, tags: safeJsonParse<string[]>(customer.tags, []) })
}
