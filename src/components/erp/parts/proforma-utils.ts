// ============================================================
// Proforma — Sabitler & yardımcı fonksiyonlar
// Proforma = Quote tablosunda isProforma=true olan kayıtlar.
// Status değerleri Quote ile aynı (taslak | gonderildi | onaylandi | reddedildi | faturalandi)
// ============================================================

import {
  FileText, Send, CheckCircle2, XCircle, Receipt, Hash,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ProformaStatusMeta {
  value: string
  label: string
  color: string
  icon: LucideIcon
}

export const PROFORMA_STATUSES: ProformaStatusMeta[] = [
  { value: 'taslak', label: 'Taslak', color: 'text-slate-700 bg-slate-50 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300', icon: FileText },
  { value: 'gonderildi', label: 'Gönderildi', color: 'text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300', icon: Send },
  { value: 'onaylandi', label: 'Onaylandı', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300', icon: CheckCircle2 },
  { value: 'reddedildi', label: 'Reddedildi', color: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/30 dark:text-red-300', icon: XCircle },
  { value: 'faturalandi', label: 'Faturalandı', color: 'text-violet-700 bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300', icon: Receipt },
]

export const FILTER_STATUSES: ProformaStatusMeta[] = [
  { value: '__all__', label: 'Tümü', color: 'text-slate-700 bg-slate-100 border-slate-200', icon: Hash },
  ...PROFORMA_STATUSES,
]

export function getProformaStatusMeta(status: string): ProformaStatusMeta {
  return PROFORMA_STATUSES.find((s) => s.value === status) ?? PROFORMA_STATUSES[0]
}

// WhatsApp için özet mesaj oluştur — TEKLİF (isProforma=false) için
export function buildQuoteWhatsAppMessage(opts: {
  number: string
  customerName: string
  total: number
  currency: string
  validUntil?: string | null
}): string {
  const lines: string[] = []
  lines.push('Merhaba,')
  lines.push('')
  lines.push(`Size ${opts.number} numaralı teklifimizi iletiyoruz.`)
  lines.push('')
  lines.push(`📊 Teklif Özeti:`)
  lines.push(`• Müşteri: ${opts.customerName}`)
  lines.push(`• Genel Toplam: ${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(opts.total)} ${opts.currency}`)
  if (opts.validUntil) {
    const d = new Date(opts.validUntil)
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      lines.push(`• Teklif Geçerliliği: ${dd}.${mm}.${yyyy}`)
    }
  }
  lines.push('')
  lines.push('Teklifi onaylamak veya detaylı bilgi almak için bizimle iletişime geçebilirsiniz.')
  lines.push('')
  lines.push('İyi çalışmalar.')
  return lines.join('\n')
}

// WhatsApp için özet mesaj oluştur
export function buildProformaWhatsAppMessage(opts: {
  number: string
  customerName: string
  total: number
  currency: string
  validUntil?: string | null
}): string {
  const lines: string[] = []
  lines.push('Merhaba,')
  lines.push('')
  lines.push(`Size ${opts.number} numaralı proforma faturamızı iletiyoruz.`)
  lines.push('')
  lines.push(`📊 Özet:`)
  lines.push(`• Müşteri: ${opts.customerName}`)
  lines.push(`• Genel Toplam: ${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(opts.total)} ${opts.currency}`)
  if (opts.validUntil) {
    const d = new Date(opts.validUntil)
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      lines.push(`• Geçerlilik: ${dd}.${mm}.${yyyy}`)
    }
  }
  lines.push('')
  lines.push('Detaylar için bizimle iletişime geçebilirsiniz.')
  lines.push('')
  lines.push('İyi çalışmalar.')
  return lines.join('\n')
}

// Mail için konu + gövde
export function buildProformaMailSubject(number: string): string {
  return `Proforma Fatura - ${number}`
}

export function buildProformaMailBody(opts: {
  number: string
  customerName: string
  total: number
  currency: string
  validUntil?: string | null
}): string {
  return buildProformaWhatsAppMessage(opts)
}
