'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CurrencyData } from './types'
import { LiveBadge } from './live-badge'

const FLAGS: Record<string, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
}

function sourceLabel(source: CurrencyData['source']): string {
  switch (source) {
    case 'er-api':
      return 'open.er-api.com'
    case 'frankfurter':
      return 'frankfurter.dev (ECB)'
    default:
      return 'çevrimdışı özet'
  }
}

function formatUpdatedAt(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function CurrencyWidget({ data }: { data?: CurrencyData }) {
  if (!data) {
    return <Skeleton className="h-40 rounded-xl" />
  }

  const live = data.source === 'er-api' || data.source === 'frankfurter'
  const updated = formatUpdatedAt(data.updatedAt)

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="text-base">💱</span>
            Döviz Kurları
          </span>
          <LiveBadge live={live} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {data.items.map((c) => (
          <div
            key={c.code}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">{FLAGS[c.code]}</span>
              <div>
                <div className="text-sm font-semibold">{c.code}/TRY</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  Önceki: {c.prev.toFixed(2)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold tabular-nums">{c.rate.toFixed(2)} ₺</div>
              <div
                className={cn(
                  'flex items-center justify-end gap-0.5 text-[11px] font-medium tabular-nums',
                  c.up ? 'text-emerald-600' : 'text-red-600',
                )}
              >
                {c.up ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span>
                  {c.up ? '+' : ''}
                  {c.changePct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        ))}
        <div className="pt-2 mt-1 border-t text-[10px] text-muted-foreground text-center">
          {live ? `Kaynak: ${sourceLabel(data.source)}` : 'Kaynak: özet veri'}
          {updated ? ` · ${updated}` : ''}
        </div>
      </CardContent>
    </Card>
  )
}
