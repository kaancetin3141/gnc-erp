import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — siteler listesi
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const sites = await db.site.findMany({
    where: { tenantId: user!.tenantId },
    include: {
      _count: { select: { blocks: true, siteStaff: true, dues: true, announcements: true, complaints: true } },
    },
    orderBy: { name: 'asc' },
  })
  return ok({ items: sites })
}

// POST — yeni site
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const body = await req.json()
  const { name, address, city, district, phone, email, managerName, dueDay, defaultDueAmount, currency } = body
  if (!name) return err('Site adı gerekli', 400)

  const site = await db.site.create({
    data: {
      tenantId: user!.tenantId,
      name, address: address || null, city: city || null, district: district || null,
      phone: phone || null, email: email || null, managerName: managerName || null,
      dueDay: parseInt(dueDay) || 5, defaultDueAmount: parseFloat(defaultDueAmount) || 0,
      currency: currency || 'TRY',
    },
  })
  await writeAuditLog({ tenantId: user!.tenantId, actorId: user!.id, action: 'create', entity: 'site', entityId: site.id, after: site })
  return ok(site)
}
