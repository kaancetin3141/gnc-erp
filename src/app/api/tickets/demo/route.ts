import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// POST /api/tickets/demo — modülü örnek taleplerle doldur (tickets.manage)
// Tenant'ta talep YOKSA çalışır; varsa 409 döner (çift veri engeli)
// ============================================================

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'tickets.manage')
  if (permErr) return permErr

  const existing = await db.ticket.count({ where: { tenantId: user!.tenantId } })
  if (existing > 0) {
    return err('Destek talepleri mevcut — örnek veri yüklenmedi', 409)
  }

  // İlk müşteri + ekip üyeleri (varsa bağla)
  const [firstCustomer, users] = await Promise.all([
    db.customer.findFirst({ where: { tenantId: user!.tenantId }, orderBy: { createdAt: 'asc' } }),
    db.user.findMany({ where: { tenantId: user!.tenantId }, select: { id: true }, take: 3 }),
  ])

  const now = new Date()
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)

  const samples = [
    { subject: 'Fatura PDF açılmıyor', category: 'fatura', priority: 'high', status: 'open', desc: 'Dün aldığım faturanın PDF dosyası açılmıyor, yeniden gönderebilir misiniz?', ago: 2, assignee: null },
    { subject: 'Siparişimin kargo takibi', category: 'satis', priority: 'normal', status: 'in_progress', desc: 'TR-2041 numaralı siparişimin nerede olduğunu öğrenebilir miyim?', ago: 26, assignee: users[1]?.id ?? null },
    { subject: 'Uygulama mobilde açılmıyor', category: 'teknik', priority: 'urgent', status: 'waiting', desc: 'Uygulamayı telefondan açınca beyaz ekran kalıyor. Android kullanıyorum.', ago: 50, assignee: users[0]?.id ?? user!.id },
    { subject: 'Adres değişikliği talebi', category: 'diger', priority: 'low', status: 'resolved', desc: 'Kayıtlı adresimi güncellemek istiyorum.', ago: 74, assignee: users[1]?.id ?? null },
    { subject: 'Yeni teklif talebi', category: 'satis', priority: 'normal', status: 'open', desc: 'Bu ay için toplu alım teklifi almak istiyoruz.', ago: 96, assignee: null },
  ]

  let i = 0
  for (const s of samples) {
    i++
    const t = await db.ticket.create({
      data: {
        tenantId: user!.tenantId,
        code: `TRK-${String(i).padStart(4, '0')}`,
        subject: s.subject,
        description: s.desc,
        category: s.category,
        priority: s.priority,
        status: s.status,
        customerId: firstCustomer?.id ?? null,
        assigneeId: s.assignee,
        createdById: user!.id,
        createdAt: hoursAgo(s.ago),
        resolvedAt: s.status === 'resolved' ? hoursAgo(s.ago - 10) : null,
      },
    })
    // İlk talebe bir yorum ekle
    if (i === 1) {
      await db.ticketComment.create({
        data: {
          ticketId: t.id,
          userId: user!.id,
          authorName: user!.name,
          body: 'İncelemeye aldık, en kısa sürede dönüş yapılacak.',
          internal: false,
        },
      })
    }
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'ticket_demo_data',
    entityId: 'demo',
    after: { tickets: samples.length },
  })

  return ok({ success: true, tickets: samples.length, message: 'Örnek destek talepleri yüklendi' })
}
