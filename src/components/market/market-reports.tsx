'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart3, BarChart2, PieChart as PieChartIcon, TrendingUp, Package,
  AlertTriangle, Clock, Calendar, Wallet, Banknote, CreditCard, Receipt,
} from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/lib/format'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { cn } from '@/lib/utils'

interface ReportData {
  date: string
  dailySummary: {
    subtotal: number
    taxTotal: number
    total: number
    cashAmount: number
    cardAmount: number
    count: number
    cashCount: number
    cardCount: number
    mixedCount: number
  }
  hourly: Array<{ hour: number; total: number; count: number }>
  topProducts: Array<{ id: string; name: string; qty: number; total: number }>
  byCategory: Array<{ name: string; value: number }>
  stockValue: number
  stockCost: number
  lowStock: Array<{ id: string; name: string; sku: string | null; stock: number; minStock: number; category: string | null }>
  lowStockCount: number
  productCount: number
  shifts: Array<{
    id: string
    number: string
    status: string
    openingCash: number
    closingCash: number | null
    expectedCash: number | null
    difference: number | null
    openingTime: string
    closingTime: string | null
    _count?: { sales: number }
  }>
  returns: { total: number; count: number; items: Array<{ totalAmount: number; reason: string; createdAt: string }> }
}

const CATEGORY_COLORS = ['#10b981', '#14b8a6', '#f59e0b', '#8b5cf6', '#64748b', '#ef4444', '#06b6d4', '#84cc16']

export function MarketReports({ marketId }: { marketId: string }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const { data, isLoading } = useQuery({
    queryKey: ['market-reports', marketId, date],
    queryFn: () => apiGet<ReportData>(`/api/market/${marketId}/reports?date=${date}`),
  })

  const report = data

  const hourlyData = useMemo(() => {
    if (!report) return []
    return report.hourly.map((h) => ({
      ...h,
      hourLabel: `${h.hour}:00`,
    }))
  }, [report])

  if (isLoading || !report) {
    return <Skeleton className="h-96 w-full" />
  }

  const { dailySummary: ds } = report

  return (
    <div className="space-y-4">
      {/* Tarih seçici */}
      <Card>
        <CardContent className="p-3 flex items-center gap-3">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Label className="text-xs text-muted-foreground">Tarih:</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto h-9"
          />
          <Button variant="ghost" size="sm" onClick={() => setDate(new Date().toISOString().slice(0, 10))}>
            Bugün
          </Button>
        </CardContent>
      </Card>

      {/* Üst özet kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xs text-muted-foreground">Günlük Satış</div>
            </div>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-2">{formatCurrency(ds.total)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{ds.count} fiş</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                <Banknote className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xs text-muted-foreground">Nakit</div>
            </div>
            <div className="text-2xl font-bold mt-2">{formatCurrency(ds.cashAmount)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{ds.cashCount} fiş</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-violet-600" />
              </div>
              <div className="text-xs text-muted-foreground">Kart</div>
            </div>
            <div className="text-2xl font-bold mt-2">{formatCurrency(ds.cardAmount)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{ds.cardCount} fiş</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
                <Receipt className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-xs text-muted-foreground">İade</div>
            </div>
            <div className="text-2xl font-bold text-red-600 mt-2">{formatCurrency(report.returns.total)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{report.returns.count} adet</div>
          </CardContent>
        </Card>
      </div>

      {/* Saatlik satış grafiği */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-sm">Saatlik Satış Dağılımı</h3>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="hourLabel" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip
                formatter={(v: number) => formatCurrency(v)}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="total" name="Satış" radius={[4, 4, 0, 0]}>
                {hourlyData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.total > 0 ? '#10b981' : '#e2e8f0'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* En çok satan ürünler */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <h3 className="font-semibold text-sm">En Çok Satan Ürünler (Top 10)</h3>
            </div>
            {report.topProducts.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Bu tarihte satış yok
              </div>
            ) : (
              <div className="space-y-2">
                {report.topProducts.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                      idx === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' :
                      idx === 1 ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' :
                      idx === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400' :
                      'bg-muted text-muted-foreground',
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.qty} adet</div>
                    </div>
                    <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(p.total)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Kategori bazlı satış (pie) */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <PieChartIcon className="w-4 h-4 text-violet-600" />
              <h3 className="font-semibold text-sm">Kategori Bazlı Satış</h3>
            </div>
            {report.byCategory.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Bu tarihte satış yok
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={report.byCategory}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} %${((percent ?? 0) * 100).toFixed(0)}`}
                    labelLine={false}
                    style={{ fontSize: 10 }}
                  >
                    {report.byCategory.map((_, idx) => (
                      <Cell key={idx} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stok özeti */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-emerald-600" />
              <h3 className="font-semibold text-sm">Stok Değeri</h3>
            </div>
            <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
              {formatCurrency(report.stockValue)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {report.productCount} ürün × fiyat
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h3 className="font-semibold text-sm">Düşük Stok</h3>
            </div>
            <div className="text-3xl font-bold text-amber-600">
              {report.lowStockCount}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              min stok altındaki ürün
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-violet-600" />
              <h3 className="font-semibold text-sm">Ortalama Fiş</h3>
            </div>
            <div className="text-3xl font-bold">
              {ds.count > 0 ? formatCurrency(ds.total / ds.count) : '—'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {ds.count} fiş / gün
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Düşük stok listesi */}
      {report.lowStock.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h3 className="font-semibold text-sm">Düşük Stok Listesi</h3>
              <Badge variant="outline" className="text-amber-700 border-amber-300">{report.lowStock.length}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {report.lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/10">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    {p.sku && <div className="text-xs text-muted-foreground">SKU: {p.sku}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-amber-600">{p.stock}</div>
                    <div className="text-xs text-muted-foreground">min: {p.minStock}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vardiya özetleri */}
      {report.shifts.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-emerald-600" />
              <h3 className="font-semibold text-sm">Vardiya Özetleri ({report.date})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left py-2">Vardiya</th>
                    <th className="text-left py-2">Açılış</th>
                    <th className="text-right py-2">Açılış Nakit</th>
                    <th className="text-right py-2">Beklenen</th>
                    <th className="text-right py-2">Fişli</th>
                    <th className="text-right py-2">Fark</th>
                    <th className="text-center py-2">Fiş</th>
                    <th className="text-center py-2">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {report.shifts.map((s) => {
                    const diff = s.difference ?? 0
                    return (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{s.number}</td>
                        <td className="py-2 text-xs">{formatDateTime(s.openingTime)}</td>
                        <td className="py-2 text-right">{formatCurrency(s.openingCash)}</td>
                        <td className="py-2 text-right">{s.expectedCash !== null ? formatCurrency(s.expectedCash) : '—'}</td>
                        <td className="py-2 text-right">{s.closingCash !== null ? formatCurrency(s.closingCash) : '—'}</td>
                        <td className={cn('py-2 text-right font-semibold', diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-amber-600' : 'text-red-600')}>
                          {s.difference !== null ? `${diff > 0 ? '+' : ''}${formatCurrency(diff)}` : '—'}
                        </td>
                        <td className="py-2 text-center text-xs">{s._count?.sales ?? 0}</td>
                        <td className="py-2 text-center">
                          <Badge variant={s.status === 'acik' ? 'default' : 'secondary'}
                            className={s.status === 'acik' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : ''}>
                            {s.status === 'acik' ? 'Açık' : 'Kapalı'}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
