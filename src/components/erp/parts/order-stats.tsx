'use client'

import { Package, ClipboardCheck, Factory, Truck, CheckCircle2, Coins } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { StatCard } from './stat-card'

export interface OrderStatsData {
  total: number
  preparing: number
  inProduction: number
  shipped: number
  delivered: number
  totalValue: number
}

interface OrderStatsProps {
  stats: OrderStatsData
  defaultCurrency: string
}

export function OrderStats({ stats, defaultCurrency }: OrderStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      <StatCard
        label="Toplam Sipariş"
        value={stats.total}
        icon={Package}
        color="bg-gradient-to-br from-slate-500 to-slate-600"
        sub="tüm siparişler"
      />
      <StatCard
        label="Hazırlanıyor"
        value={stats.preparing}
        icon={ClipboardCheck}
        color="bg-gradient-to-br from-amber-500 to-orange-600"
        sub="bekleyen"
      />
      <StatCard
        label="Üretimde"
        value={stats.inProduction}
        icon={Factory}
        color="bg-gradient-to-br from-orange-500 to-red-600"
        sub="üretim aşaması"
      />
      <StatCard
        label="Sevk Edildi"
        value={stats.shipped}
        icon={Truck}
        color="bg-gradient-to-br from-violet-500 to-fuchsia-600"
        sub="yolda"
      />
      <StatCard
        label="Teslim Edildi"
        value={stats.delivered}
        icon={CheckCircle2}
        color="bg-gradient-to-br from-emerald-500 to-teal-600"
        sub="tamamlandı"
      />
      <StatCard
        label="Toplam Değer"
        value={formatCurrency(stats.totalValue, defaultCurrency)}
        icon={Coins}
        color="bg-gradient-to-br from-teal-500 to-cyan-600"
        sub="tüm siparişler"
      />
    </div>
  )
}
