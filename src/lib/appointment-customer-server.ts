// Server-only: randevu oluşturulurken müşteri kaydını telefonla eşleştir/oluştur
import { db } from './db'
import { normalizePhoneDigits } from './appointment-customer'

export async function upsertCustomerForAppointment(opts: {
  providerId: string
  name: string
  phone: string
  email?: string | null
}) {
  const digits = normalizePhoneDigits(opts.phone)
  if (!digits || digits.length < 7) return null

  const existing = await db.appointmentCustomer.findUnique({
    where: { providerId_phoneDigits: { providerId: opts.providerId, phoneDigits: digits } },
  })

  if (existing) {
    // Profil boş alanlarını randevu bilgisiyle tamamla
    const data: { name?: string; email?: string } = {}
    if (!existing.name && opts.name) data.name = opts.name
    if (!existing.email && opts.email) data.email = opts.email
    if (Object.keys(data).length) {
      await db.appointmentCustomer.update({ where: { id: existing.id }, data })
    }
    return existing
  }

  return db.appointmentCustomer.create({
    data: {
      providerId: opts.providerId,
      name: opts.name?.trim() || 'İsimsiz Müşteri',
      phone: opts.phone.trim(),
      phoneDigits: digits,
      email: opts.email?.trim() || null,
    },
  })
}
