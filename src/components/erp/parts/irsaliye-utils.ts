// ============================================================
// İrsaliye (Dispatch Note) — Sabitler & yardımcılar
// ============================================================

import {
  Truck, FileEdit, PackageCheck, CheckCircle2, XCircle, Hash,
  Box, Palette, Recycle, Layers,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ----- İrsaliye durumları -----
export interface IrsaliyeStatusMeta {
  value: string
  label: string
  color: string
  icon: LucideIcon
}

export const IRSALIYE_STATUSES: IrsaliyeStatusMeta[] = [
  {
    value: 'taslak',
    label: 'Taslak',
    color: 'text-slate-700 bg-slate-50 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300',
    icon: FileEdit,
  },
  {
    value: 'hazir',
    label: 'Hazır',
    color: 'text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300',
    icon: Box,
  },
  {
    value: 'sevk_edildi',
    label: 'Sevk Edildi',
    color: 'text-violet-700 bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300',
    icon: Truck,
  },
  {
    value: 'teslim_edildi',
    label: 'Teslim Edildi',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
    icon: PackageCheck,
  },
  {
    value: 'iptal',
    label: 'İptal',
    color: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/30 dark:text-red-300',
    icon: XCircle,
  },
]

export const FILTER_STATUSES: IrsaliyeStatusMeta[] = [
  {
    value: '__all__',
    label: 'Tümü',
    color: 'text-slate-700 bg-slate-100 border-slate-200',
    icon: Hash,
  },
  ...IRSALIYE_STATUSES,
]

export function getIrsaliyeStatusMeta(status: string): IrsaliyeStatusMeta {
  return IRSALIYE_STATUSES.find((s) => s.value === status) ?? IRSALIYE_STATUSES[0]
}

// ----- Kargo firmaları -----
export const CARRIERS: { value: string; label: string }[] = [
  { value: 'yurtici', label: 'Yurtiçi Kargo' },
  { value: 'aras', label: 'Aras Kargo' },
  { value: 'mng', label: 'MNG Kargo' },
  { value: 'ptt', label: 'PTT Kargo' },
  { value: 'ups', label: 'UPS' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'dhl', label: 'DHL' },
  { value: 'other', label: 'Diğer' },
]

export function getCarrierLabel(value?: string | null): string {
  if (!value) return '—'
  return CARRIERS.find((c) => c.value === value)?.label ?? value
}

// ----- Palet tipleri -----
export const PALLET_TYPES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'tahta', label: 'Tahta Palet', icon: Layers },
  { value: 'plastik', label: 'Plastik Palet', icon: Recycle },
  { value: 'tek_kullanilik', label: 'Tek Kullanırlık', icon: Box },
  { value: 'eur_pallet', label: 'EUR Palet (80×120)', icon: Layers },
  { value: 'other', label: 'Diğer', icon: Palette },
]

export function getPalletTypeLabel(value?: string | null): string {
  if (!value) return '—'
  return PALLET_TYPES.find((p) => p.value === value)?.label ?? value
}

// ----- Ağırlık formatlama -----
export function formatKg(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)} kg`
}
