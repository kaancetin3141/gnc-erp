'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, qk } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, CartesianGrid,
} from 'recharts'
import {
  BarChart3, TrendingUp, Trophy, Target, DollarSign, Filter,
  Download, FileSpreadsheet, Users, MapPin, Activity as ActivityIcon,
  Phone, Mail, MessageCircle, StickyNote, CheckSquare,
  ArrowUpRight, ArrowDownRight, Calendar, AlertTriangle, Crown,
  ChevronUp, ChevronDown, UserCog, Building2, ListChecks, Plus,
  LineChart as LineChartIcon, PieChart as PieChartIcon,
  ClipboardList, ShieldX,
} from 'lucide-react'
import {
  formatCurrency, formatDate, formatCompactNumber, toCSV, downloadFile,
  daysSince,
} from '@/lib/format'
import {
  DEAL_STAGES, ACTIVITY_TYPES, LOSS_REASONS,
  getLabel,
} from '@/lib/constants'
import { cn } from '@/lib/utils'
import { DailyReportView } from '@/components/reports/daily-report'
import { getTenantSector, SECTOR_META } from '@/lib/tenant-sector'
import {
  CafeReports, MarketReports, SiteReports, AppointmentsReports,
} from './sector-reports'
import type {
  CafeReportsData, MarketReportsData,
  SiteReportsData, AppointmentsReportsData,
} from './types'

// ------------------------------------------------------------
// Tipler — API yanıt şeması
// ------------------------------------------------------------
interface ReportsData {
  pipeline: { stage: string; count: number; totalValue: number }[]
  totalPipelineValue: number
  winRate: number
  wonCount: number
  lostCount: number
  lossReasons: { reason: string; count: number }[]
  revenueByMonth: { month: string; total: number; count: number }[]
  totalRevenue: number
  topCustomers: {
    id: string; name: string; total: number; count: number
    lastActivityAt: string | null
  }[]
  staleCustomersCount: number
  staleCustomers: {
    id: string; name: string; city: string | null
    ownerId: string | null; ownerName: string | null
    lastActivityAt: string | null
  }[]
  mapsLeadConversion: {
    totalLeads: number
    contactedCount: number
    qualifiedCount: number
    convertedCount: number
    conversionRate: number
    byCity: { city: string; count: number }[]
  }
  activityByType: { type: string; count: number }[]
  activitiesOverTime: { date: string; count: number }[]
  repPerformance: {
    id: string; name: string; title: string | null; role: string
    activityCount: number; dealsWon: number; totalWonValue: number
    winRate: number
  }[]
  erp?: {
    products: {
      total: number
      stockValue: number
      lowStockCount: number
      outOfStockCount: number
      topByValue: { name: string; stockValue: number; stock: number }[]
    }
    invoices: {
      total: number
      totalInvoiced: number
      totalPaid: number
      totalPending: number
      totalOverdue: number
      paidCount: number
      pendingCount: number
      overdueCount: number
      revenueByMonth: { month: string; value: number }[]
    }
    quotes: {
      total: number
      pendingCount: number
      approvedCount: number
      totalValue: number
      conversionRate: number
    }
  }
  // Sektör bazlı alanlar (non-CRM sectors)
  sector?: string
  range?: string
  cafe?: CafeReportsData['cafe']
  market?: MarketReportsData['market']
  site?: SiteReportsData['site']
  appointments?: AppointmentsReportsData['appointments']
}

// ------------------------------------------------------------
// Renk paleti — emerald, teal, amber, violet, rose, sky, slate
// ------------------------------------------------------------
const PALETTE = {
  emerald: '#10b981',
  teal: '#14b8a6',
  amber: '#f59e0b',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  sky: '#0ea5e9',
  slate: '#64748b',
}

const STAGE_COLORS: Record<string, string> = {
  yeni: PALETTE.slate,
  iletisim: PALETTE.sky,
  teklif: PALETTE.amber,
  muzakere: PALETTE.violet,
  kazanildi: PALETTE.emerald,
  kaybedildi: PALETTE.rose,
}

const ACTIVITY_COLOR_HEX: Record<string, string> = {
  arama: PALETTE.emerald,
  toplanti: PALETTE.violet,
  email: PALETTE.sky,
  whatsapp: PALETTE.teal,
  not: PALETTE.amber,
  ziyaret: PALETTE.rose,
  gorev: PALETTE.slate,
}

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  arama: Phone, toplanti: Users, email: Mail, whatsapp: MessageCircle,
  not: StickyNote, ziyaret: MapPin, gorev: CheckSquare,
}

const LOSS_COLOR_HEX: Record<string, string> = {
  'Fiyat çok yüksek': PALETTE.rose,
  'Rakibi tercih etti': PALETTE.violet,
  'Bütçe yok': PALETTE.amber,
  'Zamanlama uygun değil': PALETTE.teal,
  'Karar verici ulaşılabilir değil': PALETTE.sky,
  'İhtiyaç yok': PALETTE.slate,
  'Ürün/hizmet uygun değil': PALETTE.emerald,
  'Diğer': PALETTE.slate,
  'Belirtilmemiş': PALETTE.slate,
}

// ------------------------------------------------------------
// Tarih aralığı seçenekleri
// ------------------------------------------------------------
const DATE_RANGES = [
  { value: '7d', label: 'Son 7 gün' },
  { value: '30d', label: 'Son 30 gün' },
  { value: '90d', label: 'Son 90 gün' },
  { value: '6m', label: 'Son 6 ay' },
  { value: '1y', label: 'Son 1 yıl' },
  { value: 'all', label: 'Tüm zamanlar' },
]

// ------------------------------------------------------------
// Yardımcılar
// ------------------------------------------------------------
function exportCSV(rows: Record<string, unknown>[], filename: string, sectionLabel: string) {
  if (!rows.length) {
    toast.error('Dışa aktarılacak veri yok', { description: `${sectionLabel} için kayıt bulunamadı.` })
    return
  }
  const csv = toCSV(rows)
  downloadFile(csv, filename, 'text/csv;charset=utf-8')
  toast.success('CSV dışa aktarıldı', { description: `${filename} indirildi.` })
}

function exportXLSX(rows: Record<string, unknown>[], filename: string, sectionLabel: string) {
  if (!rows.length) {
    toast.error('Dışa aktarılacak veri yok', { description: `${sectionLabel} için kayıt bulunamadı.` })
    return
  }
  // Excel'in açabileceği basit HTML tablosu
  const headers = Object.keys(rows[0])
  const escapeHtml = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
  const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${headers.map((h) => `<td>${escapeHtml(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
  downloadFile('\uFEFF' + html, filename, 'application/vnd.ms-excel;charset=utf-8')
  toast.success('XLSX dışa aktarıldı', { description: `${filename} indirildi.` })
}

// Ay kısaltması: "2024-08" → "Ağu 24"
function formatMonthLabel(m: string): string {
  const [y, mo] = m.split('-')
  const monthIdx = parseInt(mo, 10) - 1
  const names = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${names[monthIdx] ?? mo} ${y.slice(2)}`
}

// "2024-08-15" → "15.08"
function formatDayLabel(d: string): string {
  const [, m, day] = d.split('-')
  return `${day}.${m}`
}

// ------------------------------------------------------------
// Tooltip formatter yardımcıları
// ------------------------------------------------------------
const chartTooltipStyle = {
  borderRadius: '10px',
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

// ============================================================
// ANA BİLEŞEN — Sektör bazlı dispatch
// ============================================================
export function ReportsView() {
  const openCustomer = useAppStore((s) => s.openCustomer)
  const user = useAppStore((s) => s.user)
  const sector = getTenantSector(user?.tenant.name)
  const sectorMeta = SECTOR_META[sector]
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | '6m' | '1y' | 'all'>('6m')
  const [dailyReportOpen, setDailyReportOpen] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: qk.reports(dateRange),
    queryFn: () => apiGet<ReportsData>(`/api/reports?range=${dateRange}`),
    refetchInterval: 60_000,
    // PRIVACY-TEMPLATES (#3): depo rolü raporlara erişemez — sorguyu atla
    enabled: user?.role !== 'stock',
  })

  // PRIVACY-TEMPLATES (#3): depo rolü raporları görüntüleyemez
  if (user?.role === 'stock') {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <Card className="p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-4">
            <ShieldX className="w-7 h-7 text-red-500" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Yetkisiz Erişim</h3>
          <p className="text-sm text-muted-foreground">
            Depo rolü için satış raporlarına erişim kısıtlıdır.
            Yalnızca yönetici ve admin rolleri raporları görüntüleyebilir.
          </p>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return <ReportsSkeleton sector={sector} />
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <Card className="p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-rose-500" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Raporlar yüklenemedi</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Veriler alınırken bir hata oluştu. Lütfen tekrar deneyin.
          </p>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1.5" /> Yeniden dene
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in pb-6">
      <ReportsHeader
        sector={sector}
        sectorMeta={sectorMeta}
        dateRange={dateRange}
        onDateChange={setDateRange}
        onOpenDailyReport={sector === 'crm' ? () => setDailyReportOpen(true) : undefined}
        onExportAll={sector === 'crm' ? () => exportXLSX(buildFullReport(data), 'rapor-tamami.xls', 'Tüm rapor') : undefined}
      />

      {/* Sektör bazlı içerik */}
      {sector === 'crm' && <CrmReports data={data} openCustomer={openCustomer} />}
      {sector === 'cafe' && data.cafe && <CafeReports data={{ sector: 'cafe', cafe: data.cafe }} />}
      {sector === 'market' && data.market && <MarketReports data={{ sector: 'market', market: data.market }} />}
      {sector === 'site' && data.site && <SiteReports data={{ sector: 'site', site: data.site }} />}
      {sector === 'appointments' && data.appointments && (
        <AppointmentsReports data={{ sector: 'appointments', appointments: data.appointments }} />
      )}

      {/* Gün Sonu Raporu Dialog — yalnızca CRM sektöründe */}
      {sector === 'crm' && (
        <DailyReportView open={dailyReportOpen} onClose={() => setDailyReportOpen(false)} />
      )}
    </div>
  )
}

// ============================================================
// Sektör bazlı header
// ============================================================
function ReportsHeader({
  sector, sectorMeta, dateRange, onDateChange, onOpenDailyReport, onExportAll,
}: {
  sector: string
  sectorMeta: { label: string; emoji: string; shortLabel: string }
  dateRange: '7d' | '30d' | '90d' | '6m' | '1y' | 'all'
  onDateChange: (v: '7d' | '30d' | '90d' | '6m' | '1y' | 'all') => void
  onOpenDailyReport?: () => void
  onExportAll?: () => void
}) {
  const title = sector === 'crm' ? 'Raporlar & Analiz'
    : sector === 'cafe' ? 'Kafe Raporları'
    : sector === 'market' ? 'Market Raporları'
    : sector === 'site' ? 'Site Yönetim Raporları'
    : sector === 'appointments' ? 'Randevu Raporları'
    : 'Raporlar'
  const subtitle = sector === 'crm'
    ? 'Satış performansı, pipeline ve müşteri dönüşüm metrikleri'
    : `${sectorMeta.emoji} ${sectorMeta.label} sektör raporları`

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {onOpenDailyReport && (
          <Button
            variant="default"
            size="sm"
            onClick={onOpenDailyReport}
            className="bg-violet-600 hover:bg-violet-700"
          >
            <ClipboardList className="w-4 h-4 mr-1.5" /> Gün Sonu Raporu
          </Button>
        )}
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={dateRange} onValueChange={(v) => onDateChange(v as '7d' | '30d' | '90d' | '6m' | '1y' | 'all')}>
          <SelectTrigger size="sm" className="w-[150px]">
            <Calendar className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onExportAll && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExportAll}
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Tümünü Dışe Aktar
          </Button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// CRM Raporları — Mevcut 10 bölümün sarmalı bileşeni
// ============================================================
function CrmReports({ data, openCustomer }: { data: ReportsData; openCustomer: (id: string) => void }) {
  const user = useAppStore((s) => s.user)

  // PRIVACY-TEMPLATES (#3): rep rolü yalnızca kendi istatistiklerini görmeli
  // (diğer temsilcilerin performansı gizli)
  const visibleRepPerformance =
    user?.role === 'rep'
      ? data.repPerformance.filter((r) => r.id === user.id)
      : data.repPerformance

  // Toplam ciro = kazanılan tüm fırsatların değeri
  const totalRevenue = data.totalRevenue ?? data.revenueByMonth.reduce((s, m) => s + m.total, 0)
  const mapsConvRate = data.mapsLeadConversion.conversionRate
  const totalClosed = data.wonCount + data.lostCount

  return (
    <>
      {/* ===== SECTION 1 — KPI SUMMARY ===== */}
      <KpiSummary
        pipelineValue={data.totalPipelineValue}
        winRate={data.winRate}
        conversionRate={mapsConvRate}
        totalRevenue={totalRevenue}
        wonCount={data.wonCount}
        lostCount={data.lostCount}
        mapsLeads={data.mapsLeadConversion.totalLeads}
        onExport={() => exportCSV([
          {
            'Metrik': 'Toplam Pipeline Değeri',
            'Değer': data.totalPipelineValue,
          },
          { 'Metrik': 'Kazanma Oranı (%)', 'Değer': data.winRate },
          { 'Metrik': 'Dönüşüm Oranı (%)', 'Değer': mapsConvRate },
          { 'Metrik': 'Toplam Ciro', 'Değer': totalRevenue },
          { 'Metrik': 'Kazanılan Fırsat', 'Değer': data.wonCount },
          { 'Metrik': 'Kaybedilen Fırsat', 'Değer': data.lostCount },
          { 'Metrik': 'Maps Lead', 'Değer': data.mapsLeadConversion.totalLeads },
        ], 'kpi-ozeti.csv', 'KPI Özeti')}
      />

      {/* ===== SECTION 2 — SALES FUNNEL ===== */}
      <SalesFunnelCard
        pipeline={data.pipeline}
        onExportCsv={() => exportCSV(
          data.pipeline.map((p) => ({
            'Aşama': getLabel(DEAL_STAGES, p.stage),
            'Aşama Kodu': p.stage,
            'Fırsat Sayısı': p.count,
            'Toplam Değer (TRY)': p.totalValue,
          })),
          'satishunisi.csv',
          'Satış Hunisi',
        )}
        onExportXlsx={() => exportXLSX(
          data.pipeline.map((p) => ({
            'Aşama': getLabel(DEAL_STAGES, p.stage),
            'Aşama Kodu': p.stage,
            'Fırsat Sayısı': p.count,
            'Toplam Değer (TRY)': p.totalValue,
          })),
          'satishunisi.xls',
          'Satış Hunisi',
        )}
      />

      {/* ===== SECTION 3 — REVENUE TREND ===== */}
      <RevenueTrendCard
        revenueByMonth={data.revenueByMonth}
        onExportCsv={() => exportCSV(
          data.revenueByMonth.map((m) => ({
            'Ay': m.month,
            'Ciro (TRY)': m.total,
            'Kazanılan Fırsat': m.count,
          })),
          'ciro-trendi.csv',
          'Ciro Trendi',
        )}
        onExportXlsx={() => exportXLSX(
          data.revenueByMonth.map((m) => ({
            'Ay': m.month,
            'Ciro (TRY)': m.total,
            'Kazanılan Fırsat': m.count,
          })),
          'ciro-trendi.xls',
          'Ciro Trendi',
        )}
      />

      {/* ===== SECTION 4 — WIN/LOSS ANALYSIS ===== */}
      <WinLossAnalysisCard
        wonCount={data.wonCount}
        lostCount={data.lostCount}
        winRate={data.winRate}
        lossReasons={data.lossReasons}
        totalClosed={totalClosed}
        onExportCsv={() => exportCSV(
          data.lossReasons.map((l) => ({
            'Kayıp Nedeni': l.reason,
            'Fırsat Sayısı': l.count,
          })),
          'kazan-kayip-analizi.csv',
          'Kazan/Kayıp Analizi',
        )}
        onExportXlsx={() => exportXLSX(
          data.lossReasons.map((l) => ({
            'Kayıp Nedeni': l.reason,
            'Fırsat Sayısı': l.count,
          })),
          'kazan-kayip-analizi.xls',
          'Kazan/Kayıp Analizi',
        )}
      />

      {/* ===== SECTION 5 — MAPS LEAD CONVERSION ===== */}
      <MapsConversionCard
        conv={data.mapsLeadConversion}
        onExportCsv={() => exportCSV(
          data.mapsLeadConversion.byCity.map((c) => ({
            'Şehir': c.city,
            'Lead Sayısı': c.count,
            'Toplam Lead': data.mapsLeadConversion.totalLeads,
            'Dönüşüm Oranı (%)': data.mapsLeadConversion.conversionRate,
          })),
          'maps-donusum.csv',
          'Maps Dönüşüm',
        )}
        onExportXlsx={() => exportXLSX(
          data.mapsLeadConversion.byCity.map((c) => ({
            'Şehir': c.city,
            'Lead Sayısı': c.count,
            'Toplam Lead': data.mapsLeadConversion.totalLeads,
            'Dönüşüm Oranı (%)': data.mapsLeadConversion.conversionRate,
          })),
          'maps-donusum.xls',
          'Maps Dönüşüm',
        )}
      />

      {/* ===== SECTION 6 — ACTIVITY PERFORMANCE ===== */}
      <ActivityPerformanceCard
        activityByType={data.activityByType}
        activitiesOverTime={data.activitiesOverTime}
        onExportTypeCsv={() => exportCSV(
          data.activityByType.map((a) => ({
            'Aktivite Tipi': getLabel(ACTIVITY_TYPES, a.type),
            'Tip Kodu': a.type,
            'Sayı': a.count,
          })),
          'aktivite-tipi.csv',
          'Aktivite Tipleri',
        )}
        onExportTimeCsv={() => exportCSV(
          data.activitiesOverTime.map((a) => ({
            'Tarih': a.date,
            'Aktivite Sayısı': a.count,
          })),
          'aktivite-zaman.csv',
          'Aktivite Zaman',
        )}
      />

      {/* ===== SECTION 7 — REP PERFORMANCE ===== */}
      <RepPerformanceCard
        reps={visibleRepPerformance}
        onExportCsv={() => exportCSV(
          visibleRepPerformance.map((r) => ({
            'Temsilci': r.name,
            'Pozisyon': r.title ?? '',
            'Rol': r.role,
            'Aktivite Sayısı': r.activityCount,
            'Kazanılan Fırsat': r.dealsWon,
            'Kazanılan Değer (TRY)': r.totalWonValue,
            'Kazanma Oranı (%)': r.winRate,
          })),
          'temsilci-performans.csv',
          'Temsilci Performansı',
        )}
        onExportXlsx={() => exportXLSX(
          visibleRepPerformance.map((r) => ({
            'Temsilci': r.name,
            'Pozisyon': r.title ?? '',
            'Rol': r.role,
            'Aktivite Sayısı': r.activityCount,
            'Kazanılan Fırsat': r.dealsWon,
            'Kazanılan Değer (TRY)': r.totalWonValue,
            'Kazanma Oranı (%)': r.winRate,
          })),
          'temsilci-performans.xls',
          'Temesilci Performansı',
        )}
      />

      {/* ===== SECTION 8 — TOP CUSTOMERS ===== */}
      <TopCustomersCard
        customers={data.topCustomers}
        onOpenCustomer={openCustomer}
        onExportCsv={() => exportCSV(
          data.topCustomers.map((c, i) => ({
            'Sıra': i + 1,
            'Müşteri': c.name,
            'Toplam Değer (TRY)': c.total,
            'Fırsat Sayısı': c.count,
            'Son Aktivite': c.lastActivityAt ?? '',
          })),
          'en-iyi-musteriler.csv',
          'En İyi Müşteriler',
        )}
        onExportXlsx={() => exportXLSX(
          data.topCustomers.map((c, i) => ({
            'Sıra': i + 1,
            'Müşteri': c.name,
            'Toplam Değer (TRY)': c.total,
            'Fırsat Sayısı': c.count,
            'Son Aktivite': c.lastActivityAt ?? '',
          })),
          'en-iyi-musteriler.xls',
          'En İyi Müşteriler',
        )}
      />

      {/* ===== SECTION 9 — STALE CUSTOMERS ===== */}
      <StaleCustomersCard
        stale={data.staleCustomers}
        staleCount={data.staleCustomersCount}
        onOpenCustomer={openCustomer}
        onExportCsv={() => exportCSV(
          data.staleCustomers.map((c) => {
            const ds = daysSince(c.lastActivityAt)
            return {
              'Müşteri': c.name,
              'Şehir': c.city ?? '',
              'Sorumlu': c.ownerName ?? 'Atanmamış',
              'Son Aktivite Tarihi': c.lastActivityAt ?? '',
              'Gün Sayısı': ds === null ? 'İletişim yok' : ds,
            }
          }),
          'iletisimsiz-musteriler.csv',
          'İletişimsiz Müşteriler',
        )}
        onExportXlsx={() => exportXLSX(
          data.staleCustomers.map((c) => {
            const ds = daysSince(c.lastActivityAt)
            return {
              'Müşteri': c.name,
              'Şehir': c.city ?? '',
              'Sorumlu': c.ownerName ?? 'Atanmamış',
              'Son Aktivite Tarihi': c.lastActivityAt ?? '',
              'Gün Sayısı': ds === null ? 'İletişim yok' : ds,
            }
          }),
          'iletisimsiz-musteriler.xls',
          'İletişimsiz Müşteriler',
        )}
      />

      {/* ===== SECTION 10 — ERP LİTE METRİKLER ===== */}
      {data.erp && (() => {
        const erp = data.erp!
        return (
          <ErpMetricsCard erp={erp} onExportCsv={() => {
            const rows: Record<string, string | number>[] = []
            rows.push({ 'Kategori': 'Ürün', 'Metrik': 'Toplam Ürün', 'Değer': erp.products.total })
            rows.push({ 'Kategori': 'Ürün', 'Metrik': 'Stok Değeri (TRY)', 'Değer': erp.products.stockValue })
            rows.push({ 'Kategori': 'Ürün', 'Metrik': 'Düşük Stok', 'Değer': erp.products.lowStockCount })
            rows.push({ 'Kategori': 'Ürün', 'Metrik': 'Tükenmiş', 'Değer': erp.products.outOfStockCount })
            rows.push({ 'Kategori': 'Fatura', 'Metrik': 'Toplam Fatura', 'Değer': erp.invoices.total })
            rows.push({ 'Kategori': 'Fatura', 'Metrik': 'Toplam Tutar (TRY)', 'Değer': erp.invoices.totalInvoiced })
            rows.push({ 'Kategori': 'Fatura', 'Metrik': 'Ödenen', 'Değer': erp.invoices.totalPaid })
            rows.push({ 'Kategori': 'Fatura', 'Metrik': 'Bekleyen', 'Değer': erp.invoices.totalPending })
            rows.push({ 'Kategori': 'Fatura', 'Metrik': 'Geciken', 'Değer': erp.invoices.totalOverdue })
            rows.push({ 'Kategori': 'Teklif', 'Metrik': 'Toplam Teklif', 'Değer': erp.quotes.total })
            rows.push({ 'Kategori': 'Teklif', 'Metrik': 'Bekleyen', 'Değer': erp.quotes.pendingCount })
            rows.push({ 'Kategori': 'Teklif', 'Metrik': 'Onaylanan', 'Değer': erp.quotes.approvedCount })
            rows.push({ 'Kategori': 'Teklif', 'Metrik': 'Dönüşüm Oranı (%)', 'Değer': erp.quotes.conversionRate })
            exportCSV(rows, 'erp-metrikleri.csv', 'ERP Metrikleri')
          }} />
        )
      })()}
    </>
  )
}

// ============================================================
// Bölümler — KPI Summary
// ============================================================
function KpiSummary({
  pipelineValue, winRate, conversionRate, totalRevenue,
  wonCount, lostCount, mapsLeads, onExport,
}: {
  pipelineValue: number
  winRate: number
  conversionRate: number
  totalRevenue: number
  wonCount: number
  lostCount: number
  mapsLeads: number
  onExport: () => void
}) {
  const kpis = [
    {
      label: 'Toplam Pipeline Değeri',
      value: formatCurrency(pipelineValue),
      sub: 'Açık fırsatlar',
      icon: TrendingUp,
      gradient: 'from-emerald-500 to-teal-600',
      ring: 'ring-emerald-100 dark:ring-emerald-900/30',
    },
    {
      label: 'Kazanma Oranı',
      value: `%${winRate}`,
      sub: `${wonCount} kazanıldı / ${lostCount} kaybedildi`,
      icon: Trophy,
      gradient: 'from-amber-500 to-orange-600',
      ring: 'ring-amber-100 dark:ring-amber-900/30',
    },
    {
      label: 'Dönüşüm Oranı',
      value: `%${conversionRate}`,
      sub: `${mapsLeads} maps lead`,
      icon: Target,
      gradient: 'from-violet-500 to-purple-600',
      ring: 'ring-violet-100 dark:ring-violet-900/30',
    },
    {
      label: 'Toplam Ciro',
      value: formatCurrency(totalRevenue),
      sub: `${wonCount} kazanılan fırsat`,
      icon: DollarSign,
      gradient: 'from-sky-500 to-cyan-600',
      ring: 'ring-sky-100 dark:ring-sky-900/30',
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            KPI Özeti
          </h3>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onExport}>
          <Download className="w-3 h-3 mr-1" /> CSV
        </Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className={cn('relative overflow-hidden ring-1', kpi.ring)}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={cn('w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm', kpi.gradient)}>
                  <kpi.icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight">{kpi.value}</div>
              <div className="text-sm text-muted-foreground mt-0.5">{kpi.label}</div>
              <div className="text-xs text-muted-foreground/80 mt-1.5">{kpi.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Bölüm 2 — Satış Hunisi
// ============================================================
function SalesFunnelCard({
  pipeline, onExportCsv, onExportXlsx,
}: {
  pipeline: { stage: string; count: number; totalValue: number }[]
  onExportCsv: () => void
  onExportXlsx: () => void
}) {
  // DEAL_STAGES sırasına göre düzenle
  const chartData = DEAL_STAGES.map((s) => {
    const found = pipeline.find((p) => p.stage === s.value)
    return {
      stage: s.label,
      stageKey: s.value,
      count: found?.count ?? 0,
      totalValue: found?.totalValue ?? 0,
      fill: STAGE_COLORS[s.value] ?? PALETTE.slate,
    }
  })
  const isEmpty = chartData.every((d) => d.count === 0)
  const maxValue = Math.max(...chartData.map((d) => d.totalValue), 1)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
              </div>
              <CardTitle>Satış Hunisi</CardTitle>
            </div>
            <CardDescription>Aşama bazında fırsat sayısı ve değer</CardDescription>
          </div>
          <ExportButtons onCsv={onExportCsv} onXlsx={onExportXlsx} />
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            icon={BarChart3}
            title="Henüz fırsat yok"
            description="Pipeline'a fırsat eklendiğinde huni burada görünecek."
          />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="stage"
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number, name: string) => {
                  if (name === 'totalValue') return [formatCurrency(value), 'Toplam Değer']
                  return [value, 'Fırsat Sayısı']
                }}
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
              />
              <Legend
                formatter={(value) => value === 'count' ? 'Fırsat Sayısı' : 'Toplam Değer'}
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
              <Bar dataKey="count" name="count" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Bar>
              <Bar dataKey="totalValue" name="totalValue" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {chartData.map((d, i) => (
                  <Cell key={`v-${i}`} fill={d.fill} opacity={0.4} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Stage özet listesi */}
        {!isEmpty && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {chartData.map((d) => (
              <div key={d.stageKey} className="rounded-lg border p-2.5 bg-muted/30">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: d.fill }}
                  />
                  <span className="text-xs text-muted-foreground truncate">{d.stage}</span>
                </div>
                <div className="text-sm font-semibold">{d.count} fırsat</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatCurrency(d.totalValue)}
                </div>
                <Progress
                  value={(d.totalValue / maxValue) * 100}
                  className="h-1 mt-1.5"
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Bölüm 3 — Ciro Trendi
// ============================================================
function RevenueTrendCard({
  revenueByMonth, onExportCsv, onExportXlsx,
}: {
  revenueByMonth: { month: string; total: number; count: number }[]
  onExportCsv: () => void
  onExportXlsx: () => void
}) {
  const chartData = revenueByMonth.map((m) => ({
    ...m,
    label: formatMonthLabel(m.month),
  }))
  const isEmpty = chartData.every((d) => d.total === 0)
  const totalRevenue = chartData.reduce((s, d) => s + d.total, 0)
  const avgRevenue = totalRevenue / Math.max(chartData.length, 1)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-amber-600" />
              </div>
              <CardTitle>Ciro Trendi</CardTitle>
            </div>
            <CardDescription>Son 6 ay — kazanılan fırsatların cirosu</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Toplam</div>
              <div className="text-sm font-semibold">{formatCurrency(totalRevenue)}</div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-xs text-muted-foreground">Aylık Ort.</div>
              <div className="text-sm font-semibold">{formatCurrency(avgRevenue)}</div>
            </div>
            <ExportButtons onCsv={onExportCsv} onXlsx={onExportXlsx} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            icon={TrendingUp}
            title="Ciro verisi yok"
            description="Son 6 ayda kazanılan fırsat bulunmuyor."
          />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE.amber} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={PALETTE.amber} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={70}
                tickFormatter={(v) => formatCompactNumber(v)}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number, name: string) => {
                  if (name === 'total') return [formatCurrency(value), 'Ciro']
                  return [value, 'Fırsat']
                }}
              />
              <Area
                type="monotone"
                dataKey="total"
                name="total"
                stroke={PALETTE.amber}
                strokeWidth={2.5}
                fill="url(#revGrad)"
                dot={{ r: 4, fill: PALETTE.amber, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: PALETTE.amber }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Bölüm 4 — Kazan/Kayıp Analizi
// ============================================================
function WinLossAnalysisCard({
  wonCount, lostCount, winRate, lossReasons, totalClosed,
  onExportCsv, onExportXlsx,
}: {
  wonCount: number
  lostCount: number
  winRate: number
  lossReasons: { reason: string; count: number }[]
  totalClosed: number
  onExportCsv: () => void
  onExportXlsx: () => void
}) {
  const pieData = [
    { name: 'Kazanıldı', value: wonCount, fill: PALETTE.emerald },
    { name: 'Kaybedildi', value: lostCount, fill: PALETTE.rose },
  ]
  const isEmpty = totalClosed === 0
  const maxLoss = Math.max(...lossReasons.map((l) => l.count), 1)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
                <PieChartIcon className="w-4 h-4 text-rose-600" />
              </div>
              <CardTitle>Kazan / Kayıp Analizi</CardTitle>
            </div>
            <CardDescription>Kapanan fırsatların kazan/kayıp dağılımı ve kayıp nedenleri</CardDescription>
          </div>
          <ExportButtons onCsv={onExportCsv} onXlsx={onExportXlsx} />
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            icon={PieChartIcon}
            title="Kapanan fırsat yok"
            description="Henüz kazanılan veya kaybedilen fırsat bulunmuyor."
          />
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Donut chart */}
            <div className="space-y-3">
              <div className="relative">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number, name: string) => {
                        const pct = totalClosed > 0 ? Math.round((value / totalClosed) * 100) : 0
                        return [`${value} (%${pct})`, name]
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Orta daire — kazanma oranı */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-xs text-muted-foreground">Kazanma</div>
                  <div className="text-3xl font-bold text-emerald-600">%{winRate}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{wonCount}/{totalClosed}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border p-3 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <div className="flex items-center gap-1.5">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs text-muted-foreground">Kazanıldı</span>
                  </div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">{wonCount}</div>
                </div>
                <div className="rounded-lg border p-3 bg-rose-50/50 dark:bg-rose-950/20">
                  <div className="flex items-center gap-1.5">
                    <ArrowDownRight className="w-3.5 h-3.5 text-rose-600" />
                    <span className="text-xs text-muted-foreground">Kaybedildi</span>
                  </div>
                  <div className="text-xl font-bold text-rose-600 mt-1">{lostCount}</div>
                </div>
              </div>
            </div>

            {/* Loss reasons — yatay bar */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h4 className="text-sm font-semibold">Kayıp Nedenleri</h4>
              </div>
              {lossReasons.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
                  Kayıp nedeni kaydedilmemiş.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[260px] overflow-y-auto custom-scroll pr-1">
                  {lossReasons.map((l) => {
                    const color = LOSS_COLOR_HEX[l.reason] ?? PALETTE.slate
                    const pct = (l.count / maxLoss) * 100
                    const totalPct = totalClosed > 0 ? Math.round((l.count / lostCount) * 100) : 0
                    return (
                      <div key={l.reason} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium truncate">{l.reason}</span>
                          <span className="text-muted-foreground ml-2 shrink-0">
                            {l.count} <span className="opacity-70">· %{totalPct}</span>
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Bölüm 5 — Maps Lead Dönüşüm
// ============================================================
function MapsConversionCard({
  conv, onExportCsv, onExportXlsx,
}: {
  conv: ReportsData['mapsLeadConversion']
  onExportCsv: () => void
  onExportXlsx: () => void
}) {
  const isEmpty = conv.totalLeads === 0
  const cityData = conv.byCity.map((c) => ({
    ...c,
    fill: PALETTE.sky,
  }))
  const maxCity = Math.max(...cityData.map((c) => c.count), 1)

  const funnelSteps = [
    { label: 'Toplam Lead', value: conv.totalLeads, color: PALETTE.sky, icon: MapPin },
    { label: 'İletişime Geçildi', value: conv.contactedCount, color: PALETTE.teal, icon: Phone },
    { label: 'Nitelikli', value: conv.qualifiedCount, color: PALETTE.amber, icon: Users },
    { label: 'Dönüştü', value: conv.convertedCount, color: PALETTE.emerald, icon: Trophy },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-teal-600" />
              </div>
              <CardTitle>Maps Lead Dönüşümü</CardTitle>
            </div>
            <CardDescription>Google Maps kaynaklı potansiyel müşteri hunisi ve şehir dağılımı</CardDescription>
          </div>
          <ExportButtons onCsv={onExportCsv} onXlsx={onExportXlsx} />
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            icon={MapPin}
            title="Maps lead bulunmuyor"
            description="Potansiyel müşteri madenciliği ile lead oluşturulduğunda dönüşüm burada görünecek."
          />
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Funnel */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Target className="w-4 h-4 text-violet-600" />
                Dönüşüm Hunisi
                <Badge variant="outline" className="ml-auto text-emerald-600 border-emerald-200">
                  %{conv.conversionRate} dönüşüm
                </Badge>
              </h4>
              <div className="space-y-2">
                {funnelSteps.map((step, i) => {
                  const pct = conv.totalLeads > 0 ? (step.value / conv.totalLeads) * 100 : 0
                  const prevValue = i > 0 ? funnelSteps[i - 1].value : conv.totalLeads
                  const stepRate = prevValue > 0 ? Math.round((step.value / prevValue) * 100) : 0
                  return (
                    <div key={step.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <step.icon className="w-3.5 h-3.5" style={{ color: step.color }} />
                          <span className="font-medium">{step.label}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="font-semibold text-foreground">{step.value}</span>
                          {i > 0 && <span className="opacity-70">→ %{stepRate}</span>}
                        </div>
                      </div>
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all flex items-center justify-end pr-2"
                          style={{
                            width: `${Math.max(pct, 8)}%`,
                            backgroundColor: step.color,
                            opacity: 0.85,
                          }}
                        >
                          <span className="text-[10px] text-white font-medium">
                            %{Math.round(pct)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Leads by city */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-sky-600" />
                Şehre Göre Lead Dağılımı
              </h4>
              {cityData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                  Şehir verisi yok.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={cityData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="city"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number) => [value, 'Lead']}
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={22}>
                      {cityData.map((c, i) => (
                        <Cell key={i} fill={c.fill} opacity={0.6 + (c.count / maxCity) * 0.4} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Bölüm 6 — Aktivite Performansı
// ============================================================
function ActivityPerformanceCard({
  activityByType, activitiesOverTime, onExportTypeCsv, onExportTimeCsv,
}: {
  activityByType: { type: string; count: number }[]
  activitiesOverTime: { date: string; count: number }[]
  onExportTypeCsv: () => void
  onExportTimeCsv: () => void
}) {
  const totalActivities = activityByType.reduce((s, a) => s + a.count, 0)
  const isEmpty = totalActivities === 0

  // Tüm tipleri göster (0 olanlar dahil)
  const typeData = ACTIVITY_TYPES.map((t) => {
    const found = activityByType.find((a) => a.type === t.value)
    return {
      type: t.value,
      label: t.label,
      count: found?.count ?? 0,
      fill: ACTIVITY_COLOR_HEX[t.value] ?? PALETTE.slate,
    }
  }).sort((a, b) => b.count - a.count)

  const timeData = activitiesOverTime.map((a) => ({
    ...a,
    label: formatDayLabel(a.date),
  }))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
                <ActivityIcon className="w-4 h-4 text-violet-600" />
              </div>
              <CardTitle>Aktivite Performansı</CardTitle>
            </div>
            <CardDescription>Tip bazında ve son 30 günün aktivite dağılımı</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="type" className="w-full">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <TabsList>
              <TabsTrigger value="type" className="text-xs">
                <PieChartIcon className="w-3.5 h-3.5 mr-1.5" /> Tip Bazında
              </TabsTrigger>
              <TabsTrigger value="time" className="text-xs">
                <LineChartIcon className="w-3.5 h-3.5 mr-1.5" /> Zaman İçinde
              </TabsTrigger>
            </TabsList>
            <div className="text-xs text-muted-foreground">
              Toplam <span className="font-semibold text-foreground">{totalActivities}</span> aktivite
            </div>
          </div>

          <TabsContent value="type">
            <div className="flex items-center justify-end mb-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onExportTypeCsv}>
                <Download className="w-3 h-3 mr-1" /> CSV
              </Button>
            </div>
            {isEmpty ? (
              <EmptyState
                icon={ActivityIcon}
                title="Aktivite yok"
                description="Henüz aktivite kaydedilmemiş."
              />
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={typeData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number) => [value, 'Aktivite']}
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={50}>
                      {typeData.map((d, i) => (
                        <Cell key={i} fill={d.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* Type breakdown */}
                <div className="space-y-2 max-h-[280px] overflow-y-auto custom-scroll pr-1">
                  {typeData.filter((d) => d.count > 0).map((d) => {
                    const pct = totalActivities > 0 ? (d.count / totalActivities) * 100 : 0
                    const Icon = ACTIVITY_ICONS[d.type] ?? ActivityIcon
                    return (
                      <div key={d.type} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${d.fill}22`, color: d.fill }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{d.label}</span>
                            <span className="text-sm font-semibold">{d.count}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: d.fill }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground w-9 text-right">
                              %{Math.round(pct)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="time">
            <div className="flex items-center justify-end mb-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onExportTimeCsv}>
                <Download className="w-3 h-3 mr-1" /> CSV
              </Button>
            </div>
            {isEmpty ? (
              <EmptyState
                icon={Calendar}
                title="Aktivite yok"
                description="Son 30 günde aktivite kaydedilmemiş."
              />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE.violet} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={PALETTE.violet} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={3}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value: number) => [value, 'Aktivite']}
                    labelFormatter={(label) => `Tarih: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={PALETTE.violet}
                    strokeWidth={2.5}
                    fill="url(#actGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: PALETTE.violet }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Bölüm 7 — Temsilci Performansı
// ============================================================
type SortKey = 'name' | 'activityCount' | 'dealsWon' | 'totalWonValue' | 'winRate'
type SortDir = 'asc' | 'desc'

function SortHeader({
  k, label, align = 'left', sortKey, sortDir, onToggle,
}: {
  k: SortKey
  label: string
  align?: 'left' | 'right'
  sortKey: SortKey
  sortDir: SortDir
  onToggle: (k: SortKey) => void
}) {
  return (
    <TableHead className={align === 'right' ? 'text-right' : ''}>
      <button
        onClick={() => onToggle(k)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {sortKey === k ? (
          sortDir === 'asc'
            ? <ChevronUp className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3 opacity-30" />
        )}
      </button>
    </TableHead>
  )
}

const ROLE_LABELS = [
  { value: 'rep', label: 'Satış Temsilcisi' },
  { value: 'manager', label: 'Müdür' },
  { value: 'admin', label: 'Yönetici' },
  { value: 'superadmin', label: 'Süper Yönetici' },
  { value: 'readonly', label: 'Salt Okunur' },
] as const

function RepPerformanceCard({
  reps, onExportCsv, onExportXlsx,
}: {
  reps: ReportsData['repPerformance']
  onExportCsv: () => void
  onExportXlsx: () => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('totalWonValue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [detailRep, setDetailRep] = useState<{ id: string; name: string } | null>(null)

  const sortedReps = useMemo(() => {
    const sorted = [...reps].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv, 'tr')
      }
      return (av as number) - (bv as number)
    })
    return sortDir === 'asc' ? sorted : sorted.reverse()
  }, [reps, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const topPerformer = reps[0]
  const totalWonValue = reps.reduce((s, r) => s + r.totalWonValue, 0)
  const totalActivities = reps.reduce((s, r) => s + r.activityCount, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                <UserCog className="w-4 h-4 text-amber-600" />
              </div>
              <CardTitle>Temsilci Performansı</CardTitle>
            </div>
            <CardDescription>
              {reps.length} temsilci · Toplam {formatCurrency(totalWonValue)} kazanç · {totalActivities} aktivite
            </CardDescription>
          </div>
          <ExportButtons onCsv={onExportCsv} onXlsx={onExportXlsx} />
        </div>
      </CardHeader>
      <CardContent>
        {reps.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="Temsilci yok"
            description="Görünür temsilci bulunamadı."
          />
        ) : (
          <>
            {/* Top performer highlight */}
            {topPerformer && topPerformer.totalWonValue > 0 && (
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-emerald-50 dark:from-amber-950/30 dark:to-emerald-950/30 border border-amber-200 dark:border-amber-900/40 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-amber-700 dark:text-amber-400 font-medium uppercase tracking-wide">
                    En İyi Performans
                  </div>
                  <div className="text-base font-semibold truncate">{topPerformer.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {topPerformer.title ?? 'Satış Temsilcisi'} · {topPerformer.dealsWon} fırsat kazandı
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-emerald-600">{formatCurrency(topPerformer.totalWonValue)}</div>
                  <div className="text-xs text-muted-foreground">%{topPerformer.winRate} kazanma</div>
                </div>
              </div>
            )}

            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10">#</TableHead>
                    <SortHeader k="name" label="Temsilci" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <SortHeader k="activityCount" label="Aktivite" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <SortHeader k="dealsWon" label="Kazanılan" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <SortHeader k="totalWonValue" label="Kazanç" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <SortHeader k="winRate" label="Kazanma %" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <TableHead className="text-right">Log</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedReps.map((r, i) => (
                    <TableRow
                      key={r.id}
                      className={cn(
                        i === 0 && r.totalWonValue > 0 && 'bg-amber-50/40 dark:bg-amber-950/20',
                      )}
                    >
                      <TableCell>
                        <span className={cn(
                          'inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold',
                          i === 0 && r.totalWonValue > 0
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-muted text-muted-foreground',
                        )}>
                          {i + 1}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{r.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {r.title ?? getLabel(ROLE_LABELS, r.role)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.activityCount}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.dealsWon}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">
                        {formatCurrency(r.totalWonValue)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                r.winRate >= 60 ? 'bg-emerald-500' :
                                r.winRate >= 30 ? 'bg-amber-500' : 'bg-rose-500',
                              )}
                              style={{ width: `${r.winRate}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium tabular-nums w-8 text-right">%{r.winRate}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setDetailRep({ id: r.id, name: r.name })}
                        >
                          <ListChecks className="w-3.5 h-3.5 mr-1" />
                          Detay
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
      {detailRep && (
        <UserActivityLogDialog
          userId={detailRep.id}
          userName={detailRep.name}
          open={!!detailRep}
          onOpenChange={(v) => { if (!v) setDetailRep(null) }}
        />
      )}
    </Card>
  )
}

// ============================================================
// User Activity Log Dialog — Detaylı aktivite log görünümü
// ============================================================
function UserActivityLogDialog({
  userId, userName, open, onOpenChange,
}: {
  userId: string
  userName: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [typeFilter, setTypeFilter] = useState('')
  const [exporting, setExporting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['user-activities', userId, typeFilter],
    queryFn: () => apiGet<{
      user: { id: string; name: string; role: string }
      activities: {
        id: string; type: string; subject: string; detail: string | null
        date: string; durationMin: number; outcome: string | null
        customer: { id: string; name: string } | null
      }[]
      total: number
      summary: {
        typeStats: Record<string, number>
        outcomeStats: Record<string, number>
        totalDuration: number
        totalActivities: number
      }
    }>(`/api/users/${userId}/activities${typeFilter ? `?type=${typeFilter}` : ''}${typeFilter ? '&' : '?'}limit=500`),
    enabled: open,
  })

  const activities = data?.activities ?? []
  const summary = data?.summary

  const handleExport = () => {
    setExporting(true)
    const rows = activities.map((a) => ({
      'Tarih': new Date(a.date).toLocaleString('tr-TR'),
      'Tip': a.type,
      'Konu': a.subject,
      'Müşteri': a.customer?.name ?? '',
      'Süre (dk)': a.durationMin,
      'Sonuç': a.outcome ?? '',
      'Detay': a.detail ?? '',
    }))
    exportCSV(rows, `aktivite-log-${userName}.csv`, 'Aktivite Log')
    setExporting(false)
    toast.success('Log dışa aktarıldı')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-amber-600" />
            {userName} — Aktivite Logları
          </DialogTitle>
          <DialogDescription>
            {data ? `${data.total} aktivite kaydı` : 'Yükleniyor...'}
          </DialogDescription>
        </DialogHeader>

        {/* Summary stats */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pb-3 border-b">
            <div className="p-2.5 rounded-lg bg-muted/30">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Toplam Aktivite</div>
              <div className="text-xl font-bold tabular-nums">{summary.totalActivities}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/30">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Toplam Süre</div>
              <div className="text-xl font-bold tabular-nums">{summary.totalDuration}dk</div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/30">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Arama</div>
              <div className="text-xl font-bold tabular-nums text-emerald-600">{summary.typeStats['arama'] ?? 0}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/30">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">E-posta</div>
              <div className="text-xl font-bold tabular-nums text-sky-600">{summary.typeStats['email'] ?? 0}</div>
            </div>
          </div>
        )}

        {/* Type breakdown */}
        {summary && Object.keys(summary.typeStats).length > 0 && (
          <div className="flex flex-wrap gap-1.5 py-2">
            <button
              onClick={() => setTypeFilter('')}
              className={cn(
                'px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors',
                !typeFilter ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              Tümü ({summary.totalActivities})
            </button>
            {Object.entries(summary.typeStats).map(([type, count]) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type === typeFilter ? '' : type)}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors',
                  type === typeFilter ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {type} ({count})
              </button>
            ))}
          </div>
        )}

        {/* Activities table */}
        <div className="flex-1 overflow-auto custom-scroll">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : activities.length === 0 ? (
            <div className="py-12 text-center">
              <ListChecks className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Aktivite kaydı bulunamadı</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Tarih</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Tip</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Konu</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Müşteri</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Süre</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Sonuç</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((a) => (
                  <TableRow key={a.id} className="text-sm">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(a.date).toLocaleDateString('tr-TR')}
                      <div className="text-[10px]">{new Date(a.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {a.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={a.subject}>{a.subject}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-muted-foreground">{a.customer?.name ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{a.durationMin > 0 ? `${a.durationMin}dk` : '—'}</TableCell>
                    <TableCell>
                      {a.outcome ? (
                        <span className={cn(
                          'text-[10px] font-medium',
                          a.outcome === 'basarili' ? 'text-emerald-600' :
                          a.outcome === 'basarisiz' ? 'text-red-600' :
                          a.outcome === 'ertelendi' ? 'text-amber-600' : 'text-sky-600',
                        )}>
                          {a.outcome}
                        </span>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || activities.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            CSV Dışa Aktar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Bölüm 8 — En İyi Müşteriler
// ============================================================
function TopCustomersCard({
  customers, onOpenCustomer, onExportCsv, onExportXlsx,
}: {
  customers: ReportsData['topCustomers']
  onOpenCustomer: (id: string) => void
  onExportCsv: () => void
  onExportXlsx: () => void
}) {
  const maxValue = Math.max(...customers.map((c) => c.total), 1)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-emerald-600" />
              </div>
              <CardTitle>En İyi Müşteriler</CardTitle>
            </div>
            <CardDescription>Kazanılan fırsat değerine göre ilk 10 müşteri</CardDescription>
          </div>
          <ExportButtons onCsv={onExportCsv} onXlsx={onExportXlsx} />
        </div>
      </CardHeader>
      <CardContent>
        {customers.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="Müşteri yok"
            description="Henüz kazanılan fırsat bulunmuyor."
          />
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead className="text-right">Değer</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Fırsat</TableHead>
                  <TableHead className="hidden md:table-cell">Son Aktivite</TableHead>
                  <TableHead className="w-32 hidden lg:table-cell">Dağılım</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c, i) => {
                  const ds = daysSince(c.lastActivityAt)
                  return (
                    <TableRow key={c.id} className="group">
                      <TableCell>
                        <span className={cn(
                          'inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold',
                          i === 0
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            : i === 1
                            ? 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
                            : i === 2
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                            : 'bg-muted text-muted-foreground',
                        )}>
                          {i + 1}
                        </span>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => onOpenCustomer(c.id)}
                          className="font-medium text-left hover:text-emerald-600 transition-colors group-hover:underline"
                        >
                          {c.name}
                        </button>
                        <div className="text-xs text-muted-foreground sm:hidden">
                          {c.count} fırsat · {formatCurrency(c.total)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">
                        {formatCurrency(c.total)}
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell font-mono text-sm">
                        {c.count}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs">{formatDate(c.lastActivityAt)}</span>
                          {ds !== null && (
                            <span className={cn(
                              'text-[10px]',
                              ds > 30 ? 'text-rose-600' : ds > 14 ? 'text-amber-600' : 'text-emerald-600',
                            )}>
                              · {ds}g
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full"
                            style={{ width: `${(c.total / maxValue) * 100}%` }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Bölüm 9 — İletişimsiz Müşteriler
// ============================================================
function StaleCustomersCard({
  stale, staleCount, onOpenCustomer, onExportCsv, onExportXlsx,
}: {
  stale: ReportsData['staleCustomers']
  staleCount: number
  onOpenCustomer: (id: string) => void
  onExportCsv: () => void
  onExportXlsx: () => void
}) {
  const handleCreateTask = (name: string) => {
    toast.success('Görev oluşturma tetiklendi', {
      description: `${name} için görev oluşturma formu açılacak (görev modülü M5'te geliştirilecek).`,
    })
  }

  return (
    <Card className="border-rose-200 dark:border-rose-900/40">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <CardTitle>İletişimsiz Müşteriler</CardTitle>
              <Badge variant="outline" className="text-rose-600 border-rose-200">
                {staleCount} kayıt
              </Badge>
            </div>
            <CardDescription>30+ gündür iletişim kurulmamış veya hiç iletişim kurulmamış müşteriler</CardDescription>
          </div>
          <ExportButtons onCsv={onExportCsv} onXlsx={onExportXlsx} />
        </div>
      </CardHeader>
      <CardContent>
        {stale.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title="İletişimsiz müşteri yok"
            description="Tüm müşterilerle son 30 gün içinde iletişim kurulmuş. Harika!"
          />
        ) : (
          <div className="space-y-2 max-h-[460px] overflow-y-auto custom-scroll pr-1">
            {stale.map((c) => {
              const ds = daysSince(c.lastActivityAt)
              const isCritical = ds === null || ds > 60
              const isWarning = ds !== null && ds > 30 && ds <= 60
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors group"
                >
                  <div className={cn(
                    'w-2 h-12 rounded-full shrink-0',
                    isCritical ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-slate-400',
                  )} />

                  <button
                    onClick={() => onOpenCustomer(c.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="font-medium truncate group-hover:text-emerald-600 transition-colors">
                      {c.name}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Building2 className="w-3 h-3" />
                      <span className="truncate">{c.city ?? 'Şehir belirtilmemiş'}</span>
                      <span>·</span>
                      <UserCog className="w-3 h-3" />
                      <span className="truncate">{c.ownerName ?? 'Atanmamış'}</span>
                    </div>
                  </button>

                  <div className="text-right shrink-0">
                    {ds === null ? (
                      <Badge variant="outline" className="text-rose-600 border-rose-200 bg-rose-50 dark:bg-rose-950/30">
                        İletişim yok
                      </Badge>
                    ) : (
                      <>
                        <div className={cn(
                          'text-lg font-bold tabular-nums',
                          isCritical ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-slate-600',
                        )}>
                          {ds}<span className="text-xs font-normal ml-0.5">gün</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatDate(c.lastActivityAt)}
                        </div>
                      </>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleCreateTask(c.name)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Görev
                  </Button>
                </div>
              )
            })}
            {staleCount > stale.length && (
              <div className="text-center text-xs text-muted-foreground py-2">
                İlk {stale.length} kayıt gösteriliyor · Toplam {staleCount} iletişimsiz müşteri var
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Yardımcı bileşenler
// ============================================================
function ExportButtons({ onCsv, onXlsx }: { onCsv: () => void; onXlsx: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCsv}>
        <Download className="w-3 h-3 mr-1" /> CSV
      </Button>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onXlsx}>
        <FileSpreadsheet className="w-3 h-3 mr-1" /> XLSX
      </Button>
    </div>
  )
}

function EmptyState({
  icon: Icon, title, description,
}: {
  icon: typeof BarChart3
  title: string
  description: string
}) {
  return (
    <div className="h-64 flex flex-col items-center justify-center text-center">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className="w-7 h-7 text-muted-foreground/50" />
      </div>
      <h4 className="text-sm font-medium mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
    </div>
  )
}

// ============================================================
// Loading skeleton — sektör bazlı placeholder sayısı
// ============================================================
function ReportsSkeleton({ sector = 'crm' }: { sector?: string }) {
  // Sektöre göre bölüm sayısı (CRM 8, diğerleri daha az)
  const cardCount = sector === 'crm' ? 8 : sector === 'cafe' ? 5 : sector === 'market' ? 6 : sector === 'site' ? 5 : 5
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>

      {/* Section placeholders */}
      {[...Array(cardCount)].map((_, i) => (
        <Skeleton key={i} className="h-[400px] w-full" />
      ))}
    </div>
  )
}

// ============================================================
// Tüm raporu tek dosyada dışa aktarma
// ============================================================
function buildFullReport(data: ReportsData): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []

  // KPI Özeti
  rows.push({ 'Bölüm': 'KPI Özeti', 'Metrik': 'Toplam Pipeline Değeri', 'Değer': data.totalPipelineValue })
  rows.push({ 'Bölüm': 'KPI Özeti', 'Metrik': 'Kazanma Oranı (%)', 'Değer': data.winRate })
  rows.push({ 'Bölüm': 'KPI Özeti', 'Metrik': 'Dönüşüm Oranı (%)', 'Değer': data.mapsLeadConversion.conversionRate })
  rows.push({ 'Bölüm': 'KPI Özeti', 'Metrik': 'Toplam Ciro', 'Değer': data.totalRevenue })
  rows.push({ 'Bölüm': 'KPI Özeti', 'Metrik': 'Kazanılan Fırsat', 'Değer': data.wonCount })
  rows.push({ 'Bölüm': 'KPI Özeti', 'Metrik': 'Kaybedilen Fırsat', 'Değer': data.lostCount })

  // Pipeline
  data.pipeline.forEach((p) => {
    rows.push({
      'Bölüm': 'Satış Hunisi',
      'Aşama': getLabel(DEAL_STAGES, p.stage),
      'Fırsat Sayısı': p.count,
      'Toplam Değer': p.totalValue,
    })
  })

  // Ciro
  data.revenueByMonth.forEach((m) => {
    rows.push({
      'Bölüm': 'Ciro Trendi',
      'Ay': m.month,
      'Ciro': m.total,
      'Kazanılan': m.count,
    })
  })

  // Kayıp nedenleri
  data.lossReasons.forEach((l) => {
    rows.push({
      'Bölüm': 'Kayıp Nedenleri',
      'Neden': l.reason,
      'Sayı': l.count,
    })
  })

  // Maps dönüşüm
  rows.push({
    'Bölüm': 'Maps Dönüşüm',
    'Toplam Lead': data.mapsLeadConversion.totalLeads,
    'İletişim': data.mapsLeadConversion.contactedCount,
    'Nitelikli': data.mapsLeadConversion.qualifiedCount,
    'Dönüştü': data.mapsLeadConversion.convertedCount,
    'Dönüşüm %': data.mapsLeadConversion.conversionRate,
  })

  // Aktivite tipleri
  data.activityByType.forEach((a) => {
    rows.push({
      'Bölüm': 'Aktivite Tipleri',
      'Tip': getLabel(ACTIVITY_TYPES, a.type),
      'Sayı': a.count,
    })
  })

  // Temsilci performansı
  data.repPerformance.forEach((r, i) => {
    rows.push({
      'Bölüm': 'Temsilci Performansı',
      'Sıra': i + 1,
      'Temsilci': r.name,
      'Aktivite': r.activityCount,
      'Kazanılan': r.dealsWon,
      'Kazanç': r.totalWonValue,
      'Kazanma %': r.winRate,
    })
  })

  // En iyi müşteriler
  data.topCustomers.forEach((c, i) => {
    rows.push({
      'Bölüm': 'En İyi Müşteriler',
      'Sıra': i + 1,
      'Müşteri': c.name,
      'Değer': c.total,
      'Fırsat': c.count,
    })
  })

  return rows
}

// ============================================================
// Bölümler — ERP Lite Metrikleri
// ============================================================
function ErpMetricsCard({
  erp,
  onExportCsv,
}: {
  erp: NonNullable<ReportsData['erp']>
  onExportCsv: () => void
}) {
  const erpKpis = [
    { label: 'Stok Değeri', value: formatCurrency(erp.products.stockValue), sub: `${erp.products.total} ürün`, color: 'from-emerald-500 to-teal-600', icon: '📦' },
    { label: 'Toplam Faturalanan', value: formatCurrency(erp.invoices.totalInvoiced), sub: `${erp.invoices.total} fatura`, color: 'from-violet-500 to-purple-600', icon: '🧾' },
    { label: 'Tahsil Edilen', value: formatCurrency(erp.invoices.totalPaid), sub: `${erp.invoices.paidCount} ödenen`, color: 'from-sky-500 to-blue-600', icon: '✅' },
    { label: 'Bekleyen Tahsilat', value: formatCurrency(erp.invoices.totalPending), sub: `${erp.invoices.overdueCount} geciken`, color: 'from-amber-500 to-orange-600', icon: '⏳' },
  ]

  return (
    <Card className="shadow-soft">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="text-lg">📊</span>
              ERP Lite Metrikleri
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Ürün, stok, teklif ve fatura özeti
            </CardDescription>
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onExportCsv}>
              <Download className="w-3.5 h-3.5 mr-1" /> CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {erpKpis.map((k) => (
            <div key={k.label} className="p-3 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn('w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-sm', k.color)}>
                  {k.icon}
                </div>
              </div>
              <div className="text-lg font-bold tabular-nums">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Invoice revenue by month chart */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Fatura Ciro Trendi (6 Ay)</h4>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={erp.invoices.revenueByMonth} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="erpRevGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => formatCompactNumber(v)} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: '12px' }}
                  formatter={(v: number) => [formatCurrency(v), 'Ciro']}
                />
                <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} fill="url(#erpRevGradient)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Top products by stock value */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">En Değerli Ürünler (Stok)</h4>
            {erp.products.topByValue.length === 0 ? (
              <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">Ürün yok</div>
            ) : (
              <div className="space-y-2">
                {erp.products.topByValue.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
                    <div className="w-6 h-6 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.stock} adet stokta</div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(p.stockValue)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Alert row */}
        <div className="grid grid-cols-3 gap-3">
          <div className={cn('p-3 rounded-lg border flex items-center gap-2', erp.products.lowStockCount > 0 ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/20' : 'border-border bg-muted/20')}>
            <AlertTriangle className={cn('w-4 h-4', erp.products.lowStockCount > 0 ? 'text-amber-600' : 'text-muted-foreground')} />
            <div>
              <div className="text-sm font-semibold">{erp.products.lowStockCount}</div>
              <div className="text-[10px] text-muted-foreground">Düşük stok</div>
            </div>
          </div>
          <div className={cn('p-3 rounded-lg border flex items-center gap-2', erp.products.outOfStockCount > 0 ? 'border-red-200 bg-red-50/50 dark:bg-red-950/20' : 'border-border bg-muted/20')}>
            <AlertTriangle className={cn('w-4 h-4', erp.products.outOfStockCount > 0 ? 'text-red-600' : 'text-muted-foreground')} />
            <div>
              <div className="text-sm font-semibold">{erp.products.outOfStockCount}</div>
              <div className="text-[10px] text-muted-foreground">Tükenmiş</div>
            </div>
          </div>
          <div className={cn('p-3 rounded-lg border flex items-center gap-2', erp.invoices.overdueCount > 0 ? 'border-red-200 bg-red-50/50 dark:bg-red-950/20' : 'border-border bg-muted/20')}>
            <AlertTriangle className={cn('w-4 h-4', erp.invoices.overdueCount > 0 ? 'text-red-600' : 'text-muted-foreground')} />
            <div>
              <div className="text-sm font-semibold">{erp.invoices.overdueCount}</div>
              <div className="text-[10px] text-muted-foreground">Geciken fatura</div>
            </div>
          </div>
        </div>

        {/* Quote summary */}
        <div className="p-3 rounded-lg bg-muted/20 border border-border">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Teklif Özeti</h4>
            <Badge variant="outline" className="text-[10px]">Dönüşüm: {erp.quotes.conversionRate}%</Badge>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-lg font-bold tabular-nums">{erp.quotes.total}</div>
              <div className="text-[10px] text-muted-foreground">Toplam</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums text-amber-600">{erp.quotes.pendingCount}</div>
              <div className="text-[10px] text-muted-foreground">Bekleyen</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums text-emerald-600">{erp.quotes.approvedCount}</div>
              <div className="text-[10px] text-muted-foreground">Onaylanan</div>
            </div>
            <div>
              <div className="text-sm font-bold tabular-nums">{formatCurrency(erp.quotes.totalValue)}</div>
              <div className="text-[10px] text-muted-foreground">Toplam Değer</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
