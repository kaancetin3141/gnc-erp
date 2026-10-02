'use client'

// ============================================================
// TAHSİLAT YAŞLENDİRMA RAPORU (Reports · SECTION 11)
// · Müşteri bazlı bekleyen fatura dökümü — vade gecikmesi kovalarına göre
// · Her müşteri için yığılmış yaşlandırma barı + en eski gecikme
// · KPI: toplam bekleyen / vadesi geçmiş / gecikmiş müşteri / ort. gecikme
// · CSV + XLSX dışa aktarma; müşteri adına tıklayınca Müşteri 360 açılır
// Veri kaynağı: /api/invoices (list) — istemci tarafında gruplanır.
// ============================================================

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import {
  Hourglass, HandCoins, CalendarClock, CalendarDays, CalendarX2,
  UserX, Download, Info, AlertTriangle, ArrowUpDown, Users,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { toCSV, downloadFile } from '@/lib/format'
import { exportRowsToExcel } from '@/lib/excel-export'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import type { SessionUser } from '@/types'
import type { Invoice } from '@/components/erp/parts/types'
import { toTry, overdueDays, useFxRates } from '@/components/erp/parts/invoice-utils'
import {
  AGING_BUCKETS, bucketOf, type AgingBucket,
} from '@/components/erp/parts/invoice-aging'

// Yaşlandırma kova sırası — bar ve kolonlar aynı dizide
const BUCKET_KEYS: Exclude<AgingBucket, '__all__'>[] = ['notdue', 'd1_30', 'd31_60', 'd61p']

// Kova HEX renkleri (bar göstergeleri — tailwind sınıflarıyla aynı palet)
const BUCKET_HEX: Record<string, string> = {
  notdue: '#94a3b8',   // slate-400
  d1_30: '#fbbf24',    // amber-400
  d31_60: '#f97316',   // orange-500
  d61p: '#ef4444',     // red-500
}

interface CustomerAgingRow {
  customerId: string
  name: string
  segment?: string
  count: number
  totalTry: number
  buckets: Record<string, { count: number; amount: number }>
  overdueTry: number   // notdue hariç gecikmiş toplam
  oldestDays: number   // en eski gecikme günü (0 = gecikme yok)
}

export function AgingReportCard() {
  // Canlı döviz kuru — toTry hesapları bu veriyle güncellenir
  useFxRates()
  const user = useAppStore((s) => s.user)
  const openCustomer = useAppStore((s) => s.openCustomer)

  // Görünürlük: fatura listesi API'si ile aynı yetki (erp.manage);
  // Faturalar kenar çubuğu öğesi de bu yetkiyle görünür
  const canViewInvoices = hasPermission(user as SessionUser | null, 'erp.manage')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoices', 'aging-report'],
    queryFn: () => apiGet<{ items: Invoice[] }>(`/api/invoices?limit=200`),
    enabled: canViewInvoices,
    refetchInterval: 120_000,
  })

  const rows = useMemo<CustomerAgingRow[]>(() => {
    const invoices = data?.items ?? []
    const now = Date.now()
    const pending = invoices.filter((i) => i.status === 'odeme_bekliyor' || i.status === 'gecikti')
    const byCustomer = new Map<string, CustomerAgingRow>()
    for (const inv of pending) {
      const id = inv.customer?.id ?? inv.customerId
      let row = byCustomer.get(id)
      if (!row) {
        row = {
          customerId: id,
          name: inv.customer?.name ?? 'Bilinmeyen',
          segment: inv.customer?.segment,
          count: 0,
          totalTry: 0,
          buckets: {},
          overdueTry: 0,
          oldestDays: 0,
        }
        for (const b of BUCKET_KEYS) row.buckets[b] = { count: 0, amount: 0 }
        byCustomer.set(id, row)
      }
      const amount = toTry(inv.total, inv.currency)
      const bucket = bucketOf(inv, now)
      row.count += 1
      row.totalTry += amount
      row.buckets[bucket].count += 1
      row.buckets[bucket].amount += amount
      const days = overdueDays(inv.dueDate, now)
      if (bucket !== 'notdue') {
        row.overdueTry += amount
        if (days > row.oldestDays) row.oldestDays = days
      }
    }
    // Sıralama: gecikmiş tutar desc, sonra toplam bekleyen desc
    return Array.from(byCustomer.values()).sort((a, b) =>
      b.overdueTry - a.overdueTry || b.totalTry - a.totalTry || b.count - a.count,
    )
  }, [data])

  const kpis = useMemo(() => {
    const totalPending = rows.reduce((s, r) => s + r.totalTry, 0)
    const totalOverdue = rows.reduce((s, r) => s + r.overdueTry, 0)
    const overdueCustomers = rows.filter((r) => r.overdueTry > 0).length
    // Ağırlıklı ortalama gecikme (gecikmiş fatura tutarına göre)
    let weightedSum = 0
    let weightTotal = 0
    for (const r of rows) {
      if (r.overdueTry > 0 && r.oldestDays > 0) {
        weightedSum += r.oldestDays * r.overdueTry
        weightTotal += r.overdueTry
      }
    }
    const avgOverdue = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0
    return { totalPending, totalOverdue, overdueCustomers, avgOverdue }
  }, [rows])

  if (!canViewInvoices) return null

  const fmtTry = (n: number) =>
    n >= 1000000
      ? `${(n / 1000000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} M ₺`
      : n >= 1000
        ? `${(n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} bin ₺`
        : `${n.toLocaleString('tr-TR')} ₺`

  const buildExportRows = () =>
    rows.map((r) => {
      const row: Record<string, string | number> = {
        'Müşteri': r.name,
        'Segment': r.segment ?? '',
        'Bekleyen Fatura': r.count,
        'Toplam Bekleyen (TRY)': Math.round(r.totalTry),
        'Vadesi Geçmemiş (TRY)': Math.round(r.buckets.notdue?.amount ?? 0),
        '1-30 Gün (TRY)': Math.round(r.buckets.d1_30?.amount ?? 0),
        '31-60 Gün (TRY)': Math.round(r.buckets.d31_60?.amount ?? 0),
        '61+ Gün (TRY)': Math.round(r.buckets.d61p?.amount ?? 0),
        'Gecikmiş Toplam (TRY)': Math.round(r.overdueTry),
        'En Eski Gecikme (Gün)': r.oldestDays || '',
      }
      return row
    })

  const handleExportCSV = () => {
    const exportRows = buildExportRows()
    if (!exportRows.length) {
      toast.error('Dışa aktarılacak veri yok', { description: 'Bekleyen fatura bulunamadı.' })
      return
    }
    downloadFile(toCSV(exportRows), 'tahsilat-yaslandirma.csv', 'text/csv;charset=utf-8')
    toast.success('CSV dışa aktarıldı', { description: 'tahsilat-yaslandirma.csv indirildi.' })
  }

  const handleExportXLSX = () => {
    exportRowsToExcel(buildExportRows(), {
      filename: 'tahsilat-yaslandirma',
      sheetName: 'Yaşlandırma',
      successMessage: 'Yaşlandırma raporu Excel olarak indirildi',
      emptyMessage: 'Dışa aktarılacak veri yok',
    })
  }

  return (
    <Card className="shadow-soft overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-sm shrink-0">
              <Hourglass className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                Tahsilat Yaşlandırma Raporu
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Müşteri bazlı bekleyen faturalar — vade gecikmesi kovalarına göre
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExportCSV}>
              <Download className="w-3.5 h-3.5 mr-1" /> CSV
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExportXLSX}>
              <Download className="w-3.5 h-3.5 mr-1" /> XLSX
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError ? (
          <div className="p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <div className="text-sm font-medium">Veri alınamadı</div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Yeniden dene
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-3">
              <HandCoins className="w-7 h-7 text-emerald-500" />
            </div>
            <div className="font-semibold">Bekleyen tahsilat yok 🎉</div>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Tüm faturalar tahsil edilmiş durumda. Yeni bekleyen fatura oluştuğunda burada yaşlandırma dökümü görünür.
            </p>
          </div>
        ) : (
          <>
            {/* KPI satırı */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg border border-border bg-muted/20">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shrink-0">
                    <HandCoins className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Toplam Bekleyen</span>
                </div>
                <div className="text-lg font-bold tabular-nums">{fmtTry(kpis.totalPending)}</div>
                <div className="text-[10px] text-muted-foreground">{rows.length} müşteri · TRY bazlı</div>
              </div>
              <div className="p-3 rounded-lg border border-border bg-muted/20">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                    kpis.totalOverdue > 0
                      ? 'bg-gradient-to-br from-red-500 to-rose-600'
                      : 'bg-gradient-to-br from-emerald-500 to-teal-600',
                  )}>
                    <AlertTriangle className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Vadesi Geçmiş</span>
                </div>
                <div className={cn('text-lg font-bold tabular-nums', kpis.totalOverdue > 0 && 'text-red-600')}>
                  {fmtTry(kpis.totalOverdue)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  toplamın %{kpis.totalPending > 0 ? Math.round((kpis.totalOverdue / kpis.totalPending) * 100) : 0}&apos;ı
                </div>
              </div>
              <div className="p-3 rounded-lg border border-border bg-muted/20">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shrink-0">
                    <UserX className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Gecikmiş Müşteri</span>
                </div>
                <div className="text-lg font-bold tabular-nums">
                  {kpis.overdueCustomers}
                  <span className="text-xs font-normal text-muted-foreground"> / {rows.length}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">gecikmiş bakiyesi olan</div>
              </div>
              <div className="p-3 rounded-lg border border-border bg-muted/20">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shrink-0">
                    <CalendarClock className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Ort. Gecikme</span>
                </div>
                <div className="text-lg font-bold tabular-nums">
                  {kpis.avgOverdue > 0 ? `${kpis.avgOverdue} gün` : '—'}
                </div>
                <div className="text-[10px] text-muted-foreground">tutar ağırlıklı ortalama</div>
              </div>
            </div>

            {/* Lejant */}
            <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
              {AGING_BUCKETS.map((b) => (
                <span key={b.value} className="inline-flex items-center gap-1">
                  <span className={cn('w-2 h-2 rounded-full', b.color)} />
                  {b.label}
                </span>
              ))}
              <span className="ml-auto inline-flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" />
                Gecikmiş tutara göre sıralı
              </span>
            </div>

            {/* Müşteri satırları */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="divide-y divide-border/60 max-h-[420px] overflow-y-auto custom-scroll">
                {rows.map((r) => {
                  const maxAmount = Math.max(...BUCKET_KEYS.map((k) => r.buckets[k]?.amount ?? 0), 1)
                  const hasOverdue = r.overdueTry > 0
                  return (
                    <div
                      key={r.customerId}
                      className={cn(
                        'p-3 hover:bg-muted/40 transition-colors',
                        hasOverdue && 'bg-red-50/30 dark:bg-red-950/10',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <button
                          onClick={() => openCustomer(r.customerId)}
                          className="group text-left min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 rounded"
                          title="Müşteri 360'ı aç"
                        >
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-muted-foreground group-hover:text-fuchsia-600 shrink-0" />
                            <span className="text-sm font-semibold group-hover:text-fuchsia-700 group-hover:underline underline-offset-2 truncate max-w-[220px]">
                              {r.name}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {r.segment && <Badge variant="outline" className="text-[8px] h-3.5 px-1">{r.segment}</Badge>}
                            <span>{r.count} bekleyen fatura</span>
                            {hasOverdue && r.oldestDays > 0 && (
                              <span className="text-red-600 font-medium">· en eski {r.oldestDays} gün</span>
                            )}
                          </div>
                        </button>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold tabular-nums">{fmtTry(r.totalTry)}</div>
                          {hasOverdue && (
                            <div className="text-[10px] text-red-600 font-semibold tabular-nums">
                              {fmtTry(r.overdueTry)} gecikmiş
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Yığılmış yaşlandırma barı */}
                      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${r.name} yaşlandırma dağılımı`}>
                        {BUCKET_KEYS.map((k) => {
                          const amount = r.buckets[k]?.amount ?? 0
                          if (amount <= 0) return null
                          return (
                            <div
                              key={k}
                              className="h-full transition-all"
                              style={{ width: `${Math.max((amount / r.totalTry) * 100, 2)}%`, backgroundColor: BUCKET_HEX[k] }}
                              title={`${AGING_BUCKETS.find((b) => b.value === k)?.label}: ${fmtTry(amount)}`}
                            />
                          )
                        })}
                      </div>

                      {/* Kova kırılımı — mobilde 2 kolon, sm+ 4 kolon */}
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {BUCKET_KEYS.map((k) => {
                          const cell = r.buckets[k]
                          const isEmpty = !cell || cell.count === 0
                          const meta = AGING_BUCKETS.find((b) => b.value === k)
                          return (
                            <div
                              key={k}
                              className={cn(
                                'rounded-md border px-2 py-1 min-w-0',
                                isEmpty ? 'border-dashed border-border/60 opacity-50' : cn('border-border', meta?.chipCls),
                              )}
                            >
                              <div className="text-[9px] uppercase tracking-wide truncate flex items-center gap-1">
                                {k === 'notdue' ? (
                                  <CalendarDays className="w-2.5 h-2.5 shrink-0" />
                                ) : k === 'd1_30' ? (
                                  <CalendarClock className="w-2.5 h-2.5 shrink-0" />
                                ) : (
                                  <CalendarX2 className="w-2.5 h-2.5 shrink-0" />
                                )}
                                {meta?.short}
                              </div>
                              <div className="text-xs font-bold tabular-nums truncate">
                                {isEmpty ? '—' : fmtTry(cell.amount)}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3 h-3 shrink-0" />
              Tutarlar canlı kur servisi ile TRY bazına çevrilir (USD · EUR · GBP — saatte bir güncellenir). Müşteri adına tıklayınca Müşteri 360 açılır.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
