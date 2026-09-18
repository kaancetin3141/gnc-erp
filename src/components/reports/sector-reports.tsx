'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, CartesianGrid,
} from 'recharts'
import {
  Coffee, TrendingUp, Receipt, Users, ShoppingCart, AlertTriangle,
  CreditCard, Package, Calendar, Clock, CheckCircle2,
  XCircle, UserX, DollarSign, Crown, Building2, Wrench, Home,
  Download, FileSpreadsheet, ChevronUp, ChevronDown,
} from 'lucide-react'
import { formatCurrency, formatCompactNumber, toCSV, downloadFile } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/hooks/use-count-up'
import { toast } from 'sonner'
import type {
  CafeReportsData, MarketReportsData,
  SiteReportsData, AppointmentsReportsData,
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
}

function KpiCard({ kpi }: { kpi: KpiData }) {
  const animated = useCountUp(kpi.numericValue, 900)
  const displayValue = typeof kpi.value === 'string' && kpi.value.includes('₺')
    ? formatCurrency(animated, 'TRY')
    : typeof kpi.value === 'number'
      ? animated
      : kpi.value
  return (
    <Card className="relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
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

function ExportButtons({ onCsv, onXlsx }: { onCsv?: () => void; onXlsx?: () => void }) {
  return (
    <div className="flex items-center gap-1">
      {onCsv && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCsv}>
          <Download className="w-3 h-3 mr-1" /> CSV
        </Button>
      )}
      {onXlsx && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onXlsx}>
          <FileSpreadsheet className="w-3 h-3 mr-1" /> XLSX
        </Button>
      )}
    </div>
  )
}

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
  const headers = Object.keys(rows[0])
  const escapeHtml = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
  const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${headers.map((h) => `<td>${escapeHtml(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
  downloadFile('\uFEFF' + html, filename, 'application/vnd.ms-excel;charset=utf-8')
  toast.success('XLSX dışa aktarıldı', { description: `${filename} indirildi.` })
}

const chartTooltipStyle = {
  borderRadius: '10px',
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

function formatDayLabel(d: string): string {
  const [, m, day] = d.split('-')
  return `${day}.${m}`
}

// ============================================================
// CAFE REPORTS
// ============================================================
export function CafeReports({ data }: { data: CafeReportsData }) {
  const c = data.cafe

  const kpis: KpiData[] = [
    {
      label: 'Toplam Ciro',
      value: formatCurrency(c.totalRevenue),
      numericValue: c.totalRevenue,
      sub: `${c.totalOrders} sipariş`,
      icon: TrendingUp,
      color: 'from-amber-500 to-orange-600',
    },
    {
      label: 'Sipariş Sayısı',
      value: c.totalOrders,
      numericValue: c.totalOrders,
      sub: 'Ödenmiş siparişler',
      icon: Receipt,
      color: 'from-emerald-500 to-teal-600',
    },
    {
      label: 'Ortalama Hesap',
      value: formatCurrency(c.avgTicket),
      numericValue: c.avgTicket,
      sub: 'Sipariş başına',
      icon: Coffee,
      color: 'from-sky-500 to-blue-600',
    },
    {
      label: 'Masa Doluluk',
      value: `${c.activeTables}/${c.totalTables}`,
      numericValue: c.activeTables,
      sub: 'Aktif masa',
      icon: Users,
      color: 'from-violet-500 to-purple-600',
    },
  ]

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => <KpiCard key={k.label} kpi={k} />)}
      </div>

      {/* Daily revenue trend */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                </div>
                <CardTitle>Günlük Ciro Trendi</CardTitle>
              </div>
              <CardDescription>Son 30 gün · ödenmiş siparişler</CardDescription>
            </div>
            <ExportButtons
              onCsv={() => exportCSV(
                c.dailyRevenue.map((d) => ({ 'Tarih': d.date, 'Ciro': d.revenue, 'Sipariş': d.orders })),
                'kafe-gunluk-ciro.csv', 'Günlük Ciro',
              )}
              onXlsx={() => exportXLSX(
                c.dailyRevenue.map((d) => ({ 'Tarih': d.date, 'Ciro': d.revenue, 'Sipariş': d.orders })),
                'kafe-gunluk-ciro.xls', 'Günlük Ciro',
              )}
            />
          </div>
        </CardHeader>
        <CardContent>
          {c.dailyRevenue.every((d) => d.revenue === 0) ? (
            <EmptyState message="Bu dönemde ciro kaydı yok" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={c.dailyRevenue} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cafeRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => formatDayLabel(v)}
                  interval={4}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                  tickFormatter={(v: number) => formatCompactNumber(v)}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value: number, name: string) => {
                    if (name === 'revenue') return [formatCurrency(value), 'Ciro']
                    return [value, 'Sipariş']
                  }}
                  labelFormatter={(v: string) => formatDayLabel(v)}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  fill="url(#cafeRevGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#f59e0b' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Hourly breakdown */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/30 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-sky-600" />
                  </div>
                  <CardTitle>Saatlik Kırılım (08-23)</CardTitle>
                </div>
                <CardDescription>Saat bazında ciro ve sipariş sayısı</CardDescription>
              </div>
              <ExportButtons
                onCsv={() => exportCSV(
                  c.hourlyBreakdown.map((h) => ({
                    'Saat': `${String(h.hour).padStart(2, '0')}:00`,
                    'Ciro': h.revenue, 'Sipariş': h.orders,
                  })),
                  'kafe-saatlik.csv', 'Saatlik Kırılım',
                )}
              />
            </div>
          </CardHeader>
          <CardContent>
            {c.hourlyBreakdown.every((h) => h.revenue === 0) ? (
              <EmptyState message="Saatlik veri yok" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={c.hourlyBreakdown} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${String(v).padStart(2, '0')}:00`}
                  />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={50} tickFormatter={(v: number) => formatCompactNumber(v)} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value: number, name: string) => {
                      if (name === 'revenue') return [formatCurrency(value), 'Ciro']
                      return [value, 'Sipariş']
                    }}
                    labelFormatter={(v: number) => `${String(v).padStart(2, '0')}:00 saatleri`}
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                  />
                  <Bar dataKey="revenue" name="revenue" radius={[6, 6, 0, 0]} maxBarSize={32} fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Order type mix */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-violet-600" />
                  </div>
                  <CardTitle>Sipariş Tipi Dağılımı</CardTitle>
                </div>
                <CardDescription>dine_in / takeaway / delivery</CardDescription>
              </div>
              <ExportButtons
                onCsv={() => exportCSV(
                  c.orderTypeMix.map((t) => ({
                    'Tip': t.type, 'Sipariş': t.count, 'Ciro': t.revenue,
                  })),
                  'kafe-siparis-tipi.csv', 'Sipariş Tipi',
                )}
              />
            </div>
          </CardHeader>
          <CardContent>
            {c.orderTypeMix.length === 0 ? (
              <EmptyState message="Sipariş tipi verisi yok" />
            ) : (
              <div className="grid sm:grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={c.orderTypeMix}
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      innerRadius={45}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="type"
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    >
                      {c.orderTypeMix.map((_, i) => (
                        <Cell key={i} fill={['#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#f43f5e'][i % 5]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number, name: string) => [`${value} sipariş`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {c.orderTypeMix.map((t, i) => {
                    const total = c.orderTypeMix.reduce((s, x) => s + x.count, 0)
                    const pct = total > 0 ? Math.round((t.count / total) * 100) : 0
                    const label = t.type === 'dine_in' ? 'Yerinde' : t.type === 'takeaway' ? 'Paket' : t.type === 'delivery' ? 'Gel Al' : t.type
                    return (
                      <div key={t.type} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: ['#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#f43f5e'][i % 5] }}
                            />
                            <span>{label}</span>
                          </div>
                          <span className="font-medium tabular-nums">{t.count} · %{pct}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{formatCurrency(t.revenue)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top items */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                  <Crown className="w-4 h-4 text-emerald-600" />
                </div>
                <CardTitle>En Çok Satan Ürünler</CardTitle>
              </div>
              <CardDescription>Ciro bazında ilk 10 ürün</CardDescription>
            </div>
            <ExportButtons
              onCsv={() => exportCSV(
                c.topItems.map((it, i) => ({
                  'Sıra': i + 1, 'Ürün': it.name, 'Adet': it.qty, 'Ciro': it.revenue,
                })),
                'kafe-top-urunler.csv', 'Top Ürünler',
              )}
              onXlsx={() => exportXLSX(
                c.topItems.map((it, i) => ({
                  'Sıra': i + 1, 'Ürün': it.name, 'Adet': it.qty, 'Ciro': it.revenue,
                })),
                'kafe-top-urunler.xls', 'Top Ürünler',
              )}
            />
          </div>
        </CardHeader>
        <CardContent>
          {c.topItems.length === 0 ? (
            <EmptyState message="Bu dönemde satılan ürün yok" />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-right">Adet</TableHead>
                    <TableHead className="text-right">Ciro</TableHead>
                    <TableHead className="text-right w-32">Dağılım</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.topItems.map((it, i) => {
                    const maxRev = c.topItems[0].revenue || 1
                    const pct = (it.revenue / maxRev) * 100
                    return (
                      <TableRow key={it.name}>
                        <TableCell>
                          <span className={cn(
                            'inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold',
                            i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                            i === 1 ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' :
                            i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' :
                            'bg-muted text-muted-foreground',
                          )}>{i + 1}</span>
                        </TableCell>
                        <TableCell className="font-medium">{it.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{it.qty} adet</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(it.revenue)}</TableCell>
                        <TableCell>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
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

      {/* Per-cafe comparison */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/30 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-sky-600" />
                </div>
                <CardTitle>Çoklu Kafe Karşılaştırması</CardTitle>
              </div>
              <CardDescription>Kafe bazında ciro, sipariş ve ortalama hesap</CardDescription>
            </div>
            <ExportButtons
              onCsv={() => exportCSV(
                c.perCafe.map((cf) => ({
                  'Kafe': cf.name, 'Ciro': cf.revenue, 'Sipariş': cf.orders, 'Ort Hesap': cf.avgTicket,
                })),
                'kafe-karsilastirma.csv', 'Kafe Karşılaştırma',
              )}
              onXlsx={() => exportXLSX(
                c.perCafe.map((cf) => ({
                  'Kafe': cf.name, 'Ciro': cf.revenue, 'Sipariş': cf.orders, 'Ort Hesap': cf.avgTicket,
                })),
                'kafe-karsilastirma.xls', 'Kafe Karşılaştırma',
              )}
            />
          </div>
        </CardHeader>
        <CardContent>
          {c.perCafe.length === 0 ? (
            <EmptyState message="Kafe kaydı yok" />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Kafe</TableHead>
                    <TableHead className="text-right">Sipariş</TableHead>
                    <TableHead className="text-right">Ciro</TableHead>
                    <TableHead className="text-right">Ort. Hesap</TableHead>
                    <TableHead className="text-right w-32">Pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.perCafe.map((cf, i) => {
                    const total = c.perCafe.reduce((s, x) => s + x.revenue, 0)
                    const pct = total > 0 ? (cf.revenue / total) * 100 : 0
                    return (
                      <TableRow key={cf.id}>
                        <TableCell>
                          <span className={cn(
                            'inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold',
                            i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                            'bg-muted text-muted-foreground',
                          )}>{i + 1}</span>
                        </TableCell>
                        <TableCell className="font-medium">{cf.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{cf.orders}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(cf.revenue)}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(cf.avgTicket)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">%{Math.round(pct)}</span>
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
    </div>
  )
}

// ============================================================
// MARKET REPORTS
// ============================================================
export function MarketReports({ data }: { data: MarketReportsData }) {
  const m = data.market

  const kpis: KpiData[] = [
    {
      label: 'Toplam Satış',
      value: formatCurrency(m.totalRevenue),
      numericValue: m.totalRevenue,
      sub: `${m.totalTx} fiş`,
      icon: TrendingUp,
      color: 'from-emerald-500 to-teal-600',
    },
    {
      label: 'Fiş Sayısı',
      value: m.totalTx,
      numericValue: m.totalTx,
      sub: 'Tamamlanan satış',
      icon: Receipt,
      color: 'from-sky-500 to-blue-600',
    },
    {
      label: 'Ortalama Sepet',
      value: formatCurrency(m.avgBasket),
      numericValue: m.avgBasket,
      sub: 'Fiş başına',
      icon: ShoppingCart,
      color: 'from-violet-500 to-purple-600',
    },
    {
      label: 'Düşük Stok',
      value: m.lowStockCount,
      numericValue: m.lowStockCount,
      sub: `${m.outOfStockCount} tükenmiş`,
      icon: AlertTriangle,
      color: m.lowStockCount > 0 ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600',
    },
  ]

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => <KpiCard key={k.label} kpi={k} />)}
      </div>

      {/* Daily sales trend */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
                <CardTitle>Günlük Satış Trendi</CardTitle>
              </div>
              <CardDescription>Son 30 gün · POS satışları</CardDescription>
            </div>
            <ExportButtons
              onCsv={() => exportCSV(
                m.dailyRevenue.map((d) => ({ 'Tarih': d.date, 'Satış': d.revenue, 'Fiş': d.tx })),
                'market-gunluk-satis.csv', 'Günlük Satış',
              )}
              onXlsx={() => exportXLSX(
                m.dailyRevenue.map((d) => ({ 'Tarih': d.date, 'Satış': d.revenue, 'Fiş': d.tx })),
                'market-gunluk-satis.xls', 'Günlük Satış',
              )}
            />
          </div>
        </CardHeader>
        <CardContent>
          {m.dailyRevenue.every((d) => d.revenue === 0) ? (
            <EmptyState message="Bu dönemde satış kaydı yok" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={m.dailyRevenue} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="marketRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => formatDayLabel(v)}
                  interval={4}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                  tickFormatter={(v: number) => formatCompactNumber(v)}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value: number, name: string) => {
                    if (name === 'revenue') return [formatCurrency(value), 'Satış']
                    return [value, 'Fiş']
                  }}
                  labelFormatter={(v: string) => formatDayLabel(v)}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#marketRevGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#10b981' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Payment method mix */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-amber-600" />
                  </div>
                  <CardTitle>Ödeme Yöntemi Dağılımı</CardTitle>
                </div>
                <CardDescription>cash / card / mixed</CardDescription>
              </div>
              <ExportButtons
                onCsv={() => exportCSV(
                  m.paymentMethodMix.map((p) => ({
                    'Yöntem': p.method, 'Fiş': p.count, 'Ciro': p.revenue,
                  })),
                  'market-odeme-yontemi.csv', 'Ödeme Yöntemi',
                )}
              />
            </div>
          </CardHeader>
          <CardContent>
            {m.paymentMethodMix.length === 0 ? (
              <EmptyState message="Ödeme yöntemi verisi yok" />
            ) : (
              <div className="grid sm:grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={m.paymentMethodMix}
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      innerRadius={45}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="method"
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    >
                      {m.paymentMethodMix.map((_, i) => (
                        <Cell key={i} fill={['#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#f43f5e'][i % 5]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number, name: string) => [`${value} fiş`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {m.paymentMethodMix.map((p, i) => {
                    const total = m.paymentMethodMix.reduce((s, x) => s + x.count, 0)
                    const pct = total > 0 ? Math.round((p.count / total) * 100) : 0
                    const label = p.method === 'cash' ? 'Nakit' : p.method === 'card' ? 'Kart' : p.method === 'mixed' ? 'Karma' : p.method
                    return (
                      <div key={p.method} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: ['#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#f43f5e'][i % 5] }}
                            />
                            <span>{label}</span>
                          </div>
                          <span className="font-medium tabular-nums">{p.count} · %{pct}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{formatCurrency(p.revenue)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cashier performance */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
                    <Users className="w-4 h-4 text-violet-600" />
                  </div>
                  <CardTitle>Kasiyer Performansı</CardTitle>
                </div>
                <CardDescription>Kasiyer bazında fiş ve ciro</CardDescription>
              </div>
              <ExportButtons
                onCsv={() => exportCSV(
                  m.cashierPerformance.map((c, i) => ({
                    'Sıra': i + 1, 'Kasiyer': c.name, 'Fiş': c.txCount, 'Ciro': c.totalRevenue, 'Ort Sepet': c.avgBasket,
                  })),
                  'market-kasiyer.csv', 'Kasiyer Performansı',
                )}
                onXlsx={() => exportXLSX(
                  m.cashierPerformance.map((c, i) => ({
                    'Sıra': i + 1, 'Kasiyer': c.name, 'Fiş': c.txCount, 'Ciro': c.totalRevenue, 'Ort Sepet': c.avgBasket,
                  })),
                  'market-kasiyer.xls', 'Kasiyer Performansı',
                )}
              />
            </div>
          </CardHeader>
          <CardContent>
            {m.cashierPerformance.length === 0 ? (
              <EmptyState message="Kasiyer kaydı yok" />
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Kasiyer</TableHead>
                      <TableHead className="text-right">Fiş</TableHead>
                      <TableHead className="text-right">Ciro</TableHead>
                      <TableHead className="text-right">Ort. Sepet</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {m.cashierPerformance.map((c, i) => (
                      <TableRow key={c.userId}>
                        <TableCell>
                          <span className={cn(
                            'inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold',
                            i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-muted text-muted-foreground',
                          )}>{i + 1}</span>
                        </TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.txCount}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(c.totalRevenue)}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(c.avgBasket)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top products */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                  <Crown className="w-4 h-4 text-emerald-600" />
                </div>
                <CardTitle>En Çok Satan Ürünler</CardTitle>
              </div>
              <CardDescription>Ciro bazında ilk 10 ürün + mevcut stok</CardDescription>
            </div>
            <ExportButtons
              onCsv={() => exportCSV(
                m.topProducts.map((p, i) => ({
                  'Sıra': i + 1, 'Ürün': p.name, 'Adet': p.qty, 'Ciro': p.revenue, 'Mevcut Stok': p.currentStock,
                })),
                'market-top-urunler.csv', 'Top Ürünler',
              )}
              onXlsx={() => exportXLSX(
                m.topProducts.map((p, i) => ({
                  'Sıra': i + 1, 'Ürün': p.name, 'Adet': p.qty, 'Ciro': p.revenue, 'Mevcut Stok': p.currentStock,
                })),
                'market-top-urunler.xls', 'Top Ürünler',
              )}
            />
          </div>
        </CardHeader>
        <CardContent>
          {m.topProducts.length === 0 ? (
            <EmptyState message="Bu dönemde satılan ürün yok" />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-right">Adet</TableHead>
                    <TableHead className="text-right">Ciro</TableHead>
                    <TableHead className="text-right">Mevcut Stok</TableHead>
                    <TableHead className="text-right">Gün Kapağı</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.topProducts.map((p, i) => {
                    const turnMatch = m.stockTurnover.find((st) => st.name === p.name)
                    return (
                      <TableRow key={p.name}>
                        <TableCell>
                          <span className={cn(
                            'inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold',
                            i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                            i === 1 ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' :
                            i === 2 ? 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' :
                            'bg-muted text-muted-foreground',
                          )}>{i + 1}</span>
                        </TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{p.qty.toFixed(0)}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(p.revenue)}</TableCell>
                        <TableCell className={cn(
                          'text-right font-mono text-sm',
                          p.currentStock === 0 ? 'text-red-600' :
                          p.currentStock <= 5 ? 'text-amber-600' : 'text-foreground',
                        )}>{p.currentStock}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {turnMatch?.daysOfCover === null ? '—' : `${turnMatch?.daysOfCover}g`}
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

      {/* Low/out-of-stock alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                </div>
                <CardTitle>Stok Uyarıları</CardTitle>
              </div>
              <CardDescription>Düşük ve tükenmiş ürünler</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {m.lowStockProducts.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Stok sağlıklı</div>
                <div className="text-xs text-muted-foreground">Düşük stok eşiği altında ürün yok</div>
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-80 overflow-y-auto custom-scroll pr-1">
              {m.lowStockProducts.map((p) => {
                const out = p.stock === 0
                const critical = !out && p.stock <= Math.max(1, Math.floor(p.minStock / 2))
                return (
                  <div
                    key={p.name}
                    className={cn(
                      'p-3 rounded-lg border flex items-center gap-3',
                      out ? 'border-rose-200 bg-rose-50/50 dark:bg-rose-950/20' :
                      critical ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/20' :
                      'border-border bg-muted/20',
                    )}
                  >
                    <div className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                      out ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                      critical ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                    )}>
                      <Package className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.stock} / {p.minStock} (min) · {p.category ?? 'Genel'}
                      </div>
                    </div>
                    {out && (
                      <Badge variant="outline" className="text-rose-600 border-rose-200 bg-rose-50 dark:bg-rose-950/30 text-[10px]">Tükendi</Badge>
                    )}
                    {critical && !out && (
                      <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-[10px]">Kritik</Badge>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// SITE REPORTS
// ============================================================
export function SiteReports({ data }: { data: SiteReportsData }) {
  const s = data.site

  const kpis: KpiData[] = [
    {
      label: 'Tahsilat Oranı',
      value: `%${s.collectionRate.toFixed(0)}`,
      numericValue: s.collectionRate,
      sub: `Bu yıl ${formatCurrency(s.totalDuesCollected)}`,
      icon: TrendingUp,
      color: 'from-emerald-500 to-teal-600',
    },
    {
      label: 'Açık Şikayet',
      value: s.complaintStats.open,
      numericValue: s.complaintStats.open,
      sub: `${s.complaintStats.total} toplam`,
      icon: AlertTriangle,
      color: s.complaintStats.open > 0 ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600',
    },
    {
      label: 'Toplam Sakin',
      value: s.residentsCount,
      numericValue: s.residentsCount,
      sub: `${s.apartmentsCount} daire`,
      icon: Users,
      color: 'from-violet-500 to-purple-600',
    },
    {
      label: 'Personel',
      value: s.staffCount,
      numericValue: s.staffCount,
      sub: 'Site çalışanları',
      icon: Wrench,
      color: 'from-sky-500 to-blue-600',
    },
  ]

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => <KpiCard key={k.label} kpi={k} />)}
      </div>

      {/* Monthly dues collection */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-violet-600" />
                </div>
                <CardTitle>Aylık Aidat Tahsilatı (6 Ay)</CardTitle>
              </div>
              <CardDescription>Beklenen vs Tahsil edilen</CardDescription>
            </div>
            <ExportButtons
              onCsv={() => exportCSV(
                s.monthlyCollection.map((m) => ({
                  'Ay': m.month, 'Tahsil Edilen': m.collected, 'Beklenen': m.expected,
                })),
                'site-aidat-tahsilat.csv', 'Aidat Tahsilatı',
              )}
              onXlsx={() => exportXLSX(
                s.monthlyCollection.map((m) => ({
                  'Ay': m.month, 'Tahsil Edilen': m.collected, 'Beklenen': m.expected,
                })),
                'site-aidat-tahsilat.xls', 'Aidat Tahsilatı',
              )}
            />
          </div>
        </CardHeader>
        <CardContent>
          {s.monthlyCollection.every((m) => m.expected === 0 && m.collected === 0) ? (
            <EmptyState message="Son 6 ayda aidat verisi yok" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={s.monthlyCollection} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60} tickFormatter={(v: number) => formatCompactNumber(v)} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value: number, name: string) => {
                    if (name === 'collected') return [formatCurrency(value), 'Tahsil Edilen']
                    return [formatCurrency(value), 'Beklenen']
                  }}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} formatter={(value: string) => value === 'collected' ? 'Tahsil Edilen' : 'Beklenen'} />
                <Bar dataKey="expected" name="expected" fill="#cbd5e1" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar dataKey="collected" name="collected" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Complaint stats */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <CardTitle>Şikayet Özeti</CardTitle>
                </div>
                <CardDescription>Ortalama çözüm süresi: {s.complaintStats.avgResolutionHours === null ? '—' : `${s.complaintStats.avgResolutionHours} saat`}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Açık', value: s.complaintStats.open, fill: '#f59e0b' },
                      { name: 'Çözüldü', value: s.complaintStats.resolved, fill: '#10b981' },
                      { name: 'Diğer', value: Math.max(0, s.complaintStats.total - s.complaintStats.open - s.complaintStats.resolved), fill: '#64748b' },
                    ].filter((d) => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    innerRadius={50}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  >
                    {[0, 1, 2].map((i) => (
                      <Cell key={i} fill={['#f59e0b', '#10b981', '#64748b'][i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value: number, name: string) => [`${value} şikayet`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-xs text-muted-foreground">Toplam</div>
                <div className="text-3xl font-bold">{s.complaintStats.total}</div>
                <div className="text-xs text-muted-foreground">şikayet</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="rounded-lg border p-3 bg-amber-50/50 dark:bg-amber-950/20">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs text-muted-foreground">Açık</span>
                </div>
                <div className="text-xl font-bold text-amber-600 mt-1">{s.complaintStats.open}</div>
              </div>
              <div className="rounded-lg border p-3 bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs text-muted-foreground">Çözüldü</span>
                </div>
                <div className="text-xl font-bold text-emerald-600 mt-1">{s.complaintStats.resolved}</div>
              </div>
              <div className="rounded-lg border p-3 bg-sky-50/50 dark:bg-sky-950/20">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-600" />
                  <span className="text-xs text-muted-foreground">Ort. Süre</span>
                </div>
                <div className="text-xl font-bold text-sky-600 mt-1">{s.complaintStats.avgResolutionHours === null ? '—' : `${s.complaintStats.avgResolutionHours}h`}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Complaint breakdown by category */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
                    <Wrench className="w-4 h-4 text-rose-600" />
                  </div>
                  <CardTitle>Şikayet Kategorileri</CardTitle>
                </div>
                <CardDescription>Kategori ve öncelik dağılımı</CardDescription>
              </div>
              <ExportButtons
                onCsv={() => exportCSV(
                  s.complaintStats.byCategory.map((c) => ({
                    'Kategori': c.category, 'Şikayet': c.count, 'Ort Süre (saat)': c.avgHours,
                  })),
                  'site-sikayet-kategori.csv', 'Şikayet Kategori',
                )}
              />
            </div>
          </CardHeader>
          <CardContent>
            {s.complaintStats.byCategory.length === 0 ? (
              <EmptyState message="Şikayet kaydı yok" />
            ) : (
              <div className="space-y-3">
                <div className="space-y-2 max-h-44 overflow-y-auto custom-scroll pr-1">
                  {s.complaintStats.byCategory.map((c) => {
                    const max = s.complaintStats.byCategory[0].count || 1
                    const pct = (c.count / max) * 100
                    return (
                      <div key={c.category} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium capitalize">{c.category}</span>
                          <span className="text-muted-foreground">{c.count} · {c.avgHours > 0 ? `${c.avgHours}h` : '—'}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
                  {s.complaintStats.byPriority.map((p) => {
                    const color = p.priority === 'acil' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                      p.priority === 'yuksek' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                      p.priority === 'normal' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    return (
                      <Badge key={p.priority} variant="outline" className={cn('text-[10px] capitalize', color)}>
                        {p.priority}: {p.count}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resident growth */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                  <Home className="w-4 h-4 text-emerald-600" />
                </div>
                <CardTitle>Sakin Büyümesi (12 Ay)</CardTitle>
              </div>
              <CardDescription>Aylık yeni sakin + kümülatif toplam</CardDescription>
            </div>
            <ExportButtons
              onCsv={() => exportCSV(
                s.residentGrowth.map((r) => ({
                  'Ay': r.month, 'Yeni Sakin': r.newResidents, 'Kümülatif': r.cumulative,
                })),
                'site-sakin-buyume.csv', 'Sakin Büyümesi',
              )}
            />
          </div>
        </CardHeader>
        <CardContent>
          {s.residentGrowth.every((r) => r.newResidents === 0 && r.cumulative === 0) ? (
            <EmptyState message="Sakin büyüme verisi yok" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={s.residentGrowth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '12px' }} formatter={(value: string) => value === 'cumulative' ? 'Kümülatif' : 'Yeni Sakin'} />
                <Line type="monotone" dataKey="cumulative" name="cumulative" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="newResidents" name="newResidents" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Staff workload */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/30 flex items-center justify-center">
                  <Users className="w-4 h-4 text-sky-600" />
                </div>
                <CardTitle>Personel İş Yükü</CardTitle>
              </div>
              <CardDescription>Site bazında kişi başına düşen ortalama şikayet</CardDescription>
            </div>
            <ExportButtons
              onCsv={() => exportCSV(
                s.staffWorkload.map((w) => ({
                  'Personel': w.name, 'Atanan': w.assignedComplaints, 'Çözülen': w.resolvedComplaints,
                })),
                'site-personel-yuku.csv', 'Personel İş Yükü',
              )}
            />
          </div>
        </CardHeader>
        <CardContent>
          {s.staffWorkload.length === 0 ? (
            <EmptyState message="Personel kaydı yok" />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Personel</TableHead>
                    <TableHead className="text-right">Atanan</TableHead>
                    <TableHead className="text-right">Çözülen</TableHead>
                    <TableHead className="text-right">Çözüm Oranı</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.staffWorkload.map((w, i) => {
                    const rate = w.assignedComplaints > 0 ? Math.round((w.resolvedComplaints / w.assignedComplaints) * 100) : 0
                    return (
                      <TableRow key={w.userId}>
                        <TableCell>
                          <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold">{i + 1}</span>
                        </TableCell>
                        <TableCell className="font-medium">{w.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{w.assignedComplaints}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600">{w.resolvedComplaints}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  rate >= 70 ? 'bg-emerald-500' : rate >= 30 ? 'bg-amber-500' : 'bg-rose-500',
                                )}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium tabular-nums w-9 text-right">%{rate}</span>
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
    </div>
  )
}

// ============================================================
// APPOINTMENTS REPORTS
// ============================================================
type ApptSortKey = 'name' | 'total' | 'completed' | 'cancelled' | 'noShow' | 'revenue'

export function AppointmentsReports({ data }: { data: AppointmentsReportsData }) {
  const a = data.appointments
  const [sortKey, setSortKey] = useState<ApptSortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const kpis: KpiData[] = [
    {
      label: 'Toplam Randevu',
      value: a.totalCount,
      numericValue: a.totalCount,
      sub: `${a.completedCount} tamamlandı`,
      icon: Calendar,
      color: 'from-pink-500 to-rose-600',
    },
    {
      label: 'No-show Oranı',
      value: `%${a.noShowRate}`,
      numericValue: a.noShowRate,
      sub: `${a.noShowCount} gelmedi · ${a.cancelledCount} iptal`,
      icon: UserX,
      color: a.noShowRate > 15 ? 'from-rose-500 to-red-600' : a.noShowRate > 5 ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600',
    },
    {
      label: 'Dönem Cirosu',
      value: formatCurrency(a.totalRevenue),
      numericValue: a.totalRevenue,
      sub: 'Tamamlanan randevular',
      icon: TrendingUp,
      color: 'from-emerald-500 to-teal-600',
    },
    {
      label: 'Sağlayıcı Sayısı',
      value: a.providerNames.length,
      numericValue: a.providerNames.length,
      sub: a.providerNames[0] ?? '—',
      icon: Users,
      color: 'from-violet-500 to-purple-600',
    },
  ]

  const sortedStaff = useMemo(() => {
    const sorted = [...a.staffPerformance].sort((x, y) => {
      const av = x[sortKey]
      const bv = y[sortKey]
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv, 'tr')
      return (av as number) - (bv as number)
    })
    return sortDir === 'asc' ? sorted : sorted.reverse()
  }, [a.staffPerformance, sortKey, sortDir])

  const toggleSort = (key: ApptSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // Busy hours: 7x24 grid (Paz-Cmt, 0-23)
  const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
  const busyMatrix: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const b of a.busyHours) {
    if (b.dayOfWeek >= 0 && b.dayOfWeek < 7 && b.hour >= 0 && b.hour < 24) {
      busyMatrix[b.dayOfWeek][b.hour] = b.count
    }
  }
  const maxBusy = Math.max(...busyMatrix.flat(), 1)

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => <KpiCard key={k.label} kpi={k} />)}
      </div>

      {/* Daily appointment volume */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-pink-50 dark:bg-pink-950/30 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-pink-600" />
                </div>
                <CardTitle>Günlük Randevu Hacmi</CardTitle>
              </div>
              <CardDescription>Son 30 gün · tüm sağlayıcılar</CardDescription>
            </div>
            <ExportButtons
              onCsv={() => exportCSV(
                a.dailyAppointments.map((d) => ({ 'Tarih': d.date, 'Randevu': d.count, 'Ciro': d.revenue })),
                'randevu-gunluk.csv', 'Günlük Randevu',
              )}
              onXlsx={() => exportXLSX(
                a.dailyAppointments.map((d) => ({ 'Tarih': d.date, 'Randevu': d.count, 'Ciro': d.revenue })),
                'randevu-gunluk.xls', 'Günlük Randevu',
              )}
            />
          </div>
        </CardHeader>
        <CardContent>
          {a.dailyAppointments.every((d) => d.count === 0) ? (
            <EmptyState message="Bu dönemde randevu kaydı yok" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={a.dailyAppointments} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="apptRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ec4899" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ec4899" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => formatDayLabel(v)}
                  interval={4}
                />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value: number, name: string) => {
                    if (name === 'count') return [`${value} randevu`, 'Adet']
                    return [formatCurrency(value), 'Ciro']
                  }}
                  labelFormatter={(v: string) => formatDayLabel(v)}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="count"
                  stroke="#ec4899"
                  strokeWidth={2.5}
                  fill="url(#apptRevGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#ec4899' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* No-show rate donut */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
                    <UserX className="w-4 h-4 text-rose-600" />
                  </div>
                  <CardTitle>Randevu Durumu</CardTitle>
                </div>
                <CardDescription>Tamamlanan / İptal / Gelmedi</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {a.totalCount === 0 ? (
              <EmptyState message="Randevu kaydı yok" />
            ) : (
              <div className="relative">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Tamamlandı', value: a.completedCount, fill: '#10b981' },
                        { name: 'İptal', value: a.cancelledCount, fill: '#f43f5e' },
                        { name: 'Gelmedi', value: a.noShowCount, fill: '#f59e0b' },
                      ].filter((d) => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      innerRadius={55}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    >
                      {[0, 1, 2].map((i) => (
                        <Cell key={i} fill={['#10b981', '#f43f5e', '#f59e0b'][i]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number, name: string) => [`${value} randevu`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-xs text-muted-foreground">No-show</div>
                  <div className="text-3xl font-bold text-rose-600">%{a.noShowRate}</div>
                  <div className="text-xs text-muted-foreground">{a.noShowCount}/{a.completedCount + a.noShowCount}</div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="rounded-lg border p-3 bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs text-muted-foreground">Tamam</span>
                </div>
                <div className="text-xl font-bold text-emerald-600 mt-1">{a.completedCount}</div>
              </div>
              <div className="rounded-lg border p-3 bg-rose-50/50 dark:bg-rose-950/20">
                <div className="flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span className="text-xs text-muted-foreground">İptal</span>
                </div>
                <div className="text-xl font-bold text-rose-600 mt-1">{a.cancelledCount}</div>
              </div>
              <div className="rounded-lg border p-3 bg-amber-50/50 dark:bg-amber-950/20">
                <div className="flex items-center gap-1.5">
                  <UserX className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs text-muted-foreground">Gelmedi</span>
                </div>
                <div className="text-xl font-bold text-amber-600 mt-1">{a.noShowCount}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Revenue by service */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                  </div>
                  <CardTitle>Hizmet Bazlı Ciro</CardTitle>
                </div>
                <CardDescription>En çok ciro getiren 10 hizmet</CardDescription>
              </div>
              <ExportButtons
                onCsv={() => exportCSV(
                  a.revenueByService.map((s, i) => ({
                    'Sıra': i + 1, 'Hizmet': s.name, 'Randevu': s.count, 'Ciro': s.revenue, 'Ort Fiyat': s.avgPrice,
                  })),
                  'randevu-hizmet-ciro.csv', 'Hizmet Bazlı Ciro',
                )}
                onXlsx={() => exportXLSX(
                  a.revenueByService.map((s, i) => ({
                    'Sıra': i + 1, 'Hizmet': s.name, 'Randevu': s.count, 'Ciro': s.revenue, 'Ort Fiyat': s.avgPrice,
                  })),
                  'randevu-hizmet-ciro.xls', 'Hizmet Bazlı Ciro',
                )}
              />
            </div>
          </CardHeader>
          <CardContent>
            {a.revenueByService.length === 0 ? (
              <EmptyState message="Bu dönemde ciro kaydı yok" />
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Hizmet</TableHead>
                      <TableHead className="text-right">Randevu</TableHead>
                      <TableHead className="text-right">Ort. Fiyat</TableHead>
                      <TableHead className="text-right">Ciro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {a.revenueByService.map((s, i) => (
                      <TableRow key={s.name}>
                        <TableCell>
                          <span className={cn(
                            'inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold',
                            i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-muted text-muted-foreground',
                          )}>{i + 1}</span>
                        </TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{s.count}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(s.avgPrice)}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(s.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Staff performance */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
                  <Users className="w-4 h-4 text-violet-600" />
                </div>
                <CardTitle>Personel Performansı</CardTitle>
              </div>
              <CardDescription>Sortable · randevu sayısı, ciro, no-show %</CardDescription>
            </div>
            <ExportButtons
              onCsv={() => exportCSV(
                sortedStaff.map((s) => ({
                  'Personel': s.name, 'Toplam': s.total, 'Tamam': s.completed, 'İptal': s.cancelled,
                  'No-show': s.noShow, 'Ciro': s.revenue,
                  'No-show %': s.completed + s.noShow > 0 ? Math.round((s.noShow / (s.completed + s.noShow)) * 100) : 0,
                })),
                'randevu-personel.csv', 'Personel Performansı',
              )}
              onXlsx={() => exportXLSX(
                sortedStaff.map((s) => ({
                  'Personel': s.name, 'Toplam': s.total, 'Tamam': s.completed, 'İptal': s.cancelled,
                  'No-show': s.noShow, 'Ciro': s.revenue,
                  'No-show %': s.completed + s.noShow > 0 ? Math.round((s.noShow / (s.completed + s.noShow)) * 100) : 0,
                })),
                'randevu-personel.xls', 'Personel Performansı',
              )}
            />
          </div>
        </CardHeader>
        <CardContent>
          {sortedStaff.length === 0 ? (
            <EmptyState message="Personel kaydı yok" />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10">#</TableHead>
                    <ApptSortHeader k="name" label="Personel" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <ApptSortHeader k="total" label="Toplam" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <ApptSortHeader k="completed" label="Tamam" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <ApptSortHeader k="cancelled" label="İptal" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <ApptSortHeader k="noShow" label="Gelmedi" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <ApptSortHeader k="revenue" label="Ciro" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <TableHead className="text-right">No-show %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStaff.map((s, i) => {
                    const noShowPct = s.completed + s.noShow > 0 ? Math.round((s.noShow / (s.completed + s.noShow)) * 100) : 0
                    return (
                      <TableRow key={s.userId}>
                        <TableCell>
                          <span className={cn(
                            'inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold',
                            i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-muted text-muted-foreground',
                          )}>{i + 1}</span>
                        </TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{s.total}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600">{s.completed}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-rose-600">{s.cancelled}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-amber-600">{s.noShow}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(s.revenue)}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  noShowPct >= 15 ? 'bg-rose-500' : noShowPct >= 5 ? 'bg-amber-500' : 'bg-emerald-500',
                                )}
                                style={{ width: `${Math.min(noShowPct, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium tabular-nums w-9 text-right">%{noShowPct}</span>
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

      {/* Busy hours heatmap (7x24) */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/30 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-sky-600" />
                </div>
                <CardTitle>Yoğun Saatler</CardTitle>
              </div>
              <CardDescription>7×24 grid · gün × saat</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {a.busyHours.length === 0 ? (
            <EmptyState message="Bu dönemde randevu kaydı yok" />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                {/* Hour labels (top) */}
                <div className="grid grid-cols-[40px_repeat(24,1fr)] gap-0.5 mb-1">
                  <div />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="text-[10px] text-muted-foreground text-center">
                      {h % 3 === 0 ? `${String(h).padStart(2, '0')}` : ''}
                    </div>
                  ))}
                </div>
                {/* Day rows */}
                {busyMatrix.map((row, dayIdx) => (
                  <div key={dayIdx} className="grid grid-cols-[40px_repeat(24,1fr)] gap-0.5 mb-0.5">
                    <div className="text-xs text-muted-foreground flex items-center font-medium">
                      {dayNames[dayIdx]}
                    </div>
                    {row.map((count, hourIdx) => {
                      const intensity = count / maxBusy
                      const bg = count === 0
                        ? 'bg-muted/30'
                        : intensity > 0.75 ? 'bg-rose-500'
                        : intensity > 0.5 ? 'bg-amber-500'
                        : intensity > 0.25 ? 'bg-amber-400'
                        : 'bg-amber-300'
                      return (
                        <div
                          key={hourIdx}
                          className={cn('aspect-square rounded-sm flex items-center justify-center', bg)}
                          title={`${dayNames[dayIdx]} ${String(hourIdx).padStart(2, '0')}:00 · ${count} randevu`}
                        >
                          {count > 0 && <span className="text-[9px] font-medium text-white">{count}</span>}
                        </div>
                      )
                    })}
                  </div>
                ))}
                {/* Legend */}
                <div className="flex items-center justify-end gap-2 mt-2 text-xs text-muted-foreground">
                  <span>Az</span>
                  <div className="flex gap-0.5">
                    <div className="w-3 h-3 rounded-sm bg-amber-300" />
                    <div className="w-3 h-3 rounded-sm bg-amber-400" />
                    <div className="w-3 h-3 rounded-sm bg-amber-500" />
                    <div className="w-3 h-3 rounded-sm bg-rose-500" />
                  </div>
                  <span>Çok</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Sort header — Appointments staff table
// ============================================================
function ApptSortHeader({
  k, label, align = 'left', sortKey, sortDir, onToggle,
}: {
  k: ApptSortKey
  label: string
  align?: 'left' | 'right'
  sortKey: ApptSortKey
  sortDir: 'asc' | 'desc'
  onToggle: (k: ApptSortKey) => void
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
