import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { whatsappLink, formatCurrency, formatDate } from '@/lib/format'

// PATCH — aidat güncelle (ödendi işaretle)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; duesId: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, duesId } = await params
  const body = await req.json()
  const { status, paidDate, paidAmount, paymentMethod, notes } = body

  const existing = await db.dues.findUnique({ where: { id: duesId } })
  if (!existing || existing.siteId !== id) return err('Aidat bulunamadı', 404)

  const updateData: Record<string, unknown> = {}
  if (status) {
    updateData.status = status
    if (status === 'odendi') {
      updateData.paidDate = paidDate ? new Date(paidDate) : new Date()
      updateData.paidAmount = paidAmount ? parseFloat(paidAmount) : existing.amount
      if (paymentMethod) updateData.paymentMethod = paymentMethod
    }
  }
  if (notes !== undefined) updateData.notes = notes

  const updated = await db.dues.update({ where: { id: duesId }, data: updateData })
  return ok(updated)
}

// DELETE
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; duesId: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, duesId } = await params
  await db.dues.delete({ where: { id: duesId } })
  return ok({ success: true })
}
