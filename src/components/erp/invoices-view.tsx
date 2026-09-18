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
  Receipt, Plus, Download, Search, X, RefreshCw,
} from 'lucide-react'
import { formatDate, toCSV, downloadFile } from '@/lib/format'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import type { Invoice, InvoiceListResponse } from './parts/types'
import { FILTER_STATUSES, getInvoiceStatusMeta } from './parts/invoice-utils'
import { InvoiceFormDialog } from './parts/invoice-form-dialog'
import { InvoiceDetailDialog } from './parts/invoice-detail-dialog'
import { InvoiceStats } from './parts/invoice-stats'
import { InvoiceTable } from './parts/invoice-table'

// ============================================================
// Ana liste bileşeni (orchestrator)
// ============================================================

export function InvoicesView() {
  const { user } = useAppStore()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('__all__')
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Query parametreleri
  const params = useMemo(() => {
    const p: Record<string, string> = { limit: '200' }
    if (search) p.search = search
    if (statusFilter !== '__all__') p.status = statusFilter
    return p
  }, [search, statusFilter])

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['invoices', params],
    queryFn: () => {
      const qs = new URLSearchParams(params).toString()
      return apiGet<InvoiceListResponse>(`/api/invoices?${qs}`)
    },
  })

  const invoices = data?.items ?? []
  const total = data?.total ?? 0

  // İstatistikler
  const stats = useMemo(() => {
    const pending = invoices.filter((i) => i.status === 'odeme_bekliyor').length
    const paid = invoices.filter((i) => i.status === 'odendi').length
    const overdue = invoices.filter((i) => i.status === 'gecikti').length
    const totalValue = invoices.reduce((sum, i) => sum + i.total, 0)
    return {
      total,
      pending,
      paid,
      overdue,
      totalValue,
    }
  }, [invoices, total])

  const canExport = hasPermission(user as SessionUser | null, 'export.data')

  // CSV dışa aktarma
  const handleExport = () => {
    if (!invoices.length) {
      toast.error('Dışa aktarılacak fatura yok')
      return
    }
    const rows = invoices.map((inv) => ({
      'Fatura No': inv.number,
      'Müşteri': inv.customer?.name ?? '',
      'Durum': getInvoiceStatusMeta(inv.status).label,
      'Düzenleme': formatDate(inv.issueDate),
      'Vade': formatDate(inv.dueDate),
      'Ödeme': formatDate(inv.paidDate),
      'Para Birimi': inv.currency,
      'Ara Toplam': inv.subtotal,
      'KDV': inv.taxTotal,
      'Genel Toplam': inv.total,
    }))
    const csv = toCSV(rows)
    downloadFile(csv, `faturalar-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success(`${invoices.length} fatura dışa aktarıldı`)
  }

  const handleClearFilters = () => {
    setSearch('')
    setStatusFilter('__all__')
  }

  const activeFilterCount = [search, statusFilter !== '__all__' ? statusFilter : ''].filter(Boolean).length

  const openDetail = (inv: Invoice) => {
    setDetailInvoice(inv)
    setDetailOpen(true)
  }

  const openEdit = (inv: Invoice) => {
    setEditInvoice(inv)
    setDetailOpen(false)
    setEditOpen(true)
  }

  const handleDetailOpenChange = (v: boolean) => {
    setDetailOpen(v)
    if (!v) setTimeout(() => setDetailInvoice(null), 100)
  }

  const handleEditOpenChange = (v: boolean) => {
    setEditOpen(v)
    if (!v) setTimeout(() => setEditInvoice(null), 100)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-amber-600" />
            Faturalar
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toplam <span className="font-semibold text-foreground">{total}</span> fatura
            {stats.overdue > 0 && (
              <span className="ml-2 text-red-600 font-medium">· {stats.overdue} gecikmiş</span>
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
          <Button size="sm" onClick={() => setAddOpen(true)} className="bg-amber-600 hover:bg-amber-700">
            <Plus className="w-4 h-4 mr-1.5" />
            Yeni Fatura
          </Button>
        </div>
      </div>

      {/* Stats row — 5 kart */}
      <InvoiceStats
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
                  placeholder="Fatura no veya müşteri ara..."
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
                      ? s.color + ' ring-2 ring-offset-1 ring-amber-300'
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

      {/* Fatura tablosu */}
      <Card>
        <CardContent className="p-0">
          <InvoiceTable
            invoices={invoices}
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
      {!isLoading && invoices.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Receipt className="w-3.5 h-3.5" />
            <span>{invoices.length} / {total} fatura gösteriliyor</span>
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
      <InvoiceFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      <InvoiceFormDialog
        open={editOpen}
        onOpenChange={handleEditOpenChange}
        editInvoice={editInvoice}
      />
      <InvoiceDetailDialog
        invoice={detailInvoice}
        open={detailOpen}
        onOpenChange={handleDetailOpenChange}
        onEdit={openEdit}
      />
    </div>
  )
}
