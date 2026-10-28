// GNC CRM — Automation Cron Service
// Gece 02:00'de iletişimsiz müşteriler için otomatik görev oluşturur
// Port: 3010 (health check endpoint)

import cron from './vendor/node-cron/src/node-cron.js'
import { createServer } from 'http'

const PORT = 3010
const APP_URL = process.env.APP_URL || 'http://localhost:3000'
// Servis kimliği: /api/auth artık email+şifre (bcrypt) istiyor — eski {userId} gövdesi 400 dönerdi.
// Kimlik env'den gelir; sandbox default'u program admini (admin/314159).
const AUTOMATION_EMAIL = process.env.AUTOMATION_EMAIL || 'admin@gnccrm.app'
const AUTOMATION_PASSWORD = process.env.AUTOMATION_PASSWORD || '314159'

// ---- oturum: login → cache; 401'de bir kez re-login ----
let cachedSession: string | null = null

async function login(): Promise<string | null> {
  try {
    const authRes = await fetch(`${APP_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: AUTOMATION_EMAIL, password: AUTOMATION_PASSWORD }),
    })
    if (!authRes.ok) {
      console.error(`[${new Date().toISOString()}] Auth başarısız: ${authRes.status} (${AUTOMATION_EMAIL})`)
      cachedSession = null
      return null
    }
    const authData = (await authRes.json().catch(() => null)) as { sessionId?: string } | null
    const session = authData?.sessionId
    if (!session) {
      console.error(`[${new Date().toISOString()}] Auth yanıtı sessionId içermiyor`)
      cachedSession = null
      return null
    }
    cachedSession = session
    console.log(`[${new Date().toISOString()}] Auth başarılı (${AUTOMATION_EMAIL})`)
    return session
  } catch (e) {
    cachedSession = null
    console.error(`[${new Date().toISOString()}] Auth isteği hata verdi:`, e)
    return null
  }
}

async function getFreshSession(force = false): Promise<string | null> {
  if (force) cachedSession = null
  if (cachedSession) return cachedSession
  return login()
}

/** x-gnc-session başlığıyla istek atar; 401 gelirse BİR KEZ re-login + tekrar dener. */
async function authedFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const session = await getFreshSession()
  if (!session) throw new Error('Oturum alınamadı — kimlik bilgileri hatalı olabilir')
  const res = await fetch(`${APP_URL}${path}`, {
    ...init,
    headers: { 'x-gnc-session': session, ...(init.headers || {}) },
  })
  if (res.status === 401 && !retried) {
    console.warn(`[${new Date().toISOString()}] Oturum geçersiz (401) — yeniden login deneniyor`)
    await getFreshSession(true)
    return authedFetch(path, init, true)
  }
  return res
}

// Tüm tenant'ların automation ayarlarını oku ve çalışan tenant'lar için otomasyon tetikle
async function runAutomationForAllTenants() {
  try {
    console.log(`[${new Date().toISOString()}] Otomasyon cron başlatıldı...`)

    // Bu basit servis, doğrudan veritabanına erişemez (Prisma client ana app'te).
    // Bunun yerine, ana uygulamanın automation API'sine service kimliğiyle istek atar.
    // Önce login ol (email+şifre → session token), sonra tüm istekleri
    // x-gnc-session başlığıyla gönder (401'de otomatik re-login).

    // Automation durumunu kontrol et
    const statusRes = await authedFetch('/api/automation')
    const status = await statusRes.json()

    if (!status.enabled) {
      console.log(`[${new Date().toISOString()}] Otomasyon pasif, atlanıyor.`)
      return
    }

    console.log(`[${new Date().toISOString()}] Otomasyon aktif. Stale müşteri: ${status.staleCustomerCount}, threshold: ${status.thresholdDays} gün`)

    // Otomasyonu çalıştır
    const runRes = await authedFetch(`/api/automation/stale-customer-tasks?days=${status.thresholdDays}`, {
      method: 'POST',
    })

    const result = await runRes.json()
    console.log(`[${new Date().toISOString()}] Otomasyon tamamlandı: ${result.created} görev oluşturuldu, ${result.skipped} atlandı (toplam ${result.scanned} müşteri tarandı)`)

    // Üyelik bitiş hatırlatmaları (aktif paketler, 3 gün içinde bitenler)
    try {
      const memRes = await authedFetch('/api/automation/membership-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 3 }),
      })
      if (memRes.ok) {
        const mem = await memRes.json()
        console.log(`[${new Date().toISOString()}] Üyelik hatırlatma: ${rem(mem.reminded)} hatırlatıldı, ${rem(mem.emailed)} e-posta, ${rem(mem.tasksCreated)} görev`)
      } else {
        console.error(`[${new Date().toISOString()}] Üyelik hatırlatma başarısız: ${memRes.status}`)
      }
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Üyelik hatırlatma hatası:`, e)
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Otomasyon cron hatası:`, e)
  }
}

function rem(v: unknown): string {
  return typeof v === 'number' ? String(v) : '0'
}

// A-01 kuralı (kullanıcı onayı: tur8): süresi geçmiş beklemede randevuları otomatik iptal et
async function runExpireAppointments() {
  try {
    const res = await authedFetch('/api/automation/expire-appointments', { method: 'POST' })
    if (!res.ok) {
      console.error(`[${new Date().toISOString()}] Randevu süre aşımı başarısız: ${res.status}`)
      return
    }
    const data = (await res.json()) as { expiredCount?: number }
    if (data.expiredCount) {
      console.log(`[${new Date().toISOString()}] Randevu süre aşımı: ${data.expiredCount} beklemede randevu otomatik iptal edildi`)
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Randevu süre aşımı hatası:`, e)
  }
}

// Cron schedule: her gece 02:00
// Dakika Saat Gün Ay Haftaiçi
cron.schedule('0 2 * * *', () => {
  console.log(`\n[${new Date().toISOString()}] === Günlük otomasyon cron tetiklendi ===`)
  runAutomationForAllTenants()
})

// A-01: her 15 dakikada bir geçmiş tarihe düşen beklemede randevuları iptal et
cron.schedule('*/15 * * * *', () => {
  runExpireAppointments()
})

// Health check HTTP server
const server = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      service: 'gnc-cron-automation',
      status: 'running',
      schedule: '0 2 * * * (her gece 02:00) + */15 * * * * (randevu süre aşımı)',
      lastRun: lastRunTime,
      port: PORT,
    }))
  } else if (req.url === '/run-now' && req.method === 'POST') {
    console.log(`[${new Date().toISOString()}] Manuel tetikleme...`)
    runAutomationForAllTenants()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Otomasyon manuel olarak tetiklendi' }))
  } else {
    res.writeHead(404)
    res.end('Not found')
  }
})

let lastRunTime: string | null = null
const origRun = runAutomationForAllTenants
// Wrap to track lastRunTime
;(globalThis as { runAutomation?: () => void }).runAutomation = () => {
  lastRunTime = new Date().toISOString()
  origRun()
}

server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] GNC Cron Automation Service çalışıyor — port ${PORT}`)
  console.log(`[${new Date().toISOString()}] Schedule: her gece 02:00 + randevu süre aşımı (15 dk)`)
  console.log(`[${new Date().toISOString()}] Health: http://localhost:${PORT}/health`)
  console.log(`[${new Date().toISOString()}] Manuel tetikleme: POST http://localhost:${PORT}/run-now`)
})

// Başlangıçta bir kez bilgi logla
console.log(`[${new Date().toISOString()}] Servis hazır. İlk otomasyon: bu gece 02:00`)
