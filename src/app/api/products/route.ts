import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — ürün listesi (filtreli)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const url = new URL(req.url)
  const search = url.searchParams.get('search') || ''
  const category = url.searchParams.get('category') || ''
  const lowStock = url.searchParams.get('lowStock') === 'true'
  const limit = parseInt(url.searchParams.get('limit') || '200')
  const offset = parseInt(url.searchParams.get('offset') || '0')

  const where: Record<string, unknown> = { tenantId: user!.tenantId }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { sku: { contains: search } },
      { category: { contains: search } },
    ]
  }
  if (category) where.category = category

  // Düşük stok filtresi: SQLite'ta kolonlar arası karşılaştırma Prisma'da desteklenmiyor.
  // Bu yüzden app seviyesinde filtreliyoruz. KOBİ segmenti için makul limit.
  const fetchLimit = lowStock ? 1000 : limit
  const fetchOffset = lowStock ? 0 : offset

  const products = await db.product.findMany({
    where,
    include: {
      _count: { select: { stockMovements: true, quoteLines: true } },
    },
    orderBy: { name: 'asc' },
    take: fetchLimit,
    skip: fetchOffset,
    // weight, weightUnit, packagingWeight, packagingType vb. tüm alanlar Prisma'da otomatik
    // select olmadan gelir (mevcut alanlar). ErpProductSimple tipi için yeterli.
  })

  let items = products
  let total: number
  if (lowStock) {
    const filtered = products.filter((p) => p.stock <= p.minStock)
    total = filtered.length
    items = filtered.slice(offset, offset + limit)
  } else {
    total = await db.product.count({ where })
  }

  return ok({
    items,
    total,
    limit,
    offset,
  })
}

// POST — yeni ürün
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  // ERP erişimi: Şimdilik tüm giriş yapmış kullanıcılar ürün ekleyebilir.
  // Rol hiyerarşisinde admin/manager 'customers.edit' yetkisine sahip.
  // TODO: Ayrı 'products.edit' yetki anahtarı eklendiğinde burada kullanılacak.

  const body = await req.json()
  const {
    name, sku, description, price, currency, taxRate,
    stock, minStock, unit, category, photo,
    weight, weightUnit, packagingWeight, packagingType,
    paletType, paletCount, carrier, trackingNumber,
  } = body

  if (!name || !name.trim()) return err('Ürün adı gerekli', 400)

  // Photo (base64 data URL) — 2MB sınırı
  let photoValue: string | null = null
  if (photo && typeof photo === 'string' && photo.startsWith('data:image/')) {
    if (photo.length > 2_700_000) return err('Fotoğraf çok büyük (maks 2MB)', 413)
    photoValue = photo
  }

  const product = await db.product.create({
    data: {
      tenantId: user!.tenantId,
      name: name.trim(),
      sku: sku?.trim() || null,
      description: description?.trim() || null,
      price: typeof price === 'number' ? price : parseFloat(price) || 0,
      currency: currency || user!.tenant.defaultCurrency || 'TRY',
      taxRate: typeof taxRate === 'number' ? taxRate : parseFloat(taxRate) || 20,
      stock: typeof stock === 'number' ? stock : parseInt(stock) || 0,
      minStock: typeof minStock === 'number' ? minStock : parseInt(minStock) || 0,
      unit: unit?.trim() || 'adet',
      category: category?.trim() || null,
      photo: photoValue,
      // Ağırlık & ambalaj (F4) — value kg olarak, weightUnit kullanıcı tercihi olarak saklanır
      weight: typeof weight === 'number' && weight > 0 ? weight : null,
      weightUnit: weightUnit || 'kg',
      packagingWeight: typeof packagingWeight === 'number' && packagingWeight >= 0 ? packagingWeight : null,
      packagingType: packagingType || null,
      paletType: paletType || null,
      paletCount: typeof paletCount === 'number' && paletCount >= 0 ? paletCount : null,
      carrier: carrier || null,
      trackingNumber: trackingNumber?.trim() || null,
    },
  })

  // İlk stok hareketi (eğer başlangıç stoğu > 0 ise)
  if (product.stock > 0) {
    await db.stockMovement.create({
      data: {
        productId: product.id,
        quantity: product.stock,
        type: 'giris',
        reason: 'Açılış stoğu',
        refType: 'manual',
      },
    })
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'product',
    entityId: product.id,
    after: product,
  })

  return ok(product)
}
