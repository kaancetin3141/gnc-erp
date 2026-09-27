// Mevcut randevulardan müşteri kayıt defterini (AppointmentCustomer) doldurur.
// Telefon rakamlarına göre upsert — idempotent, tekrar çalıştırılabilir.
import { db } from '../src/lib/db'

function phoneDigits(p: string): string {
  const d = (p || '').replace(/\D/g, '')
  // 90xxxxxxxxxx → 0xxxxxxxxxx, 90532... → 0532...
  if (d.startsWith('90') && d.length === 12) return '0' + d.slice(2)
  if (d.length === 10 && !d.startsWith('0')) return '0' + d
  return d
}

async function main() {
  const appts = await db.appointment.findMany({
    select: { id: true, providerId: true, customerName: true, customerPhone: true, customerEmail: true, customerId: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`Toplam ${appts.length} randevu taranıyor...`)

  const cache = new Map<string, string>() // `${providerId}:${digits}` -> customerId
  let linked = 0, created = 0

  for (const a of appts) {
    const digits = phoneDigits(a.customerPhone)
    if (!digits) continue
    const key = `${a.providerId}:${digits}`
    let customerId = cache.get(key) ?? a.customerId ?? null

    if (!customerId) {
      const existing = await db.appointmentCustomer.findUnique({
        where: { providerId_phoneDigits: { providerId: a.providerId, phoneDigits: digits } },
        select: { id: true },
      })
      if (existing) {
        customerId = existing.id
      } else {
        const c = await db.appointmentCustomer.create({
          data: {
            providerId: a.providerId,
            name: a.customerName,
            phone: a.customerPhone,
            phoneDigits: digits,
            email: a.customerEmail ?? null,
          },
        })
        customerId = c.id
        created++
      }
      cache.set(key, customerId)
    }

    if (a.customerId !== customerId) {
      await db.appointment.update({ where: { id: a.id }, data: { customerId } })
      linked++
    }
  }

  const total = await db.appointmentCustomer.count()
  console.log(`Tamam: ${created} müşteri oluşturuldu, ${linked} randevu ilişkilendirildi. Kayıt defteri toplam: ${total}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
