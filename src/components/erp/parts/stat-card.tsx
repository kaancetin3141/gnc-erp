'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: number | string
  icon: LucideIcon
  color: string
  sub?: string
  /** 6 kolonlu KPI satırları gibi dar kartlarda kullanılır:
   *  değer tek satırda tutulur (para değerinin ortadan bölünmesini engeller) */
  compact?: boolean
}

export function StatCard({ label, value, icon: Icon, color, sub, compact }: StatCardProps) {
  if (compact) {
    // Dar kart düzeni (6 kolonlu KPI satırları): ikon üstte sağda,
    // değer altta tam genişlik — para değeri ortadan bölünmez
    return (
      <Card className="relative overflow-hidden hover:shadow-sm transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs text-muted-foreground truncate">{label}</div>
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', color)}>
              <Icon className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="text-base sm:text-lg font-bold tracking-tight mt-1.5 leading-tight whitespace-nowrap overflow-hidden text-ellipsis tabular-nums">
            {value}
          </div>
          {sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="relative overflow-hidden hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground truncate">{label}</div>
            <div className="text-lg sm:text-xl font-bold tracking-tight mt-0.5 break-words leading-tight">{value}</div>
            {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
          </div>
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', color)}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
