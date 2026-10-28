// Araştırma: sikkuaför + "4" neye karşılık geliyor?
import { Database } from 'bun:sqlite';
const db = new Database('/home/z/my-project/db/custom.db', { readonly: true });

console.log('=== TENANTS ===');
for (const t of db.query('SELECT * FROM Tenant').all()) {
  console.log(JSON.stringify(t).slice(0, 250));
}

console.log('\n=== SERVICE PROVIDERS ===');
for (const p of db.query('SELECT id, tenantId, name, slug, type, city, district, isActive FROM ServiceProvider').all()) {
  console.log(JSON.stringify(p));
}

console.log('\n=== SERVICES (6) ===');
for (const s of db.query('SELECT id, name, category, duration, price, isActive, sortOrder FROM Service ORDER BY sortOrder').all()) {
  console.log(JSON.stringify(s));
}

console.log('\n=== STAFF ===');
for (const s of db.query('SELECT * FROM Staff').all()) {
  console.log(JSON.stringify(s).slice(0, 220));
}

console.log('\n=== SITES (2) ===');
for (const s of db.query('SELECT id, name, city, isActive FROM Site').all()) {
  console.log(JSON.stringify(s));
}

console.log('\n=== APPOINTMENT DAĞILIMI (providerId bazlı) ===');
for (const r of db.query('SELECT providerId, COUNT(*) as n, status FROM Appointment GROUP BY providerId, status').all()) {
  console.log(JSON.stringify(r));
}

console.log('\n=== MEMBERSHIP PACKAGES ===');
try { for (const r of db.query('SELECT id, name, price, isActive FROM MembershipPackage').all()) console.log(JSON.stringify(r)); } catch(e) { console.log('yok'); }
