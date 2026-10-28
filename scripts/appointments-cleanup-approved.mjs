// appointments-cleanup-approved.mjs — Kullanıcı onaylı randevu temizliği (tur8)
// Onay: 1) 2 test randevusu SİL  2) Ece Kaya → iptal (arşiv)  3) Ahmet'in randevusuna Ahmet Usta ata
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TEST_IDS = ['cmu3f9uyr0035v77a04e85mq8', 'cmu7jwoqk0005scpz60f6uxar']; // Test Müşteri + Otomatik Test
const ECE_ID = 'cmu3azeux03f8v796cpu7x8ms';
const AHMET_ID = 'cmujc5emr000bm71zmyvnje8u';
const AHMET_USTA_ID = 'cmu3azeu903e0v796lew1k8uk';

async function main() {
  const before = {
    toplam: await prisma.appointment.count(),
    beklemede: await prisma.appointment.count({ where: { status: 'beklemede' } }),
    iptal: await prisma.appointment.count({ where: { status: 'iptal' } }),
  };
  console.log('ÖNCE:', JSON.stringify(before));

  // --- 1) Test randevularını sil (kimlik + isim doğrulaması ile) ---
  for (const id of TEST_IDS) {
    const a = await prisma.appointment.findUnique({ where: { id } });
    if (!a) { console.log(`- zaten yok: ${id}`); continue; }
    if (!/test/i.test(a.customerName)) {
      console.log(`! ATLANDI (isim uyuşmuyor, silinmedi): ${a.customerName} / ${id}`);
      continue;
    }
    await prisma.appointment.delete({ where: { id } });
    console.log(`✓ silindi: ${a.customerName} — ${a.serviceName ?? a.serviceId} (${id})`);
  }

  // --- 2) Ece Kaya → iptal (arşiv) ---
  const ece = await prisma.appointment.findUnique({ where: { id: ECE_ID } });
  if (ece && ece.customerName === 'Ece Kaya') {
    await prisma.appointment.update({
      where: { id: ECE_ID },
      data: {
        status: 'iptal',
        notes: [ece.notes, 'Arşiv: randevu tarihi geçti, onaylanmadı (28.10.2026)'].filter(Boolean).join(' | '),
      },
    });
    console.log(`✓ iptal (arşiv): Ece Kaya — Manikür (${ECE_ID})`);
  } else {
    console.log(`! Ece Kaya kaydı bulunamadı/değişmiş: ${ECE_ID}`);
  }

  // --- 3) Ahmet'in randevusuna Ahmet Usta ata ---
  const ahmet = await prisma.appointment.findUnique({ where: { id: AHMET_ID } });
  const usta = await prisma.staff.findUnique({ where: { id: AHMET_USTA_ID } });
  if (ahmet && ahmet.customerName === 'Ahmet' && usta && usta.name === 'Ahmet Usta') {
    await prisma.appointment.update({
      where: { id: AHMET_ID },
      data: { staffId: AHMET_USTA_ID },
    });
    console.log(`✓ personel atandı: Ahmet (Saç Kesimi) → ${usta.name} / ${usta.title ?? ''}`);
  } else {
    console.log(`! Ahmet kaydı veya Ahmet Usta bulunamadı: ${AHMET_ID} / ${AHMET_USTA_ID}`);
  }

  const after = {
    toplam: await prisma.appointment.count(),
    beklemede: await prisma.appointment.count({ where: { status: 'beklemede' } }),
    iptal: await prisma.appointment.count({ where: { status: 'iptal' } }),
  };
  console.log('SONRA:', JSON.stringify(after));
}

main()
  .catch((e) => { console.error('FATAL:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
