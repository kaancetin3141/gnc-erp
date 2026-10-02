'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import {
  Package, Search, X, RefreshCw, ClipboardCheck, Truck,
  Eye, FileText, Hash,
} from 'lucide-react'
import { formatDate, toCSV, downloadFile } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Order, OrderListResponse } from './parts/types'
import {
  FILTER_STATUSES, getOrderStatusMeta,
} from './parts/order-utils'
import { OrderProductionPreview } from './order-production-preview'

// ============================================================
// Depo Siparişleri View (FİYAT YOK)
// Depo rolü (stock / depo_sorumlusu) için sadeleştirilmiş liste
// ============================================================

interface DepoOrder extends Order {
  hidePrices?: boolean
}

export function DepoSiparisView() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('__all__')
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const params = useMemo(() => {
    const p: Record<string, string> = { limit: '200', depo: '1' }
    if (search) p.search = search
    if (statusFilter !== '__all__') p.status = statusFilter
    return p
  }, [search, statusFilter])

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['orders-depo', params],
    queryFn: () => apiGet<OrderListResponse & { hidePrices?: boolean; items: DepoOrder[] }>(`/api/orders?${new URLSearchParams(params).toString()}`),
  })

  const orders = data?.items ?? []
  const total = data?.total ?? 0
  const hidePrices = data?.hidePrices ?? true

  // Özet kartlar — FİYAT YOK, sadece kalem/sipariş sayısı
  const stats = useMemo(() => {
    return {
      total,
      preparing: orders.filter((o) => o.status === 'hazirlaniyor').length,
      inProduction: orders.filter((o) => o.status === 'uretimde').length,
      shipped: orders.filter((o) => o.status === 'sevk_yapildi').length,
      delivered: orders.filter((o) => o.status === 'teslim_edildi').length,
    }
  }, [orders, total])

  // CSV dışa aktarma — fiyat YOK
  const handleExport = () => {
    if (!orders.length) {
      toast.error('Dışa aktarılacak sipariş yok')
      return
    }
    const rows = orders.map((o) => ({
      'Sipariş No': o.number,
      'Müşteri': o.customer?.name ?? '',
      'Durum': getOrderStatusMeta(o.status).label,
      'Sipariş Tarihi': formatDate(o.orderDate),
      'Beklenen Teslimat': formatDate(o.expectedDelivery),
      'Teslim Tarihi': formatDate(o.deliveredAt),
      'Takip Adımı Sayısı': o._count?.trackingSteps ?? 0,
    }))
    const csv = toCSV(rows)
    downloadFile(csv, `depo-siparisler-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success(`${orders.length} sipariş dışa aktarıldı (fiyat hariç)`)
  }

  const handleClearFilters = () => {
    setSearch('')
    setStatusFilter('__all__')
  }

  const activeFilterCount = [search, statusFilter !== '__all__' ? statusFilter : ''].filter(Boolean).length

  const openDetail = (o: Order) => {
    setDetailOrder(o)
    setDetailOpen(true)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-violet-600" />
            Siparişler (Depo Görünümü)
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toplam <span className="font-semibold text-foreground">{total}</span> sipariş
            <span className="ml-2 text-amber-600 font-medium">· Fiyat bilgisi gizli</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <FileText className="w-4 h-4 mr-1.5" /> Dışa Aktar
        </Button>
      </div>

      {/* Stats — FİYAT YOK */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Toplam Sipariş</div>
            <div className="text-xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-50/50 dark:bg-slate-950/20">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-400">Hazırlanıyor</div>
            <div className="text-xl font-bold text-slate-700 dark:text-slate-300">{stats.preparing}</div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Üretimde</div>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{stats.inProduction}</div>
          </CardContent>
        </Card>
        <Card className="bg-violet-50/50 dark:bg-violet-950/20">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-violet-700 dark:text-violet-400">Sevk Edildi</div>
            <div className="text-xl font-bold text-violet-700 dark:text-violet-400">{stats.shipped}</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Teslim</div>
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{stats.delivered}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtre barı */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Sipariş no veya müşteri ara..."
                  className="pl-9"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                  >
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                title="Yenile"
              >
                <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
              </Button>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                  <X className="w-3.5 h-3.5 mr-1" /> Temizle
                </Button>
              )}
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {FILTER_STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatusFilter(s.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all',
                    statusFilter === s.value
                      ? s.color + ' ring-2 ring-offset-1 ring-violet-300'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted/60',
                  )}
                >
                  <s.icon className="w-3 h-3" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tablo — FİYAT SÜTUNU YOK */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Sipariş bulunamadı</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Sipariş No</TableHead>
                    <TableHead className="min-w-[180px]">Müşteri</TableHead>
                    <TableHead className="min-w-[100px]">Tarih</TableHead>
                    <TableHead className="min-w-[110px]">Durum</TableHead>
                    <TableHead className="text-center min-w-[80px]">Takip Adımı</TableHead>
                    <TableHead className="min-w-[120px]">Fatura</TableHead>
                    <TableHead className="min-w-[100px]">Beklenen Teslimat</TableHead>
                    <TableHead className="text-right min-w-[80px]">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => {
                    const status = getOrderStatusMeta(o.status)
                    return (
                      <TableRow key={o.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(o)}>
                        <TableCell className="font-mono text-xs font-semibold">{o.number}</TableCell>
                        <TableCell className="font-medium truncate">
                          <div className="flex items-center gap-2">
                            <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{o.customer?.name ?? '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(o.orderDate)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px]', status.color)}>
                            <status.icon className="w-3 h-3 mr-1" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-xs">
                          {o._count?.trackingSteps ?? 0}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {o.invoice?.number ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(o.expectedDelivery)}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => openDetail(o)}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Detay & Üretim Durumu</TooltipContent>
                          </Tooltip>
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

      {/* Footer */}
      {!isLoading && orders.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Hash className="w-3.5 h-3.5" />
            <span>{orders.length} / {total} sipariş gösteriliyor</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Fiyat bilgisi gizli</span>
          </div>
        </div>
      )}

      {/* Detail with production preview */}
      <OrderProductionPreview
        order={detailOrder}
        open={detailOpen}
        onOpenChange={(v) => {
          setDetailOpen(v)
          if (!v) setTimeout(() => setDetailOrder(null), 100)
        }}
      />
    </div>
  )
}
