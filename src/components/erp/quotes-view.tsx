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
  FileText, Plus, Download, Search, X, RefreshCw,
} from 'lucide-react'
import { formatDate, toCSV, downloadFile } from '@/lib/format'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import type { Quote, QuoteListResponse } from './parts/types'
import { FILTER_STATUSES, getQuoteStatusMeta } from './parts/quote-utils'
import { QuoteFormDialog } from './parts/quote-form-dialog'
import { QuoteDetailDialog } from './parts/quote-detail-dialog'
import { QuoteStats } from './parts/quote-stats'
import { QuoteTable } from './parts/quote-table'

// ============================================================
// Ana liste bileşeni (orchestrator)
// ============================================================

export function QuotesView() {
  const { user } = useAppStore()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('__all__')
  const [typeFilter, setTypeFilter] = useState<'__all__' | 'proforma' | 'teklif'>('__all__')
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editQuote, setEditQuote] = useState<Quote | null>(null)
  const [detailQuote, setDetailQuote] = useState<Quote | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Query parametreleri
  const params = useMemo(() => {
    const p: Record<string, string> = { limit: '200' }
    if (search) p.search = search
    if (statusFilter !== '__all__') p.status = statusFilter
    if (typeFilter !== '__all__') p.type = typeFilter
    return p
  }, [search, statusFilter, typeFilter])

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['quotes', params],
    queryFn: () => {
      const qs = new URLSearchParams(params).toString()
      return apiGet<QuoteListResponse>(`/api/quotes?${qs}`)
    },
  })

  const quotes = data?.items ?? []
  const total = data?.total ?? 0

  // İstatistikler (tüm teklifler üzerinden, filtrelenmemiş)
  const stats = useMemo(() => {
    const pending = quotes.filter((q) => q.status === 'taslak' || q.status === 'gonderildi').length
    const approved = quotes.filter((q) => q.status === 'onaylandi').length
    const proformaCount = quotes.filter((q) => q.isProforma).length
    const totalValue = quotes.reduce((sum, q) => sum + q.total, 0)
    return {
      total,
      pending,
      approved,
      proformaCount,
      totalValue,
    }
  }, [quotes, total])

  const canExport = hasPermission(user as SessionUser | null, 'export.data')

  // CSV dışa aktarma
  const handleExport = () => {
    if (!quotes.length) {
      toast.error('Dışa aktarılacak teklif yok')
      return
    }
    const rows = quotes.map((q) => ({
      'Teklif No': q.number,
      'Müşteri': q.customer?.name ?? '',
      'Durum': getQuoteStatusMeta(q.status).label,
      'Düzenleme': formatDate(q.issueDate),
      'Geçerlilik': formatDate(q.validUntil),
      'Para Birimi': q.currency,
      'Ara Toplam': q.subtotal,
      'KDV': q.taxTotal,
      'Genel Toplam': q.total,
      'Kalem Sayısı': q._count?.lines ?? q.lines?.length ?? 0,
    }))
    const csv = toCSV(rows)
    downloadFile(csv, `teklifler-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success(`${quotes.length} teklif dışa aktarıldı`)
  }

  const handleClearFilters = () => {
    setSearch('')
    setStatusFilter('__all__')
    setTypeFilter('__all__')
  }

  const activeFilterCount = [
    search,
    statusFilter !== '__all__' ? statusFilter : '',
    typeFilter !== '__all__' ? typeFilter : '',
  ].filter(Boolean).length

  const openDetail = (q: Quote) => {
    setDetailQuote(q)
    setDetailOpen(true)
  }

  const openEdit = (q: Quote) => {
    setEditQuote(q)
    setDetailOpen(false)
    setEditOpen(true)
  }

  const handleDetailOpenChange = (v: boolean) => {
    setDetailOpen(v)
    if (!v) setTimeout(() => setDetailQuote(null), 100)
  }

  const handleEditOpenChange = (v: boolean) => {
    setEditOpen(v)
    if (!v) setTimeout(() => setEditQuote(null), 100)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-600" />
            Teklifler
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toplam <span className="font-semibold text-foreground">{total}</span> kayıt
            {stats.proformaCount > 0 && (
              <span className="ml-2 text-violet-600 font-medium">· {stats.proformaCount} proforma</span>
            )}
            {stats.pending > 0 && (
              <span className="ml-2 text-amber-600 font-medium">· {stats.pending} bekleyen</span>
            )}
            <span className="ml-2 text-muted-foreground/70">(yeni kayıtlar proforma oluşur, gönderilince teklife dönüşür)</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1.5" />
              Dışa Aktar
            </Button>
          )}
          <Button size="sm" onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-1.5" />
            Yeni Teklif
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <QuoteStats
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
                  placeholder="Teklif no veya müşteri ara..."
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

            {/* Tür chip'leri: Proforma / Teklif */}
            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Tür:</span>
              {([
                { value: '__all__' as const, label: 'Tümü' },
                { value: 'proforma' as const, label: 'Proforma' },
                { value: 'teklif' as const, label: 'Teklif' },
              ]).map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTypeFilter(t.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all',
                    typeFilter === t.value
                      ? 'bg-violet-50 text-violet-700 border-violet-200 ring-2 ring-offset-1 ring-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/60'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted/60',
                  )}
                >
                  {t.label}
                </button>
              ))}
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
                      ? s.color + ' ring-2 ring-offset-1 ring-emerald-300'
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

      {/* Teklif tablosu */}
      <Card>
        <CardContent className="p-0">
          <QuoteTable
            quotes={quotes}
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
      {!isLoading && quotes.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" />
            <span>{quotes.length} / {total} teklif gösteriliyor</span>
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
      <QuoteFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      <QuoteFormDialog
        open={editOpen}
        onOpenChange={handleEditOpenChange}
        editQuote={editQuote}
      />
      <QuoteDetailDialog
        quote={detailQuote}
        open={detailOpen}
        onOpenChange={handleDetailOpenChange}
        onEdit={openEdit}
      />
    </div>
  )
}
