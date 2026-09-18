// ============================================================
// Ürün ERP — Sabitler & yardımcı fonksiyonlar
// ============================================================

import {
  TrendingUp, TrendingDown, Sliders, ArrowUpRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface MovementMeta {
  value: string
  label: string
  icon: LucideIcon
  color: string
  sign: string
}

export const MOVEMENT_TYPES: readonly MovementMeta[] = [
  {
    value: 'giris', label: 'Giriş', icon: TrendingUp,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
    sign: '+',
  },
  {
    value: 'cikis', label: 'Çıkış', icon: TrendingDown,
    color: 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300',
    sign: '-',
  },
  {
    value: 'duzeltme', label: 'Düzeltme', icon: Sliders,
    color: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
    sign: '=',
  },
  {
    value: 'transfer', label: 'Transfer', icon: ArrowUpRight,
    color: 'text-violet-700 bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300',
    sign: '-',
  },
] as const

export const REF_TYPES = [
  { value: 'manual', label: 'Manuel' },
  { value: 'quote', label: 'Teklif' },
  { value: 'invoice', label: 'Fatura' },
  { value: 'opening', label: 'Açılış' },
] as const

export function getMovementMeta(type: string): MovementMeta {
  return MOVEMENT_TYPES.find((m) => m.value === type) ?? MOVEMENT_TYPES[0]
}

export function getRefLabel(refType: string | null): string {
  if (!refType) return '—'
  return REF_TYPES.find((r) => r.value === refType)?.label ?? refType
}

export interface StockStatus {
  label: string
  color: string
  variant: 'out' | 'low' | 'ok'
}

// Ürün stok durumu hesapla
export function getStockStatus(p: { stock: number; minStock: number }): StockStatus {
  if (p.stock === 0) {
    return {
      label: 'Tükendi',
      color: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/30 dark:text-red-300',
      variant: 'out',
    }
  }
  if (p.stock <= p.minStock) {
    return {
      label: 'Düşük Stok',
      color: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
      variant: 'low',
    }
  }
  return {
    label: 'Stokta',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
    variant: 'ok',
  }
}
