import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err, safeJsonParse } from '@/lib/api-utils'

// GET — randevu listesi (tarih/staff/status filtreli)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const url = new URL(req.url)
  const date = url.searchParams.get('date') // YYYY-MM-DD
  const staffId = url.searchParams.get('staffId') || ''
  const status = url.searchParams.get('status') || ''

  const where: Record<string, unknown> = { providerId: id }
  if (staffId) where.staffId = staffId
  if (status) where.status = status
  if (date) {
    const start = new Date(date + 'T00:00:00')
    const end = new Date(date + 'T23:59:59')
    where.date = { gte: start, lte: end }
  }

  const appointments = await db.appointment.findMany({
    where,
    include: {
      staff: { select: { id: true, name: true, title: true, photo: true } },
      service: { select: { id: true, name: true, duration: true, price: true } },
    },
    orderBy: { date: 'asc' },
    take: 200,
  })

  return ok(appointments)
}

// POST — yeni randevu oluştur (çakışma kontrolü ile)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const body = await req.json()
  const { staffId, serviceId, customerName, customerPhone, customerEmail, customerNote, date, source } = body

  if (!customerName || !customerPhone || !date) return err('Müşteri adı, telefon ve tarih gerekli', 400)

  // Hizmet süresini al
  const service = serviceId ? await db.service.findUnique({ where: { id: serviceId } }) : null
  const duration = service?.duration || 30
  const startTime = new Date(date)
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000)

  // Çakışma kontrolü (aynı personel, aynı zaman aralığı)
  if (staffId) {
    const conflicts = await db.appointment.findMany({
      where: {
        providerId: id,
        staffId,
        status: { in: ['beklemede', 'onaylandi'] },
        date: { lt: endTime },
        endTime: { gt: startTime },
      },
    })
    if (conflicts.length > 0) return err('Bu saatte aynı personelin başka randevusu var', 409)
  }

  const appointment = await db.appointment.create({
    data: {
      providerId: id,
      staffId: staffId || null,
      serviceId: serviceId || null,
      customerName,
      customerPhone,
      customerEmail: customerEmail || null,
      customerNote: customerNote || null,
      date: startTime,
      endTime,
      status: 'onaylandi',
      price: service?.price || 0,
      source: source || 'web',
    },
    include: {
      staff: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, duration: true, price: true } },
    },
  })

  return ok(appointment)
}
