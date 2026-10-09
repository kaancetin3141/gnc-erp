// QA smoke test #2 — 0063a7b'de kapsamı açılan ama uçtan uca doğrulanmamış modüller
// Superadmin: 200 + platform geneli; Demo: 200 + izolasyon (demo sayısı ≤ admin sayısı)
// Kullanım: node scripts/qa-modules-smoke.js
const BASE = process.env.BASE || 'http://localhost:3000'

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const cookie = r.headers.get('set-cookie')?.split(';')[0] || ''
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !cookie) throw new Error(`login ${email} başarısız: ${r.status} ${JSON.stringify(j)}`)
  return cookie
}

async function get(cookie, path) {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie } })
  const text = await r.text()
  let j
  try { j = JSON.parse(text) } catch { j = { raw: text.slice(0, 120) } }
  return { status: r.status, j }
}

// Yanıt içindeki ilk anlamlı diziyi bul (items/data/xxx format çeşitliliği için)
function pickArray(j) {
  if (Array.isArray(j)) return j
  if (!j || typeof j !== 'object') return null
  for (const k of ['items', 'data', 'list', 'records']) {
    if (Array.isArray(j[k])) return j[k]
  }
  for (const v of Object.values(j)) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return v
  }
  return null
}

let failures = 0
function check(label, cond, extra = '') {
  const mark = cond ? '✓' : '✗ FAIL'
  if (!cond) failures++
  console.log(`${mark} ${label}${extra ? ' — ' + extra : ''}`)
}

const ENDPOINTS = [
  ['/api/products', 'ürünler'],
  ['/api/expenses', 'giderler'],
  ['/api/irsaliye', 'irsaliye'],
  ['/api/hr/employees', 'İK personel'],
  ['/api/hr/leaves', 'İK izin'],
  ['/api/hr/shifts', 'İK vardiya'],
  ['/api/cash/accounts', 'kasa hesapları'],
  ['/api/cash/transactions', 'kasa hareketleri'],
  ['/api/tickets', 'talepler'],
  ['/api/messages', 'mesajlar'],
  ['/api/membership/packages', 'üyelik paketleri'],
  ['/api/membership/subscriptions', 'üyelik abonelikleri'],
  ['/api/templates', 'şablonlar'],
  ['/api/loyalty/accounts', 'sadakat hesapları'],
  ['/api/social/inbox', 'sosyal gelen kutusu'],
  ['/api/admin/overview', 'admin genel bakış'],
]

;(async () => {
  const admin = await login('admin', '314159')
  console.log('=== SUPERADMIN (admin) — platform geneli ===')
  const adminCounts = {}
  for (const [path, label] of ENDPOINTS) {
    const r = await get(admin, path)
    const list = pickArray(r.j)
    const n = list ? list.length : null
    adminCounts[path] = n
    check(`GET ${path} 200 (${label})`, r.status === 200,
      n !== null ? `kayıt=${n}` : `gövde=${JSON.stringify(r.j).slice(0, 90)}`)
  }

  const demo = await login('demo@anadolu.com', '1234')
  console.log('=== DEMO (demo@anadolu.com) — izolasyon regresyonu ===')
  for (const [path, label] of ENDPOINTS) {
    const r = await get(demo, path)
    const list = pickArray(r.j)
    const n = list ? list.length : null
    const a = adminCounts[path]
    const isolated = (typeof n === 'number' && typeof a === 'number') ? n <= a : true
    check(`GET ${path} 200 + izolasyon (${label})`, r.status === 200 && isolated,
      `demo=${n ?? '?'} ≤ admin=${a ?? '?'}${r.status !== 200 ? ` durum=${r.status}` : ''}`)
  }

  console.log(failures === 0 ? '\nSONUÇ: TÜM TESTLER GEÇTİ ✅' : `\nSONUÇ: ${failures} TEST BAŞARISIZ ❌`)
  process.exit(failures === 0 ? 0 : 1)
})().catch(e => { console.error('HATA:', e.message); process.exit(2) })
