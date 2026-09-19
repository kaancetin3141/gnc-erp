'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import type { SessionUser } from '@/types'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Receipt, Plus, Download, Search, X, RefreshCw,
} from 'lucide-react'
import { formatDate, formatCurrency, whatsappLink } from '@/lib/format'
import { exportRowsToExcel } from '@/lib/excel-export'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import type { Invoice, InvoiceListResponse } from './parts/types'
import { FILTER_STATUSES, getInvoiceStatusMeta, buildInvoiceWhatsAppMessage, toTry, overdueDays } from './parts/invoice-utils'
import { InvoiceFormDialog } from './parts/invoice-form-dialog'
import { InvoiceDetailDialog } from './parts/invoice-detail-dialog'
import { InvoiceStats } from './parts/invoice-stats'
import { InvoiceTable } from './parts/invoice-table'
import { InvoiceAging, bucketOf, type AgingBucket } from './parts/invoice-aging'

// ============================================================
// Ana liste bileşeni (orchestrator)
// ============================================================

export function InvoicesView() {
  const { user } = useAppStore()
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('__all__')
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [agingFilter, setAgingFilter] = useState<AgingBucket>('__all__')

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

  const allInvoices = data?.items ?? []
  const total = data?.total ?? 0

  // Yaşlandırma filtresi (kova seçiliyse tabloyu daralt)
  const invoices = useMemo(() => {
    if (agingFilter === '__all__') return allInvoices
    return allInvoices.filter((i) =>
      (i.status === 'odeme_bekliyor' || i.status === 'gecikti') && bucketOf(i) === agingFilter,
    )
  }, [allInvoices, agingFilter])

  // İstatistikler — yaşlandırma filtresinden bağımsız (tüm liste)
  const stats = useMemo(() => {
    const pending = allInvoices.filter((i) => i.status === 'odeme_bekliyor').length
    const paid = allInvoices.filter((i) => i.status === 'odendi').length
    const overdue = allInvoices.filter((i) => i.status === 'gecikti').length
    const totalValue = allInvoices.reduce((sum, i) => sum + i.total, 0)
    // Bekleyen tahsilat: ödeme bekliyor + gecikmiş faturaların TRY bazlı toplamı
    const pendingAmount = allInvoices
      .filter((i) => i.status === 'odeme_bekliyor' || i.status === 'gecikti')
      .reduce((sum, i) => sum + toTry(i.total, i.currency), 0)
    return {
      total,
      pending,
      paid,
      overdue,
      totalValue,
      pendingAmount: Math.round(pendingAmount),
    }
  }, [allInvoices, total])

  const canExport = hasPermission(user as SessionUser | null, 'export.data')

  // Excel dışa aktarma — filtrelenmiş fatura listesi (.xlsx)
  const handleExport = () => {
    exportRowsToExcel(
      invoices.map((inv) => ({
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
      })),
      {
        filename: 'faturalar',
        sheetName: 'Faturalar',
        successMessage: `${invoices.length} fatura Excel olarak indirildi`,
        emptyMessage: 'Dışa aktarılacak fatura yok',
      },
    )
  }

  const handleClearFilters = () => {
    setSearch('')
    setStatusFilter('__all__')
    setAgingFilter('__all__')
  }

  const activeFilterCount = [
    search,
    statusFilter !== '__all__' ? statusFilter : '',
    agingFilter !== '__all__' ? agingFilter : '',
  ].filter(Boolean).length

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

  // ----- Hızlı tahsilat aksiyonları -----
  const isOverdueRow = (inv: Invoice) =>
    inv.status === 'odeme_bekliyor' && overdueDays(inv.dueDate) > 0

  // Ödendi işaretle / ödemeyi geri al
  const handleQuickStatus = async (inv: Invoice, status: 'odendi' | 'odeme_bekliyor') => {
    setBusyId(inv.id)
    try {
      await apiPatch(`/api/invoices/${inv.id}`, { status })
      await qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success(
        status === 'odendi'
          ? `${inv.number} ödendi olarak işaretlendi 🎉`
          : `${inv.number} ödeme bekliyor durumuna alındı`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusyId(null)
    }
  }

  // Vade uzat +7 gün
  const handleExtendDue = async (inv: Invoice) => {
    setBusyId(inv.id)
    try {
      const base = inv.dueDate && !isNaN(new Date(inv.dueDate).getTime())
        ? new Date(inv.dueDate)
        : new Date()
      base.setDate(base.getDate() + 7)
      await apiPatch(`/api/invoices/${inv.id}`, { dueDate: base.toISOString() })
      await qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success(`${inv.number} vadesi ${formatDate(base.toISOString())} olarak uzatıldı`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusyId(null)
    }
  }

  // Ödeme hatırlatma (WhatsApp) — detaydan telefon alıp wa.me linki açar
  const handleRemind = async (inv: Invoice) => {
    setBusyId(inv.id)
    try {
      const detail = await apiGet<Invoice>(`/api/invoices/${inv.id}`)
      const phone = detail.customer?.phone ?? null
      if (!phone) {
        toast.error(`${detail.customer?.name ?? 'Müşteri'} için telefon numarası kayıtlı değil`)
        return
      }
      const msg = buildInvoiceWhatsAppMessage({
        number: inv.number,
        customerName: detail.customer?.name ?? '',
        total: inv.total,
        currency: inv.currency,
        dueDate: inv.dueDate,
        isOverdue: isOverdueRow(inv) || inv.status === 'gecikti',
      })
      window.open(whatsappLink(phone, msg), '_blank', 'noopener,noreferrer')
      toast.success(`${inv.number} için hatırlatma mesajı hazırlandı`)

      // Müşteri 360 zaman tüneliğine hatırlatma aktivitesi kaydet
      const customerId = detail.customer?.id ?? inv.customerId
      if (customerId) {
        try {
          await apiPost('/api/customers/' + customerId + '/activities', {
            type: 'whatsapp',
            subject: `Ödeme hatırlatması gönderildi: ${inv.number}`,
            detail: `${inv.total.toLocaleString('tr-TR')} ${inv.currency} · Vade: ${inv.dueDate ? formatDate(inv.dueDate) : '—'}`,
            outcome: isOverdueRow(inv) || inv.status === 'gecikti' ? null : 'basarili',
          })
        } catch { /* aktivite kaydı başarısız olsa da akış etkilenmez */ }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hatırlatma hazırlanamadı')
    } finally {
      setBusyId(null)
    }
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

      {/* Stats row — 6 kart */}
      <InvoiceStats
        stats={stats}
        defaultCurrency={user?.tenant.defaultCurrency || 'TRY'}
      />

      {/* Tahsilat yaşlandırma — kovaya tıklayınca tablo filtrelenir */}
      <InvoiceAging
        invoices={allInvoices}
        activeBucket={agingFilter}
        onBucketChange={setAgingFilter}
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
            onQuickStatus={handleQuickStatus}
            onExtendDue={handleExtendDue}
            onRemind={handleRemind}
            busyId={busyId}
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
