'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CurrencyRate } from './types'

const FLAGS: Record<string, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
}

export function CurrencyWidget({ data }: { data?: CurrencyRate[] }) {
  if (!data) {
    return <Skeleton className="h-40 rounded-xl" />
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="text-base">💱</span>
          Döviz Kurları
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {data.map((c) => (
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
                  {c.up ? '+' : ''}{c.changePct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        ))}
        <div className="pt-2 mt-1 border-t text-[10px] text-muted-foreground text-center">
          Saatlik güncellenir · Mock veri
        </div>
      </CardContent>
    </Card>
  )
}
