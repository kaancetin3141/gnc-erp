// ============================================================
// QA — BEKLEME LİSTESİ (waitlist) UÇTAN UCA TEST
// Kapsam: public POST/GET, admin GET/PATCH/DELETE, tenant izolasyonu,
//         doğrulama (400), mükerrer (409), 3002 same-origin proxy,
//         temizlik + baseline doğrulaması.
// Koşum:  node scripts/qa-waitlist-e2e.mjs
// Çıkış:  0 = tümü geçti, 1 = en az bir hata (CI uyumlu)
// Not:    Test verisi QA-WL öneki + koşuma özgü telefon/XFF ile
//         çalışır, sonda silinir; seed kayıtlarına dokunulmaz.
// ============================================================
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const CRM = 'http://localhost:3000';
const SITE = 'http://localhost:3002';
const RUNID = Math.random().toString(36).slice(2, 8);
const XFF = `10.${(Math.random() * 250 | 0) + 1}.${(Math.random() * 250 | 0) + 1}.77`;
const PHONE = `905${(100000000 + Math.floor(Math.random() * 899999999)).toString().slice(0, 9)}`; // 905XXXXXXXXX

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
const h = (extra = {}) => ({ 'content-type': 'application/json', 'x-forwarded-for': XFF, ...extra });

async function main() {
  console.log(`\n=== Bekleme Listesi E2E — RUNID=${RUNID} XFF=${XFF} telefon=${PHONE} ===\n`);

  // ---- 0) admin oturumu (T1 Anadolu — provider sik-kuafor bu tenant'ta) ----
  const loginRes = await fetch(`${CRM}/api/auth`, {
    method: 'POST', headers: h(),
    body: JSON.stringify({ email: 'demo@anadolu.com', password: '1234' }),
  });
  const setCookie = loginRes.headers.getSetCookie?.() || [];
  const sessionCookie = setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('gnc_session='));
  ok('admin login → gnc_session cookie', Boolean(sessionCookie));
  const adminH = h({ cookie: sessionCookie || '' });

  // ---- 1) public POST doğrulamaları ----
  const base = { providerSlug: 'sik-kuafor', customerName: `QA-WL Test ${RUNID}`, customerPhone: PHONE, serviceName: 'QA Test Hizmeti', preferredDate: '2027-03-15', preferredSlot: '14:00', note: 'QA otomatik test kaydı' };

  const noPhone = await fetch(`${CRM}/api/public/waitlist`, { method: 'POST', headers: h(), body: JSON.stringify({ ...base, customerPhone: '123' }) });
  ok('geçersiz telefon → 400', noPhone.status === 400, `status=${noPhone.status}`);

  const pastDate = await fetch(`${CRM}/api/public/waitlist`, { method: 'POST', headers: h(), body: JSON.stringify({ ...base, preferredDate: '2020-01-01' }) });
  ok('geçmiş tarih → 400', pastDate.status === 400, `status=${pastDate.status}`);

  const badSlot = await fetch(`${CRM}/api/public/waitlist`, { method: 'POST', headers: h(), body: JSON.stringify({ ...base, preferredSlot: '25:99' }) });
  ok('geçersiz saat 25:99 → 400', badSlot.status === 400, `status=${badSlot.status}`);

  const shortName = await fetch(`${CRM}/api/public/waitlist`, { method: 'POST', headers: h(), body: JSON.stringify({ ...base, customerName: 'A' }) });
  ok('1 karakter isim → 400', shortName.status === 400, `status=${shortName.status}`);

  const unknownProvider = await fetch(`${CRM}/api/public/waitlist`, { method: 'POST', headers: h(), body: JSON.stringify({ ...base, providerSlug: 'olmayan-isletme-xyz' }) });
  ok('olmayan işletme → 404', unknownProvider.status === 404, `status=${unknownProvider.status}`);

  // ---- 2) geçerli kayıt → 201 ----
  const created = await fetch(`${CRM}/api/public/waitlist`, { method: 'POST', headers: h(), body: JSON.stringify(base) });
  const createdBody = await created.json().catch(() => ({}));
  ok('geçerli kayıt → 201', created.status === 201, `status=${created.status}`);
  const entryId = createdBody?.data?.id || createdBody?.id;
  ok('yanıtta id dönüyor', Boolean(entryId), `id=${entryId || '-'}`);

  // ---- 3) mükerrer → 409 ----
  const dup = await fetch(`${CRM}/api/public/waitlist`, { method: 'POST', headers: h(), body: JSON.stringify(base) });
  ok('aynı telefon+gün+işletme tekrar → 409', dup.status === 409, `status=${dup.status}`);

  // ---- 4) public GET "Bekleme Durumum" ----
  const myStatus = await fetch(`${CRM}/api/public/waitlist?phone=${PHONE}`, { headers: h() });
  const myStatusBody = await myStatus.json().catch(() => ({}));
  const items = myStatusBody?.data?.items || myStatusBody?.items || [];
  ok('GET ?phone= → 200 ve kayıt görünür', myStatus.status === 200 && items.length === 1, `status=${myStatus.status} adet=${items.length}`);
  ok('kayıt status=waiting', items[0]?.status === 'waiting');
  ok('yanıtta PII dışı alan (not/telefon yok)', items[0] && !('note' in items[0]) && !('customerPhone' in items[0]) && !('customerName' in items[0]), Object.keys(items[0] || {}).join(','));

  const noPhoneGet = await fetch(`${CRM}/api/public/waitlist`, { headers: h() });
  ok("GET telefon'sız → 400", noPhoneGet.status === 400, `status=${noPhoneGet.status}`);

  // ---- 5) admin yetkisiz erişim ----
  const anonAdmin = await fetch(`${CRM}/api/admin/waitlist`, { headers: h() });
  ok("admin GET token'sız → 401", anonAdmin.status === 401, `status=${anonAdmin.status}`);

  // ---- 6) admin liste ----
  const adminList = await fetch(`${CRM}/api/admin/waitlist?status=waiting&q=QA-WL`, { headers: adminH });
  const adminListBody = await adminList.json().catch(() => ({}));
  const aItems = adminListBody?.items || [];
  ok('admin GET (q=QA-WL) → 200 + kayıt bulundu', adminList.status === 200 && aItems.some((x) => x.id === entryId), `status=${adminList.status} adet=${aItems.length}`);

  // ---- 7) tenant izolasyonu: T2 admini T1 kaydına erişemez (404) ----
  const login2 = await fetch(`${CRM}/api/auth`, {
    method: 'POST', headers: h(),
    body: JSON.stringify({ email: 'demo@egeticaret.com', password: '1234' }),
  });
  const sc2 = (login2.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('gnc_session='));
  if (sc2 && entryId) {
    const cross = await fetch(`${CRM}/api/admin/waitlist/${entryId}`, { method: 'PATCH', headers: h({ cookie: sc2 }), body: JSON.stringify({ status: 'booked' }) });
    ok('T2 admini T1 kaydını PATCH → 404 (sızma yok)', cross.status === 404, `status=${cross.status}`);
    const crossDel = await fetch(`${CRM}/api/admin/waitlist/${entryId}`, { method: 'DELETE', headers: h({ cookie: sc2 }) });
    ok('T2 admini T1 kaydını DELETE → 404', crossDel.status === 404, `status=${crossDel.status}`);
  } else {
    ok('T2 login + cross-tenant testi', false, 'T2 oturumu ya da entryId yok');
  }

  // ---- 8) admin PATCH → notified (notifiedAt set) + geçersiz status 400 ----
  const badStatus = await fetch(`${CRM}/api/admin/waitlist/${entryId}`, { method: 'PATCH', headers: adminH, body: JSON.stringify({ status: 'hacked' }) });
  ok('PATCH geçersiz status → 400', badStatus.status === 400, `status=${badStatus.status}`);

  const patch = await fetch(`${CRM}/api/admin/waitlist/${entryId}`, { method: 'PATCH', headers: adminH, body: JSON.stringify({ status: 'notified' }) });
  const patchBody = await patch.json().catch(() => ({}));
  const patched = patchBody?.data?.entry || patchBody?.entry;
  ok('PATCH → notified + notifiedAt set', patch.status === 200 && patched?.status === 'notified' && Boolean(patched?.notifiedAt), `status=${patch.status}`);

  // müşteri artık "notified" görüyor
  // NOT: api-utils ok() veriyi TOP-LEVEL döndürür ({ok:true,...data} değil) — items doğrudan gövdede
  const myStatus2 = await fetch(`${CRM}/api/public/waitlist?phone=${PHONE}`, { headers: h() });
  const items2 = ((await myStatus2.json().catch(() => ({})))?.items) || [];
  ok('müşteri GET artık status=notified görüyor', items2[0]?.status === 'notified', `status=${items2[0]?.status || '-'}`);

  // ---- 9) 3002 same-origin proxy ----
  const proxyPhone = `906${(100000000 + Math.floor(Math.random() * 899999999)).toString().slice(0, 9)}`;
  const proxyPost = await fetch(`${SITE}/api/waitlist`, { method: 'POST', headers: h(), body: JSON.stringify({ ...base, customerPhone: proxyPhone }) });
  ok('3002 POST proxy → 201 iletilir', proxyPost.status === 201, `status=${proxyPost.status}`);
  const proxyGet = await fetch(`${SITE}/api/waitlist?phone=${proxyPhone}`, { headers: h() });
  const proxyItems = ((await proxyGet.json().catch(() => ({})))?.items) || [];
  ok('3002 GET proxy → kayıt döner', proxyGet.status === 200 && proxyItems.length === 1, `status=${proxyGet.status} adet=${proxyItems.length}`);

  // ---- 10) temizlik: iki kaydı admin DELETE ile sil ----
  const proxyId = proxyItems[0]?.id;
  for (const [label, id] of [['ana', entryId], ['proxy', proxyId]]) {
    if (!id) { ok(`temizlik (${label})`, false, 'id yok'); continue; }
    const del = await fetch(`${CRM}/api/admin/waitlist/${id}`, { method: 'DELETE', headers: adminH });
    ok(`admin DELETE (${label}) → 200`, del.status === 200, `status=${del.status}`);
  }
  const after = await fetch(`${CRM}/api/public/waitlist?phone=${PHONE}`, { headers: h() });
  const afterItems = ((await after.json().catch(() => ({})))?.items) || [];
  ok('temizlik sonrası müşteri GET boş', afterItems.length === 0, `adet=${afterItems.length}`);

  // ---- 11) DB baseline: seed 3 kayıt + QA kalıntısı 0 ----
  const qaCount = await db.waitlistEntry.count({ where: { customerName: { contains: 'QA-WL' } } });
  const total = await db.waitlistEntry.count();
  ok('QA kalıntısı 0', qaCount === 0, `qa=${qaCount}`);
  ok('DB baseline (3 seed kaydı) korunuyor', total === 3, `toplam=${total}`);

  // ---- özet ----
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
