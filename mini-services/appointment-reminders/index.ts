// GNC CRM — Randevu Hatırlatma Cron Servisi
// Her 30 dakikada bir ana uygulamanın /api/cron/reminders endpoint'ini tetikler:
//  · Önümüzdeki 24 saatteki onaylı randevulara hatırlatma (WhatsApp linki üretimi + reminderSent)
//  · 2+ saattir onay bekleyen randevuları işletmeye bildirir (escalation)
// Port: 3011 (health check endpoint)

import cron from './vendor/node-cron/src/node-cron.js'
import { createServer } from 'http'

const PORT = 3011
const APP_URL = process.env.APP_URL || 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET || ''

let lastRunTime: string | null = null
let lastResult: Record<string, unknown> | null = null
let running = false

async function runReminderCron() {
  if (running) {
    console.log(`[${new Date().toISOString()}] Önceki çalışma hâlâ sürüyor, atlanıyor.`)
    return
  }
  running = true
  try {
    console.log(`[${new Date().toISOString()}] Randevu hatırlatma cron başlatıldı...`)

    const res = await fetch(`${APP_URL}/api/cron/reminders`, {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET },
    })

    if (res.status === 403) {
      console.error(`[${new Date().toISOString()}] Yetkisiz: CRON_SECRET eşleşmiyor. mini-services/appointment-reminders/.env dosyasını kontrol et.`)
      return
    }
    if (!res.ok) {
      console.error(`[${new Date().toISOString()}] API hatası: ${res.status}`)
      return
    }

    const data = await res.json()
    lastResult = data
    lastRunTime = new Date().toISOString()
    console.log(
      `[${lastRunTime}] Hatırlatma tamamlandı: ${data.reminderCount} hatırlatma işaretlendi, ` +
      `${data.stalePendingCount} onay bekleyen randevu tespit edildi.`,
    )
    for (const r of data.reminders ?? []) {
      console.log(`  🔔 ${r.appointmentNo} · ${r.customerName} · ${r.date} · WhatsApp linki üretildi`)
    }
    for (const s of data.stalePending ?? []) {
      console.log(`  ⏳ ${s.appointmentNo} · ${s.customerName} · onay bekliyor (since ${s.waitingSince})`)
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Randevu hatırlatma cron hatası:`, e)
  } finally {
    running = false
  }
}

// Her 30 dakikada bir
cron.schedule('*/30 * * * *', () => {
  console.log(`\n[${new Date().toISOString()}] === Randevu hatırlatma cron tetiklendi ===`)
  runReminderCron()
})

// Sağlık kontrolü HTTP sunucusu
const server = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      service: 'gnc-appointment-reminders',
      status: 'running',
      schedule: '*/30 * * * * (her 30 dakika)',
      lastRun: lastRunTime,
      lastResult: lastResult
        ? { reminderCount: lastResult.reminderCount, stalePendingCount: lastResult.stalePendingCount }
        : null,
    }))
  } else if (req.url === '/run-now' && req.method === 'POST') {
    // Manuel tetikleme (test / ilk kurulum)
    runReminderCron()
      .then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, lastRun: lastRunTime }))
      })
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  }
})

server.listen(PORT, () => {
  console.log(`GNC Appointment Reminders cron servisi çalışıyor — port ${PORT}`)
  console.log(`Hedef: ${APP_URL}/api/cron/reminders`)
  if (!CRON_SECRET) {
    console.warn('⚠️  CRON_SECRET boş! mini-services/appointment-reminders/.env dosyasına ana projedeki CRON_SECRET değerini ekle.')
  }
  // Başlangıçta bir kez çalıştır (bekleyen işleri hemen yakalar)
  setTimeout(runReminderCron, 5000)
})
