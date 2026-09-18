'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Newspaper } from 'lucide-react'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { NewsItem } from './types'

const CATEGORY_COLORS: Record<string, string> = {
  Ekonomi: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  Ticaret: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  KOBİ: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  Piyasa: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  Teknoloji: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
}

export function NewsWidget({ data }: { data?: NewsItem[] }) {
  if (!data) {
    return <Skeleton className="h-72 rounded-xl" />
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-violet-600" />
            İş Dünyası Haberleri
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">{data.length} manşet</Badge>
        </div>
      </CardHeader>
      <CardContent className="max-h-80 overflow-y-auto custom-scroll pr-1">
        <div className="space-y-2">
          {data.map((n) => (
            <div
              key={n.id}
              className="p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <Badge
                  variant="outline"
                  className={cn('text-[10px] h-4 px-1.5 font-medium', CATEGORY_COLORS[n.category] ?? 'bg-muted text-muted-foreground')}
                >
                  {n.category}
                </Badge>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {formatRelative(n.time)}
                </span>
              </div>
              <p className="text-sm font-medium leading-snug mb-1">{n.title}</p>
              <div className="text-[11px] text-muted-foreground">— {n.source}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
