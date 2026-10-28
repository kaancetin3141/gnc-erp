import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// TENANT İZOLASYONU: site bu tenant'a ait mi? (diğer site route'larındaki
// checkSite deseni ile birebir aynı — staff/maaş verisi kiracılar arası sızmaz)
async function checkSite(siteId: string, tenantId: string, isSuperadmin: boolean) {
  const site = await db.site.findUnique({ where: { id: siteId } })
  if (!site) return null
  if (site.tenantId !== tenantId && !isSuperadmin) return null
  return site
}

// GET — personel listesi
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!user!.permissions.includes('site.view') && user!.role !== 'superadmin') {
    return err('Bu modül için yetkiniz yok', 403)
  }

  const { id } = await params
  const site = await checkSite(id, user!.tenantId, user!.role === 'superadmin')
  if (!site) return err('Site bulunamadı', 404)

  const staff = await db.siteStaff.findMany({ where: { siteId: id }, orderBy: { name: 'asc' } })
  return ok(staff)
}

// POST — personel ekle
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!user!.permissions.includes('site.manage') && user!.role !== 'superadmin') {
    return err('Bu işlem için yetkiniz yok', 403)
  }

  const { id } = await params
  const site = await checkSite(id, user!.tenantId, user!.role === 'superadmin')
  if (!site) return err('Site bulunamadı', 404)

  const body = await req.json()
  const { name, role, phone, photo, salary, startDate, notes } = body
  if (!name) return err('Personel adı gerekli', 400)

  const staff = await db.siteStaff.create({
    data: {
      siteId: id,
      name,
      role: role || 'kapici',
      phone: phone || null,
      photo: photo || null,
      salary: salary ? parseFloat(salary) : null,
      startDate: startDate ? new Date(startDate) : null,
      notes: notes || null,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'site_staff',
    entityId: staff.id,
    after: { name: staff.name, role: staff.role, siteId: id },
  })

  return ok(staff)
}
