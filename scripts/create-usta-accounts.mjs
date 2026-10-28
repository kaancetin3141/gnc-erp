// Usta/çırak giriş hesaplarını oluşturur ve mevcut Staff kayıtlarına bağlar.
// Kural: usta/çırak kendi hesabıyla giriş yapar, kendi randevu/izin/hizmetlerini
// yönetir; personel/hizmet ekleme ve işletme ayarları şirket admininde kalır.
// Şifre politikası: tüm demo hesapları gibi 1234.
import { PrismaClient } from '/home/z/my-project/node_modules/.prisma/client/default.js'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

const USTA_ACCOUNTS = [
  { email: 'ahmet@sikkuaför.com', staffName: 'Ahmet Usta', title: 'Usta Berber', role: 'usta', phone: '+90 532 111 22 33' },
  { email: 'ayse@sikkuaför.com', staffName: 'Ayşe Hanım', title: 'Kuaför', role: 'usta', phone: '+90 532 222 33 44' },
  { email: 'mehmet@sikkuaför.com', staffName: 'Mehmet Bey', title: 'Berber & Stilist', role: 'usta', phone: '+90 532 333 44 55' },
]

const tenant = await db.tenant.findFirst({ where: { name: { contains: 'Kuaf' } } })
if (!tenant) throw new Error('Kuaför tenant bulunamadı')
const provider = await db.serviceProvider.findFirst({ where: { tenantId: tenant.id } })
if (!provider) throw new Error('ServiceProvider bulunamadı')

const hash = await bcrypt.hash('1234', 10)
let created = 0, linked = 0

for (const acc of USTA_ACCOUNTS) {
  const staff = await db.staff.findFirst({ where: { providerId: provider.id, name: acc.staffName } })
  if (!staff) { console.log(`ATLANDI: ${acc.staffName} Staff kaydı yok`); continue }

  let user = await db.user.findUnique({ where: { email: acc.email } })
  if (!user) {
    user = await db.user.create({
      data: {
        tenantId: tenant.id,
        email: acc.email,
        name: acc.staffName,
        passwordHash: hash,
        role: acc.role,
        permissions: JSON.stringify(['dashboard.view', 'messages.view', 'appointments.view', 'appointments.self', 'tickets.view']),
        status: 'active',
        phone: acc.phone,
        title: acc.title,
      },
    })
    created++
    console.log(`OLUŞTURULDU: ${acc.email} (${acc.role})`)
  } else if (user.role !== acc.role) {
    user = await db.user.update({ where: { id: user.id }, data: { role: acc.role } })
    console.log(`ROL GÜNCELLENDİ: ${acc.email} → ${acc.role}`)
  }

  if (staff.userId !== user.id) {
    await db.staff.update({ where: { id: staff.id }, data: { userId: user.id } })
    linked++
    console.log(`BAĞLANDI: ${staff.name} → ${acc.email}`)
  }
}

const staffRows = await db.staff.findMany({ where: { providerId: provider.id }, select: { name: true, userId: true } })
console.log('\nSON DURUM:')
for (const s of staffRows) console.log(`  ${s.name}: ${s.userId ? 'hesaplı' : 'hesapsız'}`)
console.log(`\nÖzet: ${created} yeni hesap, ${linked} bağlantı`)
await db.$disconnect()
