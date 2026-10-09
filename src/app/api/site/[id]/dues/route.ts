import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// Late-fee percentage (5%) — applied once when a dues record becomes overdue
const LATE_FEE_PCT = 0.05

/** Round to 2 decimal places (TRY kuruş) */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// GET — aidat listesi (filtreli)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const url = new URL(req.url)
  const month = url.searchParams.get('month') || ''
  const year = url.searchParams.get('year') || ''
  const status = url.searchParams.get('status') || ''

  const where: Record<string, unknown> = { siteId: id }
  if (month) where.month = parseInt(month)
  if (year) where.year = parseInt(year)
  if (status) where.status = status

  const dues = await db.dues.findMany({
    where,
    include: {
      apartment: { include: { block: { select: { name: true } } } },
      resident: { select: { id: true, name: true, phone: true } },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { apartment: { number: 'asc' } }],
    take: 500,
  })

  // Stats
  const totalAmount = dues.reduce((s, d) => s + d.amount, 0)
  const paidAmount = dues.filter(d => d.status === 'odendi').reduce((s, d) => s + (d.paidAmount || d.amount), 0)
  const unpaidCount = dues.filter(d => d.status === 'odenmedi').length

  return ok({ items: dues, stats: { total: dues.length, totalAmount, paidAmount, unpaidCount } })
}

// POST — aylık aidat oluştur (tüm daireler için) veya tekil
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const body = await req.json()
  const { month, year, amount, apartmentId, generateAll } = body

  if (!month || !year) return err('Ay ve yıl gerekli', 400)

  if (generateAll) {
    // Tüm daireler için aidat oluştur
    const apartments = await db.apartment.findMany({ where: { block: { siteId: id } } })
    if (apartments.length === 0) return err('Bu siteye ait daire yok', 400)

    const site = await db.site.findUnique({ where: { id } })
    const dueAmount = parseFloat(amount) || site?.defaultDueAmount || 0
    const dueDate = new Date(year, month - 1, site?.dueDay || 5)

    // Var mı kontrol et
    const existing = await db.dues.findFirst({ where: { siteId: id, month: parseInt(month), year: parseInt(year) } })
    if (existing) return err('Bu ay için aidat zaten oluşturulmuş', 400)

    // Önce tüm daireler için aidatı 'odenmedi' olarak oluştur
    const created = await db.dues.createMany({
      data: apartments.map(a => ({
        siteId: id,
        apartmentId: a.id,
        residentId: a.residentId,
        month: parseInt(month),
        year: parseInt(year),
        amount: dueAmount,
        currency: site?.currency || 'TRY',
        dueDate,
        status: 'odenmedi',
      })),
    })

    // Eğer oluşturulan aidatın vade tarihi geçmişse → otomatik 'gecikti' + %5 gecikme zammı uygula
    // (geçmiş aya aidat yeniden oluşturulursa, gecikmiş durumda ve zammı ile başlatılır)
    const now = new Date()
    let markedLate = 0
    let lateFeeApplied = 0
    let totalLateFee = 0
    if (dueDate.getTime() < now.getTime()) {
      const lateFee = round2(dueAmount * LATE_FEE_PCT)
      const upd = await db.dues.updateMany({
        where: { siteId: id, month: parseInt(month), year: parseInt(year), status: 'odenmedi' },
        data: {
          status: 'gecikti',
          lateFee: lateFee,
          lateFeeAppliedAt: now,
          notes: `Gecikme zammı: %${(LATE_FEE_PCT * 100).toFixed(0)} uygulandı (otomatik, vade tarihi geçmiş)`,
        },
      })
      markedLate = upd.count
      lateFeeApplied = upd.count
      totalLateFee = round2(lateFee * upd.count)
    }

    await writeAuditLog({
      tenantId: user!.tenantId,
      actorId: user!.id,
      action: 'create',
      entity: 'dues',
      entityId: id,
      after: { created: created.count, markedLate, lateFeeApplied, totalLateFee, month, year },
    })

    return ok({
      created: created.count,
      markedLate,
      lateFeeApplied,
      totalLateFee,
      message:
        markedLate > 0
          ? `${created.count} daire için aidat oluşturuldu (${markedLate} tanesi vadesi geçmiş → gecikti +%${(LATE_FEE_PCT * 100).toFixed(0)} zam)`
          : `${created.count} daire için aidat oluşturuldu`,
    })
  } else if (apartmentId) {
    // Tek daire için
    const site = await db.site.findUnique({ where: { id } })
    const apt = await db.apartment.findUnique({ where: { id: apartmentId } })
    const dueDate = new Date(year, month - 1, site?.dueDay || 5)

    const dues = await db.dues.create({
      data: {
        siteId: id,
        apartmentId,
        residentId: apt?.residentId,
        month: parseInt(month),
        year: parseInt(year),
        amount: parseFloat(amount) || site?.defaultDueAmount || 0,
        currency: site?.currency || 'TRY',
        dueDate,
        status: 'odenmedi',
      },
    })
    return ok(dues)
  }

  return err('generateAll veya apartmentId gerekli', 400)
}

// PATCH — toplu aidat işlemleri (action bazlı)
//
// Action'lar:
//   - 'calculate-late-fees' : Tüm aidatlar için gecikme zammını yeniden hesapla
//     • status='odenmedi' AND dueDate<bugun → status='gecikti'
//     • status='gecikti' AND lateFee=0 → lateFee = amount * 0.05 (bir kez)
//   Yanıt: { markedLate, lateFeeApplied, totalLateFee, message }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!user!.permissions.includes('site.manage')) return err('Bu işlem için yetkiniz yok', 403)

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body?.action

  if (action !== 'calculate-late-fees') {
    return err("Geçerli bir 'action' gerekli (örn: 'calculate-late-fees')", 400)
  }

  const site = await db.site.findUnique({ where: { id } })
  if (!site) return err('Site bulunamadı', 404)

  const now = new Date()

  // 1) Ödenmemiş ama vadesi geçmiş aidatları 'gecikti' yap
  const overdueUnpaid = await db.dues.findMany({
    where: { siteId: id, status: 'odenmedi', dueDate: { lt: now } },
    select: { id: true },
  })
  let markedLate = 0
  if (overdueUnpaid.length > 0) {
    const r = await db.dues.updateMany({
      where: { id: { in: overdueUnpaid.map((d) => d.id) } },
      data: { status: 'gecikti' },
    })
    markedLate = r.count
  }

  // 2) 'gecikti' durumuna düşmüş ama lateFee henüz uygulanmamış aidatlara %5 zam
  const lateCandidates = await db.dues.findMany({
    where: { siteId: id, status: 'gecikti', lateFee: 0 },
    select: { id: true, amount: true },
  })

  let lateFeeApplied = 0
  let totalLateFee = 0
  for (const d of lateCandidates) {
    const fee = round2(d.amount * LATE_FEE_PCT)
    if (fee <= 0) continue
    await db.dues.update({
      where: { id: d.id },
      data: {
        lateFee: fee,
        lateFeeAppliedAt: now,
        notes: `Gecikme zammı: %${(LATE_FEE_PCT * 100).toFixed(0)} uygulandı`,
      },
    })
    lateFeeApplied += 1
    totalLateFee = round2(totalLateFee + fee)
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'dues',
    entityId: id,
    after: { action: 'calculate-late-fees', markedLate, lateFeeApplied, totalLateFee, lateFeePct: LATE_FEE_PCT },
  })

  return ok({
    markedLate,
    lateFeeApplied,
    totalLateFee,
    message:
      `${markedLate} aidat gecikti olarak işaretlendi, ${lateFeeApplied} aidata %${(LATE_FEE_PCT * 100).toFixed(0)} gecikme zammı uygulandı (${totalLateFee.toFixed(2)} ₺)`,
  })
}
