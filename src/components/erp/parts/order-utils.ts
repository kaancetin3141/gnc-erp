// ============================================================
// Siparişler (Orders) — Sabitler & yardımcı fonksiyonlar
// ============================================================

import {
  Package, ClipboardCheck, Factory, Truck, CheckCircle2,
  XCircle, Hash, PackageCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface OrderStatusMeta {
  value: string
  label: string
  color: string
  icon: LucideIcon
  description: string
}

export const ORDER_STATUSES: OrderStatusMeta[] = [
  {
    value: 'hazirlaniyor',
    label: 'Hazırlanıyor',
    color: 'text-slate-700 bg-slate-50 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300',
    icon: ClipboardCheck,
    description: 'Sipariş alındı, hazırlık aşamasında',
  },
  {
    value: 'onaylandi',
    label: 'Onaylandı',
    color: 'text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300',
    icon: CheckCircle2,
    description: 'Sipariş onaylandı, üretim/sevkiyat bekliyor',
  },
  {
    value: 'uretimde',
    label: 'Üretimde',
    color: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
    icon: Factory,
    description: 'Üretim/hazırlık sürüyor',
  },
  {
    value: 'sevk_yapildi',
    label: 'Sevk Edildi',
    color: 'text-violet-700 bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300',
    icon: Truck,
    description: 'Yola çıktı, teslimat bekleniyor',
  },
  {
    value: 'teslim_edildi',
    label: 'Teslim Edildi',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
    icon: PackageCheck,
    description: 'Müşteriye teslim edildi',
  },
  {
    value: 'iptal',
    label: 'İptal',
    color: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/30 dark:text-red-300',
    icon: XCircle,
    description: 'Sipariş iptal edildi',
  },
]

export const FILTER_STATUSES: OrderStatusMeta[] = [
  {
    value: '__all__',
    label: 'Tümü',
    color: 'text-slate-700 bg-slate-100 border-slate-200',
    icon: Hash,
    description: '',
  },
  ...ORDER_STATUSES,
]

export function getOrderStatusMeta(status: string): OrderStatusMeta {
  return ORDER_STATUSES.find((s) => s.value === status) ?? ORDER_STATUSES[0]
}

// Sipariş yaşam döngüsündeki bir sonraki mantıklı adımı öner
export function getNextStep(currentStatus: string): string | null {
  const order = ['hazirlaniyor', 'onaylandi', 'uretimde', 'sevk_yapildi', 'teslim_edildi']
  const idx = order.indexOf(currentStatus)
  if (idx === -1 || idx === order.length - 1) return null
  return order[idx + 1]
}

// Timeline için: adım hangi sırada "tamamlanmış" sayılır?
const STEP_ORDER = ['hazirlaniyor', 'onaylandi', 'uretimde', 'sevk_yapildi', 'teslim_edildi']

export function isStepCompleted(step: string, currentStatus: string): boolean {
  const stepIdx = STEP_ORDER.indexOf(step)
  const currIdx = STEP_ORDER.indexOf(currentStatus)
  if (stepIdx === -1 || currIdx === -1) return false
  return stepIdx <= currIdx
}

export function isStepCurrent(step: string, currentStatus: string): boolean {
  return step === currentStatus
}

// ----- Form yardımcıları -----
export interface OrderForm {
  customerId: string
  quoteId: string
  totalAmount: string
  currency: string
  expectedDelivery: string
  notes: string
  status: string
}

export function emptyOrderForm(defaultCurrency: string): OrderForm {
  const today = new Date()
  today.setDate(today.getDate() + 14)
  return {
    customerId: '',
    quoteId: '',
    totalAmount: '0',
    currency: defaultCurrency,
    expectedDelivery: today.toISOString().slice(0, 10),
    notes: '',
    status: 'hazirlaniyor',
  }
}

export const ORDER_PACKAGE_ICON = Package
