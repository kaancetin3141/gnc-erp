'use client'

// ============================================================
// Randevu Özet Kartları — /api/reports/summary beslemeli grafik bölümü
// · Son 14 gün: gün başına stacked BAR chart (onaylandı yeşil / iptal kırmızı / diğer gri)
// · 30/7/90 günlük randevu trendi (alan grafiği)
// · Durum dağılımı (donut) + en çok talep edilen hizmetler / aktif personel (yatay bar)
// · Özet çipleri: toplam üye, toplam randevu, yaklaşan randevu, dönem içi
// · Tema: emerald/stone (mavi/indigo kullanılmaz); mobilde tek kolon
// ============================================================

import { useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell,
} from 'recharts'
import {
  Users, CalendarCheck, CalendarClock, Activity, PieChart as PieIcon,
  BarChart3, Sparkles, UserRound,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet } from '@/lib/api-client'
import { cn } from '@/lib/utils'

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

// Tema renkleri (emerald/stone ailesi)
const EMERALD = '#10b981'
const TEAL = '#14b8a6'
const AMBER = '#f59e0b'
const ROSE = '#f43f5e'
const STONE = '#78716c'

const TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 10,
  fontSize: 12,
  color: 'hsl(var(--popover-foreground))',
}

type SummaryData = {
  days: number
  scope: { platformWide: boolean; tenantId: string | null }
  appointmentsByDay: Array<{ date: string; total: number; onaylandi: number; iptal: number }>
  statusDistribution: {
    onaylandi: number; bekliyor: number; iptal: number
    tamamlandi: number; reddedildi: number; gelmedi: number
  }
  topServices: Array<{ name: string; count: number }>
  topStaff: Array<{ name: string; count: number }>
  totalMembers: number
  totalAppointments: number
  upcomingCount: number
}

function dayLabel(iso: string): string {
  const d = Number(iso.slice(8, 10))
  const m = Number(iso.slice(5, 7)) - 1
  return `${d} ${TR_MONTHS[m] ?? ''}`
}

function EmptyHint({ text = 'Bu dönemde veri yok' }: { text?: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}

// Yatay bar listesi (hizmetler / personel)
function HBarList({ items }: { items: Array<{ name: string; count: number }> }) {
  if (items.length === 0) return <EmptyHint />
  const max = Math.max(...items.map((i) => i.count), 1)
  return (
    <div className="space-y-3 pt-1">
      {items.map((item, i) => (
        <div key={`${item.name}-${i}`} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">{item.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{item.count}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200/70 dark:bg-stone-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.max((item.count / max) * 100, 6)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function AppointmentSummaryCards() {
  const [days, setDays] = useState<7 | 30 | 90>(30)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'summary', days],
    queryFn: () => apiGet<SummaryData>(`/api/reports/summary?days=${days}`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  // Son 14 gün — gün başına stacked bar (onaylandı/iptal renk ayrımı) için sabit 14 günlük sorgu
  const bars14 = useQuery({
    queryKey: ['reports', 'summary', 'bars-14'],
    queryFn: () => apiGet<SummaryData>('/api/reports/summary?days=14'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const barData = (bars14.data?.appointmentsByDay ?? []).map((d) => ({
    ...d,
    // Diğer durumlar (beklemede/tamamlandı/reddedildi/gelmedi) = toplam − onaylandı − iptal
    diger: Math.max(0, d.total - d.onaylandi - d.iptal),
  }))
  const barTotal = barData.reduce((s, d) => s + d.total, 0)

  const trendTotal = data?.appointmentsByDay.reduce((s, d) => s + d.total, 0) ?? 0
  const dist = data?.statusDistribution
  const distData = dist
    ? [
        { key: 'onaylandi', label: 'Onaylandı', value: dist.onaylandi, fill: EMERALD },
        { key: 'bekliyor', label: 'Bekliyor', value: dist.bekliyor, fill: AMBER },
        { key: 'iptal', label: 'İptal', value: dist.iptal, fill: ROSE },
        { key: 'tamamlandi', label: 'Tamamlandı', value: dist.tamamlandi, fill: STONE },
      ]
    : []
  const distTotal = distData.reduce((s, d) => s + d.value, 0)
  const hasDist = distTotal > 0

  // Yükleniyor — iskelet
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="reports-summary-loading">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-[300px] rounded-xl lg:col-span-2" />
          <Skeleton className="h-[300px] rounded-xl" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-[220px] rounded-xl" />
          <Skeleton className="h-[220px] rounded-xl" />
        </div>
      </div>
    )
  }

  // Hata — bölümü bozmadan küçük uyarı kartı
  if (isError || !data) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between gap-3 py-4 text-sm text-muted-foreground">
          <span>Randevu özeti yüklenemedi.</span>
          <button
            onClick={() => refetch()}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
          >
            Yeniden dene
          </button>
        </CardContent>
      </Card>
    )
  }

  const chips = [
    { label: 'Toplam Üye', value: data.totalMembers, icon: Users, hint: data.scope.platformWide ? 'Platform geneli' : 'Randevu veren üyeler' },
    { label: 'Toplam Randevu', value: data.totalAppointments, icon: CalendarCheck, hint: 'Tüm zamanlar' },
    { label: 'Yaklaşan', value: data.upcomingCount, icon: CalendarClock, hint: 'Bugün + gelecek' },
    { label: 'Dönem İçi', value: trendTotal, icon: Activity, hint: `Son ${days} gün` },
  ]

  return (
    <div className="space-y-4" data-testid="reports-summary">
      {/* Bölüm başlığı + dönem seçici */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/50">
            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold leading-tight">Randevu Özeti</h3>
            <p className="text-xs text-muted-foreground">
              {data.scope.platformWide ? 'Platform geneli' : 'İşletmeleriniz'} · son {data.days} gün
            </p>
          </div>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                days === d
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {d} gün
            </button>
          ))}
        </div>
      </div>

      {/* Özet çipleri */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {chips.map((chip) => (
          <Card key={chip.label} className="py-0">
            <CardContent className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/50">
                <chip.icon className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xl font-bold leading-tight tabular-nums">{chip.value}</div>
                <div className="truncate text-xs text-muted-foreground" title={chip.hint}>{chip.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend + durum dağılımı */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{days} Günlük Randevu Trendi</CardTitle>
            <CardDescription className="text-xs">Günlük toplam randevu</CardDescription>
          </CardHeader>
          <CardContent>
            {trendTotal === 0 ? (
              <EmptyHint />
            ) : (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.appointmentsByDay} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="apptTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={EMERALD} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={EMERALD} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={dayLabel}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      minTickGap={24}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(l) => dayLabel(String(l))}
                      formatter={(value) => [`${value} randevu`, 'Toplam']}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke={EMERALD}
                      strokeWidth={2}
                      fill="url(#apptTrendFill)"
                      activeDot={{ r: 4, fill: EMERALD, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
              <PieIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Durum Dağılımı
            </CardTitle>
            <CardDescription className="text-xs">Son {days} gün</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasDist ? (
              <EmptyHint />
            ) : (
              <>
                <div className="relative h-[170px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distData.filter((d) => d.value > 0)}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={52}
                        outerRadius={78}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {distData.filter((d) => d.value > 0).map((entry) => (
                          <Cell key={entry.key} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value, name) => [`${value}`, String(name)]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold tabular-nums">{distTotal}</span>
                    <span className="text-[11px] text-muted-foreground">randevu</span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {distData.map((d) => (
                    <div key={d.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.fill }} />
                        {d.label}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Son 14 gün — gün başına stacked bar chart (onaylandı yeşil / iptal kırmızı / diğer gri) */}
      <Card data-testid="reports-14day-bars">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
            <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Son 14 Gün · Günlük Randevular
          </CardTitle>
          <CardDescription className="text-xs">Gün başına randevu sayısı — onaylandı / iptal / diğer</CardDescription>
        </CardHeader>
        <CardContent>
          {bars14.isLoading ? (
            <Skeleton className="h-[220px] w-full rounded-xl" />
          ) : bars14.isError || !bars14.data ? (
            <div className="flex h-[180px] flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
              <span>14 günlük grafik yüklenemedi.</span>
              <button
                onClick={() => bars14.refetch()}
                className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
              >
                Yeniden dene
              </button>
            </div>
          ) : barTotal === 0 ? (
            <EmptyHint text="Son 14 günde randevu verisi yok" />
          ) : (
            <>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={dayLabel}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      minTickGap={16}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(l) => dayLabel(String(l))}
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }}
                      formatter={(value, name) => [`${value}`, String(name)]}
                    />
                    <Bar dataKey="onaylandi" name="Onaylandı" stackId="appt" fill={EMERALD} maxBarSize={26} />
                    <Bar dataKey="iptal" name="İptal" stackId="appt" fill={ROSE} maxBarSize={26} />
                    <Bar
                      dataKey="diger"
                      name="Diğer (bekleyen/tamamlanan)"
                      stackId="appt"
                      fill={STONE}
                      fillOpacity={0.55}
                      maxBarSize={26}
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: EMERALD }} /> Onaylandı
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ROSE }} /> İptal
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STONE, opacity: 0.55 }} /> Diğer
                </span>
                <span className="ml-auto tabular-nums">Toplam: {barTotal}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Hizmetler + personel */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">En Çok Talep Edilen Hizmetler</CardTitle>
            <CardDescription className="text-xs">Son {days} gün · ilk 5</CardDescription>
          </CardHeader>
          <CardContent>
            <HBarList items={data.topServices} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
              <UserRound className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              En Aktif Personel
            </CardTitle>
            <CardDescription className="text-xs">Son {days} gün · ilk 5</CardDescription>
          </CardHeader>
          <CardContent>
            <HBarList items={data.topStaff} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
