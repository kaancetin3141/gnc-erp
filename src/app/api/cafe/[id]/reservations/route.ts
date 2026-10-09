import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_STATUSES = ['bekliyor', 'onaylandi', 'geldi', 'gelmedi', 'iptal']
const VALID_SOURCES = ['yuzden', 'telefon', 'whatsapp', 'online']

// ============================================================
// GET — rezervasyon listesi
// Query: ?date=YYYY-MM-DD (tek gün) | ?from=&to= (aralık) | ?status= | ?upcoming=1
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.view')
  if (permErr) return permErr

  const { id } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Kafe bulunamadı', 404)

  const sp = Object.fromEntries(new URL(req.url).searchParams)
  const where: Record<string, unknown> = { cafeId: id }

  if (sp.date) {
    const d = new Date(sp.date + 'T00:00:00')
    const dEnd = new Date(sp.date + 'T23:59:59.999')
    where.date = { gte: d, lte: dEnd }
  } else if (sp.from && sp.to) {
    where.date = { gte: new Date(sp.from + 'T00:00:00'), lte: new Date(sp.to + 'T23:59:59.999') }
  } else if (sp.upcoming === '1') {
    where.date = { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
  }
  if (sp.status && VALID_STATUSES.includes(sp.status)) where.status = sp.status

  const reservations = await db.cafeReservation.findMany({
    where,
    orderBy: { date: 'asc' },
    include: {
      table: { select: { id: true, number: true, capacity: true } },
    },
    take: 300,
  })

  // Gelen kişi sayısı özeti (onaylı + geldi)
  const activeReservations = reservations.filter((r) => r.status === 'onaylandi' || r.status === 'geldi')
  const totalGuests = activeReservations.reduce((s, r) => s + r.partySize, 0)

  return ok({ items: reservations, summary: { total: reservations.length, active: activeReservations.length, totalGuests } })
}

// ============================================================
// POST — yeni rezervasyon
// Body: { name, phone?, partySize, date (ISO), durationMin?, tableId?, source?, note? }
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.orders')
  if (permErr) return permErr

  const { id } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Kafe bulunamadı', 404)

  const body = await req.json()
  const { name, phone, partySize, date, durationMin, tableId, source, note } = body as {
    name?: string; phone?: string; partySize?: number; date?: string
    durationMin?: number; tableId?: string; source?: string; note?: string
  }

  if (!name?.trim()) return err('Müşteri adı gerekli', 400)
  if (!date || isNaN(new Date(date).getTime())) return err('Geçerli bir tarih/saat gerekli', 400)

  const party = Math.max(1, Math.min(100, Math.round(Number(partySize ?? 2))))

  // Rezervasyon tarihi geçmişe alınamaz (30 dk tolerans)
  const resDate = new Date(date)
  if (resDate.getTime() < Date.now() - 30 * 60 * 1000) {
    return err('Rezervasyon geçmiş bir zamana alınamaz', 400)
  }

  // Masa kontrolü + kapasite uyarısı + çakışma kontrolü
  if (tableId) {
    const table = await db.cafeTable.findUnique({ where: { id: tableId } })
    if (!table || table.cafeId !== id) return err('Masa bulunamadı', 404)
    if (table.capacity < party) {
      return err(`Masa kapasitesi (${table.capacity}) kişi sayısından (${party}) az`, 400)
    }
    // Aynı masada çakışan aktif rezervasyon var mı? (aralık kesişimi)
    const start = resDate.getTime()
    const end = start + (Math.round(Number(durationMin ?? 90)) * 60 * 1000)
    const actives = await db.cafeReservation.findMany({
      where: {
        cafeId: id,
        tableId,
        status: { in: ['bekliyor', 'onaylandi'] },
        date: { lt: new Date(end) },
      },
    })
    const clash = actives.find((r) => r.date.getTime() + r.durationMin * 60 * 1000 > start)
    if (clash) {
      const t = clash.date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      return err(`Bu masada ${t} için ${clash.name} rezervasyonu var`, 409)
    }
  }

  const reservation = await db.cafeReservation.create({
    data: {
      cafeId: id,
      tableId: tableId || null,
      name: name.trim(),
      phone: phone?.trim() || null,
      partySize: party,
      date: resDate,
      durationMin: Math.max(30, Math.min(480, Math.round(Number(durationMin ?? 90)))),
      status: 'bekliyor',
      source: source && VALID_SOURCES.includes(source) ? source : 'yuzden',
      note: note?.trim() || null,
    },
    include: { table: { select: { id: true, number: true, capacity: true } } },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'cafe_reservation',
    entityId: reservation.id,
    after: { name: reservation.name, date: reservation.date, partySize: reservation.partySize },
  })

  return ok(reservation, 201)
}
