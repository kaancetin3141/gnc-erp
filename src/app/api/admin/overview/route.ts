import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, safeJsonParse } from '@/lib/api-utils'
import type { Role } from '@/types'

// GET — admin dashboard özet verisi
// Sadece admin/superadmin yetkisi (users.manage)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'users.manage')
  if (permErr) return permErr

  const tenantId = user!.tenantId

  // Müşteri türüne göre sayım
  const customerTypeCounts = await db.customer.groupBy({
    by: ['customerType'],
    where: { tenantId },
    _count: { _all: true },
  })

  const customerByType: Record<string, number> = {
    kafe: 0,
    dis_ticaret: 0,
    musteri_hizmetleri: 0,
    musteri: 0,
  }
  for (const row of customerTypeCounts) {
    if (row.customerType && row.customerType in customerByType) {
      customerByType[row.customerType] = row._count._all
    } else if (row.customerType) {
      customerByType[row.customerType] = row._count._all
    } else {
      customerByType.musteri += row._count._all
    }
  }

  // Kullanıcı rolüne göre sayım
  const userRoleCounts = await db.user.groupBy({
    by: ['role'],
    where: { tenantId },
    _count: { _all: true },
  })

  const userByRole: Record<string, number> = {
    superadmin: 0,
    admin: 0,
    manager: 0,
    rep: 0,
    readonly: 0,
    stock: 0,
  }
  for (const row of userRoleCounts) {
    if (row.role && row.role in userByRole) {
      userByRole[row.role] = row._count._all
    }
  }

  // Sistem istatistikleri
  const [
    totalCustomers,
    totalUsers,
    totalDeals,
    totalOrders,
    totalInvoices,
    totalTasks,
    totalLeads,
    totalProducts,
  ] = await Promise.all([
    db.customer.count({ where: { tenantId } }),
    db.user.count({ where: { tenantId } }),
    db.deal.count({ where: { tenantId } }),
    db.order.count({ where: { tenantId } }),
    db.invoice.count({ where: { tenantId } }),
    db.task.count({ where: { tenantId } }),
    db.lead.count({ where: { tenantId } }),
    db.product.count({ where: { tenantId } }),
  ])

  // Son aktiviteler (audit log)
  const recentAuditLogs = await db.auditLog.findMany({
    where: { tenantId },
    include: {
      actor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Aktif görevler
  const openTasks = await db.task.count({
    where: { tenantId, status: 'acik' },
  })

  // Açık fırsat değeri
  const openDeals = await db.deal.findMany({
    where: {
      tenantId,
      stage: { notIn: ['kazanıldı', 'kaybedildi'] },
    },
    select: { value: true, currency: true },
  })
  const openDealsValue = openDeals.reduce((s, d) => s + (d.value || 0), 0)

  // Bekleyen ödemeler
  const pendingInvoices = await db.invoice.count({
    where: { tenantId, status: 'odeme_bekliyor' },
  })

  return ok({
    customerByType,
    userByRole,
    systemStats: {
      totalCustomers,
      totalUsers,
      totalDeals,
      totalOrders,
      totalInvoices,
      totalTasks,
      totalLeads,
      totalProducts,
      openTasks,
      openDealsCount: openDeals.length,
      openDealsValue,
      pendingInvoices,
    },
    recentActivity: recentAuditLogs.map((log) => ({
      id: log.id,
      actorId: log.actorId,
      actor: log.actor,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      before: safeJsonParse(log.before, null),
      after: safeJsonParse(log.after, null),
      createdAt: log.createdAt,
    })),
    generatedAt: new Date().toISOString(),
  })
}

// Cast: role enum tutarlılığı için tip importu (lint için)
export type _RoleRef = Role
