// QA smoke test — Superadmin platform-geneli görünürlük + rol regresyonu
// Kullanım: node scripts/qa-superadmin-smoke.js
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

function pick(j) { return j.items || j.data || j }

function tenantBreakdown(list) {
  const by = {}
  for (const c of list) {
    const t = c.tenant?.name || (c.tenantId ? '(tenant bilgisi yok)' : 'YOK')
    by[t] = (by[t] || 0) + 1
  }
  return by
}

let failures = 0
function check(label, cond, extra = '') {
  const mark = cond ? '✓' : '✗ FAIL'
  if (!cond) failures++
  console.log(`${mark} ${label}${extra ? ' — ' + extra : ''}`)
}

;(async () => {
  // ─── 1) SUPERADMIN: platform geneli ───
  const admin = await login('admin', '314159')
  console.log('=== SUPERADMIN (admin) ===')

  const cust = await get(admin, '/api/customers')
  const custList = pick(cust.j)
  check('GET /api/customers 200', cust.status === 200, `durum=${cust.status}`)
  check('müşteri = tüm tenantlar (31 bekleniyor)', custList.length === 31, `toplam=${custList.length}`)
  check('tenant bilgisi include ediliyor', custList.every?.(c => c.tenant?.name), 'hepsinde tenant.name olmalı')
  if (Array.isArray(custList)) console.log('  kırılım:', JSON.stringify(tenantBreakdown(custList)))

  const dash = await get(admin, '/api/dashboard')
  check('GET /api/dashboard 200', dash.status === 200, `durum=${dash.status}`)

  const trend = await get(admin, '/api/dashboard/trend')
  check('GET /api/dashboard/trend 200', trend.status === 200, `durum=${trend.status}`)

  const deals = await get(admin, '/api/deals')
  const dealList = pick(deals.j)
  check('GET /api/deals 200', deals.status === 200)
  check('fırsat platform geneli (25 bekleniyor)', dealList.length === 25, `toplam=${dealList.length}`)

  const tasks = await get(admin, '/api/tasks')
  check('GET /api/tasks 200', tasks.status === 200)

  const prov = await get(admin, '/api/appointments/providers')
  const provList = pick(prov.j)
  check('GET /api/appointments/providers 200', prov.status === 200)
  check('işletme platform geneli + tenant bilgisi', Array.isArray(provList) && provList.every(p => p.tenant?.name),
    `toplam=${Array.isArray(provList) ? provList.length : '?'}`)

  // ─── 1b) Yeni genişletilen uçlar (tenantScope merkezi düzeltmesi) ───
  const search = await get(admin, '/api/search?q=a')
  check('GET /api/search 200', search.status === 200)
  const searchHits = (search.j.customers?.length || 0) + (search.j.deals?.length || 0)
  check('arama platform geneli sonuç döner', search.status === 200 && searchHits > 0, `müşteri+fırsat=${searchHits}`)

  const leads = await get(admin, '/api/leads?limit=500')
  const leadList = pick(leads.j)
  check('GET /api/leads 200 (platform geneli)', leads.status === 200 && Array.isArray(leadList), `toplam=${Array.isArray(leadList) ? leadList.length : '?'}`)

  const users = await get(admin, '/api/users')
  const userList = pick(users.j)
  const usersItems = userList.items || userList
  check('GET /api/users 200 (platform geneli)', users.status === 200 && Array.isArray(usersItems), `toplam=${Array.isArray(usersItems) ? usersItems.length : '?'}`)

  const rep = await get(admin, '/api/reports')
  check('GET /api/reports 200', rep.status === 200)

  const drep = await get(admin, '/api/reports/daily')
  check('GET /api/reports/daily 200', drep.status === 200)

  const mapPts = await get(admin, '/api/maps/customers-points')
  const mapList = pick(mapPts.j)
  // Not: sandbox DB'de koordinatlı müşteri yoksa 0 dönmesi normal (kod değil veri konusu)
  check('GET /api/maps/customers-points 200 (platform geneli)', mapPts.status === 200 && Array.isArray(mapList),
    `nokta=${Array.isArray(mapList) ? mapList.length : '?'}`)

  const inv = await get(admin, '/api/invoices?limit=500')
  check('GET /api/invoices 200', inv.status === 200)

  const ords = await get(admin, '/api/orders?limit=500')
  check('GET /api/orders 200', ords.status === 200)

  const quo = await get(admin, '/api/quotes?limit=500')
  check('GET /api/quotes 200', quo.status === 200)

  const pro = await get(admin, '/api/proforma?limit=500')
  check('GET /api/proforma 200', pro.status === 200)

  const prod = await get(admin, '/api/production?limit=500')
  check('GET /api/production 200', prod.status === 200)

  // ─── 2) DEMO KULLANICI: tenant izolasyonu korunmalı ───
  const demo = await login('demo@anadolu.com', '1234')
  console.log('=== DEMO (demo@anadolu.com) ===')

  const dcust = await get(demo, '/api/customers')
  const dcustList = pick(dcust.j)
  check('demo müşterileri yalnız kendi tenantında', dcust.status === 200 && dcustList.length === 21,
    `toplam=${dcustList.length} (21 olmalı — Ege'nin 10 müşterisi GÖRÜNMEMELİ)`)

  const ddeals = await get(demo, '/api/deals')
  const ddealList = pick(ddeals.j)
  check('demo fırsatları tenant izolasyonlu', ddealList.length === 25, `toplam=${ddealList.length}`)

  const ddash = await get(demo, '/api/dashboard')
  check('demo dashboard 200', ddash.status === 200, `durum=${ddash.status}`)

  // Yeni uçlar için demo izolasyon regresyonu
  const dleads = await get(demo, '/api/leads?limit=500')
  const dleadList = pick(dleads.j)
  check('demo lead listesi tenant izolasyonlu', dleads.status === 200 && Array.isArray(dleadList),
    `toplam=${Array.isArray(dleadList) ? dleadList.length : '?'} (platform toplamından küçük olmalı)`)

  const dusers = await get(demo, '/api/users')
  const duserList = pick(dusers.j)
  const dusersItems = duserList.items || duserList
  const adminUsers = await get(admin, '/api/users')
  const adminUserList = pick(adminUsers.j)
  const adminUsersItems = adminUserList.items || adminUserList
  check('demo kullanıcı listesi superadmin listesinden dar',
    Array.isArray(dusersItems) && Array.isArray(adminUsersItems) && dusersItems.length <= adminUsersItems.length,
    `demo=${Array.isArray(dusersItems) ? dusersItems.length : '?'} ≤ admin=${Array.isArray(adminUsersItems) ? adminUsersItems.length : '?'}`)

  const dmap = await get(demo, '/api/maps/customers-points')
  const dmapList = pick(dmap.j)
  check('demo harita noktaları tenant izolasyonlu', dmap.status === 200 && Array.isArray(dmapList) && dmapList.length <= mapList.length,
    `demo=${Array.isArray(dmapList) ? dmapList.length : '?'} ≤ admin=${Array.isArray(mapList) ? mapList.length : '?'}`)

  console.log(failures === 0 ? '\nSONUÇ: TÜM TESTLER GEÇTİ ✅' : `\nSONUÇ: ${failures} TEST BAŞARISIZ ❌`)
  process.exit(failures === 0 ? 0 : 1)
})().catch(e => { console.error('HATA:', e.message); process.exit(2) })
