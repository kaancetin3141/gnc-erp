// Kurtarma adayı DB'nin içeriğini doğrula (salt-okunur)
import { Database } from 'bun:sqlite';
const db = new Database('/home/z/my-project/db/backups/recovery-20261028.db', { readonly: true });

const targets = ['User', 'Tenant', 'ServiceProvider', 'Staff', 'Service', 'Appointment', 'Customer', 'Member', 'Resident', 'Site', 'Cafe', 'Market'];
for (const t of targets) {
  try {
    const r = db.query(`SELECT COUNT(*) as n FROM "${t}"`).get();
    console.log(`${t}: ${r.n}`);
  } catch (e) { console.log(`${t}: tablo yok`); }
}
console.log('\n--- ServiceProvider içeriği ---');
try {
  const rows = db.query('SELECT * FROM ServiceProvider').all();
  for (const r of rows) console.log(JSON.stringify(r).slice(0, 300));
} catch (e) { console.log('hata: ' + e.message); }
