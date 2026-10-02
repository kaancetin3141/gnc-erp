'use client'

import { FileText, Clock, CheckCircle2, Coins } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { StatCard } from './stat-card'

export interface QuoteStatsData {
  total: number
  pending: number
  approved: number
  totalValue: number
}

interface QuoteStatsProps {
  stats: QuoteStatsData
  defaultCurrency: string
}

export function QuoteStats({ stats, defaultCurrency }: QuoteStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        label="Toplam Teklif"
        value={stats.total}
        icon={FileText}
        color="bg-gradient-to-br from-slate-500 to-slate-600"
        sub="Tüm teklifler"
      />
      <StatCard
        label="Bekleyen"
        value={stats.pending}
        icon={Clock}
        color="bg-gradient-to-br from-amber-500 to-orange-600"
        sub="taslak & gönderildi"
      />
      <StatCard
        label="Onaylanan"
        value={stats.approved}
        icon={CheckCircle2}
        color="bg-gradient-to-br from-emerald-500 to-teal-600"
        sub="onaylandı"
      />
      <StatCard
        label="Toplam Değer"
        value={formatCurrency(stats.totalValue, defaultCurrency)}
        icon={Coins}
        color="bg-gradient-to-br from-violet-500 to-fuchsia-600"
        sub="tüm teklif toplamı"
      />
    </div>
  )
}
