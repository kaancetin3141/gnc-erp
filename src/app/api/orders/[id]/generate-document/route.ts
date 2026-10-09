import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err, safeJsonParse } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// OTOMATİK BELGE ÜRETİMİ — Belge Yönetimi sayfası için
// POST /api/orders/[id]/generate-document
// Body: { type: 'invoice' | 'irsaliye' | 'packing_list' | 'atr' | 'eur1' | 'mense' | 'gumruk' | 'konsimento' | 'sigorta' }
//
// · invoice      → Siparişten otomatik FATURA üret (yoksa)
// · irsaliye     → Siparişten otomatik İRSALİYE üret (yoksa)
// · packing_list → Siparişin faturasına otomatik ÇEKİ LİSTESİ no üret
// · atr/eur1/mense/gumruk/konsimento/sigorta → İHRACAT BELGESİ üret
//
// Belgeler mevcutsa yeniden üretilmez, mevcut belge döner.
// Yetkiler (kullanıcı isteği):
//   · müdür        → fatura + irsaliye + çeki listesi + ihracat belgeleri
//   · depocu       → yalnızca irsaliye + çeki listesi görebilir
// ============================================================

type DocType = 'invoice' | 'irsaliye' | 'packing_list' | 'atr' | 'eur1' | 'mense' | 'gumruk' | 'konsimento' | 'sigorta'

const EXPORT_DOC_TYPES: DocType[] = ['atr', 'eur1', 'mense', 'gumruk', 'konsimento', 'sigorta']

// İhracat belgesi tür meta — numara ön eki + başlık
const EXPORT_DOC_META: Record<string, { prefix: string; title: string }> = {
  atr: { prefix: 'ATR', title: 'ATR Dolaşım Belgesi' },
  eur1: { prefix: 'EUR1', title: 'EUR.1 Dolaşım Belgesi' },
  mense: { prefix: 'MSH', title: 'Menşe Şahadetnamesi' },
  gumruk: { prefix: 'GBE', title: 'İhracat Beyannamesi' },
  konsimento: { prefix: 'KNS', title: 'Konşimento (Bill of Lading)' },
  sigorta: { prefix: 'SIG', title: 'Sigorta Poliçesi' },
}

// Fatura numarası üret: FAT-2025-001
async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.invoice.count({ where: { tenantId } })
  return `FAT-${year}-${String(count + 1).padStart(3, '0')}`
}

// İrsaliye numarası üret: IRS-2026-001
async function generateIrsaliyeNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.irsaliye.count({ where: { tenantId } })
  return `IRS-${year}-${String(count + 1).padStart(3, '0')}`
}

// Çeki listesi numarası üret: CL-2026-001 (tenant + yıl bazlı)
async function generatePackingListNo(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.invoice.count({
    where: { tenantId, packingListNo: { not: null } },
  })
  return `CL-${year}-${String(count + 1).padStart(3, '0')}`
}

// İhracat belgesi numarası üret: ATR-2026-001 (tür ön eki + yıl + tenant bazlı sıra)
async function generateExportDocNumber(tenantId: string, prefix: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.exportDoc.count({
    where: { tenantId, type: { in: EXPORT_DOC_TYPES.filter((t) => EXPORT_DOC_META[t].prefix === prefix) } },
  })
  return `${prefix}-${year}-${String(count + 1).padStart(3, '0')}`
}

interface OrderLineDraft {
  productId: string | null
  description: string
  qty: number
  unitPrice: number
  taxRate: number
  lineTotal: number
  weightPerUnit: number | null
  weightUnit: string | null
  totalWeight: number | null
  color: string | null
}

// Fiyat alanlarını sıfırla — çeki listesi isteyen depo rolüne
// API yanıtında fiyat sızmasını engeller (UI zaten fiyat göstermez)
function stripInvoicePrices<T extends {
  subtotal: number; taxTotal: number; total: number
  lines?: { unitPrice: number; taxRate: number; lineTotal: number }[] | null
}>(invoice: T): T {
  return {
    ...invoice,
    subtotal: 0,
    taxTotal: 0,
    total: 0,
    lines: (invoice.lines ?? []).map((l) => ({ ...l, unitPrice: 0, taxRate: 0, lineTotal: 0 })),
  }
}

// Siparişin kalemlerini çıkar: önce bağlı teklif/proforma satırları,
// yoksa üretim listesi kalemleri, o da yoksa tek satır sipariş özeti.
async function buildOrderLines(orderId: string): Promise<OrderLineDraft[]> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      quote: { include: { lines: { include: { product: true } } } },
      productionItems: { include: { product: true } },
    },
  })
  if (!order) return []

  // 1) Teklif/proforma satırları (en zengin: fiyat + ağırlık + renk)
  if (order.quote?.lines?.length) {
    return order.quote.lines.map((l) => ({
      productId: l.productId,
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
      lineTotal: l.lineTotal,
      weightPerUnit: l.weightPerUnit,
      weightUnit: l.weightUnit,
      totalWeight: l.totalWeight,
      color: l.color,
    }))
  }

  // 2) Üretim listesi kalemleri (fiyat: ürün fiyatı)
  if (order.productionItems?.length) {
    return order.productionItems.map((p) => {
      const price = p.product?.price ?? 0
      return {
        productId: p.productId,
        description: p.description,
        qty: p.qty,
        unitPrice: price,
        taxRate: p.product?.taxRate ?? 20,
        lineTotal: Math.round(p.qty * price * 100) / 100,
        weightPerUnit: p.product?.weight ?? null,
        weightUnit: p.product?.weightUnit ?? 'kg',
        totalWeight: p.product?.weight != null ? Math.round(p.qty * p.product.weight * 1000) / 1000 : null,
        color: p.product?.color ?? null,
      }
    })
  }

  // 3) Fallback: tek satır
  return [{
    productId: null,
    description: `Sipariş ${order.number}`,
    qty: 1,
    unitPrice: order.totalAmount,
    taxRate: 0,
    lineTotal: order.totalAmount,
    weightPerUnit: null,
    weightUnit: null,
    totalWeight: null,
    color: null,
  }]
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { type } = body as { type?: DocType }

  if (!type || !['invoice', 'irsaliye', 'packing_list', ...EXPORT_DOC_TYPES].includes(type)) {
    return err('Geçersiz belge türü', 400)
  }

  // Yetki kontrolü — kullanıcı isteği:
  // · fatura         → erp.manage VEYA invoices.view (müdür + admin)
  // · irsaliye       → irsaliye.view (müdür + depocu)
  // · çeki listesi   → fiyat içermez! irsaliye.view YETERLİ (müdür + depocu)
  // · ihracat belgesi → erp.manage VEYA invoices.view (ticari evrak — depocu göremez)
  const perms = user!.permissions
  if (EXPORT_DOC_TYPES.includes(type)) {
    if (!perms.includes('erp.manage') && !perms.includes('invoices.view')) {
      return err('İhracat belgesi görüntüleme yetkiniz yok', 403)
    }
  } else if (type === 'irsaliye' || type === 'packing_list') {
    if (!perms.includes('irsaliye.view') && !perms.includes('erp.manage') && !perms.includes('invoices.view')) {
      return err(type === 'irsaliye' ? 'İrsaliye görüntüleme yetkiniz yok' : 'Çeki listesi görüntüleme yetkiniz yok', 403)
    }
  } else {
    if (!perms.includes('erp.manage') && !perms.includes('invoices.view')) {
      return err('Fatura görüntüleme yetkiniz yok', 403)
    }
  }

  // Sipariş + tenant kontrolü
  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      quote: true,
      invoice: true,
      irsaliyeler: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  if (!order) return err('Sipariş bulunamadı', 404)
  if (order.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  // ----------------------------------------------------------
  // İHRACAT BELGELERİ (ATR / EUR.1 / MENŞE / GÜMRÜK / KONŞİMENTO / SİGORTA)
  // ----------------------------------------------------------
  if (EXPORT_DOC_TYPES.includes(type)) {
    const meta = EXPORT_DOC_META[type]
    // Idempotent — bu siparişin bu tür belgesi varsa döndür
    const existingDoc = await db.exportDoc.findFirst({
      where: { tenantId: user!.tenantId, orderId: order.id, type },
    })
    if (existingDoc) {
      return ok({ type, created: false, document: existingDoc, documentType: 'export_doc' })
    }

    // Hedef ülke: müşteri ülkesi (TR ise boş — ihracat senaryosunda doldurulur)
    const destinationCountry = order.customer.country && order.customer.country !== 'TR'
      ? order.customer.country
      : 'DE' // demo varsayılan — Almanya ihracat

    const number = await generateExportDocNumber(user!.tenantId, meta.prefix)
    const doc = await db.exportDoc.create({
      data: {
        tenantId: user!.tenantId,
        orderId: order.id,
        customerId: order.customerId,
        type,
        number,
        status: 'hazir',
        // Akıllı varsayılanlar: müşteri ülkesine göre
        transportMode: 'karayolu',
        incoterms: 'FOB',
        destinationCountry,
        portOfLoading: 'İstanbul (Ambarlı)',
        notes: `Sipariş ${order.number} üzerinden otomatik oluşturuldu.`,
        createdById: user!.id,
      },
    })

    await writeAuditLog({
      tenantId: user!.tenantId,
      actorId: user!.id,
      action: 'create',
      entity: 'export_doc',
      entityId: doc.id,
      after: safeJsonParse(JSON.stringify({ ...doc, source: 'order_auto', orderId: order.id }), null),
    })

    return ok({ type, created: true, document: doc, documentType: 'export_doc', title: meta.title })
  }

  // ----------------------------------------------------------
  // FATURA / ÇEKİ LİSTESİ
  // ----------------------------------------------------------
  if (type === 'invoice' || type === 'packing_list') {
    let invoice = order.invoice

    // Fatura yoksa otomatik oluştur
    if (!invoice) {
      const lines = await buildOrderLines(order.id)
      const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100
      const taxTotal = Math.round(lines.reduce((s, l) => s + l.lineTotal * (l.taxRate / 100), 0) * 100) / 100
      const number = await generateInvoiceNumber(user!.tenantId)

      invoice = await db.invoice.create({
        data: {
          tenantId: user!.tenantId,
          customerId: order.customerId,
          orderId: order.id,
          number,
          status: 'odeme_bekliyor',
          subtotal,
          taxTotal,
          total: Math.round((subtotal + taxTotal) * 100) / 100,
          currency: order.currency,
          issueDate: new Date(),
          lines: {
            create: lines.map((l) => ({
              productId: l.productId,
              description: l.description,
              qty: l.qty,
              unitPrice: l.unitPrice,
              taxRate: l.taxRate,
              lineTotal: l.lineTotal,
              weightPerUnit: l.weightPerUnit,
              weightUnit: l.weightUnit,
              totalWeight: l.totalWeight,
              color: l.color,
            })),
          },
        },
        include: { lines: true },
      })

      // Otomatik stok çıkışı (productId olan satırlar)
      for (const line of lines) {
        if (line.productId) {
          const product = await db.product.findUnique({
            where: { id: line.productId },
            select: { id: true, stock: true },
          })
          if (product && product.stock >= line.qty) {
            await db.$transaction([
              db.stockMovement.create({
                data: {
                  productId: line.productId,
                  quantity: line.qty,
                  type: 'cikis',
                  reason: `Otomatik fatura: ${number}`,
                  refType: 'invoice',
                  refId: invoice.id,
                },
              }),
              db.product.update({
                where: { id: line.productId },
                data: { stock: { decrement: line.qty } },
              }),
            ])
          }
        }
      }

      await writeAuditLog({
        tenantId: user!.tenantId,
        actorId: user!.id,
        action: 'create',
        entity: 'invoice',
        entityId: invoice.id,
        after: safeJsonParse(JSON.stringify({ ...invoice, source: 'order_auto', orderId: order.id }), null),
      })
    }

    // Çeki listesi istendiyse no + tarih ata (yoksa)
    if (type === 'packing_list') {
      if (!invoice.packingListNo) {
        const packingNo = await generatePackingListNo(user!.tenantId)
        invoice = await db.invoice.update({
          where: { id: invoice.id },
          data: { packingListNo: packingNo, packingListDate: new Date() },
          include: { lines: true },
        })
        await writeAuditLog({
          tenantId: user!.tenantId,
          actorId: user!.id,
          action: 'update',
          entity: 'invoice',
          entityId: invoice.id,
          after: safeJsonParse(JSON.stringify({ packingListNo: packingNo, source: 'order_auto' }), null),
        })
      } else {
        invoice = await db.invoice.findUnique({
          where: { id: invoice.id },
          include: { lines: true },
        }) ?? invoice
      }
    }

    // Depo rolü (invoices.view yok) fiyatsız sürüm alır
    const canSeePrices = perms.includes('erp.manage') || perms.includes('invoices.view')
    return ok({
      type,
      created: !order.invoice,
      document: canSeePrices ? invoice : stripInvoicePrices(invoice),
      documentType: 'invoice',
    })
  }

  // ----------------------------------------------------------
  // İRSALİYE
  // ----------------------------------------------------------
  // Bu siparişe bağlı irsaliye var mı?
  const existingIrsaliye = order.irsaliyeler?.[0]
  if (existingIrsaliye) {
    return ok({
      type,
      created: false,
      document: existingIrsaliye,
      documentType: 'irsaliye',
    })
  }

  // Yoksa siparişten otomatik irsaliye üret (status=hazir)
  const lines = await buildOrderLines(order.id)
  const productIds = lines.map((l) => l.productId).filter((x): x is string => !!x)
  const products = productIds.length > 0
    ? await db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, unit: true, packagingWeight: true },
      })
    : []
  const productMap = new Map(products.map((p) => [p.id, p]))

  let totalNet = 0
  let totalPackaging = 0
  const palletWeight = 20
  for (const l of lines) {
    totalNet += (l.weightPerUnit ?? 0) * l.qty
    const pw = l.productId ? productMap.get(l.productId)?.packagingWeight ?? 0 : 0
    totalPackaging += pw * l.qty
  }
  const totalGross = totalNet + totalPackaging + palletWeight

  const number = await generateIrsaliyeNumber(user!.tenantId)
  const irsaliye = await db.irsaliye.create({
    data: {
      tenantId: user!.tenantId,
      customerId: order.customerId,
      orderId: order.id,
      number,
      status: 'hazir',
      totalNetWeight: Math.round(totalNet * 1000) / 1000,
      totalPackagingWeight: Math.round(totalPackaging * 1000) / 1000,
      palletWeight,
      totalGrossWeight: Math.round(totalGross * 1000) / 1000,
      notes: `Sipariş ${order.number} üzerinden otomatik oluşturuldu.`,
      createdById: user!.id,
      lines: {
        create: lines.map((l) => {
          const prod = l.productId ? productMap.get(l.productId) : null
          return {
            productId: l.productId,
            description: l.description || prod?.name || 'Ürün',
            qty: l.qty,
            unit: prod?.unit || 'adet',
            weightPerUnit: l.weightPerUnit,
            totalWeight: l.weightPerUnit != null ? Math.round(l.weightPerUnit * l.qty * 1000) / 1000 : null,
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
    after: safeJsonParse(JSON.stringify({ ...irsaliye, source: 'order_auto', orderId: order.id }), null),
  })

  return ok({
    type,
    created: true,
    document: irsaliye,
    documentType: 'irsaliye',
  })
}
