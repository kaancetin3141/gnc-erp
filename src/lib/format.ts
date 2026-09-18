// Formatlama yardımcıları — tarih, para birimi, telefon (E.164)

import { CURRENCIES, CURRENCY_RATES } from './constants'

// Tarih: DD.MM.YYYY
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

// Tarih + saat: DD.MM.YYYY HH:mm (24h)
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${formatDate(d)} ${hours}:${mins}`
}

// Saat: HH:mm
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${mins}`
}

// Göreceli zaman: "3 gün önce", "2 saat önce", "az önce"
export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'az önce'
  if (minutes < 60) return `${minutes} dakika önce`
  if (hours < 24) return `${hours} saat önce`
  if (days < 30) return `${days} gün önce`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} ay önce`
  return `${Math.floor(months / 12)} yıl önce`
}

// X gün önce (sayısal)
export function daysSince(date: string | Date | null | undefined): number | null {
  if (!date) return null
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return null
  const diff = Date.now() - d.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// Para birimi formatla
export function formatCurrency(amount: number | null | undefined, currency = 'TRY'): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '—'
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? '₺'
  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
  return `${formatted} ${symbol}`
}

// Para birimi dönüştür ve formatla
export function convertAndFormat(amount: number, fromCurrency: string, toCurrency: string = 'TRY'): string {
  const rate = CURRENCY_RATES[fromCurrency] ?? 1
  const targetRate = CURRENCY_RATES[toCurrency] ?? 1
  const converted = (amount / rate) * targetRate
  return formatCurrency(converted, toCurrency)
}

// Telefonu E.164'e normalize et (+90...)
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  let cleaned = phone.replace(/[\s\-()]/g, '')
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2)
  if (cleaned.startsWith('0') && !cleaned.startsWith('+')) cleaned = '+9' + cleaned.slice(1)
  if (!cleaned.startsWith('+')) cleaned = '+90' + cleaned
  // Basit validasyon
  if (!/^\+\d{10,15}$/.test(cleaned)) return null
  return cleaned
}

// Telefonu görüntüleme formatına çevir: +90 532 123 45 67
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const normalized = normalizePhone(phone)
  if (!normalized) return phone
  // +90 532 123 45 67
  const match = normalized.match(/^\+(\d{2})(\d{3})(\d{3})(\d{2})(\d{2})$/)
  if (match) {
    return `+${match[1]} ${match[2]} ${match[3]} ${match[4]} ${match[5]}`
  }
  return normalized
}

// WhatsApp linki
export function whatsappLink(phone: string | null | undefined, text?: string): string {
  const normalized = normalizePhone(phone)
  if (!normalized) return '#'
  const digits = normalized.replace('+', '')
  const msg = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${digits}${msg}`
}

// Tel linki
export function telLink(phone: string | null | undefined): string {
  const normalized = normalizePhone(phone)
  if (!normalized) return '#'
  return `tel:${normalized}`
}

// Baş harfler
export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Sayı kısaltma: 1250 → "1.2B", 980000 → "980B"
export function formatCompactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n < 1000) return String(n)
  if (n < 1000000) return `${(n / 1000).toFixed(1).replace('.', ',')}B`
  return `${(n / 1000000).toFixed(1).replace('.', ',')}M`
}

// İletişim gün sayısına göre renk
export function getActivityStatusColor(days: number | null): { color: string; label: string; bg: string } {
  if (days === null) return { color: 'text-gray-500', label: 'İletişim yok', bg: 'bg-gray-100' }
  if (days <= 7) return { color: 'text-emerald-600', label: 'Son iletişim yeni', bg: 'bg-emerald-50' }
  if (days <= 30) return { color: 'text-amber-600', label: 'İletişim biraz eski', bg: 'bg-amber-50' }
  return { color: 'text-red-600', label: 'İletişim çok eski!', bg: 'bg-red-50' }
}

// ISO string → input[type=datetime-local] değeri
export function toLocalDateTimeInput(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16)
}

// input[type=date] değeri → ISO string
export function fromDateInput(value: string): string {
  if (!value) return ''
  return new Date(value + 'T00:00:00').toISOString()
}

// CSV üret
export function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (val: unknown) => {
    const s = val === null || val === undefined ? '' : String(val)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  // BOM for Excel UTF-8
  return '\uFEFF' + lines.join('\n')
}

// Dosya indirme tetikle
export function downloadFile(content: string, filename: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
