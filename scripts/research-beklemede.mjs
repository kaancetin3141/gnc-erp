// 4 bekleyen randevuyu detaylı incele
import { Database } from 'bun:sqlite';
const db = new Database('/home/z/my-project/db/custom.db', { readonly: true });

const cols = db.query("PRAGMA table_info(Appointment)").all().map(c => c.name);
console.log('Appointment kolonları:', cols.join(', '));
console.log('\n=== BEKLEMEDEKİ 4 RANDEVU ===');
const rows = db.query(`SELECT a.*, s.name as serviceName, st.name as staffName
  FROM Appointment a
  LEFT JOIN Service s ON s.id = a.serviceId
  LEFT JOIN Staff st ON st.id = a.staffId
  WHERE a.status='beklemede'`).all();
for (const r of rows) {
  const o = {};
  for (const [k, val] of Object.entries(r)) {
    let v = val;
    if (typeof v === 'string' && v.length > 60) v = v.slice(0, 57) + '...';
    o[k] = v;
  }
  console.log(JSON.stringify(o, null, 1));
}
