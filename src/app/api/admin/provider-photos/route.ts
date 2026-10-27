import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// ADMIN — İŞLETME VİTRİN PORTFÖY FOTOĞRAFLARI
// GET  ?providerId=  → { photos: [...] } (sıralı; superadmin hepsi,
//                      admin yalnız kendi tenant'ı — kapsam dışı 404)
// POST { providerId, url, title?, caption?, category?, width?, height? }
//   url: data:image/webp|jpeg|png|gif;base64,... (max 2 MB base64 metni;
//   istemci tarafında canvas 1280px WebP'ye küçültülür)
// Yetki: appointments.view VEYA users.manage (panel deseni)
// ============================================================

const DATA_URL_RE = /^data:image\/(webp|jpeg|png|gif);base64,[A-Za-z0-9+/=]+$/
const MAX_URL_LEN = 2_000_000 // ~1.5 MB ikili
const MAX_TITLE = 80
const MAX_CAPTION = 200
const CATEGORIES = ['kesim', 'sac-boyama', 'sakal', 'stil', 'salon', 'ekip', 'diger']

export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const providerId = (url.searchParams.get('providerId') || '').trim()
  if (!providerId) return err('providerId gerekli', 400)

  const provider = await db.serviceProvider.findUnique({ where: { id: providerId } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') {
    return err('İşletme bulunamadı', 404) // kapsam dışı — bilgi sızdırmaz
  }

  const photos = await db.providerPhoto.findMany({
    where: { providerId },
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, url: true, title: true, caption: true, category: true,
      width: true, height: true, sortOrder: true, isActive: true, createdAt: true,
    },
  })
  return ok({ photos })
}

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Geçersiz istek gövdesi', 400)

  const providerId = String((body as Record<string, unknown>).providerId || '').trim()
  const url = String((body as Record<string, unknown>).url || '')
  if (!providerId) return err('providerId gerekli', 400)
  if (!DATA_URL_RE.test(url)) {
    return err('Fotoğraf yalnızca geçerli bir görsel data URL olabilir (webp/jpeg/png/gif)', 400)
  }
  if (url.length > MAX_URL_LEN) {
    return err('Fotoğraf çok büyük — en fazla ~1,5 MB (1280px önerilir)', 413)
  }

  const provider = await db.serviceProvider.findUnique({ where: { id: providerId } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') {
    return err('İşletme bulunamadı', 404)
  }

  // Fotoğraf sayısı sınırı — vitrin performansı (SSR'a gömülüyor)
  const count = await db.providerPhoto.count({ where: { providerId } })
  if (count >= 24) {
    return err('Bu vitrinde en fazla 24 fotoğraf olabilir — fazlaysa birkaçını silin', 400)
  }

  const title = String((body as Record<string, unknown>).title || '').trim().slice(0, MAX_TITLE) || null
  const caption = String((body as Record<string, unknown>).caption || '').trim().slice(0, MAX_CAPTION) || null
  const catRaw = String((body as Record<string, unknown>).category || '').trim()
  const category = (CATEGORIES as readonly string[]).includes(catRaw) ? catRaw : null
  const width = Number((body as Record<string, unknown>).width) || null
  const height = Number((body as Record<string, unknown>).height) || null

  // Yeni foto en sona eklenir
  const maxSort = await db.providerPhoto.findFirst({
    where: { providerId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const photo = await db.providerPhoto.create({
    data: {
      providerId,
      url,
      title,
      caption,
      category,
      width: width && width > 0 ? Math.round(width) : null,
      height: height && height > 0 ? Math.round(height) : null,
      sortOrder: (maxSort?.sortOrder ?? -1) + 1,
    },
  })

  await writeAuditLog({
    tenantId: provider.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'provider_photo',
    entityId: photo.id,
    before: 'null',
    after: JSON.stringify({ title, category, provider: provider.name }),
  }).catch(() => {})

  return ok({ photo }, 201)
}
