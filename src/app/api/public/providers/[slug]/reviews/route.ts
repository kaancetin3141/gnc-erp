import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import { slugify } from '@/lib/slug'

// ============================================================
// PUBLIC (auth gerektirmez) — işletmenin ONAYLI değerlendirmeleri
// GET /api/public/providers/[slug]/reviews?limit=20 (max 50)
// Returns: { items: [{ id, authorName, rating, comment, staffReply,
//           repliedAt, createdAt }], summary: { average, count,
//           distribution: { "1".."5" } } }
// Yalnız status='approved' kayıtlar döner; rate limit gerekmez.
// ============================================================

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const url = new URL(req.url)
  const limitRaw = Number(url.searchParams.get('limit') ?? '20')
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 20, 1), 50)

  let provider = await db.serviceProvider.findFirst({
    where: { slug },
    select: { id: true },
  })
  if (!provider) {
    // slug backfill edilmemiş olabilir — isimden slugify eşleşmesi (detail route deseni)
    const all = await db.serviceProvider.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
    })
    const match = all.find((p) => (p.slug ?? slugify(p.name)) === slug)
    if (!match) return err('İşletme bulunamadı', 404)
    provider = match
  }

  const [items, summaryRows] = await Promise.all([
    db.review.findMany({
      where: { providerId: provider.id, status: 'approved' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        authorName: true,
        rating: true,
        comment: true,
        staffReply: true,
        repliedAt: true,
        createdAt: true,
      },
    }),
    db.review.groupBy({
      by: ['rating'],
      where: { providerId: provider.id, status: 'approved' },
      _count: { _all: true },
    }),
  ])

  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  let count = 0
  let total = 0
  for (const row of summaryRows) {
    const key = String(row.rating)
    if (key in distribution) {
      distribution[key] = row._count._all
      count += row._count._all
      total += row.rating * row._count._all
    }
  }

  return ok({
    items: items.map((r) => ({
      id: r.id,
      authorName: r.authorName,
      rating: r.rating,
      comment: r.comment,
      staffReply: r.staffReply,
      repliedAt: r.repliedAt,
      createdAt: r.createdAt,
    })),
    summary: {
      average: count > 0 ? Math.round((total / count) * 10) / 10 : 0,
      count,
      distribution,
    },
  })
}
