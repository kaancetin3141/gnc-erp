import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { whatsappLink, formatCurrency, formatDate } from '@/lib/format'

// POST — WhatsApp aidat hatırlatma gönder
// Geciken veya yaklaşan aidatlar için WhatsApp linkleri üretir
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const body = await req.json()
  const { duesId, daysBefore } = body

  // Tekil veya toplu
  if (duesId) {
    // Tek aidat için hatırlatma
    const dues = await db.dues.findUnique({
      where: { id: duesId },
      include: {
        resident: { select: { name: true, phone: true } },
        apartment: { include: { block: { select: { name: true } } } },
        site: { select: { name: true, currency: true } },
      },
    })
    if (!dues || dues.siteId !== id) return err('Aidat bulunamadı', 404)
    if (!dues.resident?.phone) return err('Sakin telefon numarası yok', 400)

    const message = `Sayın ${dues.resident.name}, ${dues.site.name} ${dues.month}/${dues.year} aidatınızın (${formatCurrency(dues.amount, dues.site.currency)}) son ödeme tarihi ${formatDate(dues.dueDate)}. Ödemenizi bekliyoruz.`
    const link = whatsappLink(dues.resident.phone, message)

    await db.dues.update({ where: { id: duesId }, data: { reminderSent: true, reminderSentAt: new Date() } })

    return ok({ sent: 1, links: [{ duesId, apartment: `${dues.apartment.block.name} ${dues.apartment.number}`, residentName: dues.resident.name, phone: dues.resident.phone, link }] })
  }

  // Toplu: tüm ödenmemiş aidatlar (dueDate within daysBefore or overdue)
  const days = parseInt(daysBefore) || 7
  const now = new Date()
  const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  const unpaidDues = await db.dues.findMany({
    where: {
      siteId: id,
      status: 'odenmedi',
      dueDate: { lte: futureDate },
      reminderSent: false,
      resident: { phone: { not: null } },
    },
    include: {
      resident: { select: { name: true, phone: true } },
      apartment: { include: { block: { select: { name: true } } } },
      site: { select: { name: true, currency: true } },
    },
    take: 100,
  })

  const links = unpaidDues.map(d => {
    const message = `Sayın ${d.resident!.name}, ${d.site.name} ${d.month}/${d.year} aidatınızın (${formatCurrency(d.amount, d.site.currency)}) son ödeme tarihi ${formatDate(d.dueDate)}. Ödemenizi bekliyoruz.`
    return {
      duesId: d.id,
      apartment: `${d.apartment.block.name} ${d.apartment.number}`,
      residentName: d.resident!.name,
      phone: d.resident!.phone,
      link: whatsappLink(d.resident!.phone, message),
    }
  })

  // Hatırlatma gönderildi olarak işaretle
  if (links.length > 0) {
    await db.dues.updateMany({
      where: { id: { in: links.map(l => l.duesId) } },
      data: { reminderSent: true, reminderSentAt: new Date() },
    })
  }

  return ok({ sent: links.length, links })
}
