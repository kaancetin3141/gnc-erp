import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err, safeJsonParse } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// Yardımcılar
// ============================================================

// İrsaliye numarası üret: IRS-2026-001
// Tenant bazında, yıl bazında sıra no
async function generateIrsaliyeNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.irsaliye.count({ where: { tenantId } })
  return `IRS-${year}-${String(count + 1).padStart(3, '0')}`
}

const IRS_STATUSES = ['taslak', 'hazir', 'sevk_edildi', 'teslim_edildi', 'iptal']

interface IrsaliyeLineInput {
  productId?: string | null
  description: string
  qty: number
  unit?: string
  weightPerUnit?: number | null
  notes?: string | null
}

// Ağırlıkları yeniden hesapla
function computeWeights(
  lines: { qty: number; weightPerUnit: number | null }[],
  palletWeight: number,
  packagingWeights: number[], // her line için ürünün packagingWeight * qty
) {
  let totalNet = 0
  let totalPackaging = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const w = (l.weightPerUnit ?? 0) * (l.qty ?? 0)
    totalNet += w
    totalPackaging += packagingWeights[i] ?? 0
  }
  const totalGross = totalNet + totalPackaging + (palletWeight ?? 0)
  return { totalNet, totalPackaging, totalGross }
}

// ============================================================
// GET — irsaliye listesi (filtreler: ?status=, ?customerId=, ?orderId=)
// ============================================================
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'irsaliye.view')
  if (permErr) return permErr

  const url = new URL(req.url)
  const search = url.searchParams.get('search') || ''
  const status = url.searchParams.get('status') || ''
  const customerId = url.searchParams.get('customerId') || ''
  const orderId = url.searchParams.get('orderId') || ''
  const limit = parseInt(url.searchParams.get('limit') || '200')
  const offset = parseInt(url.searchParams.get('offset') || '0')

  const where: Record<string, unknown> = user!.role === 'superadmin' ? {} : { tenantId: user!.tenantId }
  if (status) where.status = status
  if (customerId) where.customerId = customerId
  if (orderId) where.orderId = orderId
  if (search) {
    where.OR = [
      { number: { contains: search } },
      { customer: { name: { contains: search } } },
      { trackingNo: { contains: search } },
    ]
  }

  const [items, total] = await Promise.all([
    db.irsaliye.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, segment: true, status: true } },
        order: { select: { id: true, number: true, status: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.irsaliye.count({ where }),
  ])

  return ok({ items, total, limit, offset })
}

// ============================================================
// POST — yeni irsaliye (otomatik IRS-2026-001 numarası ile)
// ============================================================
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'irsaliye.manage')
  if (permErr) return permErr

  const body = await req.json()
  const {
    customerId, orderId, lines, carrier, trackingNo,
    shippingAddress, palletCount, palletType, palletWeight,
    notes, status, date,
  } = body as {
    customerId?: string
    orderId?: string
    lines?: IrsaliyeLineInput[]
    carrier?: string
    trackingNo?: string
    shippingAddress?: string
    palletCount?: number
    palletType?: string
    palletWeight?: number
    notes?: string
    status?: string
    date?: string
  }

  if (!customerId) return err('Müşteri seçimi gerekli', 400)
  if (!lines || lines.length === 0) return err('En az bir kalem gerekli', 400)

  // Müşteri tenant kontrolü
  const customer = await db.customer.findUnique({ where: { id: customerId } })
  if (!customer) return err('Müşteri bulunamadı', 404)
  if (customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  // Sipariş kontrolü (opsiyonel)
  if (orderId) {
    const order = await db.order.findUnique({ where: { id: orderId } })
    if (!order) return err('Sipariş bulunamadı', 404)
    if (order.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)
  }

  const finalStatus = status && IRS_STATUSES.includes(status) ? status : 'taslak'
  const number = await generateIrsaliyeNumber(user!.tenantId)
  const palletWeightVal = palletWeight ?? 20

  // Ürünleri topla — packagingWeight için (Product.packagingWeight alanı yoksa 0)
  // Şimdilik packagingWeight kullanmıyoruz (alan yok) — totalPackagingWeight = 0
  const productIds = lines
    .map((l) => l.productId)
    .filter((x): x is string => !!x)
  const products = productIds.length > 0
    ? await db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, unit: true, sku: true },
      })
    : []
  const productMap = new Map(products.map((p) => [p.id, p]))

  // Ağırlık hesabı
  const computedLines = lines.map((l) => {
    const wpu = l.weightPerUnit ?? 0
    const qty = l.qty ?? 1
    return { ...l, weightPerUnit: wpu, totalWeight: wpu * qty }
  })
  const { totalNet, totalPackaging, totalGross } = computeWeights(
    computedLines.map((l) => ({ qty: l.qty, weightPerUnit: l.weightPerUnit })),
    palletWeightVal,
    computedLines.map(() => 0), // packagingWeight alanı yok
  )

  const irsaliye = await db.irsaliye.create({
    data: {
      tenantId: user!.tenantId,
      customerId,
      orderId: orderId || null,
      number,
      status: finalStatus,
      totalNetWeight: totalNet,
      totalPackagingWeight: totalPackaging,
      palletWeight: palletWeightVal,
      totalGrossWeight: totalGross,
      palletCount: palletCount ?? null,
      palletType: palletType ?? null,
      shippingAddress: shippingAddress || null,
      carrier: carrier || null,
      trackingNo: trackingNo || null,
      notes: notes || null,
      createdById: user!.id,
      date: date ? new Date(date) : new Date(),
      deliveredAt: finalStatus === 'teslim_edildi' ? new Date() : null,
      lines: {
        create: computedLines.map((l) => {
          const prod = l.productId ? productMap.get(l.productId) : null
          return {
            productId: l.productId || null,
            description: l.description || prod?.name || '',
            qty: l.qty ?? 1,
            unit: l.unit || prod?.unit || 'adet',
            weightPerUnit: l.weightPerUnit ?? null,
            totalWeight: l.weightPerUnit ? l.weightPerUnit * (l.qty ?? 1) : null,
            notes: l.notes || null,
          }
        }),
      },
    },
    include: {
      customer: { select: { id: true, name: true } },
      order: { select: { id: true, number: true } },
      lines: { include: { product: { select: { id: true, name: true, sku: true } } } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'irsaliye',
    entityId: irsaliye.id,
    after: safeJsonParse(JSON.stringify(irsaliye), null),
  })

  return ok(irsaliye)
}
