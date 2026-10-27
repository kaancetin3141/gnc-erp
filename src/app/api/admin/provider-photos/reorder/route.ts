import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// ============================================================
// ADMIN — VİTRİN PORTFÖY FOTOĞRAFI SIRALAMA (toplu)
// POST { providerId, ids: [fotoId, ...] }
//   ids dizisindeki sıra → sortOrder 0..n-1 (tek transaction'da)
// Yetki: appointments.view VEYA users.manage · kapsam:
//   superadmin tümü, admin kendi tenant'ı — aksi halde 404.
// Dizide EKSİK fotoğraf varsa onlar dizinin sonuna korunur.
// ============================================================

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Geçersiz istek gövdesi', 400)
  const b = body as Record<string, unknown>

  const providerId = String(b.providerId || '').trim()
  const idsRaw = Array.isArray(b.ids) ? b.ids : []
  const ids = idsRaw.map((x) => String(x)).filter(Boolean)
  if (!providerId) return err('providerId gerekli', 400)
  if (ids.length === 0) return err('Sıralama listesi boş olamaz', 400)

  const provider = await db.serviceProvider.findUnique({ where: { id: providerId } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') {
    return err('İşletme bulunamadı', 404)
  }

  // Fotoğrafların gerçekten bu işletmeye ait olduğunu doğrula
  const photos = await db.providerPhoto.findMany({
    where: { providerId },
    select: { id: true },
  })
  const owned = new Set(photos.map((p) => p.id))
  const validIds = ids.filter((id) => owned.has(id))
  if (validIds.length !== ids.length) {
    return err('Sıralama listesinde bu işletmeye ait olmayan fotoğraf var', 400)
  }

  // Eksik kalan fotoğraflar (dizide unutulanlar) sona eklenir
  const missing = [...owned].filter((id) => !validIds.includes(id))
  const finalOrder = [...validIds, ...missing]

  await db.$transaction(
    finalOrder.map((id, i) =>
      db.providerPhoto.update({ where: { id }, data: { sortOrder: i } }),
    ),
  )

  return ok({ success: true, count: finalOrder.length })
}
