'use client'

import { Package, AlertTriangle, Layers, Warehouse } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { StatCard } from './stat-card'

export interface ProductStatsData {
  total: number
  totalStockValue: number
  lowStockCount: number
  categoryCount: number
  outOfStock: number
}

interface ProductStatsProps {
  stats: ProductStatsData
  defaultCurrency: string
}

export function ProductStats({ stats, defaultCurrency }: ProductStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        label="Toplam Ürün"
        value={stats.total}
        icon={Package}
        color="bg-gradient-to-br from-slate-500 to-slate-600"
        sub="Tüm katalog"
      />
      <StatCard
        label="Toplam Stok Değeri"
        value={formatCurrency(stats.totalStockValue, defaultCurrency)}
        icon={Warehouse}
        color="bg-gradient-to-br from-emerald-500 to-teal-600"
        sub="stok × fiyat"
      />
      <StatCard
        label="Düşük / Tükenmiş"
        value={stats.lowStockCount}
        icon={AlertTriangle}
        color="bg-gradient-to-br from-amber-500 to-orange-600"
        sub={`${stats.outOfStock} tükenmiş`}
      />
      <StatCard
        label="Kategori Sayısı"
        value={stats.categoryCount}
        icon={Layers}
        color="bg-gradient-to-br from-violet-500 to-fuchsia-600"
        sub="farklı kategori"
      />
    </div>
  )
}
