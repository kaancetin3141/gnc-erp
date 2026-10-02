'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDateTime, formatDate } from '@/lib/format'
import {
  Receipt, TrendingUp, Users, Coffee, Banknote, CreditCard,
  Smartphone, Clock, Calendar,
} from 'lucide-react'

interface Payment {
  id: string
  orderId: string
  amount: number
  method: string
  status: string
  createdAt: string
}

interface CafeOrder {
  id: string
  number: string
  status: string
  type: string
  total: number
  subtotal: number
  createdAt: string
  table?: { id: string; number: string } | null
  payments?: Payment[]
}

interface OrdersResponse { items: CafeOrder[] }

const METHOD_META: Record<string, { label: string; icon: typeof Banknote; color: string }> = {
  cash: { label: 'Nakit', icon: Banknote, color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30' },
  card: { label: 'Kart', icon: CreditCard, color: 'text-sky-700 bg-sky-950/30' },
  online: { label: 'Online', icon: Smartphone, color: 'text-violet-700 bg-violet-950/30' },
}

export function CafeReports({ cafeId }: { cafeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cafe-reports', cafeId],
    queryFn: () => apiGet<OrdersResponse>(`/api/cafe/${cafeId}/orders?today=1`),
    refetchInterval: 30_000,
  })

  const stats = useMemo(() => {
    const orders = data?.items ?? []
    const odendi = orders.filter((o) => o.status === 'odendi')
    const cancelled = orders.filter((o) => o.status === 'iptal')
    const open = orders.filter((o) => o.status !== 'odendi' && o.status !== 'iptal')

    const totalRevenue = odendi.reduce((s, o) => s + o.total, 0)
    const avgTicket = odendi.length > 0 ? totalRevenue / odendi.length : 0

    // Method breakdown
    const methods = { cash: 0, card: 0, online: 0 }
    for (const o of odendi) {
      for (const p of o.payments ?? []) {
        if (p.status !== 'tamamlandi') continue
        if (p.method === 'cash') methods.cash += p.amount
        else if (p.method === 'card') methods.card += p.amount
        else if (p.method === 'online') methods.online += p.amount
      }
    }

    // Type breakdown
    const types = { dine_in: 0, takeaway: 0, delivery: 0 }
    for (const o of odendi) {
      if (o.type === 'dine_in') types.dine_in++
      else if (o.type === 'takeaway') types.takeaway++
      else types.delivery++
    }

    // Hourly distribution
    const hourly: Record<number, number> = {}
    for (const o of orders) {
      const h = new Date(o.createdAt).getHours()
      hourly[h] = (hourly[h] ?? 0) + o.total
    }

    return {
      total: orders.length,
      odendi: odendi.length,
      cancelled: cancelled.length,
      open: open.length,
      totalRevenue,
      avgTicket,
      methods,
      types,
      hourly,
      orders,
    }
  }, [data])

  const maxHourly = Math.max(1, ...Object.values(stats.hourly))

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Date header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="w-4 h-4" />
        <span>Bugün · {formatDate(new Date())}</span>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          icon={TrendingUp}
          label="Toplam Ciro"
          value={formatCurrency(stats.totalRevenue)}
          color="emerald"
        />
        <StatCard
          icon={Receipt}
          label="Sipariş Sayısı"
          value={String(stats.odendi)}
          sub={`${stats.open} açık`}
          color="sky"
        />
        <StatCard
          icon={Coffee}
          label="Ort. Sepet"
          value={formatCurrency(stats.avgTicket)}
          color="amber"
        />
        <StatCard
          icon={Users}
          label="Masa / Paket / Gel-Al"
          value={`${stats.types.dine_in} / ${stats.types.takeaway} / ${stats.types.delivery}`}
          color="violet"
        />
      </div>

      {/* Payment methods */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Banknote className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-semibold">Ödeme Yöntemleri</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(METHOD_META).map(([key, meta]) => {
              const amount = stats.methods[key as keyof typeof stats.methods] ?? 0
              const pct = stats.totalRevenue > 0 ? (amount / stats.totalRevenue) * 100 : 0
              return (
                <div key={key} className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <meta.icon className={cn('w-3.5 h-3.5', meta.color.split(' ')[0])} />
                    <span className="text-xs font-medium">{meta.label}</span>
                  </div>
                  <div className="text-sm font-bold">{formatCurrency(amount)}</div>
                  <div className="mt-1 h-1.5 bg-background rounded-full overflow-hidden">
                    <div
                      className={cn('h-full', meta.color.split(' ')[0].replace('text-', 'bg-'))}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">%{pct.toFixed(1)}</div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Hourly distribution */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold">Saatlik Ciro Dağılımı</span>
          </div>
          {Object.keys(stats.hourly).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">Bugün sipariş yok</div>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {Object.entries(stats.hourly)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([hour, amount]) => (
                  <div key={hour} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      {formatCurrency(amount)}
                    </div>
                    <div
                      className="w-full bg-gradient-to-t from-amber-500 to-amber-400 rounded-t min-h-[2px]"
                      style={{ height: `${(amount / maxHourly) * 100}%` }}
                      title={`${hour}:00 — ${formatCurrency(amount)}`}
                    />
                    <div className="text-[9px] text-muted-foreground">{hour}</div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent orders */}
      <Card>
        <CardContent className="p-0">
          <div className="p-3 border-b">
            <div className="text-sm font-semibold">Son Siparişler</div>
          </div>
          <div className="divide-y divide-border max-h-72 overflow-y-auto custom-scroll">
            {stats.orders.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Sipariş yok</div>
            ) : (
              stats.orders.slice(0, 20).map((o) => (
                <div key={o.id} className="flex items-center gap-3 p-3 hover:bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">#{o.number}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px] h-4',
                          o.status === 'odendi'
                            ? 'text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                            : o.status === 'iptal'
                              ? 'text-red-700 dark:text-red-400 border-red-300 dark:border-red-800'
                              : 'text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800',
                        )}
                      >
                        {o.status === 'odendi' ? 'ÖDENDİ' : o.status === 'iptal' ? 'İPTAL' : 'AÇIK'}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDateTime(o.createdAt)}
                      {o.table ? ` · Masa ${o.table.number}` : o.type === 'takeaway' ? ' · Paket' : ' · Gel-Al'}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{formatCurrency(o.total)}</div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const STAT_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50', text: 'text-emerald-700 dark:text-emerald-400', icon: 'text-emerald-600' },
  sky: { bg: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50', text: 'text-sky-700 dark:text-sky-400', icon: 'text-sky-600' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-600' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900/50', text: 'text-violet-700 dark:text-violet-400', icon: 'text-violet-600' },
}

function StatCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: typeof TrendingUp
  label: string
  value: string
  sub?: string
  color: string
}) {
  const c = STAT_COLORS[color] ?? STAT_COLORS.emerald
  return (
    <Card className={cn('border', c.bg)}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn('w-3.5 h-3.5 shrink-0', c.icon)} />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</span>
        </div>
        <div className={cn('text-base sm:text-lg font-bold', c.text)}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  )
}
