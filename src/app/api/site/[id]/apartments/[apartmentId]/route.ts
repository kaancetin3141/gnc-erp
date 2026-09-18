import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, ok, err } from '@/lib/api-utils'

async function checkApartmentForUser(apartmentId: string, tenantId: string) {
  const apt = await db.apartment.findUnique({
    where: { id: apartmentId },
    include: { site: true },
  })
  if (!apt || apt.site.tenantId !== tenantId) return null
  return apt
}

// ============================================================
// PATCH — daire güncelle (site.manage)
// ============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; apartmentId: string }> },
) {
  const user = await getSession(req)
  if (!user || !user.permissions.includes('site.manage')) return err('Bu işlem için yetkiniz yok', 403)

  const { apartmentId } = await params
  const apt = await checkApartmentForUser(apartmentId, user.tenantId)
  if (!apt) return err('Daire bulunamadı', 404)

  const body = await req.json()
  const { number, floor, type, area, blockId, residentId } = body as {
    number?: string; floor?: number; type?: string; area?: number
    blockId?: string; residentId?: string | null
  }

  // Eğer blok değişiyorsa, yeni blok aynı siteye ait olmalı
  if (blockId && blockId !== apt.blockId) {
    const block = await db.block.findUnique({ where: { id: blockId } })
    if (!block || block.siteId !== apt.siteId) return err('Blok bu siteye ait değil', 400)
  }

  // Eğer residentId verildiyse, o resident bu siteye ait olmalı
  if (residentId !== undefined && residentId !== null) {
    const resident = await db.resident.findUnique({ where: { id: residentId } })
    if (!resident || resident.siteId !== apt.siteId) return err('Sakin bu siteye ait değil', 400)
  }

  const updated = await db.apartment.update({
    where: { id: apartmentId },
    data: {
      ...(typeof number === 'string' && number.trim() ? { number: number.trim() } : {}),
      ...(typeof floor === 'number' ? { floor } : {}),
      ...(typeof type === 'string' && type.trim() ? { type: type.trim() } : {}),
      ...(typeof area === 'number' ? { area } : {}),
      ...(blockId ? { blockId } : {}),
      ...(residentId !== undefined ? { residentId: residentId || null } : {}),
    },
    include: {
      block: { select: { id: true, name: true } },
      resident: { select: { id: true, name: true, phone: true } },
    },
  })

  return ok(updated)
}

// ============================================================
// DELETE — daire sil (site.manage)
// ============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; apartmentId: string }> },
) {
  const user = await getSession(req)
  if (!user || !user.permissions.includes('site.manage')) return err('Bu işlem için yetkiniz yok', 403)

  const { apartmentId } = await params
  const apt = await checkApartmentForUser(apartmentId, user.tenantId)
  if (!apt) return err('Daire bulunamadı', 404)

  await db.apartment.delete({ where: { id: apartmentId } })
  return ok({ success: true })
}
