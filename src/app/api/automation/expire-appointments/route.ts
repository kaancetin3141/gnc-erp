import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// POST /api/automation/expire-appointments
// A-01 kuralı (kullanıcı onayı: tur8, 28.10.2026): Süresi geçmiş hâlâ "beklemede"
// duran randevuları otomatik olarak "iptal" işaretler. Böylece dashboard
// "Bekleyen Talep" sayacı gerçek bekleyenleri yansıtır; eski talepler arşivde
// notuyla birlikte kalır (silinmez).
// Kapsam: TÜM tenant'lar (veri hijyeni bakım işi) — yalnızca superadmin
// (cron-automation servisi admin@gnccrm.app kimliğiyle) çalıştırabilir.
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  if (user!.role !== 'superadmin') {
    return err('Bu işlem için yetkiniz yok', 403)
  }

  const now = new Date()
  const expired = await db.appointment.findMany({
    where: {
      status: 'beklemede',
      OR: [
        { endTime: { lt: now } },
        { endTime: null, date: { lt: now } },
      ],
    },
    select: {
      id: true,
      customerName: true,
      date: true,
      provider: { select: { tenantId: true } },
    },
    take: 500,
  })

  if (expired.length === 0) {
    return ok({ expiredCount: 0, ids: [] })
  }

  const dateStr = now.toLocaleDateString('tr-TR')
  let expiredCount = 0
  for (const a of expired) {
    const current = await db.appointment.findUnique({
      where: { id: a.id },
      select: { notes: true, status: true },
    })
    // Yarış koruması: bu arada durumu değişmişse dokunma
    if (!current || current.status !== 'beklemede') continue
    const noteSuffix = `Otomatik iptal: randevu saati geçti, onay gelmedi (${dateStr})`
    await db.appointment.update({
      where: { id: a.id },
      data: {
        status: 'iptal',
        notes: [current.notes, noteSuffix].filter(Boolean).join(' | '),
      },
    })
    await writeAuditLog({
      tenantId: a.provider.tenantId,
      actorId: user!.id,
      action: 'automation.appointment.expire',
      entity: 'Appointment',
      entityId: a.id,
      before: { status: 'beklemede' },
      after: { status: 'iptal', reason: noteSuffix },
    })
    expiredCount++
  }

  return ok({ expiredCount, ids: expired.map((a) => a.id) })
}
