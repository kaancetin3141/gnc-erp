import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// Stok hareketi yazabilsin: ERP yöneticisi VEYA market depo/kasa sorumlusu
function canWriteStock(user: { permissions: string[] } | null): boolean {
  if (!user) return false
  return user.permissions.includes('erp.manage') ||
    user.permissions.includes('market.stock') ||
    user.permissions.includes('market.manage')
}

// GET — ürün için tüm stok hareketleri (sayfalanabilir, en yeni en üstte)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requireAuth(user)
  if (permErr) return permErr

  const { id } = await params
  const product = await db.product.findUnique({ where: { id }, select: { tenantId: true } })
  if (!product) return err('Ürün bulunamadı', 404)
  if (product.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const url = new URL(req.url)
  const limit = parseInt(url.searchParams.get('limit') || '50')
  const offset = parseInt(url.searchParams.get('offset') || '0')

  const [movements, total] = await Promise.all([
    db.stockMovement.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.stockMovement.count({ where: { productId: id } }),
  ])

  return ok({ items: movements, total, limit, offset })
}

// POST — yeni stok hareketi ekle ve ürün stoğunu güncelle
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!canWriteStock(user)) return err('Erişim reddedildi', 403)

  const { id } = await params
  const product = await db.product.findUnique({ where: { id } })
  if (!product) return err('Ürün bulunamadı', 404)
  if (product.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const body = await req.json()
  const { quantity, type, reason, refType, refId } = body

  // Validasyon
  if (!type || !['giris', 'cikis', 'duzeltme', 'transfer'].includes(type)) {
    return err("Hareket tipi geçersiz. (giris | cikis | duzeltme | transfer)", 400)
  }
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    return err('Miktar sayısal olmalı', 400)
  }
  // Kesirli miktar kg/lt birimli ürünler için gereklidir (yuvarlama stok sapması yaratır)
  const rounded = Math.round(quantity * 1000) / 1000
  if (Math.abs(rounded - quantity) > 1e-9) {
    return err('Miktar en fazla 3 basamak ondalık içerebilir', 400)
  }

  const beforeStock = product.stock
  let newStock = beforeStock

  if (type === 'giris') {
    newStock = beforeStock + rounded
  } else if (type === 'cikis') {
    if (rounded <= 0) {
      return err('Çıkış miktarı pozitif olmalı', 400)
    }
    if (rounded > beforeStock) {
      return err(
        `Yetersiz stok. Mevcut: ${beforeStock} ${product.unit}, istenen: ${rounded} ${product.unit}`,
        400,
      )
    }
    newStock = beforeStock - rounded
  } else if (type === 'duzeltme') {
    // Mutlak set: rounded yeni stok değeri
    if (rounded < 0) {
      return err('Düzeltme sonrası stok negatif olamaz', 400)
    }
    newStock = rounded
  } else if (type === 'transfer') {
    // Transfer tek taraflı kayıt (basitleştirilmiş): çıkış gibi davranır
    if (rounded <= 0) {
      return err('Transfer miktarı pozitif olmalı', 400)
    }
    if (rounded > beforeStock) {
      return err(
        `Yetersiz stok. Mevcut: ${beforeStock} ${product.unit}, istenen: ${rounded} ${product.unit}`,
        400,
      )
    }
    newStock = beforeStock - rounded
  }

  // Hareketi kaydet ve ürünü güncelle (transaction ile atomik)
  const [movement] = await db.$transaction([
    db.stockMovement.create({
      data: {
        productId: id,
        quantity: rounded,
        type,
        reason: reason?.trim() || null,
        refType: refType || 'manual',
        refId: refId || null,
      },
    }),
    db.product.update({
      where: { id },
      data: { stock: newStock },
    }),
  ])

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'product.stock',
    entityId: id,
    before: { stock: beforeStock },
    after: { stock: newStock, movement },
  })

  return ok({
    movement,
    previousStock: beforeStock,
    newStock,
  })
}
