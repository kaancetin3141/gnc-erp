// restore-password-policy.mjs — DB kurtarması sonrası şifre politikasını yeniden uygular
// (Görev 2 semantiği: tüm CRM hesapları 1234, Program Admini admin/314159, sakinler 1234, oturumlar sıfır)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const db = new PrismaClient();

async function main() {
  const hash1234 = await bcrypt.hash('1234', 10);
  const hash314159 = await bcrypt.hash('314159', 10);

  // 1) Program Admini: admin@gnccrm.app + 314159 (update-program-admin.cjs ile aynı semantik)
  let admin = await db.user.findUnique({ where: { email: 'admin@gnccrm.app' } });
  if (!admin) {
    const old = await db.user.findFirst({ where: { email: 'program.admin@gnccrm.app', role: 'superadmin' } });
    if (old) {
      admin = await db.user.update({
        where: { id: old.id },
        data: { email: 'admin@gnccrm.app', passwordHash: hash314159, role: 'superadmin', status: 'active' },
      });
      console.log('✓ hesap taşındı: program.admin@gnccrm.app → admin@gnccrm.app (314159)');
    }
  } else {
    admin = await db.user.update({
      where: { id: admin.id },
      data: { passwordHash: hash314159, role: 'superadmin', status: 'active' },
    });
    console.log('✓ admin@gnccrm.app şifresi 314159 olarak garanti edildi');
  }

  // 2) Diğer TÜM CRM kullanıcıları → 1234
  const others = await db.user.findMany({ where: { id: { not: admin.id } }, select: { id: true, email: true } });
  for (const u of others) {
    await db.user.update({ where: { id: u.id }, data: { passwordHash: hash1234 } });
  }
  console.log(`✓ ${others.length} CRM kullanıcısının şifresi 1234 yapıldı`);

  // 3) Sakinler (Resident) → 1234
  const residents = await db.resident.findMany({ select: { id: true } });
  for (const r of residents) {
    await db.resident.update({ where: { id: r.id }, data: { passwordHash: hash1234 } });
  }
  console.log(`✓ ${residents.length} sakinin şifresi 1234 yapıldı`);

  // 4) Tüm oturumlar iptal (eski DB'den gelen 46 ölü oturum dahil)
  const del = await db.session.deleteMany({});
  console.log(`✓ ${del.count} oturum silindi (tüm giriş oturumları geçersiz)`);

  // Özet doğrulama
  const uc = await db.user.count();
  const rc = await db.resident.count();
  console.log(`— Sonuç: User=${uc}, Resident=${rc}, admin=314159, diğerleri=1234`);
}

main()
  .catch((e) => { console.error('FATAL:', e.message); process.exit(1); })
  .finally(() => db.$disconnect());
