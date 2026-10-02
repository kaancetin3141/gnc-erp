'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Flame, Activity, Calendar } from 'lucide-react'
import type { StreakData } from './types'

export function StreakWidget({ data }: { data?: StreakData }) {
  if (!data) {
    return <Skeleton className="h-40 rounded-xl" />
  }

  const streakActive = data.days > 0
  const isHot = data.days >= 7

  return (
    <Card
      className={
        streakActive
          ? 'relative overflow-hidden border-amber-200 dark:border-amber-900/50'
          : 'relative overflow-hidden'
      }
    >
      {isHot && (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-amber-950/20 dark:via-orange-950/20 dark:to-rose-950/20 pointer-events-none" />
      )}
      <CardContent className="relative z-10 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
              Aktivite Serin
            </span>
          </div>
          {isHot && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-medium">
              🔥 Ateşli!
            </span>
          )}
        </div>

        <div className="flex items-end gap-2">
          <div className="text-4xl leading-none">{data.days > 0 ? '🔥' : '💤'}</div>
          <div>
            <div className="text-3xl font-bold tabular-nums leading-none">{data.days}</div>
            <div className="text-xs text-muted-foreground mt-1">gün üst üste</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
            <div>
              <div className="text-sm font-semibold tabular-nums leading-none">{data.todayCount}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">bugün</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-600" />
            <div>
              <div className="text-sm font-semibold tabular-nums leading-none">{data.total30d}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">son 30 gün</div>
            </div>
          </div>
        </div>

        {data.days === 0 && (
          <p className="text-[11px] text-muted-foreground mt-3 pt-2 border-t">
            Bugün bir aktivite ekleyerek seriyi başlat! 💪
          </p>
        )}
        {data.days >= 7 && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-3 pt-2 border-t">
            Harika gidiyorsun! Seriyi sürdür. ⚡
          </p>
        )}
      </CardContent>
    </Card>
  )
}
