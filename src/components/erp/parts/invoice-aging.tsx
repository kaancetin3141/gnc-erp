'use client'

// ============================================================
// Tahsilat Yaşlandırma (Receivables Aging)
// · Bekleyen faturalar (odeme_bekliyor + gecikti) vade gecikmesine
//   göre 4 kovaya ayrılır: Vadesi geçmemiş / 1-30 / 31-60 / 61+ gün
// · Her kova: adet + TRY bazlı tutar + toplam içindeki payı (bar)
// · Kova tıklanınca fatura tablosu filtrelenir
// ============================================================

import { useMemo } from 'react'
import { Hourglass, CalendarClock, CalendarDays, CalendarX2, Filter, HandCoins } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Invoice } from './types'
import { toTry, overdueDays } from './invoice-utils'

export type AgingBucket = '__all__' | 'notdue' | 'd1_30' | 'd31_60' | 'd61p'

export const AGING_BUCKETS: {
  value: AgingBucket
  label: string
  short: string
  color: string // dot + bar rengi
  chipCls: string
}[] = [
  {
    value: 'notdue',
    label: 'Vadesi Geçmemiş',
    short: 'Vadesi gelmemiş',
    color: 'bg-slate-400 dark:bg-slate-500',
    chipCls: 'text-slate-700 border-slate-300 bg-slate-50 dark:text-slate-300 dark:border-slate-700 dark:bg-slate-900/40',
  },
  {
    value: 'd1_30',
    label: '1-30 Gün',
    short: '1-30 gün',
    color: 'bg-amber-400 dark:bg-amber-500',
    chipCls: 'text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-300 dark:border-amber-800 dark:bg-amber-950/40',
  },
  {
    value: 'd31_60',
    label: '31-60 Gün',
    short: '31-60 gün',
    color: 'bg-orange-500 dark:bg-orange-600',
    chipCls: 'text-orange-700 border-orange-300 bg-orange-50 dark:text-orange-300 dark:border-orange-800 dark:bg-orange-950/40',
  },
  {
    value: 'd61p',
    label: '61+ Gün',
    short: '61+ gün',
    color: 'bg-red-500 dark:bg-red-600',
    chipCls: 'text-red-700 border-red-300 bg-red-50 dark:text-red-300 dark:border-red-800 dark:bg-red-950/40',
  },
]

export function bucketOf(inv: Invoice, now: number = Date.now()): Exclude<AgingBucket, '__all__'> {
  const d = overdueDays(inv.dueDate, now)
  if (d <= 0) return 'notdue'
  if (d <= 30) return 'd1_30'
  if (d <= 60) return 'd31_60'
  return 'd61p'
}

interface InvoiceAgingProps {
  invoices: Invoice[]
  activeBucket: AgingBucket
  onBucketChange: (b: AgingBucket) => void
}

export function InvoiceAging({ invoices, activeBucket, onBucketChange }: InvoiceAgingProps) {
  const data = useMemo(() => {
    const now = Date.now()
    const pending = invoices.filter((i) => i.status === 'odeme_bekliyor' || i.status === 'gecikti')
    const buckets = AGING_BUCKETS.map((b) => {
      const items = pending.filter((i) => bucketOf(i, now) === b.value)
      return {
        ...b,
        count: items.length,
        amount: Math.round(items.reduce((s, i) => s + toTry(i.total, i.currency), 0)),
      }
    })
    const totalAmount = buckets.reduce((s, b) => s + b.amount, 0)
    return { buckets, totalAmount, pendingCount: pending.length }
  }, [invoices])

  if (data.pendingCount === 0) return null

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Başlık */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shrink-0">
              <Hourglass className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-tight">Tahsilat Yaşlandırma</h3>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {data.pendingCount} bekleyen fatura · vade gecikmesine göre
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <HandCoins className="w-3.5 h-3.5 text-fuchsia-600" />
            <span className="text-sm font-bold tabular-nums">
              {data.totalAmount >= 1000000
                ? `${(data.totalAmount / 1000000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} M ₺`
                : `${data.totalAmount.toLocaleString('tr-TR')} ₺`}
            </span>
          </div>
        </div>

        {/* Yatay yığılmış bar */}
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Yaşlandırma dağılımı">
          {data.buckets.map((b) =>
            b.amount > 0 ? (
              <div
                key={b.value}
                className={cn('h-full transition-all', b.color)}
                style={{ width: `${Math.max((b.amount / data.totalAmount) * 100, 2)}%` }}
                title={`${b.label}: ${b.amount.toLocaleString('tr-TR')} ₺`}
              />
            ) : null,
          )}
        </div>

        {/* Kova satırları — tıklanabilir filtre */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {data.buckets.map((b) => {
            const share = data.totalAmount > 0 ? Math.round((b.amount / data.totalAmount) * 100) : 0
            const active = activeBucket === b.value
            return (
              <button
                key={b.value}
                onClick={() => onBucketChange(active ? '__all__' : b.value)}
                aria-pressed={active}
                className={cn(
                  'text-left rounded-lg border p-2.5 transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400',
                  active
                    ? 'ring-2 ring-fuchsia-400 ring-offset-1 dark:ring-offset-background border-fuchsia-300 dark:border-fuchsia-800'
                    : 'border-border hover:border-fuchsia-200 dark:hover:border-fuchsia-900',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', b.color)} />
                    <span className="text-[11px] font-medium truncate">
                      {b.value === 'notdue' ? (
                        <CalendarDays className="w-3 h-3 inline mr-0.5 -mt-0.5 text-slate-400" />
                      ) : b.value === 'd1_30' ? (
                        <CalendarClock className="w-3 h-3 inline mr-0.5 -mt-0.5 text-amber-500" />
                      ) : (
                        <CalendarX2 className="w-3 h-3 inline mr-0.5 -mt-0.5 text-red-500" />
                      )}
                      {b.label}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                    {b.count}
                  </Badge>
                </div>
                <div className="mt-1 text-sm font-bold tabular-nums truncate">
                  {b.amount >= 1000000
                    ? `${(b.amount / 1000000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} M ₺`
                    : `${b.amount.toLocaleString('tr-TR')} ₺`}
                </div>
                <div className="text-[10px] text-muted-foreground">payı %{share}</div>
              </button>
            )
          })}
        </div>

        {/* Aktif filtre bilgisi */}
        {activeBucket !== '__all__' && (
          <div className="flex items-center justify-between text-[11px] pt-1 border-t">
            <span className="flex items-center gap-1 text-fuchsia-600 font-medium">
              <Filter className="w-3 h-3" />
              Yaşlandırma filtresi aktif:
              {AGING_BUCKETS.find((b) => b.value === activeBucket)?.label}
            </span>
            <button
              onClick={() => onBucketChange('__all__')}
              className="text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Filtreyi kaldır
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
