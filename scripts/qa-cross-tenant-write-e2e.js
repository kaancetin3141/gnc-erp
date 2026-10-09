// E2E — SUPERADMIN ÇAPRAZ-TENANT YAZMA tutarlılığı
// Senaryo: superadmin, BAŞKA bir şirketin müşterisine aktivite ekler →
// aktivite superadmin'in tenant'ına DEĞİL, müşterinin tenant'ına yazılmalı.
// Test kaydı sonda silinir (DB cleanup).
const BASE = process.env.BASE || 'http://localhost:3000'
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const cookie = r.headers.get('set-cookie')?.split(';')[0] || ''
  if (!r.ok || !cookie) throw new Error(`login başarısız: ${r.status}`)
  return cookie
}

let failures = 0
function check(label, cond, extra = '') {
  const mark = cond ? '✓' : '✗ FAIL'
  if (!cond) failures++
  console.log(`${mark} ${label}${extra ? ' — ' + extra : ''}`)
}

;(async () => {
  const admin = await login('admin', '314159')

  // 1) Farklı tenant'tan bir müşteri bul (superadmin platform geneli görüyor)
  const r = await fetch(`${BASE}/api/customers`, { headers: { cookie: admin } })
  const list = (await r.json()).items || (await r.json()).data || []
  const target = list.find(c => c.tenant && !c.tenant.name.includes('Anadolu'))
  if (!target) throw new Error('Anadolu dışı tenant müşterisi bulunamadı')
  console.log(`Hedef: ${target.name} (şirket: ${target.tenant.name}, tenantId: ${target.tenantId})`)

  // 2) Superadmin olarak çapraz-tenant aktivite oluştur
  const MARKER = `QA-CROSS-TENANT-${Date.now()}`
  const pr = await fetch(`${BASE}/api/customers/${target.id}/activities`, {
    method: 'POST',
    headers: { cookie: admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'not', subject: MARKER, detail: 'çapraz-tenant yazma E2E testi' }),
  })
  const pj = await pr.json().catch(() => ({}))
  check('POST /customers/[id]/activities 200/201 (superadmin çapraz-tenant)', pr.ok, `durum=${pr.status} ${JSON.stringify(pj).slice(0, 100)}`)
  const actId = pj.data?.id || pj.id
  check('aktivite id döndü', !!actId)

  // 3) DB'de sahiplik doğrula: aktivite tenantId == müşteri tenantId (superadmin tenant'ı DEĞİL)
  const dbAct = await prisma.activity.findUnique({ where: { id: actId } })
  check('aktivite MÜŞTERİNİN tenantına yazıldı (superadmin tenantına değil)',
    dbAct && dbAct.tenantId === target.tenantId,
    `aktivite.tenantId=${dbAct?.tenantId} müşteri.tenantId=${target.tenantId}`)

  // 4) Müşterinin kendi aktivite listesinde görünür (tekrar okuma)
  const gr = await fetch(`${BASE}/api/customers/${target.id}/activities`, { headers: { cookie: admin } })
  const acts = await gr.json()
  const seen = (Array.isArray(acts) ? acts : acts.data || []).some(a => a.subject === MARKER)
  check('aktivite müşteri listesinde okunuyor', gr.ok && seen)

  // 5) Temizlik
  if (actId) {
    await prisma.activity.delete({ where: { id: actId } })
    const gone = await prisma.activity.findUnique({ where: { id: actId } })
    check('test kaydı temizlendi', !gone)
    await prisma.customer.update({ where: { id: target.id }, data: { lastActivityAt: target.lastActivityAt || null } }).catch(() => {})
  }

  console.log(failures === 0 ? '\nSONUÇ: TÜM TESTLER GEÇTİ ✅' : `\nSONUÇ: ${failures} TEST BAŞARISIZ ❌`)
  process.exitCode = failures === 0 ? 0 : 1
})().catch(e => { console.error('HATA:', e.message); process.exit(2) }).finally(() => prisma.$disconnect())
