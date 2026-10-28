// "4" olası karşılıkları: fotoğraflar, randevu durumları, üyelik sayfası bileşenleri
import { Database } from 'bun:sqlite';
const db = new Database('/home/z/my-project/db/custom.db', { readonly: true });

console.log('=== PROVIDER PHOTOS (sik-kuafor) ===');
try {
  const photos = db.query("SELECT COUNT(*) as n FROM ProviderPhoto WHERE providerId='cmu3f00pa002tv77abu82g7vq'").get();
  console.log('Toplam fotoğraf:', photos.n);
} catch (e) { console.log('hata', e.message); }

console.log('\n=== RANDEVU DURUMLARI ===');
for (const r of db.query("SELECT status, COUNT(*) as n FROM Appointment GROUP BY status").all()) console.log(JSON.stringify(r));

console.log('\n=== TENANT SIRASI (oluşturulma) ===');
for (const t of db.query("SELECT name FROM Tenant ORDER BY createdAt").all()) console.log(t.name);

console.log('\n=== REVIEWS ===');
try { console.log(JSON.stringify(db.query("SELECT COUNT(*) as n FROM Review").get())); } catch (e) { console.log('yok'); }

console.log('\n=== WAITLIST ===');
try { console.log(JSON.stringify(db.query("SELECT COUNT(*) as n FROM WaitlistEntry").get())); } catch (e) { console.log('yok'); }

console.log('\n=== MEMBERS (üye portalı) ===');
try { console.log(JSON.stringify(db.query("SELECT COUNT(*) as n FROM Member").get())); } catch (e) { console.log('yok'); }

console.log('\n=== STAMP CARD SETTINGS ===');
try { console.log(JSON.stringify(db.query("SELECT * FROM StampCardSetting").all()).slice(0,300)); } catch (e) { console.log('yok'); }
