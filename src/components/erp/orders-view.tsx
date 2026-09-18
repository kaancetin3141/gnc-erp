'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import type { SessionUser } from '@/types'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Package, Plus, Download, Search, X, RefreshCw,
} from 'lucide-react'
import { formatDate, toCSV, downloadFile } from '@/lib/format'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import type { Order, OrderListResponse } from './parts/types'
import { FILTER_STATUSES, getOrderStatusMeta } from './parts/order-utils'
import { OrderFormDialog } from './parts/order-form-dialog'
import { OrderDetailDialog } from './parts/order-detail-dialog'
import { OrderStats } from './parts/order-stats'
import { OrderTable } from './parts/order-table'

// ============================================================
// Ana liste bileşeni (orchestrator)
// ============================================================

export function OrdersView() {
  const { user } = useAppStore()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('__all__')
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Query parametreleri
  const params = useMemo(() => {
    const p: Record<string, string> = { limit: '200' }
    if (search) p.search = search
    if (statusFilter !== '__all__') p.status = statusFilter
    return p
  }, [search, statusFilter])

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['orders', params],
    queryFn: () => {
      const qs = new URLSearchParams(params).toString()
      return apiGet<OrderListResponse>(`/api/orders?${qs}`)
    },
  })

  const orders = data?.items ?? []
  const total = data?.total ?? 0

  // İstatistikler
  const stats = useMemo(() => {
    const preparing = orders.filter((o) => o.status === 'hazirlaniyor').length
    const inProduction = orders.filter((o) => o.status === 'uretimde').length
    const shipped = orders.filter((o) => o.status === 'sevk_yapildi').length
    const delivered = orders.filter((o) => o.status === 'teslim_edildi').length
    const totalValue = orders.reduce((sum, o) => sum + o.totalAmount, 0)
    return {
      total,
      preparing,
      inProduction,
      shipped,
      delivered,
      totalValue,
    }
  }, [orders, total])

  const canExport = hasPermission(user as SessionUser | null, 'export.data')

  // CSV dışa aktarma
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
      'Para Birimi': o.currency,
      'Tutar': o.totalAmount,
      'Teklif': o.quote?.number ?? '',
      'Fatura': o.invoice?.number ?? '',
    }))
    const csv = toCSV(rows)
    downloadFile(csv, `siparisler-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success(`${orders.length} sipariş dışa aktarıldı`)
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

  const openEdit = (o: Order) => {
    setEditOrder(o)
    setDetailOpen(false)
    setEditOpen(true)
  }

  const handleDetailOpenChange = (v: boolean) => {
    setDetailOpen(v)
    if (!v) setTimeout(() => setDetailOrder(null), 100)
  }

  const handleEditOpenChange = (v: boolean) => {
    setEditOpen(v)
    if (!v) setTimeout(() => setEditOrder(null), 100)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-violet-600" />
            Sipariş Takibi
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toplam <span className="font-semibold text-foreground">{total}</span> sipariş
            {stats.preparing > 0 && (
              <span className="ml-2 text-amber-600 font-medium">· {stats.preparing} hazırlanıyor</span>
            )}
            {stats.shipped > 0 && (
              <span className="ml-2 text-violet-600 font-medium">· {stats.shipped} sevkte</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1.5" />
              Dışa Aktar
            </Button>
          )}
          <Button size="sm" onClick={() => setAddOpen(true)} className="bg-violet-600 hover:bg-violet-700">
            <Plus className="w-4 h-4 mr-1.5" />
            Yeni Sipariş
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <OrderStats
        stats={stats}
        defaultCurrency={user?.tenant.defaultCurrency || 'TRY'}
      />

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
                  <X className="w-3.5 h-3.5 mr-1" />
                  Temizle
                </Button>
              )}
            </div>

            {/* Durum chip'leri */}
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

      {/* Sipariş tablosu */}
      <Card>
        <CardContent className="p-0">
          <OrderTable
            orders={orders}
            isLoading={isLoading}
            activeFilterCount={activeFilterCount}
            onClearFilters={handleClearFilters}
            onOpenAdd={() => setAddOpen(true)}
            openDetail={openDetail}
            openEdit={openEdit}
          />
        </CardContent>
      </Card>

      {/* Footer info */}
      {!isLoading && orders.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Package className="w-3.5 h-3.5" />
            <span>{orders.length} / {total} sipariş gösteriliyor</span>
          </div>
          {isFetching && (
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Güncelleniyor...
            </span>
          )}
        </div>
      )}

      {/* Dialogs */}
      <OrderFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      <OrderFormDialog
        open={editOpen}
        onOpenChange={handleEditOpenChange}
        editOrder={editOrder}
      />
      <OrderDetailDialog
        order={detailOrder}
        open={detailOpen}
        onOpenChange={handleDetailOpenChange}
        onEdit={openEdit}
      />
    </div>
  )
}
