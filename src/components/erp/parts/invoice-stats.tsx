'use client'

import {
  Receipt, Clock, CheckCircle2, AlertTriangle, Coins, HandCoins,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { StatCard } from './stat-card'

export interface InvoiceStatsData {
  total: number
  pending: number
  paid: number
  overdue: number
  totalValue: number
  pendingAmount?: number
}

interface InvoiceStatsProps {
  stats: InvoiceStatsData
  defaultCurrency: string
}

export function InvoiceStats({ stats, defaultCurrency }: InvoiceStatsProps) {
  // Kompakt para formatı — mobilde de taşmadan sığar
  const fmtCompact = (v: number) =>
    v >= 1000000
      ? `${(v / 1000000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} M ₺`
      : `${Math.round(v).toLocaleString('tr-TR')} ₺`

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        label="Toplam Fatura"
        value={stats.total}
        icon={Receipt}
        color="bg-gradient-to-br from-slate-500 to-slate-600"
        sub="tüm faturalar"
      />
      <StatCard
        label="Ödeme Bekleyen"
        value={stats.pending}
        icon={Clock}
        color="bg-gradient-to-br from-amber-500 to-orange-600"
        sub="ödeme bekliyor"
      />
      <StatCard
        label="Ödenen"
        value={stats.paid}
        icon={CheckCircle2}
        color="bg-gradient-to-br from-emerald-500 to-teal-600"
        sub="tamamlandı"
      />
      <StatCard
        label="Geciken"
        value={stats.overdue}
        icon={AlertTriangle}
        color="bg-gradient-to-br from-red-500 to-rose-600"
        sub="gecikmiş"
      />
      <StatCard
        label="Bekleyen Tahsilat"
        value={stats.pendingAmount != null ? fmtCompact(stats.pendingAmount) : '—'}
        icon={HandCoins}
        color="bg-gradient-to-br from-fuchsia-500 to-pink-600"
        sub="TRY bazlı açık bakiye"
        compact
      />
      <StatCard
        label="Toplam Tutar"
        value={formatCurrency(stats.totalValue, defaultCurrency)}
        icon={Coins}
        color="bg-gradient-to-br from-violet-500 to-fuchsia-600"
        sub="tüm fatura toplamı"
        compact
      />
    </div>
  )
}
