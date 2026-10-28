import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// TENANT İZOLASYONU (S2): aidatın sitesi bu tenant'a ait mi?
async function checkDues(duesId: string, siteId: string, tenantId: string, isSuperadmin: boolean) {
  const d = await db.dues.findUnique({
    where: { id: duesId },
    include: { site: { select: { tenantId: true } } },
  })
  if (!d || d.siteId !== siteId) return null
  if (d.site.tenantId !== tenantId && !isSuperadmin) return null
  return d
}

// PATCH — aidat güncelle (ödendi işaretle / kısmi ödeme / geri al)
// Body: { status?, paidDate?, paidAmount?, paymentMethod?, notes? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; duesId: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!user!.permissions.includes('site.manage') && user!.role !== 'superadmin') {
    return err('Bu işlem için yetkiniz yok', 403)
  }

  const { id, duesId } = await params
  const existing = await checkDues(duesId, id, user!.tenantId, user!.role === 'superadmin')
  if (!existing) return err('Aidat bulunamadı', 404)

  const body = await req.json()
  const { status, paidDate, paidAmount, paymentMethod, notes } = body as {
    status?: string
    paidDate?: string
    paidAmount?: number | string
    paymentMethod?: string
    notes?: string
  }

  const updateData: Record<string, unknown> = {}

  // KISMİ ÖDEME DESTEĞİ (S7): ödenen tutar borcu kapatmıyorsa kayıt
  // 'odendi' OLMAZ — 'odenmedi'/'gecikti' kalır ve paidAmount birikir.
  // Toplam borç = aidat + gecikme zammı.
  const totalDue = existing.amount + (existing.lateFee || 0)

  if (status !== undefined) {
    if (!['odenmedi', 'odendi', 'gecikti'].includes(status)) {
      return err('Geçersiz durum', 400)
    }
    if (status === 'odendi') {
      // Ödenen tutar (MUTLAK toplam — UI bu semantiği kullanır):
      // gönderilen değer yoksa/eksikse kalan borç kadar ödeme sayılır.
      const incoming = paidAmount !== undefined ? parseFloat(String(paidAmount)) || 0 : NaN
      const newPaid = isNaN(incoming) ? totalDue : incoming
      if (newPaid + 0.01 < totalDue) {
        // Kısmi ödeme — durum 'odendi' OLAMAZ
        updateData.paidAmount = round2(newPaid)
        updateData.status = existing.status === 'gecikti' ? 'gecikti' : 'odenmedi'
        updateData.notes = notes !== undefined ? notes : existing.notes
        const updated = await db.dues.update({ where: { id: duesId }, data: updateData })
        return ok({
          ...updated,
          _partial: true,
          _message: `Kısmi ödeme kaydedildi (${round2(newPaid).toFixed(2)} / ${totalDue.toFixed(2)} ₺) — borç kapanmadığı için 'ödendi' işaretlenmedi`,
        })
      }
      updateData.status = 'odendi'
      updateData.paidDate = paidDate ? new Date(paidDate) : new Date()
      updateData.paidAmount = round2(newPaid)
      if (paymentMethod) updateData.paymentMethod = paymentMethod
    } else {
      // Geri alma ('odenmidi'/'gecikti' set edilirse): ödeme bilgisi sıfırlanır
      updateData.status = status
      if (status !== 'odendi') {
        updateData.paidAmount = paidAmount !== undefined ? parseFloat(String(paidAmount)) || 0 : 0
        updateData.paidDate = null
      }
    }
  } else if (paidAmount !== undefined) {
    // Sadece tutar güncellemesi
    updateData.paidAmount = parseFloat(String(paidAmount)) || 0
  }
  if (notes !== undefined) updateData.notes = notes

  const updated = await db.dues.update({ where: { id: duesId }, data: updateData })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'dues',
    entityId: duesId,
    before: { status: existing.status, paidAmount: existing.paidAmount },
    after: { status: updated.status, paidAmount: updated.paidAmount },
  })

  return ok(updated)
}

// DELETE — aidat sil (sadece bu sitenin aidatı, yetkili kullanıcı)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; duesId: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!user!.permissions.includes('site.manage') && user!.role !== 'superadmin') {
    return err('Bu işlem için yetkiniz yok', 403)
  }

  const { id, duesId } = await params
  const existing = await checkDues(duesId, id, user!.tenantId, user!.role === 'superadmin')
  if (!existing) return err('Aidat bulunamadı', 404)

  await db.dues.delete({ where: { id: duesId } })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'dues',
    entityId: duesId,
    before: { month: existing.month, year: existing.year, amount: existing.amount, status: existing.status },
  })
  return ok({ success: true })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
