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
}

export function StatCard({ label, value, icon: Icon, color, sub }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground truncate">{label}</div>
            <div className="text-xl font-bold tracking-tight mt-0.5 truncate">{value}</div>
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
