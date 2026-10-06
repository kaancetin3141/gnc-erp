import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// ============================================================
// PATCH  /api/hr/shifts/[id] — vardiya güncelle (hr.manage)
// DELETE /api/hr/shifts/[id] — vardiya sil (hr.manage)
// ============================================================

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'hr.manage')
  if (permErr) return permErr

  const { id } = await params
  const shift = await db.hrShift.findUnique({ where: { id } })
  if (!shift || shift.tenantId !== user!.tenantId) return err('Vardiya bulunamadı', 404)

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if (body.date !== undefined) {
    const d = new Date(body.date)
    if (Number.isNaN(d.getTime())) return err('Geçersiz tarih', 400)
    data.date = d
  }
  if (body.startTime !== undefined) {
    if (!TIME_RE.test(body.startTime)) return err('Geçersiz başlangıç saati (SS:DD)', 400)
    data.startTime = body.startTime
  }
  if (body.endTime !== undefined) {
    if (!TIME_RE.test(body.endTime)) return err('Geçersiz bitiş saati (SS:DD)', 400)
    data.endTime = body.endTime
  }
  if (body.note !== undefined) data.note = body.note?.trim() || null

  const finalStart = (data.startTime as string) ?? shift.startTime
  const finalEnd = (data.endTime as string) ?? shift.endTime
  if (finalEnd <= finalStart) return err('Bitiş saati başlangıçtan sonra olmalıdır', 400)

  const updated = await db.hrShift.update({
    where: { id },
    data,
    include: { employee: { select: { id: true, name: true, position: true } } },
  })

  return ok(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'hr.manage')
  if (permErr) return permErr

  const { id } = await params
  const shift = await db.hrShift.findUnique({ where: { id } })
  if (!shift || shift.tenantId !== user!.tenantId) return err('Vardiya bulunamadı', 404)

  await db.hrShift.delete({ where: { id } })

  return ok({ success: true })
}
