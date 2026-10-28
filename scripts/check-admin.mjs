// Program Admini kaydını kontrol et
import { Database } from 'bun:sqlite';
const db = new Database('/home/z/my-project/db/custom.db', { readonly: true });

const cols = db.query("PRAGMA table_info(User)").all().map(c => c.name);
console.log('User kolonları:', cols.join(', '));

const admins = db.query("SELECT id, email, name, role, tenantId, substr(passwordHash,1,15) as hashPrefix, status FROM User WHERE role LIKE '%admin%' OR email LIKE '%admin%' OR email LIKE '%gnccrm%'").all();
console.log('\n=== ADMIN KULLANICILARI ===');
for (const a of admins) console.log(JSON.stringify(a));
