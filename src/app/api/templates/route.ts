import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, ok, err,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// Geçerli tip ve kategori değerleri
const VALID_TYPES = ['whatsapp', 'email', 'sms']
const VALID_CATEGORIES = ['genel', 'satis', 'takip', 'teklif', 'tesekkur']

// ============================================================
// GET — şablon listesi (filtreli)
// ============================================================
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const type = url.searchParams.get('type') || ''
  const category = url.searchParams.get('category') || ''
  const isDefault = url.searchParams.get('isDefault') // 'true' | 'false'
  const search = url.searchParams.get('search') || ''
  const limit = parseInt(url.searchParams.get('limit') || '200')
  const offset = parseInt(url.searchParams.get('offset') || '0')

  const where: Record<string, unknown> = user!.role === 'superadmin' ? {} : { tenantId: user!.tenantId }
  if (type && VALID_TYPES.includes(type)) where.type = type
  if (category && VALID_CATEGORIES.includes(category)) where.category = category
  if (isDefault === 'true') where.isDefault = true
  if (isDefault === 'false') where.isDefault = false
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { content: { contains: search } },
      { subject: { contains: search } },
    ]
  }

  const [items, total] = await Promise.all([
    db.messageTemplate.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      skip: offset,
    }),
    db.messageTemplate.count({ where }),
  ])

  return ok({ items, total, limit, offset })
}

// ============================================================
// POST — yeni şablon oluştur
// ============================================================
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const body = await req.json()
  const { name, type, category, subject, content, isDefault } = body as {
    name?: string
    type?: string
    category?: string
    subject?: string
    content?: string
    isDefault?: boolean
  }

  if (!name || !name.trim()) return err('Şablon adı gerekli', 400)
  if (!content || !content.trim()) return err('Şablon içeriği gerekli', 400)

  const finalType = type && VALID_TYPES.includes(type) ? type : 'whatsapp'
  const finalCategory = category && VALID_CATEGORIES.includes(category) ? category : 'genel'

  // isDefault true ise, aynı tip+category içindeki diğer şablonların default'unu kaldır
  if (isDefault) {
    await db.messageTemplate.updateMany({
      where: { tenantId: user!.tenantId, type: finalType },
      data: { isDefault: false },
    })
  }

  const template = await db.messageTemplate.create({
    data: {
      tenantId: user!.tenantId,
      name: name.trim(),
      type: finalType,
      category: finalCategory,
      subject: subject?.trim() || null,
      content: content.trim(),
      isDefault: !!isDefault,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'message_template',
    entityId: template.id,
    after: template,
  })

  return ok(template, 201)
}
