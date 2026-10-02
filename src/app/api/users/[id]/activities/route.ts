import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err, canAccessResource } from '@/lib/api-utils'

// GET /api/users/[id]/activities — belirli bir kullanıcının aktivite logları
// Yöneticiler kendi astlarının, adminler tüm tenant'ın aktivitelerini görebilir
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const targetUser = await db.user.findUnique({
    where: { id },
    select: { id: true, tenantId: true, name: true, role: true, managerId: true },
  })

  if (!targetUser || targetUser.tenantId !== user!.tenantId) {
    return err('Kullanıcı bulunamadı', 404)
  }

  // Yetki kontrolü:
  // - Admin/SuperAdmin: tüm tenant'ı görür
  // - Manager: sadece kendi astlarını görür
  // - Rep: sadece kendini görür
  if (user!.role !== 'admin' && user!.role !== 'superadmin') {
    if (user!.id !== id) {
      // Manager ise ast kontrolü
      if (user!.role === 'manager') {
        const canAccess = await canAccessResource(user!, targetUser.managerId)
        if (!canAccess && user!.id !== targetUser.managerId) {
          return err('Bu kullanıcının aktivitelerini görüntüleme yetkiniz yok', 403)
        }
      } else {
        return err('Bu kullanıcının aktivitelerini görüntüleme yetkiniz yok', 403)
      }
    }
  }

  const url = new URL(req.url)
  const type = url.searchParams.get('type') || ''
  const startDate = url.searchParams.get('startDate') || ''
  const endDate = url.searchParams.get('endDate') || ''
  const limit = parseInt(url.searchParams.get('limit') || '500')
  const offset = parseInt(url.searchParams.get('offset') || '0')

  const where: Record<string, unknown> = {
    tenantId: user!.tenantId,
    userId: id,
  }

  if (type) where.type = type
  if (startDate || endDate) {
    where.date = {}
    if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate)
    if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate + 'T23:59:59')
  }

  const [activities, total] = await Promise.all([
    db.activity.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.activity.count({ where }),
  ])

  // Aktivite tiplerine göre özet istatistikler
  const typeStats: Record<string, number> = {}
  for (const a of activities) {
    typeStats[a.type] = (typeStats[a.type] ?? 0) + 1
  }

  // Toplam süre
  const totalDuration = activities.reduce((s, a) => s + (a.durationMin || 0), 0)

  // Outcome istatistikleri
  const outcomeStats: Record<string, number> = {}
  for (const a of activities) {
    if (a.outcome) {
      outcomeStats[a.outcome] = (outcomeStats[a.outcome] ?? 0) + 1
    }
  }

  return ok({
    user: { id: targetUser.id, name: targetUser.name, role: targetUser.role },
    activities,
    total,
    summary: {
      typeStats,
      outcomeStats,
      totalDuration,
      totalActivities: total,
    },
    limit,
    offset,
  })
}
