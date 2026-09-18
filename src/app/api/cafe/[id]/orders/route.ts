import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_ORDER_STATUSES = ['acik', 'hazirlaniyor', 'hazir', 'odendi', 'iptal']
const VALID_ORDER_TYPES = ['dine_in', 'takeaway', 'delivery']

// Sipariş numarası üret: S-001, S-002...
async function generateOrderNumber(cafeId: string): Promise<string> {
  const count = await db.cafeOrder.count({ where: { cafeId } })
  const num = String(count + 1).padStart(4, '0')
  return `S-${num}`
}

// ============================================================
// GET — kafe siparişleri
// Query: status, tableId, type
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.view')
  if (permErr) return permErr

  const { id } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId) return err('Kafe bulunamadı', 404)

  const url = new URL(req.url)
  // Çoklu status desteği: ?status=acik&status=hazirlaniyor&status=hazir
  const statusList = url.searchParams.getAll('status').filter(Boolean)
  const tableId = url.searchParams.get('tableId') || ''
  const type = url.searchParams.get('type') || ''
  const today = url.searchParams.get('today') === '1'

  const where: Record<string, unknown> = { cafeId: id }
  if (statusList.length === 1) where.status = statusList[0]
  else if (statusList.length > 1) where.status = { in: statusList }
  if (tableId) where.tableId = tableId
  if (type) where.type = type
  if (today) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    where.createdAt = { gte: start }
  }

  const orders = await db.cafeOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      table: { select: { id: true, number: true, status: true } },
      items: {
        include: {
          menuItem: { select: { id: true, name: true, photo: true, station: true, recipe: true } },
        },
      },
      payments: true,
    },
    take: 500,
  })

  return ok({ items: orders })
}

// ============================================================
// POST — yeni sipariş oluştur (komi/kasa/admin)
// Body: { tableId?, type, customerName?, items: [{ menuItemId, qty, notes? }] }
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.orders')
  if (permErr) return permErr

  const { id } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId) return err('Kafe bulunamadı', 404)

  const body = await req.json()
  const { tableId, type, customerName, items, notes } = body as {
    tableId?: string | null
    type?: string
    customerName?: string
    items?: { menuItemId: string; qty: number; notes?: string }[]
    notes?: string
  }

  if (type && !VALID_ORDER_TYPES.includes(type)) return err('Geçersiz sipariş tipi', 400)
  if (!items || !Array.isArray(items) || items.length === 0) {
    return err('En az bir kalem gerekli', 400)
  }
  // dine_in ise masa zorunlu
  const orderType = type ?? 'dine_in'
  if (orderType === 'dine_in' && !tableId) return err('Masa seçimi gerekli', 400)

  // Masanın bu kafeye ait olduğunu doğrula
  if (tableId) {
    const table = await db.cafeTable.findUnique({ where: { id: tableId } })
    if (!table || table.cafeId !== id) return err('Masa bulunamadı', 404)
  }

  // Menü kalemlerini topla — snapshot için fiyat ve isim gerekli
  const menuItemIds = items.map((i) => i.menuItemId)
  const menuItems = await db.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    include: { category: { select: { cafeId: true } } },
  })

  // Tümü bu kafede mi?
  for (const mi of menuItems) {
    if (mi.category.cafeId !== id) return err('Geçersiz menü kalemi', 400)
  }
  if (menuItems.length !== menuItemIds.length) {
    return err('Bazı menü kalemleri bulunamadı', 400)
  }

  // Subtotal & total hesapla (KDV hariç sade tutar — vergi model bazlı değil)
  const itemLines = items.map((it) => {
    const mi = menuItems.find((m) => m.id === it.menuItemId)!
    const qty = Math.max(1, Math.floor(it.qty) || 1)
    return {
      menuItemId: mi.id,
      name: mi.name,
      qty,
      unitPrice: mi.price,
      notes: it.notes?.trim() || null,
      station: mi.station,
      status: 'bekliyor',
    }
  })

  const subtotal = itemLines.reduce((s, l) => s + l.unitPrice * l.qty, 0)
  const total = subtotal

  const orderNumber = await generateOrderNumber(id)

  const order = await db.cafeOrder.create({
    data: {
      cafeId: id,
      tableId: tableId || null,
      number: orderNumber,
      status: 'acik',
      type: orderType,
      customerName: customerName?.trim() || null,
      subtotal,
      taxTotal: 0,
      total,
      notes: notes?.trim() || null,
      createdById: user!.id,
      items: {
        create: itemLines,
      },
    },
    include: {
      items: true,
      table: true,
    },
  })

  // Masa durumunu 'siparis' yap
  if (tableId) {
    await db.cafeTable.update({
      where: { id: tableId },
      data: { status: 'siparis' },
    })
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'cafe_order',
    entityId: order.id,
    after: { number: order.number, total: order.total, tableId: order.tableId },
  })

  return ok(order)
}
