import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requirePermission, ok, err,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { normalizePhone } from '@/lib/format'

// POST — seçili maps sonuçlarını lead olarak içe aktar
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'leads.import')
  if (permErr) return permErr

  const body = await req.json()
  const { searchId, items, ownerId } = body

  if (!Array.isArray(items) || items.length === 0) {
    return err('İçe aktarılacak kayıt yok', 400)
  }
  if (!searchId) return err('searchId gerekli', 400)

  // searchId geçerli mi?
  const search = await db.mapsSearch.findFirst({
    where: { id: searchId, tenantId: user!.tenantId },
    select: { id: true, importedCount: true },
  })
  if (!search) return err('Arama kaydı bulunamadı', 404)

  const targetOwnerId = ownerId || user!.id
  // Owner tenant'ta mı?
  if (targetOwnerId !== user!.id) {
    const owner = await db.user.findFirst({
      where: { id: targetOwnerId, tenantId: user!.tenantId },
      select: { id: true },
    })
    if (!owner) return err('Sahip kullanıcısı bulunamadı', 404)
  }

  // Aynı placeId'ye sahip lead'leri atla (deduplication)
  const placeIds = items
    .map((i: { placeId?: string }) => i.placeId)
    .filter(Boolean) as string[]
  const existing = await db.lead.findMany({
    where: { tenantId: user!.tenantId, placeId: { in: placeIds } },
    select: { placeId: true },
  })
  const existingSet = new Set(existing.map((e) => e.placeId))

  const toCreate = items.filter(
    (i: { placeId?: string }) => !i.placeId || !existingSet.has(i.placeId),
  )

  if (toCreate.length === 0) {
    return ok({ created: [], skipped: items.length, searchId })
  }

  // Toplu oluştur
  const created = await db.$transaction(
    toCreate.map((item: {
      placeId?: string; name: string; category?: string;
      address?: string; city?: string; lat?: number; lng?: number;
      phone?: string; web?: string; rating?: number; reviewCount?: number;
    }) =>
      db.lead.create({
        data: {
          tenantId: user!.tenantId,
          name: item.name,
          placeId: item.placeId || null,
          category: item.category || null,
          address: item.address || null,
          city: item.city || null,
          lat: item.lat ?? null,
          lng: item.lng ?? null,
          phone: item.phone ? normalizePhone(item.phone) || item.phone : null,
          web: item.web || null,
          rating: item.rating ?? null,
          reviewCount: item.reviewCount ?? null,
          ownerId: targetOwnerId,
          source: 'google_maps',
          status: 'yeni',
          notes: JSON.stringify([]),
          mapsSearchId: searchId,
        },
        include: {
          owner: { select: { id: true, name: true } },
        },
      }),
    ),
  )

  // importedCount güncelle
  await db.mapsSearch.update({
    where: { id: searchId },
    data: { importedCount: search.importedCount + created.length },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'import',
    entity: 'lead',
    entityId: searchId,
    after: { count: created.length, searchId, ownerId: targetOwnerId },
  })

  return ok({
    created,
    skipped: items.length - created.length,
    searchId,
  }, 201)
}
