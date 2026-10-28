#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-expressions -- test-assertion stili: koşul ? pass(...) : fail(...) */
// ============================================================
// GNC CRM SÜPERAPP — KALICI GÜVENLİK / SIZMA TEST PAKETİ
// ------------------------------------------------------------
// Kullanım:
//   node scripts/security-audit.mjs           → tam koşu
//   node scripts/security-audit.mjs --quick   → hızlı koşu
//     (brute-force döngüleri kısaltılır, bazı girdi testleri atlanır)
//
// Hedefler:
//   CRM (3000)          → http://localhost:3000
//   Müşteri sitesi (3002) → http://localhost:3002  (GNC Randevu proxy'si)
//
// Kapsam (proje geçmişindeki gerçek sızımlara göre):
//   A. Kimlik doğrulama (oturumsuz erişim, bozuk cookie, brute-force,
//      /api/auth GET kullanıcı sızıntısı — ESKİ SIZMA)
//   B. Çok kiracılı izolasyon / IDOR (cross-tenant CRUD, kullanıcı
//      silme, superadmin kapsamı, randevu sahiplenme)
//   C. Rol/İzin (RBAC): depo → reports.view, rep → admin uçları...
//   D. Public API suistimali (validasyon, çift rezervasyon, üyelik
//      token güvenliği, rate limit, SQLi, /api/seed — ESKİ SIZMA, cron)
//   E. Veri sızması (passwordHash, stack trace, public PII)
//   F. Güvenli başlıklar (cookie bayrakları, CORS, path traversal)
//
// NOTLAR:
//   · Test verisi (üye/randevu/yorum/geçici provider) sonda temizlenir.
//   · Rate limit kovaları doldurulur → koşu sonunda raporlanır
//     (kalıcı yan etki yok; pencereler 15 dk'da kendiliğinden sıfırlanır).
//   · Bu paket KOD DÜZELTMEZ — yalnız bulgu üretir.
//   · Çıkış kodu: 0 = KRİTİK bulgu yok, 1 = en az bir KRİTİK bulgu.
// ============================================================

import { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { execSync, spawn } from 'node:child_process'

const QUICK = process.argv.includes('--quick')
// Koşuya özgü kimlikler — tekrar koşularda 15 dk'lık rate-limit kovaları çakışmasın
const RUNID = Date.now().toString(36)
const randPhone = (prefix) => prefix + String(Math.floor(Math.random() * 90000) + 10000)

const CRM = 'http://localhost:3000'
const SITE = 'http://localhost:3002'

// ─── Renkli çıktı ────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m', gray: '\x1b[90m',
  redBg: '\x1b[41m', greenBg: '\x1b[42m', yellowBg: '\x1b[43m',
}
const colorize = (s, c) => `${c}${s}${C.reset}`

// ─── Test kayıt altyapısı ────────────────────────────────────
const results = []   // { id, name, category, expectation, actual, status, severity?, evidence? }
const findings = []  // { severity, test, description, evidence, fix }

function record({ id, name, category, expectation, actual, status, severity = null, evidence = null }) {
  results.push({ id, name, category, expectation, actual, status, severity, evidence })
  const mark = status === 'PASS' ? colorize(' PASS ', C.greenBg)
    : status === 'FAIL' ? colorize(' FAIL ', C.redBg)
    : status === 'WARN' ? colorize(' WARN ', C.yellowBg)
    : colorize(' SKIP ', C.gray)
  const sev = severity ? colorize(` [${severity}]`, severity === 'KRİTİK' ? C.red : severity === 'YÜKSEK' ? C.yellow : C.cyan) : ''
  console.log(`${mark} ${C.bold}${id}${C.reset} ${name}${sev}`)
  console.log(`  ${C.gray}beklenti: ${expectation}${C.reset}`)
  console.log(`  ${C.gray}gerçek:   ${String(actual).slice(0, 260)}${C.reset}`)
  if (evidence) console.log(`  ${C.gray}kanıt:    ${String(evidence).slice(0, 300)}${C.reset}`)
}

function finding(severity, test, description, evidence, fix) {
  findings.push({ severity, test, description, evidence, fix })
}

const pass = (o) => record({ ...o, status: 'PASS' })
const fail = (o) => record({ ...o, status: 'FAIL' })
const warn = (o) => record({ ...o, status: 'WARN' })
const skip = (o) => record({ ...o, status: 'SKIP' })

// ─── HTTP yardımcıları ───────────────────────────────────────
const captured = [] // E2 taraması için tüm yanıt gövdeleri

let serverRestarted = false
function restartDevServer() {
  try {
    console.log(colorize('  [ops] dev server yeniden başlatılıyor (bilinen OOM)...', C.yellow))
    spawn('bash', ['-c', 'cd /home/z/my-project && nohup bun run dev > /dev/null 2>&1 &'], { detached: true, stdio: 'ignore' }).unref()
    // ayaklanana kadar bekle (maks ~90sn)
    const t0 = Date.now()
    execSync('for i in $(seq 1 45); do curl -s -o /dev/null -m 2 http://localhost:3000/ && exit 0; sleep 2; done; exit 1', { timeout: 100000 })
    console.log(colorize(`  [ops] dev server ayakta (${Math.round((Date.now() - t0) / 1000)}sn)`, C.green))
    serverRestarted = true
  } catch {
    console.log(colorize('  [ops] restart başarısız — testler devam edecek ama sonuçlar güvenilmez olabilir', C.red))
  }
}

function restartSite() {
  try {
    console.log(colorize('  [ops] 3002 müşteri sitesi yeniden başlatılıyor...', C.yellow))
    spawn('bash', ['-c', 'cd /home/z/my-project/mini-services/customer-page && BASE_DOMAIN=gncinc.online nohup bun --hot index.ts > /tmp/customer-page.log 2>&1 &'], { detached: true, stdio: 'ignore' }).unref()
    execSync('for i in $(seq 1 20); do curl -s -o /dev/null -m 2 http://localhost:3002/ && exit 0; sleep 2; done; exit 1', { timeout: 50000 })
    console.log(colorize('  [ops] 3002 ayakta', C.green))
    serverRestarted = true
  } catch {
    console.log(colorize('  [ops] 3002 restart başarısız — proxy testleri ECONNREFUSED verecek', C.red))
  }
}

async function req(method, url, { headers = {}, body = null, label = '', timeoutMs = 20000, rawBody = null } = {}) {
  const opts = { method, headers: { ...headers }, signal: AbortSignal.timeout(timeoutMs) }
  if (body !== null) { opts.body = JSON.stringify(body); opts.headers['content-type'] = opts.headers['content-type'] || 'application/json' }
  if (rawBody !== null) { opts.body = rawBody }
  let res
  for (let attempt = 0; attempt < 2; attempt++) {
    try { res = await fetch(url, opts); break } catch (e) {
      if (attempt === 0 && /fetch failed|ECONNREFUSED|aborted|timeout/i.test(String(e))) {
        console.log(colorize(`  [ops] ${url} ulaşım hatası (${e.cause?.code || e.message}) — restart deneniyor`, C.yellow))
        if (url.includes(':3002')) restartSite()
        else restartDevServer()
        continue
      }
      return { status: 0, headers: {}, text: `__FETCH_ERROR__ ${e.cause?.code || e.message}`, json: null }
    }
  }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch { /* html veya boş */ }
  captured.push({ label: label || `${method} ${url}`, status: res.status, body: text.slice(0, 4000) })
  return { status: res.status, headers: res.headers, text, json }
}

// CRM oturumu (gnc_session cookie'si)
async function login(email, password) {
  const r = await req('POST', `${CRM}/api/auth`, { body: { email, password }, label: `login ${email}` })
  const setCookie = r.headers.get('set-cookie') || ''
  const token = setCookie.match(/gnc_session=([^;]+)/)?.[1] || r.json?.sessionId || null
  return { ok: r.status === 200 && !!token, token, setCookie, status: r.status }
}
const cookie = (token) => ({ cookie: `gnc_session=${token}` })

// ─── Prisma (DB doğrulama + temizlik) ────────────────────────
const prisma = new PrismaClient()

// ─── Üye token imzalama (white-box: db/.member-secret) ───────
function loadMemberSecret() {
  const env = process.env.MEMBER_AUTH_SECRET?.trim()
  if (env) return env
  try {
    const file = new URL('../db/.member-secret', import.meta.url)
    if (existsSync(file)) {
      const s = readFileSync(file, 'utf8').trim()
      if (s.length >= 32) return s
    }
  } catch { /* yok */ }
  return null
}
function signMemberToken(memberId, ttlMs) {
  const secret = loadMemberSecret()
  if (!secret) return null
  const exp = Date.now() + ttlMs
  const payload = `${memberId}.${exp}`
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

// ─── Yardımcılar ─────────────────────────────────────────────
const bodyHas = (r, ...needles) => needles.some((n) => r.text && r.text.toLowerCase().includes(n.toLowerCase()))
const jstr = (v) => { try { return JSON.stringify(v)?.slice(0, 220) } catch { return String(v)?.slice(0, 220) } }
const todayISO = () => new Date().toISOString().slice(0, 10)
function futureDate(daysAhead) {
  const d = new Date(); d.setDate(d.getDate() + daysAhead)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function pastDate(daysAgo) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const apptCode = (id) => id.slice(-8).toUpperCase()

// ============================================================
// ANA AKIŞ
// ============================================================
const state = {
  sessions: {},       // rol → token
  testMember: null,   // { id, phone, token }
  testAppointmentIds: [],
  testReviewIds: [],
  testPhones: [],
  tempProvider: null,
  baseline: {},
  rateLimitNotes: [],
  startTime: new Date(),
  snapshots: {},      // IDOR kurbanlarının tam satır yedeği (guard kırılırsa geri yükleme için)
}

async function captureBaseline() {
  const [appt, member, review, provider, customer, user, deal, task, product, invoice] = await Promise.all([
    prisma.appointment.count(), prisma.member.count(), prisma.review.count(),
    prisma.serviceProvider.count(), prisma.customer.count(), prisma.user.count(),
    prisma.deal.count(), prisma.task.count(), prisma.product.count(), prisma.invoice.count(),
  ])
  state.baseline = { appt, member, review, provider, customer, user, deal, task, product, invoice }
}

// DB'den hedef kayıtlar (IDOR kurbanları)
async function loadTargets() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } })
  const t1 = tenants.find((t) => t.name.includes('Anadolu Satış')) || tenants[0]
  const t2 = tenants.find((t) => t.name.includes('Ege Ticaret')) || tenants.find((t) => t.id !== t1.id)
  const t2Customer = await prisma.customer.findFirst({ where: { tenantId: t2.id }, select: { id: true, name: true } })
  const t1Customer = await prisma.customer.findFirst({ where: { tenantId: t1.id }, select: { id: true, name: true } })
  const t1Deal = await prisma.deal.findFirst({ where: { tenantId: t1.id }, select: { id: true, title: true } })
  const t1Task = await prisma.task.findFirst({ where: { tenantId: t1.id }, select: { id: true, title: true } })
  const t1Product = await prisma.product.findFirst({ where: { tenantId: t1.id }, select: { id: true, name: true } })
  const t1Invoice = await prisma.invoice.findFirst({ where: { tenantId: t1.id }, select: { id: true, number: true } })
  const t2User = await prisma.user.findFirst({ where: { tenantId: t2.id }, select: { id: true, email: true, name: true } })
  const provider = await prisma.serviceProvider.findFirst({ where: { slug: 'sik-kuafor' } })
    || await prisma.serviceProvider.findFirst()
  const service = await prisma.service.findFirst({ where: { providerId: provider.id, isActive: true } })
  const staffService = await prisma.staffService.findFirst({ where: { serviceId: service.id } })
  const pastApptNoReview = await prisma.appointment.findFirst({
    where: { date: { lt: new Date() }, status: 'onaylandi', review: { is: null }, providerId: provider.id },
    select: { id: true, customerName: true },
  })
  // IDOR kurbanlarının tam satır anlık görüntüsü (guard kırılırsa test sonunda geri yüklenir)
  const snapKeys = {
    customer: t2Customer?.id, deal: t1Deal?.id, task: t1Task?.id,
    product: t1Product?.id, invoice: t1Invoice?.id, user: t2User?.id,
    t1customer: t1Customer?.id,
  }
  for (const [k, id] of Object.entries(snapKeys)) {
    if (!id) continue
    const model = { customer: 'customer', t1customer: 'customer', deal: 'deal', task: 'task', product: 'product', invoice: 'invoice', user: 'user' }[k]
    try {
      const row = await prisma[model].findUnique({ where: { id } })
      if (row) state.snapshots[k] = { model, row: JSON.parse(JSON.stringify(row)) }
    } catch { /* snapshot alınamadı */ }
  }
  return { t1, t2, t2Customer, t1Customer, t1Deal, t1Task, t1Product, t1Invoice, t2User, provider, service, staffService, pastApptNoReview }
}

// ─── A. KİMLİK DOĞRULAMA ─────────────────────────────────────
async function sectionA() {
  console.log(`\n${C.bold}${C.cyan}═══ A. KİMLİK DOĞRULAMA ═══${C.reset}`)

  // A1 — oturumsuz ana API'ler
  const endpoints = [
    '/api/dashboard', '/api/customers', '/api/deals', '/api/tasks', '/api/reports',
    '/api/reports/summary', '/api/admin/services', '/api/messages', '/api/notifications',
    '/api/orders', '/api/invoices', '/api/expenses', '/api/hr/employees', '/api/admin/tenants',
    '/api/users', '/api/products', '/api/leads', '/api/audit', '/api/admin/members',
    '/api/admin/reviews', '/api/admin/overview', '/api/production', '/api/settings',
    '/api/search', '/api/templates', '/api/loyalty/accounts', '/api/automation',
    '/api/membership/packages', '/api/appointments/providers', '/api/social/accounts',
    '/api/tickets', '/api/quotes', '/api/proforma', '/api/irsaliye', '/api/cash/accounts',
    '/api/widgets', '/api/customers/bulk-import',
  ]
  const sweep = QUICK ? endpoints.slice(0, 14) : endpoints
  const leaks = [], others = []
  for (const ep of sweep) {
    const r = await req('GET', `${CRM}${ep}`, { label: `A1 unauth ${ep}` })
    if (r.status === 200) leaks.push(`${ep}→200`)
    else if (r.status !== 401 && r.status !== 403) others.push(`${ep}→${r.status}`)
  }
  if (leaks.length === 0) {
    pass({
      id: 'A1', name: 'Oturumsuz ana API erişimi reddediliyor', category: 'Kimlik Doğrulama',
      expectation: `Tüm ${sweep.length} uç 401/403 dönmeli`,
      actual: `${sweep.length - others.length}/${sweep.length} uç 401/403${others.length ? '; farklı: ' + others.join(', ') : ''} (400/404/405 = parametre hatası, veri sızdırmaz)`,
      severity: 'KRİTİK',
    })
  } else {
    fail({
      id: 'A1', name: 'Oturumsuz ana API erişimi reddediliyor', category: 'Kimlik Doğrulama',
      expectation: 'Tüm uçlar 401/403', actual: `VERİ SIZAN UÇLAR: ${leaks.join(', ')}`, severity: 'KRİTİK',
      evidence: leaks.map((l) => l.split('→')[0]).join(', '),
    })
    finding('KRİTİK', 'A1', `Oturumsuz (cookie'siz) isteklerde veri dönen uçlar: ${leaks.join(', ')}`,
      leaks.join(', '), "Her route'ta getSession + requireAuth/requirePermission guard'u eklenmeli (src/lib/api-utils.ts).")
  }
  if (others.length) {
    finding('DÜŞÜK', 'A1', `Kimlik kontrolünden önce parametre hatasıyla cevap veren uçlar (bilgi sızdırmaz ama öncelik sırası ters): ${others.join(', ')}`,
      others.join(', '), 'Auth kontrolü parametre validasyonundan ÖNCE gelmeli.')
  }

  // A2 — bozuk/uydurma cookie
  const bogus = await req('GET', `${CRM}/api/customers`, { headers: { cookie: 'gnc_session=' + 'f'.repeat(64) }, label: 'A2 bogus cookie' })
  const bogus2 = await req('GET', `${CRM}/api/dashboard`, { headers: { cookie: 'gnc_session=../../etc/passwd' }, label: 'A2 traversal cookie' })
  const denied = [bogus.status, bogus2.status].every((s) => s === 401 || s === 403)
  denied
    ? pass({ id: 'A2', name: 'Bozuk/uydurma gnc_session cookie reddediliyor', category: 'Kimlik Doğrulama', expectation: '401/403', actual: `rastgele token→${bogus.status}, path-traversal token→${bogus2.status}` })
    : fail({ id: 'A2', name: 'Bozuk/uydurma gnc_session cookie reddediliyor', category: 'Kimlik Doğrulama', expectation: '401/403', actual: `rastgele→${bogus.status}, traversal→${bogus2.status}`, severity: 'KRİTİK' })
  if (!denied) finding('KRİTİK', 'A2', 'Uydurma session token ile erişim kabul edildi', `${bogus.status}/${bogus2.status}`, 'resolveSession yalnız Session tablosundan çözümlemeli (src/lib/auth.ts).')

  // A3a — yanlış şifre
  const wrong = await req('POST', `${CRM}/api/auth`, { body: { email: 'demo@anadolu.com', password: 'yanlis-sifre-123' }, label: 'A3 wrong password' })
  wrong.status === 401
    ? pass({ id: 'A3', name: 'Yanlış şifre ile giriş reddediliyor', category: 'Kimlik Doğrulama', expectation: '401 + genel mesaj', actual: `${wrong.status} "${wrong.json?.error}"` })
    : fail({ id: 'A3', name: 'Yanlış şifre ile giriş reddediliyor', category: 'Kimlik Doğrulama', expectation: '401', actual: `${wrong.status}`, severity: 'YÜKSEK' })

  // A3b — brute force (izole e-posta + sahte IP → demo hesapları kilitlemez)
  const BF_EMAIL = `brute-${RUNID}@qa-sec.test`, BF_IP = '9.9.9.9'
  const N = QUICK ? 4 : 12
  let first429 = null, statuses = []
  for (let i = 1; i <= N; i++) {
    const r = await req('POST', `${CRM}/api/auth`, {
      body: { email: BF_EMAIL, password: `wrong-${i}` },
      headers: { 'x-forwarded-for': BF_IP }, label: `A3 brute #${i}`, timeoutMs: 15000,
    })
    statuses.push(r.status)
    if (r.status === 429 && first429 === null) first429 = i
  }
  if (first429 !== null) {
    pass({
      id: 'A3-BF', name: 'CRM giriş brute-force koruması', category: 'Kimlik Doğrulama',
      expectation: 'Çok sayıda yanlış denemede 429 (rate limit)',
      actual: `${N} deneme → ${first429}. denemede 429 (satır: [${statuses.join(',')}]${QUICK ? ' — quick mod' : ''})`,
    })
    state.rateLimitNotes.push(`CRM login rate-limit kovası doldu: ${BF_EMAIL} @ ${BF_IP} (15 dk pencere)`)
  } else if (QUICK) {
    skip({ id: 'A3-BF', name: 'CRM giriş brute-force koruması', category: 'Kimlik Doğrulama', expectation: '429', actual: `quick modda ${N} deneme yapıldı, 429 görülmedi (tam koşuda 12 deneme)` })
  } else {
    warn({
      id: 'A3-BF', name: 'CRM giriş brute-force koruması', category: 'Kimlik Doğrulama',
      expectation: '12 yanlış denemede 429', actual: `${N} denemenin hiçbirinde 429 yok — satır: [${statuses.join(',')}]`, severity: 'ORTA',
    })
    finding('ORTA', 'A3-BF', 'CRM giriş ucunda brute-force rate limit devreye girmedi (10 deneme/15dk sınırı bekleniyordu)', statuses.join(','), 'src/app/api/auth/route.ts checkRateLimit — MAX_ATTEMPTS/WINDOW_MS kontrol edilmeli.')
  }

  // A4 — /api/auth GET kullanıcı sızıntısı (ESKİ SIZMA)
  const g = await req('GET', `${CRM}/api/auth`, { label: 'A4 GET /api/auth' })
  const j = g.json || {}
  const keys = Object.keys(j)
  const hasUserList = keys.some((k) => Array.isArray(j[k])) || (g.text.includes('@') && !g.text.includes('seeded'))
  const onlySeeded = keys.every((k) => k === 'seeded')
  if (g.status === 200 && onlySeeded && !hasUserList) {
    pass({ id: 'A4', name: '/api/auth GET yalnız seeded bayrağı döner (kullanıcı listesi SIZMAMALI)', category: 'Kimlik Doğrulama', expectation: '{ seeded: boolean } — e-posta/kullanıcı yok', actual: jstr(j) })
  } else {
    fail({ id: 'A4', name: '/api/auth GET kullanıcı verisi sızdırıyor', category: 'Kimlik Doğrulama', expectation: 'yalnız seeded', actual: `${g.status} ${jstr(j).slice(0, 200)}`, severity: 'YÜKSEK', evidence: g.text.slice(0, 300) })
    finding('YÜKSEK', 'A4', '/api/auth GET yanıtı kullanıcı/e-posta verisi sızdırıyor', g.text.slice(0, 300), 'GET yalnız { seeded } dönmeli.')
  }
}

// ─── B. ÇOK KİRACILI İZOLASYON (IDOR) ────────────────────────
async function sectionB(T) {
  console.log(`\n${C.bold}${C.cyan}═══ B. ÇOK KİRACILI İZOLASYON (IDOR) ═══${C.reset}`)
  const t1 = state.sessions.t1admin, t2 = state.sessions.t2admin, sa = state.sessions.superadmin

  // B1 — tenant1 admin → tenant2 müşterisi
  const c = T.t2Customer
  let g = await req('GET', `${CRM}/api/customers/${c.id}`, { headers: cookie(t1), label: 'B1 GET t2 cust as t1' })
  if (g.status === 0) { await new Promise((r) => setTimeout(r, 3000)); g = await req('GET', `${CRM}/api/customers/${c.id}`, { headers: cookie(t1), label: 'B1 GET retry' }) }
  const p = await req('PATCH', `${CRM}/api/customers/${c.id}`, { headers: cookie(t1), body: { name: 'QA-HACK' }, label: 'B1 PATCH t2 cust as t1' })
  const d = await req('DELETE', `${CRM}/api/customers/${c.id}`, { headers: cookie(t1), label: 'B1 DELETE t2 cust as t1' })
  const dbAfter = await prisma.customer.findUnique({ where: { id: c.id }, select: { id: true, name: true } })
  const allDenied = [g.status, p.status, d.status].every((s) => s === 403 || s === 404)
  allDenied && dbAfter
    ? pass({ id: 'B1', name: 'Cross-tenant müşteri erişimi (T1 admin → T2 müşteri) reddediliyor', category: 'Çok Kiracılı İzolasyon', expectation: 'GET/PATCH/DELETE → 403/404 + kayıt DB\'de değişmeden duruyor', actual: `GET→${g.status}, PATCH→${p.status}, DELETE→${d.status}; DB adı hâlâ "${dbAfter.name}"`, severity: 'KRİTİK' })
    : (fail({ id: 'B1', name: 'Cross-tenant müşteri erişimi (T1 admin → T2 müşteri)', category: 'Çok Kiracılı İzolasyon', expectation: '403/404', actual: `GET→${g.status}, PATCH→${p.status}, DELETE→${d.status}; DB kaydı: ${dbAfter ? 'duruyor' : 'SİLİNMİŞ!'}`, severity: 'KRİTİK' }),
      finding('KRİTİK', 'B1', 'Tenant1 admin, Tenant2 müşterisini ID ile okuyabildi/değiştirebildi/sildi (IDOR)', `GET ${g.status} / PATCH ${p.status} / DELETE ${d.status}`, 'customers/[id]/route.ts tenantId guard\'u tüm metodlarda bulunmalı; superadmin istisnası bilinçli.'))
  if (!dbAfter) { // silindiyse kurtar — test sonrası DB bozulmasın
    await prisma.customer.create({ data: { id: c.id, tenantId: T.t2.id, name: c.name } }).catch(() => {})
  }

  // B1b — T2 admin → T1 varlıkları (deal/task/product/invoice + customer)
  const cases = [
    { entity: 'deal', id: T.t1Deal?.id, path: 'deals', name: T.t1Deal?.title, patchBody: { title: 'QA-HACK' } },
    { entity: 'task', id: T.t1Task?.id, path: 'tasks', name: T.t1Task?.title, patchBody: { title: 'QA-HACK' } },
    { entity: 'product', id: T.t1Product?.id, path: 'products', name: T.t1Product?.name, patchBody: { name: 'QA-HACK' } },
    { entity: 'invoice', id: T.t1Invoice?.id, path: 'invoices', name: T.t1Invoice?.number, patchBody: { notes: 'QA-HACK' } },
    { entity: 'customer', id: T.t1Customer?.id, path: 'customers', name: T.t1Customer?.name, patchBody: { name: 'QA-HACK' } },
  ]
  let allOk = true, detail = []
  for (const cs of cases) {
    if (!cs.id) { detail.push(`${cs.entity}: (DB'de kayıt yok — atlandı)`); continue }
    let rg = await req('GET', `${CRM}/api/${cs.path}/${cs.id}`, { headers: cookie(t2), label: `B1b GET t1 ${cs.entity} as t2` })
    if (rg.status === 0) { await new Promise((r) => setTimeout(r, 3000)); rg = await req('GET', `${CRM}/api/${cs.path}/${cs.id}`, { headers: cookie(t2), label: `B1b GET retry ${cs.entity}` }) }
    const rp = await req('PATCH', `${CRM}/api/${cs.path}/${cs.id}`, { headers: cookie(t2), body: cs.patchBody, label: `B1b PATCH t1 ${cs.entity} as t2` })
    const rd = await req('DELETE', `${CRM}/api/${cs.path}/${cs.id}`, { headers: cookie(t2), label: `B1b DELETE t1 ${cs.entity} as t2` })
    // 403/404 = guard reddi; 405 = uçta o metod yok (okuma imkânı bile yok — güvenli)
    const denied = [rg.status, rp.status, rd.status].every((s) => s === 403 || s === 404 || s === 405)
    if (!denied) allOk = false
    detail.push(`${cs.entity}: GET→${rg.status} PATCH→${rp.status} DELETE→${rd.status}${rg.status === 405 ? ' (GET uçta yok)' : ''}`)
  }
  // DB bütünlüğü
  const dbDeal = T.t1Deal ? await prisma.deal.findUnique({ where: { id: T.t1Deal.id }, select: { title: true } }) : null
  const dbTask = T.t1Task ? await prisma.task.findUnique({ where: { id: T.t1Task.id }, select: { title: true } }) : null
  const dbCust = T.t1Customer ? await prisma.customer.findUnique({ where: { id: T.t1Customer.id }, select: { name: true } }) : null
  const dbIntact = (!dbDeal || dbDeal.title === T.t1Deal.title) && (!dbTask || dbTask.title === T.t1Task.title) && (!dbCust || dbCust.name === T.t1Customer.name)
  allOk && dbIntact
    ? pass({ id: 'B1-B', name: 'Cross-tenant varlık erişimi (T2 admin → T1 deal/task/product/invoice/customer)', category: 'Çok Kiracılı İzolasyon', expectation: 'Tüm metodlar 403/404 + DB değişmemiş', actual: detail.join(' | ') + ' — DB bütünlüğü sağlam', severity: 'KRİTİK' })
    : (fail({ id: 'B1-B', name: 'Cross-tenant varlık erişimi (T2 admin → T1 varlıklar)', category: 'Çok Kiracılı İzolasyon', expectation: '403/404', actual: detail.join(' | ') + ` — DB bütünlük: ${dbIntact ? 'sağlam' : 'BOZULMUŞ'}`, severity: 'KRİTİK' }),
      finding('KRİTİK', 'B1-B', 'Tenant2 admin, Tenant1 varlıklarına ID ile erişebildi (IDOR)', detail.join(' | '), 'İlgili [id]/route.ts dosyalarında tenantId guard eksik.'))
  // silinmişse kurtar
  if (T.t1Deal && !(await prisma.deal.findUnique({ where: { id: T.t1Deal.id } }))) {
    console.log(colorize('  [ops] T1 deal silinmiş — geri yükleniyor', C.red))
  }

  // B2 — T1 admin → T2 kullanıcısı
  const u = T.t2User
  const up = await req('PATCH', `${CRM}/api/users/${u.id}`, { headers: cookie(t1), body: { name: 'QA-HACK' }, label: 'B2 PATCH t2 user as t1' })
  const ud = await req('DELETE', `${CRM}/api/users/${u.id}`, { headers: cookie(t1), label: 'B2 DELETE t2 user as t1' })
  const dbUser = await prisma.user.findUnique({ where: { id: u.id }, select: { name: true, email: true } })
  const uDenied = [up.status, ud.status].every((s) => s === 403 || s === 404)
  uDenied && dbUser && dbUser.name === u.name
    ? pass({ id: 'B2', name: 'Cross-tenant kullanıcı düzenleme/silme reddediliyor', category: 'Çok Kiracılı İzolasyon', expectation: 'PATCH/DELETE → 403/404', actual: `PATCH→${up.status}, DELETE→${ud.status}; kullanıcı sağlam (${dbUser.email})`, severity: 'KRİTİK' })
    : (fail({ id: 'B2', name: 'Cross-tenant kullanıcı düzenleme/silme', category: 'Çok Kiracılı İzolasyon', expectation: '403/404', actual: `PATCH→${up.status}, DELETE→${ud.status}; DB: ${dbUser ? dbUser.name : 'SİLİNMİŞ'}`, severity: 'KRİTİK' }),
      finding('KRİTİK', 'B2', 'Tenant1 admin, Tenant2 kullanıcısını değiştirdi/sildi', `PATCH ${up.status} / DELETE ${ud.status}`, 'users/[id]/route.ts tenantId guard.'))
  if (!dbUser) { // kurtar
    console.log(colorize('  [ops] T2 kullanıcı silinmiş — TEKRAR SEED GEREKLİ', C.red))
  }

  // B3 — superadmin kapsamı (platform geneli BY DESIGN + kendi oturumu sağlam)
  const saList = await req('GET', `${CRM}/api/admin/tenants`, { headers: cookie(sa), label: 'B3 superadmin tenants' })
  const saGet = await req('GET', `${CRM}/api/customers/${c.id}`, { headers: cookie(sa), label: 'B3 superadmin GET t2 cust' })
  const saDash = await req('GET', `${CRM}/api/dashboard`, { headers: cookie(sa), label: 'B3 superadmin dashboard' })
  const b3ok = saList.status === 200 && saGet.status === 200 && saDash.status === 200
  const tenantCount = Array.isArray(saList.json?.items) ? saList.json.items.length : Array.isArray(saList.json) ? saList.json.length : null
  b3ok
    ? pass({ id: 'B3', name: 'Superadmin platform kapsamı çalışıyor (tasarım gereği cross-tenant okuma)', category: 'Çok Kiracılı İzolasyon', expectation: 'admin/tenants 200 + cross-tenant müşteri okuma 200 + dashboard 200', actual: `tenants→${saList.status}${tenantCount ? ` (${tenantCount} tenant)` : ''}, T2 müşteri→${saGet.status}, dashboard→${saDash.status}` })
    : warn({ id: 'B3', name: 'Superadmin platform kapsamı', category: 'Çok Kiracılı İzolasyon', expectation: '200', actual: `tenants→${saList.status}, T2 müşteri→${saGet.status}, dashboard→${saDash.status}`, severity: 'ORTA' })

  // B4 — randevu sahiplenme / provider eşleşmesi
  if (QUICK) {
    skip({ id: 'B4', name: 'Randevu-provider sahiplenme (geçici T2 işletme)', category: 'Çok Kiracılı İzolasyon', expectation: '403', actual: 'quick modda atlandı' })
  } else {
    // Geçici T2 provider + hizmet oluştur (temizlik sonda)
    const slug = `qa-sec-t2-${Date.now().toString(36)}`
    const prov = await prisma.serviceProvider.create({
      data: {
        tenantId: T.t2.id, name: 'QA Sec Test İşletme', slug,
        type: 'berber', phone: '+905550000000',
        workingHours: JSON.stringify({ mon: { start: '09:00', end: '18:00' }, tue: { start: '09:00', end: '18:00' }, wed: { start: '09:00', end: '18:00' }, thu: { start: '09:00', end: '18:00' }, fri: { start: '09:00', end: '18:00' }, sat: { start: '09:00', end: '18:00' }, sun: { start: '09:00', end: '18:00' } }),
        autoApprove: true, isActive: true,
      },
    })
    const svc = await prisma.service.create({ data: { providerId: prov.id, name: 'QA Güvenlik Hizmeti', duration: 30, price: 100 } })
    state.tempProvider = { id: prov.id, slug, serviceId: svc.id }

    // B4a — başka tenant'ın işletmesine misafir randevu ALMAK tasarım gereği serbest
    const bk = await req('POST', `${CRM}/api/public/appointments`, {
      body: { providerSlug: slug, serviceId: svc.id, date: futureDate(5), time: '10:00', customerName: 'QA-SEC B4 Misafir', customerPhone: '905550000098' },
      label: 'B4a guest booking on t2 provider', headers: { 'x-forwarded-for': '10.77.0.4' },
    })
    if (bk.status === 200 && bk.json?.id) {
      state.testAppointmentIds.push(bk.json.id)
      pass({ id: 'B4-A', name: "Misafir randevusu providerSlug ile her tenant'a alınabilir (müşteri sitesi tasarımı)", category: 'Çok Kiracılı İzolasyon', expectation: '200 (tasarım gereği NORMAL)', actual: `${bk.status} — randevu ${apptCode(bk.json.id)} oluşturuldu (temizlikte silinecek)` })
    } else {
      warn({ id: 'B4-A', name: 'Misafir randevusu cross-provider', category: 'Çok Kiracılı İzolasyon', expectation: '200 (tasarım)', actual: `${bk.status} ${bk.json?.error ?? ''}`, severity: 'DÜŞÜK' })
    }

    // B4b — T1 randevusunun kodunu T2 işletmesine review ile bağlama → RED
    const ap = T.pastApptNoReview
    if (ap) {
      const rv = await req('POST', `${CRM}/api/public/reviews`, {
        body: { providerSlug: slug, rating: 5, comment: 'QA-SEC sahiplenme denemesi', appointmentCode: apptCode(ap.id) },
        headers: { 'x-forwarded-for': '10.77.0.5' }, label: 'B4b review wrong provider',
      })
      const dbReview = await prisma.review.findFirst({ where: { appointmentId: ap.id } })
      rv.status === 403 && !dbReview
        ? pass({ id: 'B4-B', name: 'Randevu-provider sahiplenme: T1 randevusu T2 işletmesine bağlanamıyor', category: 'Çok Kiracılı İzolasyon', expectation: '403 + review oluşmamalı', actual: `${rv.status} "${rv.json?.error}" — DB\'de review yok`, severity: 'KRİTİK' })
        : (fail({ id: 'B4-B', name: 'Randevu-provider sahiplenme', category: 'Çok Kiracılı İzolasyon', expectation: '403', actual: `${rv.status}; DB review: ${dbReview ? 'OLUŞTU (SIZMA!)' : 'yok'}`, severity: 'KRİTİK' }),
          finding('KRİTİK', 'B4-B', 'Başka işletmenin randevusuyla review oluşturulabildi (provider eşleşmesi atlandı)', `${rv.status}`, 'public/reviews route providerId === appointment.providerId kontrolü.'))
    } else {
      skip({ id: 'B4-B', name: 'Randevu-provider sahiplenme', category: 'Çok Kiracılı İzolasyon', expectation: '403', actual: 'uygun geçmiş randevu bulunamadı' })
    }

    // B4c — var olmayan işletme slug'ı
    const rv404 = await req('POST', `${CRM}/api/public/reviews`, {
      body: { providerSlug: 'qa-sec-yok-boyle-bir-isletme', rating: 5, appointmentCode: 'AAAAAAAA' },
      headers: { 'x-forwarded-for': '10.77.0.6' }, label: 'B4c review nonexistent provider',
    })
    rv404.status === 404
      ? pass({ id: 'B4-C', name: 'Var olmayan işletme slug\'ı 404', category: 'Çok Kiracılı İzolasyon', expectation: '404', actual: `${rv404.status}` })
      : warn({ id: 'B4-C', name: 'Var olmayan işletme slug\'ı', category: 'Çok Kiracılı İzolasyon', expectation: '404', actual: `${rv404.status}`, severity: 'DÜŞÜK' })
  }
}

// ─── C. ROL/İZİN (RBAC) ──────────────────────────────────────
async function sectionC() {
  console.log(`\n${C.bold}${C.cyan}═══ C. ROL/İZİN (RBAC) ═══${C.reset}`)
  const depo = state.sessions.depo, rep = state.sessions.rep, komi = state.sessions.komi

  // C1 — depo_sorumlusu → reports.view YOK (worklog kuralı)
  const r1 = await req('GET', `${CRM}/api/reports`, { headers: cookie(depo), label: 'C1 depo reports' })
  const r2 = await req('GET', `${CRM}/api/reports/summary`, { headers: cookie(depo), label: 'C1 depo reports/summary' })
  const c1ok = [r1.status, r2.status].every((s) => s === 403)
  c1ok
    ? pass({ id: 'C1', name: 'Depo rolü reports.view izni olmadan rapor uçlarına erişemiyor', category: 'Rol/İzin', expectation: '403 (depo_sorumlusu: reports.view yok)', actual: `/api/reports→${r1.status}, /api/reports/summary→${r2.status}` })
    : fail({ id: 'C1', name: 'Depo rolü rapor uçlarına erişiyor', category: 'Rol/İzin', expectation: '403', actual: `reports→${r1.status}, summary→${r2.status}`, severity: 'YÜKSEK' })
  if (!c1ok) finding('YÜKSEK', 'C1', 'depo_sorumlusu rolü reports.view iznine sahip olmadan rapor API\'sine erişebildi', `${r1.status}/${r2.status}`, 'rbac.ts ROLE_PERMISSIONS.depo_sorumlusu — reports.view kaldırılmalı (kasa/kasiyer kalabilir).')

  // C2 — rep → admin uçları
  const adminEps = ['/api/admin/tenants', '/api/admin/overview', '/api/admin/services', '/api/admin/members', '/api/admin/reviews', '/api/admin/users']
  const c2res = []
  let c2ok = true
  for (const ep of adminEps) {
    const r = await req('GET', `${CRM}${ep}`, { headers: cookie(rep), label: `C2 rep ${ep}` })
    c2res.push(`${ep.replace('/api/admin', '')}→${r.status}`)
    if (r.status !== 403 && r.status !== 401) c2ok = false
  }
  const ar = await req('POST', `${CRM}/api/admin/assign-role`, { headers: cookie(rep), body: { userId: 'x', role: 'admin' }, label: 'C2 rep assign-role' })
  c2res.push(`assign-role→${ar.status}`)
  if (ar.status !== 403 && ar.status !== 401 && ar.status !== 400) c2ok = false
  c2ok
    ? pass({ id: 'C2', name: 'rep rolü admin uçlarına erişemiyor (admin.access yalnız superadmin)', category: 'Rol/İzin', expectation: 'Tüm admin uçları 403/401', actual: c2res.join(' | ') })
    : fail({ id: 'C2', name: 'rep rolü bazı admin uçlarına erişebiliyor', category: 'Rol/İzin', expectation: '403', actual: c2res.join(' | '), severity: 'YÜKSEK' })
  if (!c2ok) finding('YÜKSEK', 'C2', 'rep rolü admin uçlarından bazılarına erişti', c2res.join(' | '), 'admin uçlarında admin.access/users.manage requirePermission guard\'u.')

  // C3 — yetkisiz view API'leri rolle çağrılınca 403 (NOT: rep'in hr.view'i VAR — listede değil)
  const c3cases = [
    { who: 'depo(T1)', tok: state.sessions.depot1, ep: '/api/customers', perm: 'customers.view.*', sev: 'ORTA', note: "route bilinçli olarak depo_sorumlusu'ya tüm tenant müşterilerini açıyor (irsaliye/sipariş gerekçesi — kod yorumu)" },
    { who: 'komi', tok: komi, ep: '/api/reports', perm: 'reports.view', sev: 'ORTA', note: '' },
    { who: 'komi', tok: komi, ep: '/api/customers', perm: 'customers.view.*', sev: 'DÜŞÜK', note: 'own-scope fallback — boş liste dönmesi beklenir' },
    { who: 'rep', tok: rep, ep: '/api/expenses', perm: 'expenses.view', sev: 'YÜKSEK', note: 'finansal veri' },
    { who: 'rep', tok: rep, ep: '/api/orders', perm: 'orders.view', sev: 'ORTA', note: '' },
  ]
  const c3res = []
  let c3hardFail = false, c3softWarn = false
  for (const cs of c3cases) {
    if (!cs.tok) { c3res.push(`${cs.who}${cs.ep}: (oturum yok — atlandı)`); continue }
    const r = await req('GET', `${CRM}${cs.ep}`, { headers: cookie(cs.tok), label: `C3 ${cs.who} ${cs.ep}` })
    if (r.status === 403 || r.status === 401) {
      c3res.push(`${cs.who} ${cs.ep}→${r.status} ✓`)
    } else if (r.status === 200) {
      const items = r.json?.items ?? (Array.isArray(r.json) ? r.json : null)
      const n = Array.isArray(items) ? items.length : '?'
      if (n === 0) {
        c3res.push(`${cs.who} ${cs.ep}→200 (boş liste)`)
        c3softWarn = true
        finding('DÜŞÜK', 'C3', `${cs.ep} yalnız requireAuth kontrolü yapıyor — ${cs.who} rolünün izni (${cs.perm}) yok ama own-scope fallback boş liste döndürüyor`, '200, items: 0', "Route'a requirePermission eklenmeli (defense-in-depth).")
      } else {
        c3res.push(`${cs.who} ${cs.ep}→200 (${n} kayıt SIZIYOR)`)
        c3hardFail = true
        finding(cs.sev, 'C3', `${cs.ep} requirePermission eksik — ${cs.who} rolü (${cs.perm} izni YOK) ${n} kayıt okuyabildi${cs.note ? ' — NOT: ' + cs.note : ''}`, `200, ${n} kayıt`, `Route'a requirePermission('${cs.perm}') eklenmeli.`)
      }
    } else {
      c3res.push(`${cs.who} ${cs.ep}→${r.status}`)
    }
  }
  if (!c3hardFail) {
    if (c3softWarn) {
      warn({ id: 'C3', name: "Yetkisiz modül API'leri: veri sızmadı ama izin kontrolü eksik uçlar var", category: 'Rol/İzin', expectation: '403', actual: c3res.join(' | '), severity: 'DÜŞÜK' })
    } else {
      pass({ id: 'C3', name: "Yetkisiz modül API'leri rolle çağrılınca 403", category: 'Rol/İzin', expectation: '403', actual: c3res.join(' | ') })
    }
  } else {
    fail({ id: 'C3', name: "Yetkisiz modül API'lerine rol dışı erişimde veri sızdı", category: 'Rol/İzin', expectation: '403', actual: c3res.join(' | '), severity: 'YÜKSEK' })
  }
}

// ─── D. PUBLIC API SUİSTİMALİ ────────────────────────────────
async function sectionD(T) {
  console.log(`\n${C.bold}${C.cyan}═══ D. PUBLIC API SUİSTİMALİ (3000 + 3002 proxy) ═══${C.reset}`)
  const svcId = T.service.id
  const provSlug = T.provider.slug || 'sik-kuafor'
  // Her koşuya özgü rate-limit kovası (tekrar koşularda 15 dk'lık pencere çakışmasın)
  const RUN_OCTET = Math.floor(Math.random() * 200) + 10
  const XFF = (n) => ({ 'x-forwarded-for': `10.${RUN_OCTET}.${n}.1` })

  // D1a — geçmiş tarih (3000 + 3002)
  const past1 = await req('POST', `${CRM}/api/public/appointments`, {
    body: { providerSlug: provSlug, serviceId: svcId, date: pastDate(2), time: '11:00', customerName: 'QA-SEC D1', customerPhone: '905550000001' },
    headers: XFF(1), label: 'D1a past date',
  })
  const past2 = await req('POST', `${SITE}/api/book`, {
    body: { providerSlug: provSlug, serviceId: svcId, date: pastDate(2), time: '11:00', customerName: 'QA-SEC D1', customerPhone: '905550000001' },
    label: 'D1a past date via 3002',
  })
  const d1aOk = past1.status === 400 && (past2.status === 400 || past2.json?.success === false)
  d1aOk
    ? pass({ id: 'D1-A', name: 'Geçmiş tarihli randevu reddediliyor (3000 + 3002)', category: 'Public API', expectation: '400', actual: `3000→${past1.status} "${past1.json?.error}"; 3002→${past2.status}` })
    : fail({ id: 'D1-A', name: 'Geçmiş tarihli randevu reddediliyor', category: 'Public API', expectation: '400', actual: `3000→${past1.status}; 3002→${past2.status}`, severity: 'ORTA' })

  // D1b — eksik alan / bozuk format
  const badPayloads = [
    ['eksik serviceId', { providerSlug: provSlug, date: futureDate(3), time: '11:00', customerName: 'QA-SEC', customerPhone: '905550000002' }],
    ['bozuk tarih', { providerSlug: provSlug, serviceId: svcId, date: '31.12.2026', time: '11:00', customerName: 'QA-SEC', customerPhone: '905550000002' }],
    ['bozuk saat', { providerSlug: provSlug, serviceId: svcId, date: futureDate(3), time: '1100', customerName: 'QA-SEC', customerPhone: '905550000002' }],
    ['boş ad', { providerSlug: provSlug, serviceId: svcId, date: futureDate(3), time: '11:00', customerName: '   ', customerPhone: '905550000002' }],
    ['boş telefon', { providerSlug: provSlug, serviceId: svcId, date: futureDate(3), time: '11:00', customerName: 'QA-SEC', customerPhone: '' }],
    ['honeypot dolu', { providerSlug: provSlug, serviceId: svcId, date: futureDate(3), time: '11:00', customerName: 'QA-SEC', customerPhone: '905550000002', website: 'http://bot.example' }],
    ['geçersiz serviceId', { providerSlug: provSlug, serviceId: 'olmayan-service', date: futureDate(3), time: '11:00', customerName: 'QA-SEC', customerPhone: '905550000002' }],
  ]
  const d1b = []
  let d1bOk = true
  for (const [lbl, body] of badPayloads) {
    const r = await req('POST', `${CRM}/api/public/appointments`, { body, headers: XFF(2), label: `D1b ${lbl}` })
    d1b.push(`${lbl}→${r.status}`)
    if (r.status !== 400) d1bOk = false
    if (r.json?.id) state.testAppointmentIds.push(r.json.id)
  }
  d1bOk
    ? pass({ id: 'D1-B', name: 'Eksik/bozuk alanlar 400 dönüyor (7 vaka)', category: 'Public API', expectation: '400', actual: d1b.join(' | ') })
    : warn({ id: 'D1-B', name: 'Bazı geçersiz payload\'lar kabul edildi', category: 'Public API', expectation: '400', actual: d1b.join(' | '), severity: 'ORTA' })
  if (!d1bOk) finding('ORTA', 'D1-B', 'Randevu API\'si bazı geçersiz payload\'ları kabul ediyor', d1b.join(' | '), 'public/appointments route girdi validasyonu sıkılaştırılmalı.')

  if (!QUICK) {
    // D1c — 10KB isim (uzunluk sınırı yok mu?)
    const big = 'A'.repeat(10 * 1024)
    const r10k = await req('POST', `${CRM}/api/public/appointments`, {
      body: { providerSlug: provSlug, serviceId: svcId, date: futureDate(4), time: '10:00', customerName: big, customerPhone: '905550000003' },
      headers: XFF(3), label: 'D1c 10KB name',
    })
    if (r10k.json?.id) state.testAppointmentIds.push(r10k.json.id)
    if (r10k.status === 400) {
      pass({ id: 'D1-C', name: 'Devasa (10KB) girdi reddediliyor', category: 'Public API', expectation: '400', actual: `${r10k.status}` })
    } else {
      const dbRow = r10k.json?.id ? await prisma.appointment.findUnique({ where: { id: r10k.json.id }, select: { customerName: true } }) : null
      warn({ id: 'D1-C', name: 'Devasa (10KB) girdi KABUL edildi — uzunluk sınırı yok', category: 'Public API', expectation: '400 (uzunluk sınırı)', actual: `${r10k.status}; DB'de ${dbRow ? dbRow.customerName.length + ' karakter saklandı' : '?'}`, severity: 'ORTA' })
      finding('ORTA', 'D1-C', 'Public randevu API\'sinde customerName/customerNote için uzunluk sınırı yok — 10KB+ veri DB\'ye yazılıyor (DoS/abuse vektörü)', `${r10k.status}, DB'de 10240 karakter`, 'customerName max ~120, customerNote max ~2000 karakter sınırı eklenmeli.')
    }

    // D1d — geçersiz saat "25:99" (JS Date taşması)
    const rT = await req('POST', `${CRM}/api/public/appointments`, {
      body: { providerSlug: provSlug, serviceId: svcId, date: futureDate(4), time: '25:99', customerName: 'QA-SEC D1d', customerPhone: '905550000004' },
      headers: XFF(4), label: 'D1d time 25:99',
    })
    if (rT.json?.id) state.testAppointmentIds.push(rT.json.id)
    if (rT.status === 400) {
      pass({ id: 'D1-D', name: 'Geçersiz saat değeri (25:99) reddediliyor', category: 'Public API', expectation: '400', actual: `${rT.status}` })
    } else {
      warn({ id: 'D1-D', name: 'Saat "25:99" kabul edildi (JS Date taşması — ertesi güne kayıyor)', category: 'Public API', expectation: '400', actual: `${rT.status} ${rT.json?.date ? rT.json.date + ' ' + rT.json.time : ''}`, severity: 'DÜŞÜK' })
      finding('DÜŞÜK', 'D1-D', 'Randevu saati aralık kontrolü yok: "25:99" girilince Date bir sonraki güne taşıyor', `${rT.status}`, 'time için 00:00-23:59 aralık kontrolü eklenmeli.')
    }

    // D1e — geçersiz takım tarihi "2026-13-45"
    const rD = await req('POST', `${CRM}/api/public/appointments`, {
      body: { providerSlug: provSlug, serviceId: svcId, date: '2026-13-45', time: '11:00', customerName: 'QA-SEC D1e', customerPhone: '905550000005' },
      headers: XFF(5), label: 'D1e date 2026-13-45',
    })
    if (rD.json?.id) state.testAppointmentIds.push(rD.json.id)
    if (rD.status === 400) {
      pass({ id: 'D1-E', name: 'Geçersiz takvim tarihi (2026-13-45) reddediliyor', category: 'Public API', expectation: '400', actual: `${rD.status}` })
    } else {
      warn({ id: 'D1-E', name: 'Tarih "2026-13-45" kabul edildi (ay/gün normalleşmesi — 2027\'ye taşıyor)', category: 'Public API', expectation: '400', actual: `${rD.status} ${rD.json?.date || ''}`, severity: 'DÜŞÜK' })
      finding('DÜŞÜK', 'D1-E', 'Randevu tarihi takvim geçerliliği kontrol edilmiyor: "2026-13-45" normalize edilip kabul ediliyor', `${rD.status}`, 'YYYY-MM-DD parse sonrası bileşen eşleşmesi doğrulanmalı.')
    }

    // D1f — XSS payload (saklama + API yanıtı; render ayrı test konusu)
    const xss = '<img src=x onerror=alert(1)><script>alert(2)</script>'
    const rX = await req('POST', `${CRM}/api/public/appointments`, {
      body: { providerSlug: provSlug, serviceId: svcId, date: futureDate(4), time: '12:00', customerName: xss, customerPhone: '905550000006' },
      headers: XFF(6), label: 'D1f XSS payload',
    })
    if (rX.json?.id) state.testAppointmentIds.push(rX.json.id)
    const dbX = rX.json?.id ? await prisma.appointment.findUnique({ where: { id: rX.json.id }, select: { customerName: true } }) : null
    const storedRaw = dbX && dbX.customerName.includes('<script>')
    // API yanıtı JSON olduğu için içerik escape'siz döner ama Content-Type application/json → tarayıcıda çalışmaz
    warn({
      id: 'D1-F', name: 'XSS payload\'ı ham saklanıyor (stored-XSS adayı — render katmanı escape ediyor olmalı)', category: 'Public API',
      expectation: 'Kabul edilirse DB\'de HAM saklanması beklenir; render tarafında escape ZORUNLU',
      actual: `${rX.status}; DB ham mı: ${storedRaw ? 'EVET (ham)' : 'hayır'}`, severity: 'DÜŞÜK',
    })
    finding('DÜŞÜK', 'D1-F', 'customerName alanında HTML/JS payload ham olarak saklanıyor (stored-XSS yüzeyi). customer-page views.ts esc() ile render ettiği sürece risk sınırlı; ama savunma katmanlı olmalı', `DB: ${dbX ? jstr(dbX.customerName).slice(0, 80) : '?'}`, "Girdi anında sanitize (ör. <>& escape) veya render katmanında escape'in test paketine eklenmesi önerilir.")
  }

  // D2 — çift rezervasyon (slot kilidi)
  const bkDate = futureDate(6)
  const avail = await req('GET', `${CRM}/api/public/providers/${provSlug}/availability?date=${bkDate}&serviceId=${svcId}`, { label: 'D2 availability' })
  const slot = (avail.json?.slots || []).find((s) => s.available)?.time || '10:00'
  const staffId = T.staffService?.staffId || 'any'
  const b1 = await req('POST', `${CRM}/api/public/appointments`, {
    body: { providerSlug: provSlug, serviceId: svcId, staffId, date: bkDate, time: slot, customerName: 'QA-SEC D2 #1', customerPhone: '905550000007' },
    headers: XFF(7), label: 'D2 booking 1',
  })
  if (b1.json?.id) state.testAppointmentIds.push(b1.json.id)
  const b2 = await req('POST', `${CRM}/api/public/appointments`, {
    body: { providerSlug: provSlug, serviceId: svcId, staffId, date: bkDate, time: slot, customerName: 'QA-SEC D2 #2', customerPhone: '905550000008' },
    headers: XFF(8), label: 'D2 booking 2 (same slot)',
  })
  if (b2.json?.id) state.testAppointmentIds.push(b2.json.id)
  if (b1.status === 200 && b2.status === 409) {
    pass({ id: 'D2', name: 'Aynı slota çift rezervasyon 409 (slot kilidi)', category: 'Public API', expectation: '1. istek 200, 2. istek 409', actual: `slot ${bkDate} ${slot}: #1→${b1.status}, #2→${b2.status} "${b2.json?.error}"` })
  } else if (b1.status === 409) {
    warn({ id: 'D2', name: 'Çift rezervasyon testi — ilk istek bile 409 aldı', category: 'Public API', expectation: '#1 200, #2 409', actual: `#1→${b1.status} "${b1.json?.error}" (slot zaten dolu olabilir)`, severity: 'DÜŞÜK' })
  } else {
    const cnt = await prisma.appointment.count({ where: { providerId: T.provider.id, date: { gte: new Date(bkDate) } } })
    fail({ id: 'D2', name: 'Çift rezervasyon engellenmiyor', category: 'Public API', expectation: '#2 → 409', actual: `#1→${b1.status}, #2→${b2.status}`, severity: 'YÜKSEK' })
    finding('YÜKSEK', 'D2', 'Aynı personel+slot için ikinci randevu kabul edildi (çift rezervasyon)', `#1 ${b1.status} / #2 ${b2.status} (slot ${bkDate} ${slot}, staff ${staffId})`, 'public/appointments route çakışma kontrolü (rangesOverlap) personel/slot bazlı çalışmalı.')
  }

  // D3 — review validasyonu
  const ap = T.pastApptNoReview
  const rvBase = { providerSlug: provSlug }
  const r0 = await req('POST', `${CRM}/api/public/reviews`, { body: { ...rvBase, rating: 0, comment: 'x' }, headers: XFF(10), label: 'D3 rating 0' })
  const r6 = await req('POST', `${CRM}/api/public/reviews`, { body: { ...rvBase, rating: 6, comment: 'x' }, headers: XFF(11), label: 'D3 rating 6' })
  const rS = await req('POST', `${CRM}/api/public/reviews`, { body: { ...rvBase, rating: '5 yıldız' }, headers: XFF(12), label: 'D3 rating string' })
  const d3a = [r0.status, r6.status, rS.status].every((s) => s === 400)
  d3a
    ? pass({ id: 'D3-A', name: 'Review puan validasyonu (0 / 6 / "5 yıldız" → 400)', category: 'Public API', expectation: '400', actual: `0→${r0.status}, 6→${r6.status}, "5 yıldız"→${rS.status}` })
    : fail({ id: 'D3-A', name: 'Review puan validasyonu', category: 'Public API', expectation: '400', actual: `0→${r0.status}, 6→${r6.status}, string→${rS.status}`, severity: 'ORTA' })

  // 3002 proxy üzerinden de puan validasyonu
  const rS2 = await req('POST', `${SITE}/api/reviews`, { body: { ...rvBase, rating: 99 }, label: 'D3 rating 99 via 3002' })
  rS2.status === 400 || rS2.json?.success === false
    ? pass({ id: 'D3-A2', name: 'Review puan validasyonu 3002 proxy\'de de çalışıyor', category: 'Public API', expectation: '400', actual: `${rS2.status}` })
    : warn({ id: 'D3-A2', name: '3002 proxy review validasyonu', category: 'Public API', expectation: '400', actual: `${rS2.status}`, severity: 'ORTA' })

  if (ap && !QUICK) {
    // D3b — 1200 karakter yorum (görev beklentisi 400; kod 1000'de kesiyor olabilir)
    const longComment = 'B'.repeat(1200)
    const rL = await req('POST', `${CRM}/api/public/reviews`, {
      body: { ...rvBase, rating: 4, comment: longComment, appointmentCode: apptCode(ap.id) },
      headers: XFF(13), label: 'D3b long comment',
    })
    if (rL.json?.id) state.testReviewIds.push(rL.json.id)
    if (rL.status === 400) {
      pass({ id: 'D3-B', name: '1000+ karakter yorum reddediliyor', category: 'Public API', expectation: '400', actual: `${rL.status}` })
    } else {
      const dbR = rL.json?.id ? await prisma.review.findUnique({ where: { id: rL.json.id }, select: { comment: true } }) : null
      warn({
        id: 'D3-B', name: '1200 karakterlik yorum KESİLEREK kabul edildi (400 yerine truncation)',
        category: 'Public API', expectation: '400 (task tanımı); uygulama 1000 karakterde kesiyor',
        actual: `${rL.status}; DB'de ${dbR?.comment?.length ?? '?'} karakter saklandı`, severity: 'DÜŞÜK',
      })
      finding('DÜŞÜK', 'D3-B', 'Review yorumu 1000 karakteri aşıyorsa reddedilmeyip sessizce kesiliyor — kullanıcı deneyimi/tutarlılık açısından 400 dönmesi daha doğru', `DB ${dbR?.comment?.length} karakter`, 'comment.length > 1000 → err(400) önerilir (şu an slice).')
    }
    // D3c — aynı randevuya 2. review → 409 (ilk review oluşturulduysa doğrudan; reddedildiyse geçerli bir tane oluştur)
    if (!rL.json?.id) {
      const rvOk = await req('POST', `${CRM}/api/public/reviews`, {
        body: { ...rvBase, rating: 4, comment: 'QA-SEC geçerli yorum (2. deneme testi için)', appointmentCode: apptCode(ap.id) },
        headers: XFF(16), label: 'D3c setup valid review',
      })
      if (rvOk.json?.id) state.testReviewIds.push(rvOk.json.id)
    }
    const rAgain = await req('POST', `${CRM}/api/public/reviews`, {
      body: { ...rvBase, rating: 5, comment: 'QA-SEC ikinci deneme', appointmentCode: apptCode(ap.id) },
      headers: XFF(14), label: 'D3c duplicate review',
    })
    rAgain.status === 409
      ? pass({ id: 'D3-C', name: 'Aynı randevuya ikinci değerlendirme 409', category: 'Public API', expectation: '409', actual: `${rAgain.status} "${rAgain.json?.error}"` })
      : (fail({ id: 'D3-C', name: 'Aynı randevuya ikinci değerlendirme engellenmiyor', category: 'Public API', expectation: '409', actual: `${rAgain.status}`, severity: 'YÜKSEK' }),
        finding('YÜKSEK', 'D3-C', 'Tek randevuya birden fazla review yazılabiliyor (spam/oy manipülasyonu)', `${rAgain.status}`, 'Review.appointmentId unique + route içinde findFirst kontrolü.'))
    // kod bulunamadı → 404
    const rN = await req('POST', `${CRM}/api/public/reviews`, { body: { ...rvBase, rating: 5, appointmentCode: 'ZZZZZZZZ' }, headers: XFF(15), label: 'D3 nonexistent code' })
    rN.status === 404
      ? pass({ id: 'D3-D', name: 'Var olmayan randevu kodu 404', category: 'Public API', expectation: '404', actual: `${rN.status}` })
      : warn({ id: 'D3-D', name: 'Var olmayan randevu kodu', category: 'Public API', expectation: '404', actual: `${rN.status}`, severity: 'DÜŞÜK' })
  }

  // D4 — üyelik güvenliği
  const badPhones = [['boş', ''], ['harf', 'abc'], ['5 hane', '54321'], ['3 hane', '123']]
  const d4a = []
  let d4aOk = true
  for (const [lbl, ph] of badPhones) {
    const r = await req('POST', `${CRM}/api/public/member/register`, {
      body: { name: 'QA SEC', phone: ph, password: '123456' }, headers: XFF(20), label: `D4a register ${lbl}`,
    })
    d4a.push(`${lbl}→${r.status}`)
    if (r.status !== 400) d4aOk = false
  }
  const rSite = await req('POST', `${SITE}/api/member/register`, { body: { name: 'QA', phone: 'abc', password: '123456' }, label: 'D4a register via 3002' })
  d4a.push(`3002-proxy→${rSite.status}`)
  if (rSite.status !== 400) d4aOk = false
  d4aOk
    ? pass({ id: 'D4-A', name: 'Üye kaydı geçersiz telefonları reddediyor ("", "abc", kısa)', category: 'Public API', expectation: '400', actual: d4a.join(' | ') })
    : warn({ id: 'D4-A', name: 'Bazı geçersiz telefonlar kabul edildi', category: 'Public API', expectation: '400', actual: d4a.join(' | '), severity: 'ORTA' })

  // D4b — üye login brute force (10 max → 11. denemede 429 beklenir)
  const BF_PHONE = randPhone('9055500')
  const N2 = QUICK ? 4 : 12
  let mf429 = null, mst = []
  for (let i = 1; i <= N2; i++) {
    const r = await req('POST', `${CRM}/api/public/member/login`, { body: { phone: BF_PHONE, password: `wrong-${i}` }, headers: XFF(21), label: `D4b member brute #${i}` })
    mst.push(r.status)
    if (r.status === 429 && mf429 === null) mf429 = i
  }
  if (mf429 !== null) {
    pass({ id: 'D4-B', name: 'Üye girişi brute-force koruması (telefon bazlı)', category: 'Public API', expectation: '429', actual: `${N2} deneme → ${mf429}. denemede 429 [${mst.join(',')}]` })
    state.rateLimitNotes.push(`Üye login kovası doldu: ${BF_PHONE} (15 dk)`)
  } else if (QUICK) {
    skip({ id: 'D4-B', name: 'Üye girişi brute-force koruması', category: 'Public API', expectation: '429', actual: 'quick modda atlandı' })
  } else {
    warn({ id: 'D4-B', name: 'Üye girişi brute-force koruması', category: 'Public API', expectation: '12 denemede 429', actual: `429 yok [${mst.join(',')}]`, severity: 'ORTA' })
    finding('ORTA', 'D4-B', 'Üye giriş ucunda 10 deneme/15dk rate limit devreye girmedi', mst.join(','), 'member-auth checkRateLimit login:${phone} kontrolü.')
  }

  // Test üyesi oluştur (sonraki testler için)
  const MPHONE = randPhone('9055501'), MPASS = 'qasec123'
  const reg = await req('POST', `${CRM}/api/public/member/register`, {
    body: { name: 'QA SEC Test Üye', phone: MPHONE, password: MPASS }, headers: XFF(22), label: 'D4 test member register',
  })
  if (reg.status === 200 && reg.json?.token) {
    state.testMember = { id: reg.json.member.id, phone: MPHONE, token: reg.json.token, password: MPASS }
    state.testPhones.push(MPHONE)
    // üyeye ait bir randevu da oluştur (memberId bağlama + review sahiplenme testi)
    const mb = await req('POST', `${CRM}/api/public/appointments`, {
      body: { providerSlug: provSlug, serviceId: svcId, date: futureDate(6), time: slot === '10:00' ? '11:00' : '10:00', customerName: 'QA-SEC Üye Randevusu', customerPhone: MPHONE, memberToken: state.testMember.token },
      headers: { ...XFF(23), authorization: `Bearer ${state.testMember.token}` }, label: 'D4 member booking',
    })
    if (mb.json?.id) state.testAppointmentIds.push(mb.json.id)
    pass({ id: 'D4-SETUP', name: 'Test üyesi + üye randevusu oluşturuldu (temizlik listesinde)', category: 'Public API', expectation: '200', actual: `üye ${reg.json.member.id.slice(-6)}, randevu ${mb.json?.id ? apptCode(mb.json.id) : '—'}` })
  } else {
    warn({ id: 'D4-SETUP', name: 'Test üyesi oluşturulamadı', category: 'Public API', expectation: '200', actual: `${reg.status} ${reg.json?.error ?? ''}`, severity: 'DÜŞÜK' })
  }

  // D4c — sahte token
  const fake = await req('GET', `${CRM}/api/public/member/me`, { headers: { authorization: 'Bearer abc.def.ghi' }, label: 'D4c fake token' })
  fake.status === 401
    ? pass({ id: 'D4-C', name: 'Sahte token ("abc.def.ghi") 401', category: 'Public API', expectation: '401', actual: `${fake.status} "${fake.json?.error}"` })
    : fail({ id: 'D4-C', name: 'Sahte token kabul edildi', category: 'Public API', expectation: '401', actual: `${fake.status}`, severity: 'YÜKSEK' })

  // D4d — süresi geçmiş token (gerçek secret ile imzalı, exp geçmiş)
  const expired = signMemberToken(state.testMember?.id || 'x', -3600_000)
  if (expired) {
    const rExp = await req('GET', `${CRM}/api/public/member/me`, { headers: { authorization: `Bearer ${expired}` }, label: 'D4d expired token' })
    rExp.status === 401
      ? pass({ id: 'D4-D', name: 'Süresi geçmiş (geçerli imzalı) token 401', category: 'Public API', expectation: '401', actual: `${rExp.status}` })
      : fail({ id: 'D4-D', name: 'Süresi geçmiş token kabul edildi', category: 'Public API', expectation: '401', actual: `${rExp.status}`, severity: 'YÜKSEK' })
  } else {
    skip({ id: 'D4-D', name: 'Süresi geçmiş token', category: 'Public API', expectation: '401', actual: 'secret okunamadı (db/.member-secret yok + env yok)' })
  }

  // D4e — imzası kurcalanmış token (1 karakter)
  if (state.testMember) {
    const parts = state.testMember.token.split('.')
    const sig = parts[2]
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    const tampered = [parts[0], parts[1], flipped].join('.')
    const rT = await req('GET', `${CRM}/api/public/member/me`, { headers: { authorization: `Bearer ${tampered}` }, label: 'D4e tampered token' })
    rT.status === 401
      ? pass({ id: 'D4-E', name: 'İmzası değiştirilmiş token 401 (HMAC tamper)', category: 'Public API', expectation: '401', actual: `${rT.status}` })
      : fail({ id: 'D4-E', name: 'Kurcalanmış imza kabul edildi', category: 'Public API', expectation: '401', actual: `${rT.status}`, severity: 'KRİTİK' })
    if (rT.status !== 401) finding('KRİTİK', 'D4-E', 'Üye token imzası değiştirilince hâlâ geçerli — HMAC doğrulaması atlanıyor', `${rT.status}`, 'member-auth verifyToken timingSafeEqual kontrolü.')
  }

  // D5 — register rate limit (aynı telefondan 6 istek)
  if (!QUICK) {
    const RP = randPhone('9055502')
    const st = []
    for (let i = 0; i < 6; i++) {
      const r = await req('POST', `${CRM}/api/public/member/register`, {
        body: { name: `QA SEC RL ${i}`, phone: RP, password: '123456' }, headers: XFF(24 + i), label: `D5 register #${i + 1}`,
      })
      st.push(r.status)
      if (i === 0 && r.status === 200) state.testPhones.push(RP)
    }
    const has429 = st.includes(429)
    has429
      ? pass({ id: 'D5', name: 'Üye kaydı rate limit (aynı telefon 5/15dk → 6. istek 429)', category: 'Public API', expectation: 'son isteklerde 429', actual: `[${st.join(',')}]` })
      : warn({ id: 'D5', name: 'Üye kaydı rate limit tetiklenmedi', category: 'Public API', expectation: '429', actual: `[${st.join(',')}]`, severity: 'ORTA' })
    state.rateLimitNotes.push(`Register kovası: ${RP} (15 dk)`)
  } else {
    skip({ id: 'D5', name: 'Üye kaydı rate limit', category: 'Public API', expectation: '429', actual: 'quick modda atlandı' })
  }

  // D6 — SQL injection (500 OLMAMALI)
  const sqli = ["' OR 1=1 --", "%27%20OR%20%271%27%3D%271", "'; DROP TABLE User;--", "1' AND SLEEP(5)='"]
  const sqliTargets = [
    { url: `${CRM}/api/search?q=`, auth: state.sessions.t1admin, name: 'search?q' },
    { url: `${CRM}/api/customers?search=`, auth: state.sessions.t1admin, name: 'customers?search' },
    { url: `${CRM}/api/leads?search=`, auth: state.sessions.t1admin, name: 'leads?search' },
    { url: `${CRM}/api/admin/members?q=`, auth: state.sessions.superadmin, name: 'admin/members?q' },
    { url: `${SITE}/api/businesses?q=`, auth: null, name: '3002 businesses?q' },
  ]
  const d6 = []
  let d6ok = true
  for (const t of sqliTargets) {
    for (const p of sqli) {
      const r = await req('GET', `${t.url}${encodeURIComponent(p)}`, { headers: t.auth ? cookie(t.auth) : {}, label: `D6 ${t.name} sqli`, timeoutMs: 25000 })
      d6.push(`${t.name}→${r.status}`)
      if (r.status >= 500) d6ok = false
      if (bodyHas(r, 'SQLITE_ERROR', 'PrismaClientKnownRequestError', 'syntax error', 'unterminated string')) d6ok = false
    }
  }
  d6ok
    ? pass({ id: 'D6', name: 'SQL injection payload\'ları 500/SQL hatası üretmiyor (Prisma parametrik)', category: 'Public API', expectation: '200/400 — 500 değil', actual: `${sqliTargets.length} uç × ${sqli.length} payload: en yüksek durum ${Math.max(...d6.map((s) => parseInt(s.split('→')[1])))}, hepsi <500` })
    : fail({ id: 'D6', name: 'SQL injection kaynaklı 500/SQL hatası', category: 'Public API', expectation: '500 yok', actual: d6.filter((s) => parseInt(s.split('→')[1]) >= 500).join(', '), severity: 'YÜKSEK' })

  // D7 — /api/seed (ESKİ KRİTİK SIZMA)
  const s1 = await req('POST', `${CRM}/api/seed`, { body: {}, label: 'D7 seed no secret' })
  const s2 = await req('POST', `${CRM}/api/seed`, { body: {}, headers: { 'x-seed-secret': 'yanlis-secret' }, label: 'D7 seed wrong secret' })
  const userCountAfter = await prisma.user.count()
  const seedSafe = (s1.status === 403 || s1.status === 401) && (s2.status === 403 || s2.status === 401) && userCountAfter === state.baseline.user
  seedSafe
    ? pass({ id: 'D7', name: '/api/seed DB doluyken secret\'sız RED (eski sızma kapatılmış)', category: 'Public API', expectation: '403 + veri sayısı değişmemiş', actual: `secret'suz→${s1.status}, yanlış secret→${s2.status}; kullanıcı sayısı ${userCountAfter} (baseline ${state.baseline.user})`, severity: 'KRİTİK' })
    : (fail({ id: 'D7', name: '/api/seed korumasız — DB yeniden seed edilebiliyor!', category: 'Public API', expectation: '403', actual: `secret'suz→${s1.status}, yanlış→${s2.status}; kullanıcı: ${userCountAfter} (baseline ${state.baseline.user})`, severity: 'KRİTİK' }),
      finding('KRİTİK', 'D7', '/api/seed kimliksiz/yanlış secret ile çalıştı — runSeed() tüm tabloları silip yeniden doldurabilir (eski sızmanın aynısı)', `no-secret ${s1.status} / wrong ${s2.status}`, 'DB doluyken x-seed-secret === SEED_SECRET zorunlu (route.ts mevcut guard\'un bypass edildiği yer bulunmalı).'))

  // D8 — /api/cron/* secret
  const c1 = await req('POST', `${CRM}/api/cron/reminders`, { body: {}, label: 'D8 cron no secret' })
  const c2 = await req('POST', `${CRM}/api/cron/reminders`, { body: {}, headers: { 'x-cron-secret': 'yanlis' }, label: 'D8 cron wrong secret' })
  const cronSafe = (c1.status === 403 || c1.status === 401) && (c2.status === 403 || c2.status === 401)
  cronSafe
    ? pass({ id: 'D8', name: '/api/cron/* yanlış/eksik secret 403', category: 'Public API', expectation: '403', actual: `secret'suz→${c1.status}, yanlış→${c2.status}`, severity: 'KRİTİK' })
    : (fail({ id: 'D8', name: '/api/cron/* korumasız', category: 'Public API', expectation: '403', actual: `secret'suz→${c1.status}, yanlış→${c2.status}`, severity: 'KRİTİK' }),
      finding('KRİTİK', 'D8', 'Cron ucu secret olmadan çalıştırılabiliyor (randevu işaretleme/yan etki)', `${c1.status}/${c2.status}`, 'x-cron-secret === CRON_SECRET guard\'u.'))
}

// ─── E. VERİ SIZMASI ─────────────────────────────────────────
async function sectionE(T) {
  console.log(`\n${C.bold}${C.cyan}═══ E. VERI SIZMASI ═══${C.reset}`)

  // E1 — passwordHash taraması
  const scanTargets = [
    { url: `${CRM}/api/users`, tok: state.sessions.superadmin, name: '/api/users (superadmin)' },
    { url: `${CRM}/api/users`, tok: state.sessions.t1admin, name: '/api/users (T1 admin)' },
    { url: `${CRM}/api/admin/users`, tok: state.sessions.superadmin, name: '/api/admin/users' },
    { url: `${CRM}/api/auth`, tok: state.sessions.t1admin, name: '/api/auth GET (session)' },
    { url: `${CRM}/api/admin/members`, tok: state.sessions.superadmin, name: '/api/admin/members' },
    { url: `${CRM}/api/admin/tenants`, tok: state.sessions.superadmin, name: '/api/admin/tenants' },
  ]
  const e1 = []
  let e1ok = true
  for (const t of scanTargets) {
    const r = await req('GET', t.url, { headers: cookie(t.tok), label: `E1 ${t.name}` })
    const leak = /passwordhash|"password"\s*:|password_hash|pwdhash/i.test(r.text)
    e1.push(`${t.name}→${r.status}${leak ? ' (PASSWORD SIZIYOR!)' : ''}`)
    if (leak) e1ok = false
  }
  e1ok
    ? pass({ id: 'E1', name: 'API yanıtlarında passwordHash/password alanı yok', category: 'Veri Sızması', expectation: 'Tarama temiz', actual: e1.join(' | ') })
    : fail({ id: 'E1', name: 'API yanıtı şifre hash\'i sızdırıyor', category: 'Veri Sızması', expectation: 'yok', actual: e1.join(' | '), severity: 'KRİTİK' })
  if (!e1ok) finding('KRİTİK', 'E1', 'Kullanıcı liste/detay yanıtlarında passwordHash alanı döndürülüyor', e1.join(' | '), 'select { passwordHash: false } / whitelist uygulanmalı.')

  // E2 — hata mesajlarında stack trace / dahili yol (tüm yakalanan gövdeler taranır)
  const stackPatterns = [
    [/node_modules[\\/][a-z@]/i, 'node_modules yolu'],
    [/\.next[\\/]server/i, '.next/server yolu'],
    [/\/home\/[a-z]+\//i, 'sunucu dosya yolu'],
    [/PrismaClient\w*Error/i, 'Prisma hata sınıfı'],
    [/at [\w$.]+ \(.*:\d+:\d+\)/, 'JS stack frame'],
    [/Digest\b.*\d{3}/i, 'Next.js digest'],
  ]
  const hits = []
  for (const cap of captured) {
    if (cap.status < 500 && cap.status !== 0) continue // yalnız 5xx/0 gövdeleri
    for (const [re, desc] of stackPatterns) {
      if (re.test(cap.body)) hits.push(`${cap.label} (${desc})`)
    }
  }
  const fives = captured.filter((c) => c.status >= 500).map((c) => `${c.label}→${c.status}`)
  hits.length === 0
    ? pass({ id: 'E2', name: '5xx yanıtlarında stack trace/dahili yol ifşası yok', category: 'Veri Sızması', expectation: '5xx gövdesi genel mesaj olmalı', actual: fives.length ? `5xx'ler: ${fives.join(', ')} — gövdelerde iz yok` : 'koşu boyunca 5xx oluşmadı' })
    : fail({ id: 'E2', name: 'Hata yanıtları iç detay ifşa ediyor', category: 'Veri Sızması', expectation: 'iz yok', actual: hits.join('; '), severity: 'ORTA' })
  if (hits.length) finding('ORTA', 'E2', '500 yanıtları stack trace/dahili yol sızdırıyor', hits.join('; '), 'Next.js production modu + global error handler genel mesaj döndürmeli.')

  // E3 — public providers hassas alan
  const pl = await req('GET', `${CRM}/api/public/providers`, { label: 'E3 providers list' })
  const pd = await req('GET', `${CRM}/api/public/providers/${T.provider.slug || 'sik-kuafor'}`, { label: 'E3 provider detail' })
  const sens = /tenantId|salary|maaş|passwordHash|internalNote|secret|notes/i
  const plLeak = sens.test(pl.text), pdLeak = sens.test(pd.text)
  !plLeak && !pdLeak
    ? pass({ id: 'E3', name: 'Public providers yanıtı hassas alan içermiyor (tenantId/maaş/iç not)', category: 'Veri Sızması', expectation: 'temiz', actual: `liste→${pl.status}, detay→${pd.status}; taranan desenler yok` })
    : fail({ id: 'E3', name: 'Public providers hassas alan sızdırıyor', category: 'Veri Sızması', expectation: 'temiz', actual: `liste leak: ${plLeak}, detay leak: ${pdLeak}`, severity: 'ORTA' })
  if (plLeak || pdLeak) finding('ORTA', 'E3', '/api/public/providers yanıtı hassas alan (tenantId/maaş/not) sızdırıyor', `${plLeak ? 'liste ' : ''}${pdLeak ? 'detay' : ''}`, 'Public select whitelist\'i genişletilmemeli.')

  // E4 — review PII
  const rv = await req('GET', `${CRM}/api/public/providers/${T.provider.slug || 'sik-kuafor'}/reviews?limit=50`, { label: 'E4 reviews PII' })
  const rvSite = await req('GET', `${SITE}/api/reviews/providers/${T.provider.slug || 'sik-kuafor'}`, { label: 'E4 reviews via 3002' })
  const pii = /memberId|"phone"|"email"|passwordHash/i
  const rvLeak = pii.test(rv.text), rvSiteLeak = pii.test(rvSite.text)
  const items = rv.json?.items
  const onlyAuthor = Array.isArray(items) && items.every((i) => Object.keys(i).every((k) => ['id', 'authorName', 'rating', 'comment', 'staffReply', 'repliedAt', 'createdAt'].includes(k)))
  !rvLeak && !rvSiteLeak && onlyAuthor
    ? pass({ id: 'E4', name: 'Review yanıtı memberId/telefon sızdırmıyor (yalnız authorName)', category: 'Veri Sızması', expectation: 'temiz', actual: `${items?.length ?? 0} yorum; alanlar: ${items?.[0] ? Object.keys(items[0]).join(',') : '—'}; 3002 proxy de temiz` })
    : fail({ id: 'E4', name: 'Review yanıtı üye PII\'ı sızdırıyor', category: 'Veri Sızması', expectation: 'temiz', actual: `3000 leak: ${rvLeak}, 3002 leak: ${rvSiteLeak}, whitelist: ${onlyAuthor}`, severity: 'YÜKSEK' })
  if (rvLeak || rvSiteLeak || !onlyAuthor) finding('YÜKSEK', 'E4', 'Onaylı yorum listesi memberId/telefon gibi üye PII\'ı sızdırıyor', `${rvLeak}/${rvSiteLeak}/${onlyAuthor}`, 'reviews GET select whitelist\'i.')
}

// ─── F. GÜVENLİ BAŞLIKLAR + DİĞER ────────────────────────────
async function sectionF() {
  console.log(`\n${C.bold}${C.cyan}═══ F. GÜVENLI BAŞLIKLAR + DIĞER ═══${C.reset}`)

  // F1 — cookie bayrakları
  const l = await login('demo@anadolu.com', '1234')
  const sc = l.setCookie || ''
  const httpOnly = /httponly/i.test(sc), sameSite = /samesite=/i.test(sc), secure = /secure/i.test(sc)
  if (l.ok) state.sessions.t1admin = l.token // taze tut
  httpOnly && sameSite
    ? pass({ id: 'F1', name: 'Set-Cookie HttpOnly + SameSite bayraklı', category: 'Güvenli Başlıklar', expectation: 'HttpOnly + SameSite', actual: `${httpOnly ? 'HttpOnly ✓' : 'HttpOnly ✗'} ${sameSite ? 'SameSite ✓ (' + (sc.match(/samesite=(\w+)/i)?.[1] || '?') + ')' : 'SameSite ✗'} ${secure ? 'Secure ✓' : 'Secure ✗ (dev http — prod\'da HTTPS ile eklenmeli)'}` })
    : fail({ id: 'F1', name: 'Cookie bayrakları eksik', category: 'Güvenli Başlıklar', expectation: 'HttpOnly+SameSite', actual: sc.slice(0, 160), severity: 'ORTA' })
  if (!secure) finding('DÜŞÜK', 'F1', 'gnc_session cookie\'sinde Secure bayrağı yok (dev http ortamı; prod HTTPS\'te zorunlu)', sc.slice(0, 120), 'Prod ortamda cookie set edilirken secure: true.')

  // F2 — CORS (evil origin)
  const pre = await req('OPTIONS', `${CRM}/api/auth`, {
    headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    label: 'F2 preflight evil origin',
  })
  const acao = pre.headers.get('access-control-allow-origin')
  const post = await req('POST', `${CRM}/api/auth`, {
    body: { email: 'demo@anadolu.com', password: '1234' },
    headers: { origin: 'https://evil.example' }, label: 'F2 POST evil origin',
  })
  const acao2 = post.headers.get('access-control-allow-origin')
  const reflected = acao === 'https://evil.example' || acao2 === 'https://evil.example' || acao === '*' || acao2 === '*'
  !reflected
    ? pass({ id: 'F2', name: 'CORS: başka origin yansıtılmıyor (same-origin API)', category: 'Güvenli Başlıklar', expectation: 'ACAO yok veya evil yansımaz', actual: `preflight ACAO: ${acao ?? 'yok'}; POST ACAO: ${acao2 ?? 'yok'} (Cookie SameSite=Lax ile birlikte CSRF yüzeyi dar)` })
    : fail({ id: 'F2', name: 'CORS: evil origin yansıtılıyor', category: 'Güvenli Başlıklar', expectation: 'yansıma yok', actual: `ACAO: ${acao} / ${acao2}`, severity: 'YÜKSEK' })

  // F3 — path traversal (raw path — fetch URL normalizasyonunu atlatmak için node:http)
  const traversalPaths = [
    '/api/attachments/../../etc/passwd',
    '/api/public/docs/invoice/..%2F..%2F..%2Fetc%2Fpasswd',
    '/api/export-docs/..%2f..%2f..%2fetc%2fpasswd?t=x&exp=y',
    '/api/attachments/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
  ]
  const tres = await Promise.all(traversalPaths.map((p) => rawPathRequest(p)))
  const leaky = tres.filter((t) => /root:[x*]?:0:0:/.test(t.body) || /\/bin\/(bash|sh)/.test(t.body))
  const statuses = tres.map((t, i) => `${traversalPaths[i].split('?')[0].slice(0, 40)}→${t.status}`)
  leaky.length === 0
    ? pass({ id: 'F3', name: 'Path traversal denemeleri dosya içeriği döndürmüyor', category: 'Güvenli Başlıklar', expectation: '400/404/405 — /etc/passwd içeriği YOK', actual: statuses.join(' | ') })
    : fail({ id: 'F3', name: 'Path traversal ile dosya okundu!', category: 'Güvenli Başlıklar', expectation: 'dosya içeriği yok', actual: `${leaky.length} istek dosya içeriği döndürdü`, severity: 'KRİTİK' })
  if (leaky.length) finding('KRİTİK', 'F3', 'Path traversal güvenlik açığı — sunucu dosyaları okunabiliyor', leaky.map((l) => l.status).join(','), 'Parametreler decode sonrası ../ içerik ve mutlak yol için reddedilmeli.')
}

// raw HTTP istekleri (fetch'in path normalizasyonunu atlatır)
import http from 'node:http'
function rawPathRequest(path) {
  return new Promise((resolve) => {
    const r = http.request({ host: 'localhost', port: 3000, path, method: 'GET', timeout: 15000 }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c; if (body.length > 100000) r.destroy() })
      res.on('end', () => resolve({ status: res.statusCode, body: body.slice(0, 500) }))
    })
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: '__TIMEOUT__' }) })
    r.on('error', () => resolve({ status: 0, body: '__ERR__' }))
    r.end()
  })
}

// ─── TEMİZLİK ────────────────────────────────────────────────
async function cleanup() {
  console.log(`\n${C.bold}${C.yellow}═══ TEMİZLİK (test verisi geri alma) ═══${C.reset}`)
  const notes = []
  try {
    // 0) IDOR kurbanlarını doğrula — guard kırılmışsa anlık görüntüden geri yükle
    for (const [k, snap] of Object.entries(state.snapshots)) {
      try {
        const still = await prisma[snap.model].findUnique({ where: { id: snap.row.id } })
        if (!still) {
          await prisma[snap.model].create({ data: snap.row })
          notes.push(`${k} GERİ YÜKLENDİ (IDOR silinmiş!)`)
        } else if (JSON.stringify(JSON.parse(JSON.stringify(still))) !== JSON.stringify(snap.row)) {
          await prisma[snap.model].update({ where: { id: snap.row.id }, data: snap.row })
          notes.push(`${k} GERİ DÖNDÜRÜLDÜ (IDOR değiştirmiş!)`)
        }
      } catch (e) { notes.push(`${k} kurtarma hatası: ${e.message}`) }
    }
    // 1) test randevuları (QA-SEC prefix + yakalanan id'ler)
    const byName = await prisma.appointment.deleteMany({ where: { customerName: { startsWith: 'QA-SEC' } } })
    const ids = state.testAppointmentIds.filter(Boolean)
    const byId = ids.length ? await prisma.appointment.deleteMany({ where: { id: { in: ids } } }) : { count: 0 }
    notes.push(`randevu: ${byName.count + byId.count} silindi`)

    // 2) test review'ları
    const byComment = await prisma.review.deleteMany({ where: { OR: [{ comment: { startsWith: 'QA-SEC' } }, { comment: 'B'.repeat(1200) }, { comment: 'B'.repeat(1000) }] } })
    const rvIds = state.testReviewIds.filter(Boolean)
    const rvById = rvIds.length ? await prisma.review.deleteMany({ where: { id: { in: rvIds } } }) : { count: 0 }
    notes.push(`review: ${byComment.count + rvById.count} silindi`)

    // 3) test üyeleri
    const phones = state.testPhones.filter(Boolean)
    const mem = phones.length ? await prisma.member.deleteMany({ where: { phone: { in: phones } } }) : { count: 0 }
    notes.push(`üye: ${mem.count} silindi`)

    // 4) geçici T2 provider (cascade: hizmet + randevu + review)
    if (state.tempProvider) {
      const pr = await prisma.serviceProvider.deleteMany({ where: { id: state.tempProvider.id } })
      notes.push(`geçici provider: ${pr.count} silindi`)
    }

    // 5) audit loglarında test artefaktları (public_booking entity id'leri)
    const entIds = [...ids, ...rvIds].filter(Boolean)
    if (entIds.length) {
      const al = await prisma.auditLog.deleteMany({ where: { entityId: { in: entIds } } })
      notes.push(`audit kaydı: ${al.count} silindi`)
    }

    // 6) oturumları kapat (test login'leri)
    const tokens = Object.values(state.sessions).filter(Boolean)
    if (tokens.length) {
      const ss = await prisma.session.deleteMany({ where: { token: { in: tokens } } })
      notes.push(`test oturumu: ${ss.count} kapatıldı`)
    }
  } catch (e) {
    notes.push(`HATA: ${e.message}`)
  }

  // sayım doğrulaması
  try {
    const [appt, member, review, provider, customer, user, deal, task, product, invoice] = await Promise.all([
      prisma.appointment.count(), prisma.member.count(), prisma.review.count(),
      prisma.serviceProvider.count(), prisma.customer.count(), prisma.user.count(),
      prisma.deal.count(), prisma.task.count(), prisma.product.count(), prisma.invoice.count(),
    ])
    const b = state.baseline
    const after = { appt, member, review, provider, customer, user, deal, task, product, invoice }
    const diffs = Object.keys(after).filter((k) => after[k] !== b[k])
      .map((k) => `${k}: ${b[k]}→${after[k]}`)
    console.log(`  ${notes.join(' · ')}`)
    if (diffs.length === 0) {
      console.log(colorize("  ✓ DB baseline'a geri döndü (tüm sayımlar eşit)", C.green))
    } else {
      console.log(colorize(`  ⚠ Sayım farkı: ${diffs.join(', ')}`, C.yellow))
    }
    if (state.rateLimitNotes.length) {
      console.log(colorize(`  ℹ Doldurulan rate-limit kovaları (15 dk içinde kendiliğinden sıfırlanır): ${state.rateLimitNotes.join('; ')}`, C.gray))
    }
  } catch (e) {
    console.log(`  sayım hatası: ${e.message}`)
  }
}

// ─── ÖZET ────────────────────────────────────────────────────
function summary() {
  const counts = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 }
  for (const r of results) counts[r.status]++
  console.log(`\n${C.bold}═══════════════ ÖZET ═══════════════${C.reset}`)
  console.log(`Toplam ${results.length} test: ${colorize(results.length - counts.FAIL - counts.WARN - counts.SKIP + ' PASS', C.green)} · ${colorize(counts.FAIL + ' FAIL', counts.FAIL ? C.red : C.gray)} · ${colorize(counts.WARN + ' WARN', counts.WARN ? C.yellow : C.gray)} · ${colorize(counts.SKIP + ' SKIP', C.gray)}`)

  // tablo
  console.log(`\n${C.bold}${'ID'.padEnd(9)}${'DURUM'.padEnd(8)}${'ÖNEM'.padEnd(8)}${'Kategori — Test'.padEnd(58)}Sonuç${C.reset}`)
  for (const r of results) {
    const st = r.status === 'PASS' ? colorize('PASS'.padEnd(8), C.green) : r.status === 'FAIL' ? colorize('FAIL'.padEnd(8), C.red) : r.status === 'WARN' ? colorize('WARN'.padEnd(8), C.yellow) : colorize('SKIP'.padEnd(8), C.gray)
    const sev = (r.severity || '—').padEnd(8)
    const line = `${(r.id).padEnd(9)}${st}${sev}${(r.category + ' — ' + r.name).slice(0, 56).padEnd(58)}${String(r.actual).slice(0, 90)}`
    console.log(line)
  }

  // bulgular
  const orphanFails = results.filter((r) => r.status === 'FAIL' && !findings.some((f) => f.test === r.id))
  for (const r of orphanFails) {
    findings.push({ severity: r.severity || 'ORTA', test: r.id, description: `${r.name} — beklenti karşılanmadı`, evidence: String(r.actualStr).slice(0, 200), fix: 'İlgili route kodu gözden geçirilmeli.' })
  }

  const order = { KRİTİK: 0, YÜKSEK: 1, ORTA: 2, DÜŞÜK: 3 }
  findings.sort((a, b) => order[a.severity] - order[b.severity])
  if (findings.length) {
    console.log(`\n${C.bold}${C.red}═══════════════ GÜVENLİK BULGULARI (${findings.length}) ═══════════════${C.reset}`)
    for (const f of findings) {
      const c = f.severity === 'KRİTİK' ? C.red : f.severity === 'YÜKSEK' ? C.yellow : f.severity === 'ORTA' ? C.cyan : C.gray
      console.log(`\n${colorize(`[${f.severity}]`, c)} ${C.bold}${f.test}${C.reset} — ${f.description}`)
      console.log(`  kanıt: ${String(f.evidence).slice(0, 240)}`)
      console.log(`  öneri: ${f.fix}`)
    }
  } else {
    console.log(colorize('\nBulgu yok — tüm güvenlik kontrolleri beklenen davranışı gösterdi.', C.green))
  }

  const criticalCount = findings.filter((f) => f.severity === 'KRİTİK').length
  const criticalFails = results.filter((r) => r.status === 'FAIL' && r.severity === 'KRİTİK').length
  const crit = criticalCount + criticalFails
  console.log(`\n${C.bold}KRİTİK bulgu: ${crit === 0 ? colorize('0 ✓', C.green) : colorize(crit + ' ✗', C.red)}${serverRestarted ? colorize(' · (ops: dev server koşu sırasında 1 kez restart edildi)', C.yellow) : ''}${C.reset}`)
  return crit === 0 ? 0 : 1
}

// ─── KOŞUŞ ───────────────────────────────────────────────────
(async () => {
  console.log(`${C.bold}${C.magenta}╔══════════════════════════════════════════════════════╗${C.reset}`)
  console.log(`${C.bold}${C.magenta}║  GNC CRM SÜPERAPP — GÜVENLİK / SIZMA TEST PAKETİ    ║${C.reset}`)
  console.log(`${C.bold}${C.magenta}╚══════════════════════════════════════════════════════╝${C.reset}`)
  console.log(`Mod: ${QUICK ? colorize('QUICK', C.yellow) : colorize('TAM', C.green)} · CRM: ${CRM} · Site: ${SITE} · Başlangıç: ${state.startTime.toISOString()}`)

  // servis ayakta mı?
  const alive = await req('GET', `${CRM}/api/auth`, { label: 'health /api/auth GET' })
  if (alive.status === 0) restartDevServer()
  const alive2 = await req('GET', `${SITE}/healthz`, { label: 'health 3002' })
  if (alive2.status === 0) restartSite()

  await captureBaseline()
  console.log(`DB baseline: ${jstr(state.baseline)}`)

  // oturumlar
  const logins = [
    ['superadmin', 'admin@gnccrm.app', '314159'],
    ['t1admin', 'demo@anadolu.com', '1234'],
    ['t2admin', 'demo@egeticaret.com', '1234'],
    ['depo', 'depo@anadolumarket.com', '1234'],
    ['depot1', 'depo@anadolu.com', '1234'],
    ['rep', 'zeynep.arslan@hotmail.com', '1234'],
    ['komi', 'komi@sikkafe.com', '1234'],
  ]
  for (const [key, email, pass] of logins) {
    const l = await login(email, pass)
    if (l.ok) state.sessions[key] = l.token
    else console.log(colorize(`  [setup] ${email} girişi başarısız (${l.status}) — ${key} testleri atlanabilir`, C.yellow))
  }
  console.log(`Oturumlar: ${Object.keys(state.sessions).join(', ')}`)

  const T = await loadTargets()
  console.log(`Hedefler: T1=${T.t1?.name} T2=${T.t2?.name}; T2 müşteri=${T.t2Customer?.name}; T2 kullanıcı=${T.t2User?.email}; provider=${T.provider?.slug}`)

  try {
    await sectionA()
    await sectionB(T)
    await sectionC()
    await sectionD(T)
    await sectionE(T)
    await sectionF()
  } catch (e) {
    console.log(colorize(`\n[Test akışı hatası] ${e.message}\n${e.stack?.split('\n').slice(0, 3).join('\n')}`, C.red))
    finding('ORTA', 'runner', `Test akışı beklenmedik hatayla kesildi: ${e.message}`, e.stack?.split('\n')[0], 'Paket sağlamlaştırılmalı — bkz. hata.')
  } finally {
    await cleanup().catch((e) => console.log(colorize(`  temizlik hatası: ${e.message}`, C.red)))
    await prisma.$disconnect().catch(() => {})
  }

  process.exitCode = summary()
})()
