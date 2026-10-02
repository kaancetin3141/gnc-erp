import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { safeJsonParse } from '@/lib/api-utils'

// ============================================================
// PUBLIC (auth gerektirmez) — gncinc.online ana sitesi proje listesi
// CORS açık: farklı subdomain'lerden (gncinc.online -> crm.gncinc.online) fetch edilebilir
// GET /api/portfolio -> { projects: [...] }
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  try {
    const projects = await db.portfolioProject.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json(
      {
        projects: projects.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          url: p.url,
          subdomain: p.subdomain,
          status: p.status,
          emoji: p.emoji,
          tech: safeJsonParse<string[]>(p.tech, []),
          features: safeJsonParse<string[]>(p.features, []),
          sortOrder: p.sortOrder,
        })),
        generatedAt: new Date().toISOString(),
      },
      { headers: CORS_HEADERS },
    )
  } catch (error) {
    console.error('[portfolio] GET error:', error)
    return NextResponse.json(
      { error: 'Projeler yüklenemedi' },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
