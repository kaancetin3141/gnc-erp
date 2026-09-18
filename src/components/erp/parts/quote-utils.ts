// ============================================================
// Teklif ERP — Sabitler & yardımcı fonksiyonlar
// ============================================================

import {
  FileText, Send, CheckCircle2, XCircle, Receipt, Hash,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface QuoteStatusMeta {
  value: string
  label: string
  color: string
  icon: LucideIcon
}

export const QUOTE_STATUSES: QuoteStatusMeta[] = [
  { value: 'taslak', label: 'Taslak', color: 'text-slate-700 bg-slate-50 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300', icon: FileText },
  { value: 'gonderildi', label: 'Gönderildi', color: 'text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300', icon: Send },
  { value: 'onaylandi', label: 'Onaylandı', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300', icon: CheckCircle2 },
  { value: 'reddedildi', label: 'Reddedildi', color: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/30 dark:text-red-300', icon: XCircle },
  { value: 'faturalandi', label: 'Faturalandı', color: 'text-violet-700 bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300', icon: Receipt },
]

export const FILTER_STATUSES: QuoteStatusMeta[] = [
  { value: '__all__', label: 'Tümü', color: 'text-slate-700 bg-slate-100 border-slate-200', icon: Hash },
  ...QUOTE_STATUSES,
]

export function getQuoteStatusMeta(status: string): QuoteStatusMeta {
  return QUOTE_STATUSES.find((s) => s.value === status) ?? QUOTE_STATUSES[0]
}

// ----- Form yardımcıları (QuoteFormDialog için) -----
export interface LineForm {
  key: string
  productId: string
  description: string
  qty: string
  unitPrice: string
  taxRate: string
  // Ağırlık (F4)
  weightPerUnit: string  // kg cinsinden (DB'de saklanan birim)
  weightUnit: string      // gr | kg | ton — görüntüleme birimi
  color: string           // renk varyantı (F5 entegrasyonu için)
}

export interface QuoteForm {
  customerId: string
  currency: string
  issueDate: string
  validUntil: string
  isProforma: boolean
  lines: LineForm[]
}

export function emptyLine(): LineForm {
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

export function emptyQuoteForm(defaultCurrency: string): QuoteForm {
  const today = new Date().toISOString().slice(0, 10)
  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + 30)
  return {
    customerId: '',
    currency: defaultCurrency,
    issueDate: today,
    validUntil: validUntil.toISOString().slice(0, 10),
    isProforma: false,
    lines: [emptyLine()],
  }
}

export function lineTotals(line: LineForm) {
  const qty = parseFloat(line.qty) || 0
  const unitPrice = parseFloat(line.unitPrice) || 0
  const taxRate = parseFloat(line.taxRate) || 0
  const lineTotal = qty * unitPrice
  const lineTax = lineTotal * (taxRate / 100)
  // Kalem ağırlığı (kg) — DB'de saklanan değer
  const weightPerUnitKg = parseFloat(line.weightPerUnit) || 0
  const totalWeight = weightPerUnitKg > 0 ? Math.round(qty * weightPerUnitKg * 1000) / 1000 : null
  return { qty, unitPrice, taxRate, lineTotal, lineTax, totalWeight, weightPerUnitKg }
}

export function quoteFormTotals(form: QuoteForm) {
  let subtotal = 0
  let taxTotal = 0
  let totalWeightKg = 0
  let hasWeight = false
  for (const l of form.lines) {
    const t = lineTotals(l)
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
