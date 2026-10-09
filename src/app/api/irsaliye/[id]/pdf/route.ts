import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'

// ============================================================
// GET — İrsaliye PDF bilgisi (JSON)
// Frontend bu bilgiyi alıp .a4-page içinde render eder.
// Fiyat bilgisi İÇERMEZ (irsaliye zaten fiyat tutmaz).
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'irsaliye.view')
  if (permErr) return permErr

  const { id } = await params
  const irsaliye = await db.irsaliye.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true, name: true, segment: true,
          email: true, phone: true, address: true, city: true,
          taxNumber: true,
        },
      },
      order: { select: { id: true, number: true, status: true } },
      lines: {
        include: { product: { select: { id: true, name: true, sku: true, unit: true } } },
        orderBy: { id: 'asc' },
      },
      tenant: { select: { name: true, defaultCurrency: true, country: true } },
    },
  })

  if (!irsaliye) return err('İrsaliye bulunamadı', 404)
  if (irsaliye.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  // Filtered payload (no sensitive data — no prices, no createdById)
  return ok({
    id: irsaliye.id,
    number: irsaliye.number,
    date: irsaliye.date,
    status: irsaliye.status,
    deliveredAt: irsaliye.deliveredAt,

    // Tenant (firma) bilgisi
    tenantName: irsaliye.tenant.name,

    // Müşteri
    customer: irsaliye.customer ? {
      id: irsaliye.customer.id,
      name: irsaliye.customer.name,
      address: irsaliye.customer.address,
      city: irsaliye.customer.city,
      phone: irsaliye.customer.phone,
      email: irsaliye.customer.email,
      taxNumber: irsaliye.customer.taxNumber,
    } : null,

    // Sipariş bağlantısı
    order: irsaliye.order ? {
      id: irsaliye.order.id,
      number: irsaliye.order.number,
      status: irsaliye.order.status,
    } : null,

    // Ağırlık özetleri
    weights: {
      totalNetWeight: irsaliye.totalNetWeight ?? 0,
      totalPackagingWeight: irsaliye.totalPackagingWeight ?? 0,
      palletWeight: irsaliye.palletWeight ?? 0,
      totalGrossWeight: irsaliye.totalGrossWeight ?? 0,
      palletCount: irsaliye.palletCount,
      palletType: irsaliye.palletType,
    },

    // Sevkiyat bilgileri
    shipping: {
      shippingAddress: irsaliye.shippingAddress,
      carrier: irsaliye.carrier,
      trackingNo: irsaliye.trackingNo,
    },

    // Kalemler (fiyat YOK)
    lines: irsaliye.lines.map((l) => ({
      id: l.id,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      weightPerUnit: l.weightPerUnit,
      totalWeight: l.totalWeight,
      notes: l.notes,
      product: l.product ? {
        id: l.product.id,
        name: l.product.name,
        sku: l.product.sku,
      } : null,
    })),

    notes: irsaliye.notes,
    createdAt: irsaliye.createdAt,
  })
}
