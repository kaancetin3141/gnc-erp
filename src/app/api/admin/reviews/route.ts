import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, requirePermission, ok, err,
} from '@/lib/api-utils'
import { isSuperAdmin } from '@/lib/rbac'

// ============================================================
// ADMIN — DEĞERLENDİRME MODERASYONU (liste)
// GET ?page=&status=&q=&tenantId=
//   · superadmin: platform geneli (+ opsiyonel ?tenantId=)
//   · admin: kendi tenant'ının işletmelerinin değerlendirmeleri
//     (Review tenant'sız → kapsam provider.tenantId üzerinden)
// Yetki: users.manage (admin panel Üyeler sekmesi ile aynı)
// Returns: { items, total, page, pageSize, counts: {pending,...} }
// ============================================================

export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'users.manage')
  if (permErr) return permErr

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const status = (url.searchParams.get('status') || '').trim()
  const pageRaw = Number(url.searchParams.get('page') ?? '1')
  const page = Math.max(Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1, 1)
  const PAGE_SIZE = 20
  const tenantIdParam = (url.searchParams.get('tenantId') || '').trim()

  // Tenant kapsamı — superadmin ?tenantId= ile daraltabilir; admin zorunlu kendi tenant'ı
  let tenantFilter: string | undefined
  if (isSuperAdmin(user!.role)) {
    tenantFilter = tenantIdParam || undefined
  } else {
    if (tenantIdParam && tenantIdParam !== user!.tenantId) {
      return err('Bu tenantın değerlendirmelerini görme yetkin yok.', 403)
    }
    tenantFilter = user!.tenantId
  }

  const where: Record<string, unknown> = {}
  if (tenantFilter) where.provider = { tenantId: tenantFilter }
  if (status === 'pending' || status === 'approved' || status === 'rejected') {
    where.status = status
  }
  if (q) {
    where.OR = [
      { authorName: { contains: q } },
      { comment: { contains: q } },
      { provider: { name: { contains: q } } },
    ]
  }

  const [items, total, pendingCount] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        authorName: true,
        rating: true,
        comment: true,
        status: true,
        staffReply: true,
        repliedAt: true,
        createdAt: true,
        appointmentId: true,
        provider: { select: { name: true, slug: true } },
      },
    }),
    db.review.count({ where }),
    db.review.count({
      where: {
        ...(tenantFilter ? { provider: { tenantId: tenantFilter } } : {}),
        status: 'pending',
      },
    }),
  ])

  return ok({
    items: items.map((r) => ({
      id: r.id,
      providerName: r.provider.name,
      providerSlug: r.provider.slug,
      authorName: r.authorName,
      rating: r.rating,
      comment: r.comment,
      status: r.status,
      staffReply: r.staffReply,
      repliedAt: r.repliedAt,
      createdAt: r.createdAt,
      appointmentCode: r.appointmentId ? r.appointmentId.slice(-8).toUpperCase() : null,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    counts: { pending: pendingCount },
  })
}
