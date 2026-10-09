import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// ============================================================
// GET  /api/hr/shifts — vardiya listesi (hr.view)
//      ?from=YYYY-MM-DD&to=YYYY-MM-DD  &employeeId=
// POST /api/hr/shifts — yeni vardiya (hr.manage)
// ============================================================

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'hr.view')
  if (permErr) return permErr

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const employeeId = (searchParams.get('employeeId') || '').trim()

  const where: {
    tenantId?: string
    date?: { gte?: Date; lte?: Date }
    employeeId?: string
  } = user!.role === 'superadmin' ? {} : { tenantId: user!.tenantId }
  if (from && !Number.isNaN(new Date(from).getTime())) where.date = { ...where.date, gte: new Date(from) }
  if (to && !Number.isNaN(new Date(to).getTime())) {
    const toEnd = new Date(to)
    toEnd.setHours(23, 59, 59, 999)
    where.date = { ...where.date, lte: toEnd }
  }
  if (employeeId) where.employeeId = employeeId

  const shifts = await db.hrShift.findMany({
    where,
    orderBy: { date: 'asc' },
    include: { employee: { select: { id: true, name: true, position: true } } },
  })

  return ok({ items: shifts })
}

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'hr.manage')
  if (permErr) return permErr

  const body = await req.json().catch(() => ({}))
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : ''
  const startTime = typeof body.startTime === 'string' ? body.startTime.trim() : ''
  const endTime = typeof body.endTime === 'string' ? body.endTime.trim() : ''

  if (!employeeId || !TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    return err('Personel ve geçerli saatler (SS:DD) zorunludur', 400)
  }
  if (endTime <= startTime) return err('Bitiş saati başlangıçtan sonra olmalıdır', 400)

  const date = body.date ? new Date(body.date) : null
  if (!date || Number.isNaN(date.getTime())) return err('Geçerli bir tarih zorunludur', 400)

  const employee = await db.hrEmployee.findUnique({ where: { id: employeeId } })
  if (!employee || employee.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Personel bulunamadı', 404)

  const shift = await db.hrShift.create({
    data: {
      // SUPERADMIN çapraz-tenant yazımında kayıt, personelin tenantına ait olmalı
      tenantId: employee.tenantId,
      employeeId,
      date,
      startTime,
      endTime,
      note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
    },
    include: { employee: { select: { id: true, name: true, position: true } } },
  })

  return ok(shift, 201)
}
