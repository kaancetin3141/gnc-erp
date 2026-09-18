'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Users, DollarSign, TrendingUp, CheckSquare, AlertTriangle,
  Phone, Mail, MessageCircle, MapPin, StickyNote, Calendar,
  ArrowUpRight, ArrowRight, Building2, Clock, ShieldAlert, Truck,
} from 'lucide-react'
import { formatCurrency, formatRelative, formatDate } from '@/lib/format'
import { DEAL_STAGES } from '@/lib/constants'
import { getOrderStatusMeta } from '@/components/erp/parts/order-utils'
import { cn } from '@/lib/utils'
import { getTenantSector, SECTOR_META } from '@/lib/tenant-sector'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, CartesianGrid,
} from 'recharts'
import { useCountUp } from '@/hooks/use-count-up'
import { WidgetsSection } from './widgets/widgets-section'
import {
  CafeDashboard, MarketDashboard, SiteDashboard, AppointmentsDashboard,
} from './sector-dashboards'
import { AiAssistantWidget } from '@/components/ai/ai-assistant-widget'
import type {
  CafeDashboardData, MarketDashboardData,
  SiteDashboardData, AppointmentsDashboardData,
} from './types'

// CRM alanları + sektör alanları birleşik tip
interface DashboardData {
  restricted?: boolean
  message?: string
  sector?: string
  range: string
  customers: { total: number; newThisMonth: number; staleCount: number }
  deals: { activeCount: number; totalPipelineValue: number; wonThisMonth: number; revenueThisMonth: number }
  tasks: { openCount: number; overdueCount: number; upcomingCount: number }
  pipelineByStage: { stage: string; count: number; totalValue: number }[]
  activitiesOverTime: { date: string; count: number }[]
  recentActivities: {
    id: string; type: string; subject: string; detail: string | null
    date: string; outcome: string | null
    user: { id: string; name: string } | null
    customer: { id: string; name: string } | null
  }[]
  upcomingTasks: {
    id: string; title: string; dueDate: string; priority: string
    assignee: { id: string; name: string } | null
    customer: { id: string; name: string } | null
  }[]
  // Bekleyen sevkiyatlar — henüz sevk edilmemiş siparişler
  shipments?: {
    pendingCount: number
    orders: {
      id: string; number: string; status: string
      orderDate: string; expectedDelivery: string | null
      totalAmount?: number; currency?: string
      customer: { id: string; name: string } | null
    }[]
  }
  // Sektör bazlı opsiyonel alanlar
  cafe?: CafeDashboardData['cafe']
  market?: MarketDashboardData['market']
  site?: SiteDashboardData['site']
  appointments?: AppointmentsDashboardData['appointments']
}

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  arama: Phone, toplanti: Users, email: Mail, whatsapp: MessageCircle,
  not: StickyNote, ziyaret: MapPin, gorev: CheckSquare,
}
const ACTIVITY_COLORS: Record<string, string> = {
  arama: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30',
  toplanti: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30',
  email: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30',
  whatsapp: 'text-green-600 bg-green-50 dark:bg-green-950/30',
  not: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30',
  ziyaret: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30',
  gorev: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30',
}

export function DashboardView() {
  const { user, setView, openCustomer } = useAppStore()
  const sector = getTenantSector(user?.tenant.name)
  const sectorMeta = SECTOR_META[sector]
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'month' | 'quarter' | 'all'>('month')
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', range, sector],
    queryFn: () => apiGet<DashboardData>(`/api/dashboard?range=${range}`),
    refetchInterval: 60_000,
  })

  // Depo rolü için kısıtlı ekran — ancak bekleyen sevkiyatlar görünür (orders.view)
  if (user?.role === 'stock' || data?.restricted) {
    const stockShipments = data?.shipments
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 gap-4">
        <Card className="p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-amber-500" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Depo rolü için erişim kısıtlıdır</h3>
          <p className="text-sm text-muted-foreground">
            Satış ve müşteri verileri gizlilik gereği yalnızca yönetici/admin rolleri tarafından görüntülenebilir.
            Depo rolü olarak üretim listesine ve belge yönetimine erişebilirsiniz.
          </p>
        </Card>
        {stockShipments && stockShipments.orders.length > 0 && (
          <div className="w-full max-w-2xl">
            <PendingShipmentsWidget shipments={stockShipments} showAmounts={false} />
          </div>
        )}
      </div>
    )
  }

  // Loading state
  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <SectorWelcomeBannerSkeleton sector={sector} />
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-40" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectorWelcomeBanner sector={sector} sectorMeta={sectorMeta} data={data} />

      {/* Date range selector — tüm sektörlerde ortak */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Dönem:</span>
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 gap-0.5">
          {([
            { value: 'today', label: 'Bugün' },
            { value: '7d', label: '7G' },
            { value: '30d', label: '30G' },
            { value: 'month', label: 'Bu Ay' },
            { value: 'quarter', label: 'Çeyrek' },
            { value: 'all', label: 'Tümü' },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                range === opt.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sektör bazlı render */}
      {sector === 'crm' && <CrmDashboard data={data} />}
      {sector === 'cafe' && data.cafe && <CafeDashboard data={{ sector: 'cafe', cafe: data.cafe }} />}
      {sector === 'market' && data.market && <MarketDashboard data={{ sector: 'market', market: data.market }} />}
      {sector === 'site' && data.site && <SiteDashboard data={{ sector: 'site', site: data.site }} />}
      {sector === 'appointments' && data.appointments && (
        <AppointmentsDashboard data={{ sector: 'appointments', appointments: data.appointments }} />
      )}

      {/* Widget'lar — hava durumu, mesajlar, döviz, haberler, streak — tüm sektörlerde ortak */}
      <WidgetsSection />

      {/* AI Assistant floating widget — tüm dashboard'larda görünür */}
      <AiAssistantWidget />
    </div>
  )
}

// ============================================================
// Sektör bazlı karşılama banner'ı
// ============================================================
function SectorWelcomeBanner({
  sector, sectorMeta, data,
}: {
  sector: string
  sectorMeta: { label: string; emoji: string; gradient: string; shortLabel: string }
  data: DashboardData
}) {
  const { user, setView } = useAppStore()

  // Sektöre göre özet mesaj
  let summary = ''
  let quickActions: { label: string; view: string; icon: typeof Users }[] = []

  if (sector === 'crm') {
    summary = data.customers.staleCount > 0
      ? `${data.customers.staleCount} müşteri iletişimsiz — ilgilenmen gerek.`
      : 'Tüm müşterilerle iletişim güncel!'
    quickActions = [
      { label: 'Müşteriler', view: 'customers', icon: Users },
      { label: 'Yeni Lead Bul', view: 'leads-maps', icon: MapPin },
    ]
  } else if (sector === 'cafe' && data.cafe) {
    summary = data.cafe.activeTables > 0
      ? `${data.cafe.activeTables} masa aktif · Bugün ${formatCurrency(data.cafe.todayRevenue)} ciro`
      : `Bugün ${formatCurrency(data.cafe.todayRevenue)} ciro · ${data.cafe.todayOrderCount} sipariş`
    quickActions = [{ label: 'Kafe Yönetimi', view: 'cafe', icon: TrendingUp }]
  } else if (sector === 'market' && data.market) {
    summary = data.market.lowStockProducts > 0
      ? `${data.market.lowStockProducts} ürün stokta tükendi! Acil tedarik gerekli.`
      : `Bugün ${formatCurrency(data.market.todayRevenue)} satış · ${data.market.todayTxCount} fiş`
    quickActions = [{ label: 'Market Yönetimi', view: 'market', icon: TrendingUp }]
  } else if (sector === 'site' && data.site) {
    summary = data.site.openComplaints > 0
      ? `${data.site.openComplaints} açık şikayet · %${data.site.collectionRate.toFixed(0)} tahsilat oranı`
      : `Tahsilat oranı %${data.site.collectionRate.toFixed(0)} · ${data.site.residentsCount} sakin`
    quickActions = [{ label: 'Site Yönetimi', view: 'site', icon: Building2 }]
  } else if (sector === 'appointments' && data.appointments) {
    summary = data.appointments.pendingCount > 0
      ? `${data.appointments.pendingCount} randevu onay bekliyor · ${data.appointments.todayCount} bugün`
      : `${data.appointments.todayCount} bugünkü randevu · ${formatCurrency(data.appointments.todayRevenue)} ciro`
    quickActions = [{ label: 'Randevular', view: 'appointments', icon: Calendar }]
  }

  // Sektöre göre renk gradyanı
  const bannerGradient = sector === 'cafe'
    ? 'from-slate-900 via-amber-900 to-slate-900'
    : sector === 'market'
      ? 'from-slate-900 via-emerald-900 to-slate-900'
      : sector === 'site'
        ? 'from-slate-900 via-violet-900 to-slate-900'
        : sector === 'appointments'
          ? 'from-slate-900 via-pink-900 to-slate-900'
          : 'from-slate-900 via-slate-800 to-emerald-900'

  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl bg-gradient-to-br text-white p-6 lg:p-7',
      bannerGradient,
    )}>
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 30%, white 1px, transparent 1px)',
        backgroundSize: '40px 40px, 60px 60px',
      }} />
      <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs text-slate-300 mb-1 flex items-center gap-2">
            <span>{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span>·</span>
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-medium">
              {sectorMeta.emoji} {sectorMeta.label}
            </span>
          </div>
          <h2 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Merhaba, {user?.name.split(' ')[0]} 👋
          </h2>
          <p className="text-sm text-slate-300 mt-1">
            {summary}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {quickActions.map((q) => (
            <Button
              key={q.label}
              size="sm"
              variant="outline"
              onClick={() => setView(q.view as never)}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
            >
              <q.icon className="w-4 h-4 mr-1.5" />
              {q.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Mini quick stats — sektöre göre özelleşir */}
      <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-5 border-t border-white/10">
        <QuickStat sector={sector} data={data} />
      </div>
    </div>
  )
}

function QuickStat({ sector, data }: { sector: string; data: DashboardData }) {
  let stats: { label: string; value: string | number; accent?: string }[] = []

  if (sector === 'crm') {
    stats = [
      { label: 'Müşteri', value: data.customers.total },
      { label: 'Açık Fırsat', value: data.deals.activeCount },
      { label: 'Açık Görev', value: data.tasks.openCount },
      { label: 'Bu Ay Ciro', value: formatCurrency(data.deals.revenueThisMonth), accent: 'text-emerald-300' },
    ]
  } else if (sector === 'cafe' && data.cafe) {
    stats = [
      { label: 'Aktif Masa', value: data.cafe.activeTables },
      { label: 'Bugünkü Sipariş', value: data.cafe.todayOrderCount },
      { label: 'Toplam Masa', value: data.cafe.totalTables },
      { label: 'Bugün Ciro', value: formatCurrency(data.cafe.todayRevenue), accent: 'text-emerald-300' },
    ]
  } else if (sector === 'market' && data.market) {
    stats = [
      { label: 'Bugünkü Fiş', value: data.market.todayTxCount },
      { label: 'Aktif Vardiya', value: data.market.activeShifts },
      { label: 'Stok Uyarısı', value: data.market.lowStockProducts, accent: data.market.lowStockProducts > 0 ? 'text-red-300' : 'text-emerald-300' },
      { label: 'Bugün Satış', value: formatCurrency(data.market.todayRevenue), accent: 'text-emerald-300' },
    ]
  } else if (sector === 'site' && data.site) {
    stats = [
      { label: 'Toplam Sakin', value: data.site.residentsCount },
      { label: 'Açık Şikayet', value: data.site.openComplaints, accent: data.site.openComplaints > 0 ? 'text-red-300' : 'text-emerald-300' },
      { label: 'Tahsilat Oranı', value: `%${data.site.collectionRate.toFixed(0)}`, accent: 'text-emerald-300' },
      { label: 'Bu Ay Tahsilat', value: formatCurrency(data.site.collectedThisMonth), accent: 'text-emerald-300' },
    ]
  } else if (sector === 'appointments' && data.appointments) {
    stats = [
      { label: 'Bugünkü Randevu', value: data.appointments.todayCount },
      { label: 'Bu Hafta', value: data.appointments.weekCount },
      { label: 'Bekleyen', value: data.appointments.pendingCount, accent: data.appointments.pendingCount > 0 ? 'text-amber-300' : 'text-emerald-300' },
      { label: 'Bugün Ciro', value: formatCurrency(data.appointments.todayRevenue), accent: 'text-emerald-300' },
    ]
  }

  return (
    <>
      {stats.map((s, i) => (
        <div key={i}>
          <div className="text-xs text-slate-400">{s.label}</div>
          <div className={cn('text-lg font-bold tabular-nums', s.accent ?? '')}>{s.value}</div>
        </div>
      ))}
    </>
  )
}

function SectorWelcomeBannerSkeleton({ sector }: { sector: string }) {
  const gradient = sector === 'cafe'
    ? 'from-slate-900 via-amber-900 to-slate-900'
    : sector === 'market'
      ? 'from-slate-900 via-emerald-900 to-slate-900'
      : sector === 'site'
        ? 'from-slate-900 via-violet-900 to-slate-900'
        : sector === 'appointments'
          ? 'from-slate-900 via-pink-900 to-slate-900'
          : 'from-slate-900 via-slate-800 to-emerald-900'
  return (
    <div className={cn('rounded-xl bg-gradient-to-br p-6 lg:p-7 h-48', gradient)} />
  )
}

// ============================================================
// CRM DASHBOARD — mevcut dashboard (CRM sektörü için)
// ============================================================
function CrmDashboard({ data }: { data: DashboardData }) {
  const { setView, openCustomer } = useAppStore()

  const kpis = [
    {
      label: 'Toplam Müşteri',
      value: data.customers.total,
      numericValue: data.customers.total,
      sub: `Bu ay +${data.customers.newThisMonth} yeni`,
      icon: Users,
      color: 'from-sky-500 to-blue-600',
      onClick: () => setView('customers'),
    },
    {
      label: 'Aktif Pipeline',
      value: formatCurrency(data.deals.totalPipelineValue),
      numericValue: data.deals.totalPipelineValue,
      sub: `${data.deals.activeCount} açık fırsat`,
      icon: TrendingUp,
      color: 'from-violet-500 to-purple-600',
      onClick: () => setView('pipeline'),
    },
    {
      label: 'Bu Ay Ciro',
      value: formatCurrency(data.deals.revenueThisMonth),
      numericValue: data.deals.revenueThisMonth,
      sub: `${data.deals.wonThisMonth} kazanıldı`,
      icon: DollarSign,
      color: 'from-emerald-500 to-teal-600',
      onClick: () => setView('pipeline'),
    },
    {
      label: 'Açık Görevler',
      value: data.tasks.openCount,
      numericValue: data.tasks.openCount,
      sub: data.tasks.overdueCount > 0 ? `${data.tasks.overdueCount} gecikmiş!` : 'Zamanında',
      icon: CheckSquare,
      color: data.tasks.overdueCount > 0 ? 'from-red-500 to-rose-600' : 'from-amber-500 to-orange-600',
      onClick: () => setView('tasks'),
    },
  ]

  const chartData = DEAL_STAGES
    .filter((s) => s.value !== 'kazanıldı' && s.value !== 'kaybedildi')
    .map((s) => {
      const found = data.pipelineByStage.find((p) => p.stage === s.value)
      return { stage: s.label, count: found?.count ?? 0, value: found?.totalValue ?? 0 }
    })

  return (
    <>
      {/* KPI kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <CrmKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* Bekleyen sevkiyatlar — sevk edilmemiş siparişler (ERP akışı) */}
      {data.shipments && data.shipments.orders.length > 0 && (
        <PendingShipmentsWidget shipments={data.shipments} showAmounts />
      )}

      {/* İkincil satır */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Pipeline grafiği */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Satış Hunisi</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setView('pipeline')} className="text-xs h-7">
                Tümü <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {chartData.every((d) => d.count === 0) ? (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                Açık fırsat yok.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="stage"
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) =>
                      name === 'value' ? [formatCurrency(value), 'Değer'] : [value, 'Fırsat']
                    }
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={60}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={['#94a3b8', '#0ea5e9', '#f59e0b', '#8b5cf6'][i % 4]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Yaklaşan görevler */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Yaklaşan Görevler</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setView('tasks')} className="text-xs h-7">
                Tümü <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[280px] overflow-y-auto custom-scroll">
            {data.upcomingTasks.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                <div className="text-center">
                  <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Önümüzdeki 7 günde görev yok.
                </div>
              </div>
            ) : (
              data.upcomingTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => task.customer && openCustomer(task.customer.id)}
                >
                  <div className={cn(
                    'w-2 h-2 rounded-full mt-1.5 shrink-0',
                    task.priority === 'acil' ? 'bg-red-500' :
                    task.priority === 'yuksek' ? 'bg-amber-500' :
                    task.priority === 'orta' ? 'bg-sky-500' : 'bg-gray-400'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{task.title}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(task.dueDate)}</span>
                      {task.customer && (
                        <>
                          <span>·</span>
                          <span className="truncate">{task.customer.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Aktivite trend grafiği */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Aktivite Trendi</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Son 30 gün · Toplam {data.activitiesOverTime.reduce((s, d) => s + d.count, 0)} aktivite</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Günlük aktivite</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {data.activitiesOverTime.every((d) => d.count === 0) ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              Son 30 günde aktivite kaydı yok
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={data.activitiesOverTime} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
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
                  interval={4}
                />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid hsl(var(--border))',
                    fontSize: '12px',
                  }}
                  labelFormatter={(v: string) => {
                    const d = new Date(v)
                    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
                  }}
                  formatter={(value: number) => [`${value} aktivite`, '']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#activityGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#10b981' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Son aktiviteler + İletişimsiz müşteriler */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Son aktiviteler */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Son Aktiviteler</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentActivities.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                Henüz aktivite kaydedilmedi.
              </div>
            ) : (
              <div className="space-y-1">
                {data.recentActivities.slice(0, 8).map((act) => {
                  const Icon = ACTIVITY_ICONS[act.type] ?? Phone
                  return (
                    <div
                      key={act.id}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => act.customer && openCustomer(act.customer.id)}
                    >
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                        ACTIVITY_COLORS[act.type] ?? 'text-gray-600 bg-gray-50',
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{act.subject}</span>
                          {act.outcome && (
                            <Badge variant="outline" className={cn(
                              'text-[10px] px-1.5 py-0 h-4',
                              act.outcome === 'basarili' ? 'text-emerald-600 border-emerald-200' :
                              act.outcome === 'basarisiz' ? 'text-red-600 border-red-200' :
                              'text-amber-600 border-amber-200'
                            )}>
                              {act.outcome}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {act.customer && <span className="truncate">{act.customer.name}</span>}
                          <span>·</span>
                          <span>{act.user?.name ?? 'Bilinmiyor'}</span>
                          <span>·</span>
                          <span>{formatRelative(act.date)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* İletişimsiz müşteriler uyarısı */}
        <Card className="border-amber-200 dark:border-amber-900/50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <CardTitle className="text-base">Dikkat Gerekli</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">İletişimsiz Müşteriler</span>
                <span className="text-lg font-bold text-amber-600">{data.customers.staleCount}</span>
              </div>
              <p className="text-xs text-muted-foreground">30+ gündür iletişim kurulmamış</p>
              <Progress value={data.customers.total > 0 ? (data.customers.staleCount / data.customers.total) * 100 : 0} className="h-1.5 mt-2" />
            </div>

            <div className="p-3 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Gecikmiş Görevler</span>
                <span className="text-lg font-bold text-red-600">{data.tasks.overdueCount}</span>
              </div>
              <p className="text-xs text-muted-foreground">Acilen tamamlanmalı</p>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setView('customers')}
            >
              <Users className="w-4 h-4 mr-1.5" />
              Müşterileri Gör
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

// ============================================================
// Bekleyen Sevkiyatlar widget — sevk edilmemiş siparişler
// ERP akışı: hazırlanıyor / onaylandı / üretimde durumundaki
// siparişler termin tarihine göre listelenir. Depo rolünde
// tutarlar gizlidir (showAmounts=false).
// ============================================================
function PendingShipmentsWidget({
  shipments,
  showAmounts = true,
}: {
  shipments: NonNullable<DashboardData['shipments']>
  showAmounts?: boolean
}) {
  const { setView } = useAppStore()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm shrink-0">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-base leading-tight">Bekleyen Sevkiyatlar</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sevk edilmeyi bekleyen <span className="font-semibold text-foreground">{shipments.pendingCount}</span> sipariş
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setView('irsaliye')}>
            Belge Yönetimi <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/60 max-h-[320px] overflow-y-auto custom-scroll">
          {shipments.orders.map((order) => {
            const meta = getOrderStatusMeta(order.status)
            const StatusIcon = meta.icon
            const overdue =
              order.expectedDelivery != null && new Date(order.expectedDelivery) < today
            return (
              <div
                key={order.id}
                role="button"
                tabIndex={0}
                aria-label={`${order.number} sipariş detayı`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-muted/50"
                onClick={() => setView('orders')}
                onKeyDown={(e) => e.key === 'Enter' && setView('orders')}
              >
                <div className={cn(
                  'w-9 h-9 rounded-lg border flex items-center justify-center shrink-0',
                  meta.color,
                )}>
                  <StatusIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{order.number}</span>
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4.5', meta.color)}>
                      {meta.label}
                    </Badge>
                    {overdue && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30 animate-pulse">
                        Termin geçti
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {order.customer?.name ?? 'Müşteri yok'}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {order.expectedDelivery ? (
                    <div className={cn(
                      'text-xs font-medium flex items-center gap-1 justify-end',
                      overdue ? 'text-red-600' : 'text-muted-foreground',
                    )}>
                      <Clock className="w-3 h-3" />
                      {formatDate(order.expectedDelivery)}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground/60">Termin yok</div>
                  )}
                  {showAmounts && order.totalAmount != null && (
                    <div className="text-sm font-semibold mt-0.5">
                      {formatCurrency(order.totalAmount, order.currency || 'TRY')}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// CRM KPI kartı — count-up animasyonlu
interface KpiData {
  label: string
  value: string | number
  numericValue: number
  sub: string
  icon: typeof Users
  color: string
  onClick: () => void
}

function CrmKpiCard({ kpi }: { kpi: KpiData }) {
  const animated = useCountUp(kpi.numericValue, 900)
  const displayValue = typeof kpi.value === 'string' && kpi.value.includes('₺')
    ? formatCurrency(animated, 'TRY')
    : typeof kpi.value === 'number'
      ? animated
      : kpi.value

  return (
    <Card
      className="relative overflow-hidden cursor-pointer hover:shadow-md transition-all duration-300 group hover:-translate-y-0.5"
      onClick={kpi.onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={cn('w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm', kpi.color)}>
            <kpi.icon className="w-5 h-5 text-white" />
          </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
        </div>
        <div className="text-2xl font-bold tracking-tight">{displayValue}</div>
        <div className="text-sm text-muted-foreground mt-0.5">{kpi.label}</div>
        <div className="text-xs text-muted-foreground/80 mt-1.5">{kpi.sub}</div>
      </CardContent>
    </Card>
  )
}
