'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Coffee, Users, Receipt, TrendingUp, ShoppingCart, AlertTriangle,
  ArrowRight, Banknote, CreditCard, Boxes, Package, Calendar,
} from 'lucide-react'
import { formatCurrency, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, CartesianGrid,
} from 'recharts'
import { useCountUp } from '@/hooks/use-count-up'
import type {
  CafeDashboardData, MarketDashboardData,
  SiteDashboardData, AppointmentsDashboardData,
} from './types'

// ============================================================
// PAYLAŞIMLI YARDIMCILAR
// ============================================================
interface KpiData {
  label: string
  value: string | number
  numericValue: number
  sub: string
  icon: typeof Users
  color: string
  onClick?: () => void
}

function KpiCard({ kpi }: { kpi: KpiData }) {
  const animated = useCountUp(kpi.numericValue, 900)
  const displayValue = typeof kpi.value === 'string' && kpi.value.includes('₺')
    ? formatCurrency(animated, 'TRY')
    : typeof kpi.value === 'number'
      ? animated
      : kpi.value
  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-300 group hover:-translate-y-0.5',
        kpi.onClick && 'cursor-pointer hover:shadow-md',
      )}
      onClick={kpi.onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={cn('w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm', kpi.color)}>
            <kpi.icon className="w-5 h-5 text-white" />
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight">{displayValue}</div>
        <div className="text-sm text-muted-foreground mt-0.5">{kpi.label}</div>
        <div className="text-xs text-muted-foreground/80 mt-1.5">{kpi.sub}</div>
      </CardContent>
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

// ============================================================
// CAFE DASHBOARD
// ============================================================
export function CafeDashboard({ data }: { data: CafeDashboardData }) {
  const setView = useAppStore((s) => s.setView)
  const c = data.cafe

  const kpis: KpiData[] = [
    {
      label: 'Günlük Ciro',
      value: formatCurrency(c.todayRevenue),
      numericValue: c.todayRevenue,
      sub: `${c.todayOrderCount} sipariş`,
      icon: TrendingUp,
      color: 'from-emerald-500 to-teal-600',
      onClick: () => setView('cafe'),
    },
    {
      label: 'Aktif Masalar',
      value: c.activeTables,
      numericValue: c.activeTables,
      sub: `Toplam ${c.totalTables} masadan`,
      icon: Coffee,
      color: 'from-amber-500 to-orange-600',
      onClick: () => setView('cafe'),
    },
    {
      label: 'Dönem Cirosu',
      value: formatCurrency(c.rangeRevenue),
      numericValue: c.rangeRevenue,
      sub: `${c.rangeOrderCount} sipariş`,
      icon: Receipt,
      color: 'from-sky-500 to-blue-600',
      onClick: () => setView('cafe'),
    },
    {
      label: 'Toplam Kafe',
      value: c.totalCafes,
      numericValue: c.totalCafes,
      sub: c.cafeNames.join(', '),
      icon: Users,
      color: 'from-violet-500 to-purple-600',
      onClick: () => setView('cafe'),
    },
  ]

  return (
    <div className="space-y-6">
      {/* KPI kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => <KpiCard key={k.label} kpi={k} />)}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Günlük ciro grafiği */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Son 14 Gün Ciro Trendi</CardTitle>
          </CardHeader>
          <CardContent>
            {c.dailyRevenue.every((d) => d.revenue === 0) ? (
              <EmptyState message="Son 14 günde ciro kaydı yok" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={c.dailyRevenue} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cafeRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) => {
                      const d = new Date(v)
                      return `${d.getDate()}.${d.getMonth() + 1}`
                    }}
                    interval={2}
                  />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `₺${v}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: '12px' }}
                    formatter={(value: number) => [formatCurrency(value), 'Ciro']}
                    labelFormatter={(v: string) => {
                      const d = new Date(v)
                      return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
                    }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} fill="url(#cafeRevGrad)" dot={false} activeDot={{ r: 4, fill: '#f59e0b' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Sipariş tipi dağılımı */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sipariş Tipleri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {c.orderByType.length === 0 ? (
              <EmptyState message="Sipariş yok" />
            ) : (
              c.orderByType.map((t) => {
                const total = c.orderByType.reduce((s, x) => s + x.count, 0)
                const pct = total > 0 ? (t.count / total) * 100 : 0
                const label = t.type === 'dine_in' ? 'Yerinde' : t.type === 'takeaway' ? 'Paket' : 'Gel Al'
                return (
                  <div key={t.type} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{label}</span>
                      <span className="font-medium tabular-nums">{t.count}</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top satılan ürünler */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">En Çok Satan Ürünler</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setView('cafe')} className="text-xs h-7">
              Kafe <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {c.topItems.length === 0 ? (
            <EmptyState message="Bu dönemde satış kaydı yok" />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {c.topItems.map((it, idx) => (
                <div key={it.name} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                    idx === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                    idx === 1 ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' :
                    idx === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{it.qty} adet</div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">{formatCurrency(it.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// MARKET DASHBOARD
// ============================================================
export function MarketDashboard({ data }: { data: MarketDashboardData }) {
  const setView = useAppStore((s) => s.setView)
  const m = data.market

  const kpis: KpiData[] = [
    {
      label: 'Günlük Satış',
      value: formatCurrency(m.todayRevenue),
      numericValue: m.todayRevenue,
      sub: `${m.todayTxCount} fiş`,
      icon: TrendingUp,
      color: 'from-emerald-500 to-teal-600',
      onClick: () => setView('market'),
    },
    {
      label: 'Aktif Vardiya',
      value: m.activeShifts,
      numericValue: m.activeShifts,
      sub: m.activeShifts > 0 ? 'Kasa açık' : 'Kasa kapalı',
      icon: Receipt,
      color: 'from-sky-500 to-blue-600',
      onClick: () => setView('market'),
    },
    {
      label: 'Stok Uyarısı',
      value: m.lowStockProducts,
      numericValue: m.lowStockProducts,
      sub: m.lowStockProducts > 0 ? 'Acil tedarik' : 'Stok sağlıklı',
      icon: AlertTriangle,
      color: m.lowStockProducts > 0 ? 'from-red-500 to-rose-600' : 'from-emerald-500 to-teal-600',
      onClick: () => setView('market'),
    },
    {
      label: 'Dönem Satışı',
      value: formatCurrency(m.rangeRevenue),
      numericValue: m.rangeRevenue,
      sub: `${m.rangeTxCount} fiş`,
      icon: ShoppingCart,
      color: 'from-violet-500 to-purple-600',
      onClick: () => setView('market'),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => <KpiCard key={k.label} kpi={k} />)}
      </div>

      {/* Cash + Card breakdown (today) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <Banknote className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Bugün Nakit</div>
              <div className="text-xl font-bold tabular-nums">{formatCurrency(m.todayCash)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-sky-50/50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/30">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-sm">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Bugün Kart</div>
              <div className="text-xl font-bold tabular-nums">{formatCurrency(m.todayCard)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Market Sayısı</div>
              <div className="text-xl font-bold tabular-nums">{m.totalMarkets}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Günlük satış grafiği */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Son 14 Gün Satış Trendi</CardTitle>
          </CardHeader>
          <CardContent>
            {m.dailyRevenue.every((d) => d.revenue === 0) ? (
              <EmptyState message="Son 14 günde satış kaydı yok" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={m.dailyRevenue} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="marketRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) => {
                      const d = new Date(v)
                      return `${d.getDate()}.${d.getMonth() + 1}`
                    }}
                    interval={2}
                  />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `₺${v}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: '12px' }}
                    formatter={(value: number) => [formatCurrency(value), 'Satış']}
                    labelFormatter={(v: string) => {
                      const d = new Date(v)
                      return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
                    }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#marketRevGrad)" dot={false} activeDot={{ r: 4, fill: '#10b981' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Ödeme yöntemi dağılımı */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ödeme Yöntemleri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {m.paymentMethods.length === 0 ? (
              <EmptyState message="Veri yok" />
            ) : (
              m.paymentMethods.map((p) => {
                const total = m.paymentMethods.reduce((s, x) => s + x.count, 0)
                const pct = total > 0 ? (p.count / total) * 100 : 0
                const label = p.method === 'cash' ? 'Nakit' : p.method === 'card' ? 'Kart' : 'Karma'
                return (
                  <div key={p.method} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{label}</span>
                      <span className="font-medium tabular-nums">{p.count}</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top satılan ürünler */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">En Çok Satan Ürünler</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setView('market')} className="text-xs h-7">
              Market <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {m.topProducts.length === 0 ? (
            <EmptyState message="Bu dönemde satış kaydı yok" />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {m.topProducts.map((it, idx) => (
                <div key={it.name} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                    idx === 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
                    idx === 1 ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' :
                    idx === 2 ? 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{it.qty.toFixed(0)} adet</div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">{formatCurrency(it.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// SITE DASHBOARD
// ============================================================
export function SiteDashboard({ data }: { data: SiteDashboardData }) {
  const setView = useAppStore((s) => s.setView)
  const s = data.site

  const kpis: KpiData[] = [
    {
      label: 'Toplam Sakin',
      value: s.residentsCount,
      numericValue: s.residentsCount,
      sub: `${s.apartmentsCount} daire`,
      icon: Users,
      color: 'from-violet-500 to-purple-600',
      onClick: () => setView('site'),
    },
    {
      label: 'Tahsilat Oranı',
      value: `%${s.collectionRate.toFixed(0)}`,
      numericValue: s.collectionRate,
      sub: `Bu yıl ${formatCurrency(s.collectedThisMonth)} tahsil edildi`,
      icon: TrendingUp,
      color: 'from-emerald-500 to-teal-600',
      onClick: () => setView('site'),
    },
    {
      label: 'Açık Şikayet',
      value: s.openComplaints,
      numericValue: s.openComplaints,
      sub: s.openComplaints > 0 ? 'İncelenmeli' : 'Hepsi çözüldü',
      icon: AlertTriangle,
      color: s.openComplaints > 0 ? 'from-red-500 to-rose-600' : 'from-emerald-500 to-teal-600',
      onClick: () => setView('site'),
    },
    {
      label: 'Personel',
      value: s.staffCount,
      numericValue: s.staffCount,
      sub: 'Site çalışanları',
      icon: Users,
      color: 'from-sky-500 to-blue-600',
      onClick: () => setView('site'),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => <KpiCard key={k.label} kpi={k} />)}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Aylık tahsilat grafiği */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Aylık Aidat Tahsilatı</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Son 6 ay · Toplam {formatCurrency(s.monthlyCollection.reduce((a, x) => a + x.amount, 0))}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {s.monthlyCollection.every((d) => d.amount === 0) ? (
              <EmptyState message="Son 6 ayda tahsilat kaydı yok" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={s.monthlyCollection} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={(v: number) => `₺${v}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: '12px' }}
                    formatter={(value: number) => [formatCurrency(value), 'Tahsilat']}
                  />
                  <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={50}>
                    {s.monthlyCollection.map((_, i) => (
                      <Cell key={i} fill="#8b5cf6" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Aidat durumu */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Aidat Durumu (Bu Yıl)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Tahsil Edilen</span>
                <span className="text-lg font-bold text-emerald-600">{s.paidCount}</span>
              </div>
              <p className="text-xs text-muted-foreground">{formatCurrency(s.totalDuesCollected)}</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Bekleyen</span>
                <span className="text-lg font-bold text-amber-600">{s.unpaidCount}</span>
              </div>
              <p className="text-xs text-muted-foreground">{formatCurrency(s.totalDuesExpected - s.totalDuesCollected)}</p>
            </div>
            <div className="p-3 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Gecikmiş</span>
                <span className="text-lg font-bold text-red-600">{s.overdueCount}</span>
              </div>
              <p className="text-xs text-muted-foreground">Acilik takip gerekli</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setView('site')}
            >
              Site Yönetimi <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Son şikayetler */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Son Şikayet / Talepler</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[280px] overflow-y-auto custom-scroll">
            {s.recentComplaints.length === 0 ? (
              <EmptyState message="Şikayet yok" />
            ) : (
              s.recentComplaints.map((c) => (
                <div key={c.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className={cn(
                    'w-2 h-2 rounded-full mt-1.5 shrink-0',
                    c.priority === 'acil' ? 'bg-red-500' :
                    c.priority === 'yuksek' ? 'bg-amber-500' :
                    'bg-sky-500'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.title}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize">
                        {c.category}
                      </Badge>
                      {c.resident?.name && (
                        <>
                          <span>·</span>
                          <span className="truncate">{c.resident.name}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{formatRelative(c.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Son duyurular */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Son Duyurular</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[280px] overflow-y-auto custom-scroll">
            {s.recentAnnouncements.length === 0 ? (
              <EmptyState message="Duyuru yok" />
            ) : (
              s.recentAnnouncements.map((a) => (
                <div key={a.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    a.type === 'acil' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' :
                    a.type === 'aidat' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                    a.type === 'bakim' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' :
                    'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
                  )}>
                    <Package className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.title}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize">
                        {a.type}
                      </Badge>
                      {a.isPinned && <span className="text-amber-600">📌 Sabit</span>}
                      <span>·</span>
                      <span>{formatRelative(a.publishDate)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================
// APPOINTMENTS DASHBOARD
// ============================================================
export function AppointmentsDashboard({ data }: { data: AppointmentsDashboardData }) {
  const setView = useAppStore((s) => s.setView)
  const a = data.appointments

  const kpis: KpiData[] = [
    {
      label: 'Bugünkü Randevu',
      value: a.todayCount,
      numericValue: a.todayCount,
      sub: a.todayCount > 0 ? 'Bugün planlı' : 'Bugün yok',
      icon: Calendar,
      color: 'from-pink-500 to-rose-600',
      onClick: () => setView('appointments'),
    },
    {
      label: 'Bu Hafta',
      value: a.weekCount,
      numericValue: a.weekCount,
      sub: 'Önümüzdeki 7 gün',
      icon: Users,
      color: 'from-violet-500 to-purple-600',
      onClick: () => setView('appointments'),
    },
    {
      label: 'Bekleyen Talep',
      value: a.pendingCount,
      numericValue: a.pendingCount,
      sub: a.pendingCount > 0 ? 'Onay bekliyor' : 'Hepsi onaylanmış',
      icon: AlertTriangle,
      color: a.pendingCount > 0 ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600',
      onClick: () => setView('appointments'),
    },
    {
      label: 'Dönem Cirosu',
      value: formatCurrency(a.rangeRevenue),
      numericValue: a.rangeRevenue,
      sub: `${a.rangeCompletedCount} tamamlandı`,
      icon: TrendingUp,
      color: 'from-emerald-500 to-teal-600',
      onClick: () => setView('appointments'),
    },
  ]

  const todayAppts = a.todayAppointments ?? []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => <KpiCard key={k.label} kpi={k} />)}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Günlük randevu grafiği */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Son 14 Gün Randevu Trendi</CardTitle>
          </CardHeader>
          <CardContent>
            {a.dailyAppointments.every((d) => d.count === 0) ? (
              <EmptyState message="Son 14 günde randevu kaydı yok" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={a.dailyAppointments} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="apptGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) => {
                      const d = new Date(v)
                      return `${d.getDate()}.${d.getMonth() + 1}`
                    }}
                    interval={2}
                  />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: '12px' }}
                    formatter={(value: number) => [`${value} randevu`, '']}
                    labelFormatter={(v: string) => {
                      const d = new Date(v)
                      return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
                    }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#ec4899" strokeWidth={2} fill="url(#apptGrad)" dot={false} activeDot={{ r: 4, fill: '#ec4899' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top hizmetler */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">En Çok Tercih Edilen Hizmetler</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[260px] overflow-y-auto custom-scroll">
            {a.topServices.length === 0 ? (
              <EmptyState message="Veri yok" />
            ) : (
              a.topServices.map((s, idx) => {
                const maxCount = a.topServices[0].count || 1
                const pct = (s.count / maxCount) * 100
                return (
                  <div key={s.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate flex-1">{idx + 1}. {s.name}</span>
                      <span className="font-medium tabular-nums">{s.count}x</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <div className="text-xs text-muted-foreground text-right">{formatCurrency(s.revenue)}</div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bugünün randevuları */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Bugünün Randevuları</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setView('appointments')} className="text-xs h-7">
              Tümü <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {todayAppts.length === 0 ? (
            <EmptyState message="Bugün randevu yok" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {todayAppts.slice(0, 9).map((appt) => (
                <div key={appt.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors">
                  <div className={cn(
                    'w-2 h-2 rounded-full mt-1.5 shrink-0',
                    appt.status === 'tamamlandi' ? 'bg-emerald-500' :
                    appt.status === 'onaylandi' ? 'bg-sky-500' :
                    appt.status === 'beklemede' ? 'bg-amber-500' :
                    appt.status === 'reddedildi' || appt.status === 'iptal' ? 'bg-red-500' :
                    'bg-slate-400'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{appt.customerName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {appt.service?.name ?? 'Genel hizmet'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(appt.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                      {appt.staff?.name && <span>· {appt.staff.name}</span>}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums shrink-0">
                    {formatCurrency(appt.price)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
