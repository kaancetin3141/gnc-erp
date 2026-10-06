#!/usr/bin/env node
/**
 * update-program-admin.cjs — Program Admini hesabı geçişi (tek seferlik, idempotent)
 *
 * Yapılanlar:
 *   1) superadmin hesabının e-postası  program.admin@gnccrm.app  →  admin@gnccrm.app
 *   2) şifresi bcrypt('314159') olarak ayarlanır (eski 1234 geçersiz olur)
 *   3) rol superadmin + status active garanti edilir
 *
 * Kullanım (uygulama kökünden):
 *   node scripts/update-program-admin.cjs
 *
 * NOT: Giriş artık kullanıcı adıyla da çalışır — "admin" yazılırsa otomatik
 *      admin@gnccrm.app'e tamamlanır (src/app/api/auth/route.ts).
 */
const path = require('path')
const fs = require('fs')

// ---- DATABASE_URL: env → .env fallback -----------------------------------
function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const envPath = path.join(__dirname, '..', '.env')
  if (fs.existsSync(envPath)) {
    const line = fs
      .readFileSync(envPath, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='))
    if (line) return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
  }
  return 'file:./db/custom.db'
}
process.env.DATABASE_URL = resolveDatabaseUrl()

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const NEW_EMAIL = 'admin@gnccrm.app'
const OLD_EMAILS = ['program.admin@gnccrm.app']
const NEW_PASSWORD = '314159'

async function main() {
  const db = new PrismaClient()
  try {
    const hash = await bcrypt.hash(NEW_PASSWORD, 10)
    const admin = await db.user.findUnique({ where: { email: NEW_EMAIL } })

    if (admin) {
      // Hedef hesap zaten var → yalnızca şifre/rol garanti edilir
      const alreadyOk = admin.passwordHash && (await bcrypt.compare(NEW_PASSWORD, admin.passwordHash))
      await db.user.update({
        where: { id: admin.id },
        data: { role: 'superadmin', status: 'active', ...(alreadyOk ? {} : { passwordHash: hash }) },
      })
      console.log(
        alreadyOk
          ? `= zaten güncel: ${NEW_EMAIL} (şifre değişmedi)`
          : `✓ şifre güncellendi: ${NEW_EMAIL} → ${NEW_PASSWORD}`,
      )
    } else {
      // Eski e-postalı superadmin'i yeniden adlandır
      const old = await db.user.findFirst({ where: { email: { in: OLD_EMAILS }, role: 'superadmin' } })
      if (old) {
        await db.user.update({
          where: { id: old.id },
          data: { email: NEW_EMAIL, passwordHash: hash, role: 'superadmin', status: 'active' },
        })
        console.log(`✓ hesap taşındı: ${old.email} → ${NEW_EMAIL} (şifre: ${NEW_PASSWORD})`)
      } else {
        // Hiç yoksa platform tenant'ı altında oluştur (seed sonrası garanti)
        const platform =
          (await db.tenant.findFirst({ where: { name: 'GNC Süperapp Platform' } })) ||
          (await db.tenant.create({ data: { name: 'GNC Süperapp Platform', plan: 'enterprise', defaultCurrency: 'TRY', country: 'TR' } }))
        await db.user.create({
          data: {
            tenantId: platform.id,
            email: NEW_EMAIL,
            name: 'Program Admini',
            role: 'superadmin',
            permissions: JSON.stringify([]), // rol varsayılanları login'de birleşir
            status: 'active',
            title: 'Program Yöneticisi',
            employeeCode: 'GNC-001',
          },
        })
        console.log(`✓ oluşturuldu: ${NEW_EMAIL} (şifre: ${NEW_PASSWORD})`)
      }
    }

    // Emniyet: eski e-posta artık kimseye ait olmasın (varsa farklı hesaba taşınmış olabilir)
    const leftovers = await db.user.findMany({ where: { email: { in: OLD_EMAILS } }, select: { id: true, email: true } })
    for (const l of leftovers) {
      await db.user.delete({ where: { id: l.id } })
      console.log(`- eski hesap kaldırıldı: ${l.email}`)
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error('HATA:', e && e.message ? e.message : e)
  process.exit(1)
})
