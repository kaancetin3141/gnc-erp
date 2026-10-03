import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, ok, err, getVisibilityFilter,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { notifyChatService } from '@/lib/chat-realtime'

// Belge eki için ortak DTO
interface DocumentItem {
  id: string
  number: string
  customerName: string
  total: number
  currency: string
  type: 'Fatura' | 'Sipariş' | 'Proforma' | 'Teklif'
  createdAt: string
}

export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const type = url.searchParams.get('type')

  if (type === 'users') {
    const search = url.searchParams.get('search') || ''
    const tenantId = user!.tenantId

    // Debug info ekle
    const where: Record<string, unknown> = {
      tenantId,
      status: 'active',
      id: { not: user!.id },
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { title: { contains: search } },
      ]
    }
    const users = await db.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, title: true, avatarUrl: true, phone: true },
      orderBy: { name: 'asc' },
      take: 200,
    })
    return ok({ items: users, total: users.length })
  }

  // Belge eki — tenant'taki son 4 Fatura / 4 Sipariş / 4 Proforma / 4 Teklif
  // (görünürlük: müşteri sahibi üzerinden — getVisibilityFilter ile)
  if (type === 'documents') {
    const visFilter = await getVisibilityFilter(user!)
    const customerWhere: Record<string, unknown> = visFilter.ownerId
      ? { ownerId: visFilter.ownerId }
      : {}
    const customerInclude = { select: { name: true } }

    const [invoices, orders, proformas, quotes] = await Promise.all([
      db.invoice.findMany({
        where: { tenantId: user!.tenantId, customer: customerWhere },
        include: { customer: customerInclude },
        orderBy: { createdAt: 'desc' },
        take: 4,
      }),
      db.order.findMany({
        where: { tenantId: user!.tenantId, customer: customerWhere },
        include: { customer: customerInclude },
        orderBy: { createdAt: 'desc' },
        take: 4,
      }),
      db.quote.findMany({
        where: { tenantId: user!.tenantId, isProforma: true, customer: customerWhere },
        include: { customer: customerInclude },
        orderBy: { createdAt: 'desc' },
        take: 4,
      }),
      db.quote.findMany({
        where: { tenantId: user!.tenantId, isProforma: false, customer: customerWhere },
        include: { customer: customerInclude },
        orderBy: { createdAt: 'desc' },
        take: 4,
      }),
    ])

    const items: DocumentItem[] = [
      ...invoices.map<DocumentItem>((d) => ({
        id: d.id,
        number: d.number,
        customerName: d.customer.name,
        total: d.total,
        currency: d.currency,
        type: 'Fatura',
        createdAt: d.createdAt.toISOString(),
      })),
      ...orders.map<DocumentItem>((d) => ({
        id: d.id,
        number: d.number,
        customerName: d.customer.name,
        total: d.totalAmount,
        currency: d.currency,
        type: 'Sipariş',
        createdAt: d.createdAt.toISOString(),
      })),
      ...proformas.map<DocumentItem>((d) => ({
        id: d.id,
        number: d.number,
        customerName: d.customer.name,
        total: d.total,
        currency: d.currency,
        type: 'Proforma',
        createdAt: d.createdAt.toISOString(),
      })),
      ...quotes.map<DocumentItem>((d) => ({
        id: d.id,
        number: d.number,
        customerName: d.customer.name,
        total: d.total,
        currency: d.currency,
        type: 'Teklif',
        createdAt: d.createdAt.toISOString(),
      })),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

    return ok({ items, total: items.length })
  }

  const otherUserId = url.searchParams.get('userId')
  const onlyUnread = url.searchParams.get('unread') === '1'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200)

  const where: Record<string, unknown> = { tenantId: user!.tenantId }
  if (otherUserId) {
    where.OR = [
      { senderId: user!.id, receiverId: otherUserId },
      { senderId: otherUserId, receiverId: user!.id },
    ]
  } else {
    where.OR = [{ senderId: user!.id }, { receiverId: user!.id }]
    if (onlyUnread) { where.isRead = false; where.receiverId = user!.id }
  }

  const messages = await db.message.findMany({
    where,
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true, title: true, role: true } },
      receiver: { select: { id: true, name: true, avatarUrl: true, title: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  return ok({ items: messages, total: messages.length })
}

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const body = await req.json()
  const { receiverId, content, attachmentType, attachmentId, attachmentName } = body as {
    receiverId?: string; content?: string
    attachmentType?: string; attachmentId?: string; attachmentName?: string
  }
  if (!content || !content.trim()) return err('Mesaj boş olamaz', 400)
  if (content.length > 4000) return err('Mesaj çok uzun (maks 4000 karakter)', 400)

  let receiver: { id: string } | null = null
  if (receiverId) {
    if (receiverId === user!.id) return err('Kendinize mesaj gönderemezsiniz', 400)
    receiver = await db.user.findFirst({
      where: { id: receiverId, tenantId: user!.tenantId, status: 'active' },
      select: { id: true },
    })
    if (!receiver) return err('Alıcı bulunamadı', 404)
  }

  // Ekli mesaj: frontend zenginleştirilmiş içerikle gelir (📎 ile başlar) —
  // bu durumda çift ekleme yapma; eski çağıranlar için yedek olarak ekle.
  const trimmed = content.trim()
  const finalContent =
    attachmentType && attachmentId && !trimmed.startsWith('📎')
      ? `${trimmed}\n\n📎 Belge: ${attachmentName || attachmentType} #${attachmentId.slice(-6)}`
      : trimmed

  const message = await db.message.create({
    data: {
      tenantId: user!.tenantId,
      senderId: user!.id,
      receiverId: receiver?.id ?? null,
      content: finalContent,
    },
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true, title: true, role: true } },
      receiver: { select: { id: true, name: true, avatarUrl: true, title: true, role: true } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'message',
    entityId: message.id,
    after: { receiverId: message.receiverId, contentPreview: message.content.slice(0, 80) },
  })

  // Gerçek zamanlı yayım — chat-service'e bildir (fire-and-forget).
  // Alıcı odası + gönderen odası (kendi diğer sekmeleri) anında alır.
  notifyChatService({
    event: 'message',
    receiverId: message.receiverId,
    senderId: message.senderId,
    message,
  })

  return ok(message, 201)
}
