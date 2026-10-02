import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err, getSession, requireAuth, safeJsonParse } from '@/lib/api-utils'

// ============================================================
// ADMIN — Portfolyo proje yönetimi (CRM paneli "Portfolyo" sekmesi)
// GET    /api/portfolio-admin          -> tüm projeler (yayında olmayanlar dahil)
// POST   /api/portfolio-admin          -> yeni proje
// ============================================================

function parseArrayInput(input: unknown): string | null {
  if (input === undefined || input === null || input === '') return null
  if (Array.isArray(input)) {
    const arr = input.map((s) => String(s).trim()).filter(Boolean)
    return arr.length ? JSON.stringify(arr) : null
  }
  // Kullanıcı "Next.js 16, TypeScript" gibi virgüllü metin girebilir
  const arr = String(input)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return arr.length ? JSON.stringify(arr) : null
}

export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const projects = await db.portfolioProject.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return ok({
    projects: projects.map((p) => ({
      ...p,
      tech: safeJsonParse<string[]>(p.tech, []),
      features: safeJsonParse<string[]>(p.features, []),
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (user!.role !== 'admin' && user!.role !== 'superadmin') {
    return err('Bu işlem için yönetici yetkisi gerekli', 403)
  }

  const body = await req.json().catch(() => null)
  if (!body) return err('Geçersiz istek gövdesi')

  const title = String(body.title || '').trim()
  const description = String(body.description || '').trim()
  if (!title) return err('Proje başlığı gerekli')
  if (!description) return err('Proje açıklaması gerekli')

  const url = body.url ? String(body.url).trim() : null
  const subdomain = body.subdomain ? String(body.subdomain).trim() : null
  const status = ['live', 'soon', 'planned'].includes(body.status) ? body.status : 'live'

  try {
    const project = await db.portfolioProject.create({
      data: {
        title,
        description,
        url,
        subdomain,
        status,
        emoji: body.emoji ? String(body.emoji).trim().slice(0, 8) : '🚀',
        tech: parseArrayInput(body.tech),
        features: parseArrayInput(body.features),
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 99,
        published: body.published !== false,
      },
    })
    return ok({ project }, 201)
  } catch (error) {
    console.error('[portfolio-admin] POST error:', error)
    return err('Proje eklenemedi', 500)
  }
}
