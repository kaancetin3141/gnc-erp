import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// İHRACAT BELGESİ DETAY
// GET   /api/export-docs/[id]  → belge + müşteri + sipariş + fatura kalemleri (PDF verisi)
// PATCH /api/export-docs/[id]  → dış ticaret alanlarını güncelle (incoterms, taşıma, liman vb.)
// DELETE /api/export-docs/[id] → belgeyi sil
// Yetki: erp.manage VEYA invoices.view (ticari evrak)
// ============================================================

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'erp.manage') && !hasPermission(user!, 'invoices.view')) {
    return err('İhracat belgesi görüntüleme yetkiniz yok', 403)
  }

  const { id } = await params
  const doc = await db.exportDoc.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, address: true, city: true, country: true, taxNumber: true } },
      order: {
        select: {
          id: true, number: true, orderDate: true, currency: true,
          quote: { select: { number: true } },
        },
      },
    },
  })
  if (!doc) return err('Belge bulunamadı', 404)
  if (doc.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  // Mal kalemleri — fatura kalemleri varsa oradan, yoksa üretim listesinden
  const invoice = await db.invoice.findFirst({
    where: { orderId: doc.orderId },
    include: { lines: { include: { product: { select: { id: true, name: true, sku: true } } } } },
  })
  let goods: { description: string; qty: number; unitPrice: number; lineTotal: number; totalWeight: number | null }[] = []
  let currency = doc.order.currency
  if (invoice) {
    currency = invoice.currency
    goods = invoice.lines.map((l) => ({
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      totalWeight: l.totalWeight,
    }))
  } else {
    const productionItems = await db.productionItem.findMany({
      where: { orderId: doc.orderId },
      include: { product: { select: { name: true, sku: true, weight: true } } },
    })
    goods = productionItems.map((p) => ({
      description: p.description,
      qty: p.qty,
      unitPrice: 0,
      lineTotal: 0,
      totalWeight: p.product?.weight != null ? Math.round(p.qty * p.product.weight * 1000) / 1000 : null,
    }))
  }

  const company = await db.tenant.findUnique({
    where: { id: user!.tenantId },
    select: { name: true },
  })

  return ok({ ...doc, goods, currency, tenantName: company?.name ?? null })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'erp.manage') && !hasPermission(user!, 'invoices.view')) {
    return err('İhracat belgesi düzenleme yetkiniz yok', 403)
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const {
    status, transportMode, incoterms, destinationCountry,
    portOfLoading, portOfDischarge, vesselName, containerNo,
    vehiclePlate, carrierName, insuranceCompany, policyAmount, policyCurrency, notes,
  } = body as {
    status?: string
    transportMode?: string
    incoterms?: string
    destinationCountry?: string
    portOfLoading?: string
    portOfDischarge?: string
    vesselName?: string
    containerNo?: string
    vehiclePlate?: string
    carrierName?: string
    insuranceCompany?: string
    policyAmount?: number
    policyCurrency?: string
    notes?: string
  }

  const existing = await db.exportDoc.findUnique({ where: { id } })
  if (!existing) return err('Belge bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const VALID_STATUS = ['taslak', 'hazir', 'imzalandi', 'gonderildi', 'iptal']
  if (status && !VALID_STATUS.includes(status)) return err('Geçersiz durum', 400)

  const doc = await db.exportDoc.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(transportMode !== undefined && { transportMode }),
      ...(incoterms !== undefined && { incoterms }),
      ...(destinationCountry !== undefined && { destinationCountry }),
      ...(portOfLoading !== undefined && { portOfLoading }),
      ...(portOfDischarge !== undefined && { portOfDischarge }),
      ...(vesselName !== undefined && { vesselName }),
      ...(containerNo !== undefined && { containerNo }),
      ...(vehiclePlate !== undefined && { vehiclePlate }),
      ...(carrierName !== undefined && { carrierName }),
      ...(insuranceCompany !== undefined && { insuranceCompany }),
      ...(policyAmount !== undefined && { policyAmount }),
      ...(policyCurrency !== undefined && { policyCurrency }),
      ...(notes !== undefined && { notes }),
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'export_doc',
    entityId: id,
    before: { status: existing.status },
    after: { status: doc.status, incoterms: doc.incoterms, transportMode: doc.transportMode },
  })

  return ok(doc)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'erp.manage')) return err('Belge silme yetkiniz yok', 403)

  const { id } = await params
  const existing = await db.exportDoc.findUnique({ where: { id } })
  if (!existing) return err('Belge bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  await db.exportDoc.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'export_doc',
    entityId: id,
    before: { number: existing.number, type: existing.type },
  })

  return ok({ success: true })
}
