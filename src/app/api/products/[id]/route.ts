import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — ürün detayı (son 20 stok hareketi ile birlikte)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const product = await db.product.findUnique({
    where: { id },
    include: {
      stockMovements: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      _count: { select: { stockMovements: true, quoteLines: true } },
    },
  })

  if (!product) return err('Ürün bulunamadı', 404)
  if (product.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  return ok(product)
}

// PATCH — ürün güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.product.findUnique({ where: { id } })
  if (!existing) return err('Ürün bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const body = await req.json()
  const updateData: Record<string, unknown> = {}
  const allowed = [
    'name', 'sku', 'description', 'price', 'currency', 'taxRate',
    'minStock', 'unit', 'category', 'photo',
    'weight', 'weightUnit', 'packagingWeight', 'packagingType',
    'paletType', 'paletCount', 'carrier', 'trackingNumber',
  ]
  // Not: stock alanı doğrudan PATCH ile güncellenmez — stok hareketleri
  // üzerinden /api/products/[id]/stock endpoint'i kullanılmalı.
  for (const key of allowed) {
    if (key in body) {
      if (key === 'price' || key === 'taxRate') {
        updateData[key] = typeof body[key] === 'number' ? body[key] : parseFloat(body[key]) || 0
      } else if (key === 'minStock' || key === 'paletCount') {
        const v = body[key]
        updateData[key] = (typeof v === 'number' || typeof v === 'string')
          ? (typeof v === 'number' ? v : parseInt(v))
          : null
        if (!Number.isFinite(updateData[key] as number)) updateData[key] = null
        if (key === 'paletCount' && (updateData[key] as number) < 0) updateData[key] = null
      } else if (key === 'weight' || key === 'packagingWeight') {
        const v = body[key]
        if (v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) {
          updateData[key] = null
        } else if (typeof v === 'number') {
          updateData[key] = v > 0 ? v : null
        } else if (typeof v === 'string') {
          const n = parseFloat(v)
          updateData[key] = Number.isFinite(n) && n > 0 ? n : null
        }
      } else if (key === 'weightUnit') {
        const v = body[key]
        if (v === 'gr' || v === 'kg' || v === 'ton') {
          updateData[key] = v
        } else {
          updateData[key] = 'kg'
        }
      } else if (key === 'packagingType' || key === 'paletType' || key === 'carrier' || key === 'trackingNumber') {
        const v = body[key]
        if (v === null || v === '') {
          updateData[key] = null
        } else {
          updateData[key] = key === 'trackingNumber' ? String(v).trim() : String(v)
        }
      } else if (key === 'photo') {
        const v = body[key]
        if (v === null || v === '') {
          updateData[key] = null
        } else if (typeof v === 'string' && v.startsWith('data:image/')) {
          if (v.length > 2_700_000) return err('Fotoğraf çok büyük (maks 2MB)', 413)
          updateData[key] = v
        }
      } else if (body[key] === '' || body[key] === null) {
        updateData[key] = key === 'name' ? '' : null
      } else {
        updateData[key] = body[key]
      }
    }
  }

  const updated = await db.product.update({ where: { id }, data: updateData })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'product',
    entityId: id,
    before: existing,
    after: updated,
  })

  return ok(updated)
}

// DELETE — ürün sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'erp.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.product.findUnique({ where: { id } })
  if (!existing) return err('Ürün bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  // Referans kontrolü: teklif kalemlerinde kullanılıyorsa silmeyi engelle
  const refCount = await db.quoteLine.count({ where: { productId: id } })
  if (refCount > 0) {
    return err(`Bu ürün ${refCount} teklif kalemiyle ilişkili, silinemez. Örünü pasife alın veya teklifleri kontrol edin.`, 400)
  }

  // Stok hareketleri cascade ile silinir (şema: onDelete: Cascade)
  await db.product.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'product',
    entityId: id,
    before: existing,
  })

  return ok({ success: true })
}
