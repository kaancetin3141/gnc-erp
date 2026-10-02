// ============================================================
// Fatura ERP — Sabitler & yardımcı fonksiyonlar
// ============================================================

import {
  Clock, CheckCircle2, AlertTriangle, Ban, Hash,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'

export interface InvoiceStatusMeta {
  value: string
  label: string
  color: string
  icon: LucideIcon
}

export const INVOICE_STATUSES: InvoiceStatusMeta[] = [
  { value: 'odeme_bekliyor', label: 'Ödeme Bekliyor', color: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300', icon: Clock },
  { value: 'odendi', label: 'Ödendi', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300', icon: CheckCircle2 },
  { value: 'gecikti', label: 'Gecikti', color: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/30 dark:text-red-300', icon: AlertTriangle },
  { value: 'iptal', label: 'İptal', color: 'text-slate-700 bg-slate-50 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300', icon: Ban },
]

export const FILTER_STATUSES: InvoiceStatusMeta[] = [
  { value: '__all__', label: 'Tümü', color: 'text-slate-700 bg-slate-100 border-slate-200', icon: Hash },
  ...INVOICE_STATUSES,
]

export function getInvoiceStatusMeta(status: string): InvoiceStatusMeta {
  return INVOICE_STATUSES.find((s) => s.value === status) ?? INVOICE_STATUSES[0]
}

// ----- TRY bazlı kur dönüşümü (CANLI KUR + akıllı fallback) -----
// Bekleyen tahsilat, yaşlandırma ve trend hesaplarında ortak kullanılır.
// Kurlar /api/fx üzerinden (open.er-api.com canlı veri) güncellenir;
// servis erişilemezse bilinen son değerler kullanılır.
export const FX_TO_TRY: Record<string, number> = { TRY: 1, USD: 42, EUR: 45, GBP: 52 }

export function setFxRates(rates: Record<string, number>): void {
  for (const [k, v] of Object.entries(rates)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) FX_TO_TRY[k] = v
  }
}

export function toTry(amount: number, currency: string): number {
  return amount * (FX_TO_TRY[currency] ?? 1)
}

// Kurları canlı servisten çeken mini hook — kur kullanan bileşenlerde
// bir kez çağrılır; veri gelince FX_TO_TRY güncellenir ve bileşen yeniden
// render olur (hesaplar canlı kurlarla döner).
export function useFxRates() {
  return useQuery({
    queryKey: ['fx-rates'],
    queryFn: () => apiGet<{ rates: Record<string, number>; source: string }>('/api/fx'),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  })
}

// Gecikme günü hesabı — vadesi geçmiş bekleyen faturalar için
export function overdueDays(dueDate?: string | null, now: number = Date.now()): number {
  if (!dueDate) return 0
  const t = new Date(dueDate).getTime()
  if (isNaN(t) || t >= now) return 0
  return Math.floor((now - t) / 86400000)
}

// ----- Ödeme hatırlatma mesajı (WhatsApp) -----
// Fatura listesindeki hızlı aksiyonla müşteriye gönderilir.
export function buildInvoiceWhatsAppMessage(input: {
  number: string
  customerName: string
  total: number
  currency: string
  dueDate?: string | null
  isOverdue?: boolean
}): string {
  const { number, customerName, total, currency, dueDate, isOverdue } = input
  const curSymbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '₺'
  const amountStr = `${total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curSymbol}`
  const fmt = (d?: string | null) => {
    if (!d) return null
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return null
    return dt.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  const dueStr = fmt(dueDate)

  if (isOverdue) {
    return [
      `Sayın ${customerName},`,
      '',
      `${number} numaralı ${amountStr} tutarındaki faturanızın vadesi${dueStr ? ` (${dueStr})` : ''} geçmiştir.`,
      'Ödemenizin en kısa sürede yapılması rica olunur.',
      '',
      'Ödeme yapıldıysa bu mesajı dikkate almayınız.',
      '',
      'Teşekkürler.',
    ].join('\n')
  }

  return [
    `Sayın ${customerName},`,
    '',
    `${number} numaralı faturanızın bilgisi:`,
    `• Tutar: ${amountStr}`,
    dueStr ? `• Vade Tarihi: ${dueStr}` : null,
    '',
    'Ödeme için çalışmaya başlayabilirsiniz. Sorularınız için bize ulaşabilirsiniz.',
    '',
    'Teşekkürler.',
  ].filter((l): l is string => l !== null).join('\n')
}

// ----- Form yardımcıları (InvoiceFormDialog için) -----
export interface InvoiceLineForm {
  key: string
  productId: string
  description: string
  qty: string
  unitPrice: string
  taxRate: string
  // Ağırlık (F4)
  weightPerUnit: string  // kg cinsinden (DB'de saklanan birim)
  weightUnit: string      // gr | kg | ton
  color: string
}

export interface InvoiceForm {
  customerId: string
  currency: string
  issueDate: string
  dueDate: string
  lines: InvoiceLineForm[]
}

export function emptyInvoiceLine(): InvoiceLineForm {
  return {
    key: Math.random().toString(36).slice(2),
    productId: '',
    description: '',
    qty: '1',
    unitPrice: '0',
    taxRate: '20',
    weightPerUnit: '',
    weightUnit: 'kg',
    color: '',
  }
}

export function emptyInvoiceForm(defaultCurrency: string): InvoiceForm {
  const today = new Date().toISOString().slice(0, 10)
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 30)
  return {
    customerId: '',
    currency: defaultCurrency,
    issueDate: today,
    dueDate: dueDate.toISOString().slice(0, 10),
    lines: [emptyInvoiceLine()],
  }
}

export function invoiceLineTotals(line: InvoiceLineForm) {
  const qty = parseFloat(line.qty) || 0
  const unitPrice = parseFloat(line.unitPrice) || 0
  const taxRate = parseFloat(line.taxRate) || 0
  const lineTotal = qty * unitPrice
  const lineTax = lineTotal * (taxRate / 100)
  // Kalem ağırlığı (kg)
  const weightPerUnitKg = parseFloat(line.weightPerUnit) || 0
  const totalWeight = weightPerUnitKg > 0 ? Math.round(qty * weightPerUnitKg * 1000) / 1000 : null
  return { qty, unitPrice, taxRate, lineTotal, lineTax, totalWeight, weightPerUnitKg }
}

export function invoiceFormTotals(form: InvoiceForm) {
  let subtotal = 0
  let taxTotal = 0
  let totalWeightKg = 0
  let hasWeight = false
  for (const l of form.lines) {
    const t = invoiceLineTotals(l)
    subtotal += t.lineTotal
    taxTotal += t.lineTax
    if (t.totalWeight != null && t.totalWeight > 0) {
      hasWeight = true
      totalWeightKg += t.totalWeight
    }
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    total: Math.round((subtotal + taxTotal) * 100) / 100,
    totalWeightKg: hasWeight ? Math.round(totalWeightKg * 1000) / 1000 : null,
  }
}
