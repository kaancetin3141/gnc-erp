// ============================================================
// QA — BEKLEME LİSTESİ ↔ İPTAL ENTEGRASYONU ("Açılan Slot" döngüsü)
// Senaryo: üye, bekleme kaydı olan bir güne (28.10 — seed'de 2 bekleyen)
//          sahip randevusunu iptal eder:
//  1) iptal yanıtı waitlistCandidates=2 dönmeli
//  2) /api/notifications işletmeye waitlist_ready bildirimi üretmeli
// Temizlik: QA randevusu + üyesi silinir; bildirim hesaplamalı olduğu
//           için QA kaydı silinince kendiliğinden kaybolur.
// Koşum: node scripts/qa-waitlist-cancel-integration.mjs
// ============================================================
import { PrismaClient } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const db = new PrismaClient();
const CRM = 'http://localhost:3000';
const RUNID = Math.random().toString(36).slice(2, 8);
const XFF = `10.${(Math.random() * 250 | 0) + 1}.${(Math.random() * 250 | 0) + 1}.88`;

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

const SECRET = readFileSync('db/.member-secret', 'utf8').trim();
function signToken(memberId, ttlMs = 30 * 24 * 60 * 60 * 1000) {
  const exp = Date.now() + ttlMs;
  const payload = `${memberId}.${exp}`;
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

async function main() {
  console.log(`\n=== Bekleme↔İptal Entegrasyonu — RUNID=${RUNID} ===\n`);

  // ---- 0) öz-iyileşme: önceki çökmüş koşuların QA kalıntısını temizle ----
  const leftovers = await db.member.findMany({ where: { name: { contains: 'QA-WL-Cancel' } }, select: { id: true } });
  if (leftovers.length) {
    await db.appointment.deleteMany({ where: { memberId: { in: leftovers.map((m) => m.id) } } });
    await db.member.deleteMany({ where: { id: { in: leftovers.map((m) => m.id) } } });
    await db.waitlistEntry.deleteMany({ where: { customerName: { contains: 'QA-WL-Ent' } } });
    console.log(`  öz-iyileşme: ${leftovers.length} kalıntı üye + bağımlılıkları silindi`);
  }

  // ---- 1) baseline ----
  const apptBefore = await db.appointment.count();
  const wlBefore = await db.waitlistEntry.count();

  // ---- 1) QA üyesi + 28.10 15:00 randevusu (sik-kuafor) ----
  const provider = await db.serviceProvider.findUnique({
    where: { slug: 'sik-kuafor' },
    select: { id: true, tenantId: true, name: true },
  });
  if (!provider) throw new Error('sik-kuafor bulunamadı');
  const service = await db.service.findFirst({
    where: { providerId: provider.id },
    select: { id: true, name: true },
  });

  const memberPhone = `905${(100000000 + Math.floor(Math.random() * 899999999)).toString().slice(0, 9)}`;
  const member = await db.member.create({
    data: { name: `QA-WL-Cancel ${RUNID}`, phone: memberPhone, passwordHash: 'qa-test-hash', isActive: true },
  });
  // floating local time: 17.05.2027 15:00 TR → UTC bileşenlerinde duvar saati
  // (uzak tarih: seed bekleme kayıtlarından bağımsız, tam sayı doğrulanabilir)
  const apptDate = new Date(Date.UTC(2027, 4, 17, 15, 0, 0));
  const appt = await db.appointment.create({
    data: {
      providerId: provider.id,
      memberId: member.id,
      serviceId: service?.id ?? null,
      customerName: `QA-WL-Cancel ${RUNID}`,
      customerPhone: memberPhone,
      date: apptDate,
      status: 'onaylandi',
      source: 'web',
    },
  });
  // testin kendi bekleme kaydı — aynı gün, tam sayı garantisi için
  await db.waitlistEntry.create({
    data: {
      providerId: provider.id,
      customerName: `QA-WL-Ent ${RUNID}`,
      customerPhone: memberPhone,
      serviceName: 'QA Entegrasyon Hizmeti',
      preferredDate: new Date(Date.UTC(2027, 4, 17, 0, 0, 0)),
      status: 'waiting',
    },
  });
  ok('kurulum: QA üye + 17.05.2027 randevusu + 1 QA bekleme kaydı', Boolean(member.id && appt.id), `randevu=${appt.id.slice(-8).toUpperCase()}`);

  // ---- 2) üye iptali → waitlistCandidates ----
  const token = signToken(member.id);
  const cancelRes = await fetch(`${CRM}/api/public/member/appointments/${appt.id}/cancel`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': XFF },
  });
  const cancelBody = await cancelRes.json().catch(() => ({}));
  ok('iptal → 200 + status=iptal', cancelRes.status === 200 && cancelBody?.status === 'iptal', `status=${cancelRes.status} waitlistCandidates=${cancelBody?.waitlistCandidates ?? '-'}`);
  ok('waitlistCandidates = 1 (kurulan QA bekleme kaydı)', cancelBody?.waitlistCandidates === 1, `değer=${cancelBody?.waitlistCandidates}`);

  // ---- 3) bildirim akışında waitlist_ready ----
  const loginRes = await fetch(`${CRM}/api/auth`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': XFF },
    body: JSON.stringify({ email: 'demo@anadolu.com', password: '1234' }),
  });
  const sc = (loginRes.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('gnc_session='));
  const notifRes = await fetch(`${CRM}/api/notifications`, { headers: { cookie: sc || '' } });
  const notifBody = await notifRes.json().catch(() => ({}));
  const notifs = notifBody?.notifications || [];
  const wr = notifs.filter((n) => n.type === 'waitlist_ready' && n.meta?.appointmentId === appt.id);
  ok('zilde waitlist_ready bildirimi üretildi', wr.length === 1, notifs.filter((n) => n.type === 'waitlist_ready').length + ' adet waitlist_ready (tümü)');
  if (wr.length === 1) {
    ok('bildirim içeriği doğru', wr[0].title.includes('1 bekleyen') && wr[0].meta?.waitlistCount === 1, `"${wr[0].title}" · "${wr[0].description}"`);
  }

  // ---- 4) temizlik + baseline ----
  await db.appointment.delete({ where: { id: appt.id } });
  await db.member.delete({ where: { id: member.id } });
  await db.waitlistEntry.deleteMany({ where: { customerName: { contains: 'QA-WL-Ent' } } });
  const apptAfter = await db.appointment.count();
  const wlAfter = await db.waitlistEntry.count();
  const qaLeft = await db.member.count({ where: { name: { contains: 'QA-WL-Cancel' } } }) + await db.waitlistEntry.count({ where: { customerName: { contains: 'QA-WL-Ent' } } });
  ok('temizlik: randevu + üye + bekleme silindi, baseline korunuyor', apptAfter === apptBefore && wlAfter === wlBefore && qaLeft === 0, `randevu ${apptBefore}→${apptAfter}, bekleme ${wlBefore}→${wlAfter}, QA kalıntı=${qaLeft}`);

  console.log(`\n=== SONUÇ: ${pass} PASS · ${fail} FAIL ===`);
  if (failures.length) console.log('Başarısızlar:\n - ' + failures.join('\n - '));
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error('KRİTİK HATA:', e);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
