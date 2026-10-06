import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_STATUSES = ['bekliyor', 'onaylandi', 'geldi', 'gelmedi', 'iptal']

// ============================================================
// PATCH — rezervasyon güncelle (durum akışı + edit)
// Body: { status?, name?, phone?, partySize?, date?, durationMin?, tableId?, note? }
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; resId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.orders')
  if (permErr) return permErr

  const { id, resId } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId) return err('Kafe bulunamadı', 404)

  const existing = await db.cafeReservation.findUnique({ where: { id: resId } })
  if (!existing || existing.cafeId !== id) return err('Rezervasyon bulunamadı', 404)

  const body = await req.json()
  const { status, name, phone, partySize, date, durationMin, tableId, note } = body as {
    status?: string; name?: string; phone?: string; partySize?: number; date?: string
    durationMin?: number; tableId?: string | null; note?: string
  }

  const data: Record<string, unknown> = {}

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) return err('Geçersiz durum', 400)
    if (status === existing.status) {
      // no-op allowed
    }
    // iptal edilen rezervasyon tekrar bekleyene alınamaz — ama onaylanabilir (esneklik)
    data.status = status
    if (status === 'geldi') {
      // geldi olarak işaretlenen rezervasyonda masayı dolu yap (masa varsa)
      if (existing.tableId) {
        await db.cafeTable.updateMany({ where: { id: existing.tableId, status: 'bos' }, data: { status: 'dolu' } })
      }
    }
  }

  if (name !== undefined) {
    if (!name.trim()) return err('Müşteri adı boş olamaz', 400)
    data.name = name.trim()
  }
  if (phone !== undefined) data.phone = phone?.trim() || null
  if (partySize !== undefined) {
    const party = Math.max(1, Math.min(100, Math.round(Number(partySize))))
    data.partySize = party
    // masa kapasitesi tekrar kontrol
    const tableIdToCheck = tableId !== undefined ? tableId : existing.tableId
    if (tableIdToCheck) {
      const table = await db.cafeTable.findUnique({ where: { id: tableIdToCheck } })
      if (table && table.capacity < party) {
        return err(`Masa kapasitesi (${table.capacity}) kişi sayısından (${party}) az`, 400)
      }
    }
  }
  if (date !== undefined) {
    const d = new Date(date)
    if (isNaN(d.getTime())) return err('Geçerli tarih gerekli', 400)
    data.date = d
  }
  if (durationMin !== undefined) {
    data.durationMin = Math.max(30, Math.min(480, Math.round(Number(durationMin))))
  }
  if (tableId !== undefined) {
    if (tableId) {
      const table = await db.cafeTable.findUnique({ where: { id: tableId } })
      if (!table || table.cafeId !== id) return err('Masa bulunamadı', 404)
    }
    data.tableId = tableId || null
  }
  if (note !== undefined) data.note = note?.trim() || null

  const updated = await db.cafeReservation.update({
    where: { id: resId },
    data,
    include: { table: { select: { id: true, number: true, capacity: true } } },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'cafe_reservation',
    entityId: resId,
    after: { status: updated.status, name: updated.name },
  })

  return ok(updated)
}

// ============================================================
// DELETE — rezervasyon sil
// ============================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; resId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.orders')
  if (permErr) return permErr

  const { id, resId } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId) return err('Kafe bulunamadı', 404)

  const existing = await db.cafeReservation.findUnique({ where: { id: resId } })
  if (!existing || existing.cafeId !== id) return err('Rezervasyon bulunamadı', 404)

  await db.cafeReservation.delete({ where: { id: resId } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'cafe_reservation',
    entityId: resId,
    before: { name: existing.name, date: existing.date },
  })

  return ok({ deleted: true })
}
