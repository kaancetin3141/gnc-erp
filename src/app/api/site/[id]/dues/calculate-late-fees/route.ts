import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// POST — gecikme zammı hesapla
//
// Kural:
//   - status='odenmedi' AND dueDate < bugun → status='gecikti' yap
//   - status='gecikti' AND lateFee=0 (henüz uygulanmamış) → lateFee = amount * 0.05
//     (kümülatif değil — bir kere uygulama yeterli)
//
// Yanıt: { markedLate: number, lateFeeApplied: number, totalLateFee: number }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!user) return err('Oturum açmanız gerekli', 401)
  if (!user.permissions.includes('site.manage')) return err('Bu işlem için yetkiniz yok', 403)

  const { id } = await params

  const site = await db.site.findUnique({ where: { id } })
  if (!site) return err('Site bulunamadı', 404)

  const now = new Date()

  // 1) Ödenmemiş ama vadesi geçmiş aidatları 'gecikti' yap
  const overdueUnpaid = await db.dues.findMany({
    where: {
      siteId: id,
      status: 'odenmedi',
      dueDate: { lt: now },
    },
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
    where: {
      siteId: id,
      status: 'gecikti',
      lateFee: 0,
    },
    select: { id: true, amount: true },
  })

  const lateFeePct = 0.05 // %5 gecikme zammı
  let lateFeeApplied = 0
  let totalLateFee = 0

  for (const d of lateCandidates) {
    const fee = Math.round(d.amount * lateFeePct * 100) / 100 // 2 ondalık basamak
    if (fee <= 0) continue
    await db.dues.update({
      where: { id: d.id },
      data: {
        lateFee: fee,
        lateFeeAppliedAt: now,
        notes: 'Gecikme zammı: %5 uygulandı',
      },
    })
    lateFeeApplied += 1
    totalLateFee += fee
  }

  await writeAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    action: 'update',
    entity: 'dues',
    entityId: id,
    after: { markedLate, lateFeeApplied, totalLateFee, lateFeePct },
  })

  return ok({
    markedLate,
    lateFeeApplied,
    totalLateFee,
    message: `${markedLate} aidat gecikti olarak işaretlendi, ${lateFeeApplied} aidata %5 gecikme zammı uygulandı (${totalLateFee.toFixed(2)} ₺)`,
  })
}
