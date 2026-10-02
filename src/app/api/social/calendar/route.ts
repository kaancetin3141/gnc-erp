import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'

// GET — takvim görünümü için zamanlanmış/yayınlanmış post'lar
// ?month=YYYY-MM (default: current month) → o aydaki tüm postlar
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.view')) return err('Sosyal medya görüntüleme yetkiniz yok', 403)

  const url = new URL(req.url)
  const monthParam = url.searchParams.get('month') // YYYY-MM

  let startDate: Date
  let endDate: Date
  const now = new Date()
  if (monthParam) {
    const [y, m] = monthParam.split('-').map((x) => parseInt(x, 10))
    if (y && m >= 1 && m <= 12) {
      startDate = new Date(y, m - 1, 1)
      endDate = new Date(y, m, 1)
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    }
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  }

  // Hem zamanlanan hem yayınlanan (publishedAt veya scheduledAt ay içinde)
  const posts = await db.socialPost.findMany({
    where: {
      tenantId: user!.tenantId,
      OR: [
        { scheduledAt: { gte: startDate, lt: endDate } },
        { publishedAt: { gte: startDate, lt: endDate } },
      ],
    },
    include: {
      targets: {
        select: { platform: true, status: true },
      },
    },
    orderBy: { scheduledAt: 'asc' },
  })

  return ok(posts.map((p) => ({
    id: p.id,
    scheduledAt: p.scheduledAt,
    publishedAt: p.publishedAt,
    content: p.content.slice(0, 100) + (p.content.length > 100 ? '…' : ''),
    fullContent: p.content,
    platforms: JSON.parse(p.platforms || '[]'),
    mediaType: p.mediaType,
    status: p.status,
    campaignName: p.campaignName,
  })))
}
