import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { getTenantSector } from '@/lib/tenant-sector'

// ============================================================
// ADMIN — İşletme (tenant) listesi
// GET /api/admin/tenants
// - superadmin: TÜM işletmeler + modül sayaçları
// - admin: SADECE kendi işletmesi
// Yetki: admin.access + rol admin|superadmin
// ============================================================
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'admin.access')
  if (permErr) return permErr
  if (user!.role !== 'superadmin' && user!.role !== 'admin') {
    return err('Bu işlem için yönetici yetkisi gerekli', 403)
  }

  const isSuper = user!.role === 'superadmin'
  const where = isSuper ? {} : { id: user!.tenantId }

  const tenants = await db.tenant.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: {
      _count: {
        select: {
          users: true,
          customers: true,
          serviceProviders: true,
          orders: true,
          invoices: true,
          tasks: true,
          products: true,
        },
      },
    },
  })

  // Randevu sayıları: ServiceProvider üzerinden (tenant'ta doğrudan relation yok)
  const tenantIds = tenants.map((t) => t.id)
  const providerRows = await db.serviceProvider.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { id: true, tenantId: true, _count: { select: { appointments: true } } },
  })
  const appointmentCountByTenant: Record<string, number> = {}
  for (const p of providerRows) {
    appointmentCountByTenant[p.tenantId] =
      (appointmentCountByTenant[p.tenantId] ?? 0) + p._count.appointments
  }

  const items = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    plan: t.plan,
    defaultCurrency: t.defaultCurrency,
    country: t.country,
    createdAt: t.createdAt,
    sector: getTenantSector(t.name),
    counts: {
      users: t._count.users,
      customers: t._count.customers,
      providers: t._count.serviceProviders,
      orders: t._count.orders,
      invoices: t._count.invoices,
      tasks: t._count.tasks,
      products: t._count.products,
      appointments: appointmentCountByTenant[t.id] ?? 0,
    },
  }))

  return ok({ items, total: items.length, scope: isSuper ? 'platform' : 'tenant' })
}
