'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Newspaper, ExternalLink } from 'lucide-react'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { NewsData } from './types'

const CATEGORY_COLORS: Record<string, string> = {
  Ekonomi: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  Ticaret: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  KOBİ: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  Piyasa: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  Teknoloji: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  Gündem: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  Spor: 'bg-lime-100 text-lime-700 dark:bg-lime-950/40 dark:text-lime-300',
  'Son Dakika': 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
}

export function NewsWidget({ data }: { data?: NewsData }) {
  if (!data) {
    return <Skeleton className="h-72 rounded-xl" />
  }

  const items = data.items

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-violet-600" />
            Güncel Haberler
          </CardTitle>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px]',
              data.source === 'rss' &&
                'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400',
            )}
            title={
              data.source === 'rss'
                ? `${data.label} RSS üzerinden canlı`
                : 'RSS erişilemedi — özet manşetler'
            }
          >
            {data.label} · {items.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="max-h-80 overflow-y-auto custom-scroll pr-1">
        <div className="space-y-2">
          {items.map((n) => {
            const content = (
              <>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] h-4 px-1.5 font-medium',
                      CATEGORY_COLORS[n.category] ?? 'bg-muted text-muted-foreground',
                    )}
                  >
                    {n.category}
                  </Badge>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
                    {formatRelative(n.time)}
                    {n.link && <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />}
                  </span>
                </div>
                <p className="text-sm font-medium leading-snug mb-1 group-hover:text-foreground">
                  {n.title}
                </p>
                <div className="text-[11px] text-muted-foreground">— {n.source}</div>
              </>
            )
            const className =
              'group p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors text-left w-full'
            return n.link ? (
              <a
                key={n.id}
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(className, 'block cursor-pointer')}
              >
                {content}
              </a>
            ) : (
              <div key={n.id} className={className}>
                {content}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
