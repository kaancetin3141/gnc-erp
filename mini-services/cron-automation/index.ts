// GNC CRM — Automation Cron Service
// Gece 02:00'de iletişimsiz müşteriler için otomatik görev oluşturur
// Port: 3010 (health check endpoint)

import cron from './vendor/node-cron/src/node-cron.js'
import { createServer } from 'http'

const PORT = 3010
const APP_URL = process.env.APP_URL || 'http://localhost:3000'

// Tüm tenant'ların automation ayarlarını oku ve çalışan tenant'lar için otomasyon tetikle
async function runAutomationForAllTenants() {
  try {
    console.log(`[${new Date().toISOString()}] Otomasyon cron başlatıldı...`)

    // Bu basit servis, doğrudan veritabanına erişemez (Prisma client ana app'te).
    // Bunun yerine, ana uygulamanın automation API'sine admin session ile istek atar.
    // Demo amaçlı: bilinen admin kullanıcı ID'si ile çağır.
    // Production'da: her tenant için bir API key / service account gerekir.

    // Admin user ID'yi environment'tan veya sabit değerden al
    const adminUserId = process.env.ADMIN_USER_ID || 'cmtupc2ga0003u9261ucf9oab'

    // Önce login ol (session al)
    const authRes = await fetch(`${APP_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: adminUserId }),
    })

    if (!authRes.ok) {
      console.error(`[${new Date().toISOString()}] Auth başarısız: ${authRes.status}`)
      return
    }

    const authData = await authRes.json()
    const session = authData.sessionId

    // Automation durumunu kontrol et
    const statusRes = await fetch(`${APP_URL}/api/automation`, {
      headers: { 'x-gnc-session': session },
    })
    const status = await statusRes.json()

    if (!status.enabled) {
      console.log(`[${new Date().toISOString()}] Otomasyon pasif, atlanıyor.`)
      return
    }

    console.log(`[${new Date().toISOString()}] Otomasyon aktif. Stale müşteri: ${status.staleCustomerCount}, threshold: ${status.thresholdDays} gün`)

    // Otomasyonu çalıştır
    const runRes = await fetch(`${APP_URL}/api/automation/stale-customer-tasks?days=${status.thresholdDays}`, {
      method: 'POST',
      headers: { 'x-gnc-session': session },
    })

    const result = await runRes.json()
    console.log(`[${new Date().toISOString()}] Otomasyon tamamlandı: ${result.created} görev oluşturuldu, ${result.skipped} atlandı (toplam ${result.scanned} müşteri tarandı)`)
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Otomasyon cron hatası:`, e)
  }
}

// Cron schedule: her gece 02:00
// Dakika Saat Gün Ay Haftaiçi
cron.schedule('0 2 * * *', () => {
  console.log(`\n[${new Date().toISOString()}] === Günlük otomasyon cron tetiklendi ===`)
  runAutomationForAllTenants()
})

// Health check HTTP server
const server = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      service: 'gnc-cron-automation',
      status: 'running',
      schedule: '0 2 * * * (her gece 02:00)',
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
  console.log(`[${new Date().toISOString()}] Schedule: her gece 02:00`)
  console.log(`[${new Date().toISOString()}] Health: http://localhost:${PORT}/health`)
  console.log(`[${new Date().toISOString()}] Manuel tetikleme: POST http://localhost:${PORT}/run-now`)
})

// Başlangıçta bir kez bilgi logla
console.log(`[${new Date().toISOString()}] Servis hazır. İlk otomasyon: bu gece 02:00`)
