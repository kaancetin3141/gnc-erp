'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiDelete } from '@/lib/api-client'

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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import {
  Truck, Plus, Search, X, RefreshCw, FileText, Pencil, Trash2,
  Eye, Package, Scale, Send, CheckCheck, Undo2, Ban, ExternalLink, FileSpreadsheet,
} from 'lucide-react'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import type { Irsaliye, IrsaliyeListResponse } from './parts/irsaliye-types'
import {
  FILTER_STATUSES, getIrsaliyeStatusMeta,
  getCarrierLabel, getCarrierTrackingUrl, formatKg,
} from './parts/irsaliye-utils'
import { IrsaliyeFormDialog } from './irsaliye-form-dialog'
import { IrsaliyePdfDialog } from './irsaliye-pdf-dialog'
import { apiPatch } from '@/lib/api-client'

// ============================================================
// İrsaliye Listeleme View (orchestrator)
// ============================================================

export function IrsaliyeView() {
  const qc = useQueryClient()
  const { user } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('__all__')
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editIrs, setEditIrs] = useState<Irsaliye | null>(null)
  const [detailIrs, setDetailIrs] = useState<Irsaliye | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfIrs, setPdfIrs] = useState<Irsaliye | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const params = useMemo(() => {
    const p: Record<string, string> = { limit: '200' }
    if (search) p.search = search
    if (statusFilter !== '__all__') p.status = statusFilter
    return p
  }, [search, statusFilter])

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['irsaliye', params],
    queryFn: () => {
      const qs = new URLSearchParams(params).toString()
      return apiGet<IrsaliyeListResponse>(`/api/irsaliye?${qs}`)
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  // Özet kartlar
  const stats = useMemo(() => {
    return {
      total,
      taslak: items.filter((i) => i.status === 'taslak').length,
      hazir: items.filter((i) => i.status === 'hazir').length,
      sevk: items.filter((i) => i.status === 'sevk_edildi').length,
      teslim: items.filter((i) => i.status === 'teslim_edildi').length,
      totalGross: items.reduce((s, i) => s + (i.totalGrossWeight ?? 0), 0),
    }
  }, [items, total])

  const openDetail = (i: Irsaliye) => {
    setDetailIrs(i)
    setDetailOpen(true)
  }
  const openEdit = (i: Irsaliye) => {
    setEditIrs(i)
    setDetailOpen(false)
    setEditOpen(true)
  }
  const openPdf = (i: Irsaliye) => {
    setPdfIrs(i)
    setPdfOpen(true)
    setDetailOpen(false)
  }
  const handleDelete = async () => {
    if (!detailIrs) return
    setDeleting(true)
    try {
      await apiDelete(`/api/irsaliye/${detailIrs.id}`)
      toast.success('İrsaliye silindi')
      qc.invalidateQueries({ queryKey: ['irsaliye'] })
      setDeleteOpen(false)
      setDetailOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silme başarısız')
    } finally {
      setDeleting(false)
    }
  }

  // Excel dışa aktarma — filtrelenmiş irsaliye listesi (.xlsx)
  const handleExportExcel = () => {
    if (items.length === 0) {
      toast.error('Dışa aktarılacak irsaliye yok')
      return
    }
    const rows = items.map((i) => ({
      'İrsaliye No': i.number,
      'Tarih': formatDate(i.date),
      'Müşteri': i.customer?.name ?? '',
      'Sipariş No': i.order?.number ?? '',
      'Durum': getIrsaliyeStatusMeta(i.status).label,
      'Net Ağırlık (kg)': i.totalNetWeight ?? 0,
      'Brüt Ağırlık (kg)': i.totalGrossWeight ?? 0,
      'Palet Sayısı': i.palletCount ?? '',
      'Taşıyıcı': getCarrierLabel(i.carrier),
      'Takip No': i.trackingNo ?? '',
      'Not': i.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = Object.keys(rows[0]).map((k) => ({
      wch: Math.max(k.length + 2, Math.min(18, ...rows.map((r) => String((r as Record<string, unknown>)[k] ?? '').length + 2))),
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'İrsaliyeler')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `irsaliyeler-${new Date().toISOString().slice(0, 10)}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`${items.length} irsaliye Excel olarak indirildi`)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-violet-600" />
            İrsaliyeler
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toplam <span className="font-semibold text-foreground">{total}</span> irsaliye
            {stats.sevk > 0 && <span className="ml-2 text-violet-600 font-medium">· {stats.sevk} sevkte</span>}
            {stats.teslim > 0 && <span className="ml-2 text-emerald-600 font-medium">· {stats.teslim} teslim</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={items.length === 0}>
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" />
            Excel
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="bg-violet-600 hover:bg-violet-700">
            <Plus className="w-4 h-4 mr-1.5" />
            Yeni İrsaliye
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Toplam</div>
            <div className="text-xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-50/50 dark:bg-slate-950/20">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-400">Taslak</div>
            <div className="text-xl font-bold text-slate-700 dark:text-slate-300">{stats.taslak}</div>
          </CardContent>
        </Card>
        <Card className="bg-teal-50/50 dark:bg-teal-950/20">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-teal-700 dark:text-teal-400">Hazır</div>
            <div className="text-xl font-bold text-teal-700 dark:text-teal-400">{stats.hazir}</div>
          </CardContent>
        </Card>
        <Card className="bg-violet-50/50 dark:bg-violet-950/20">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-violet-700 dark:text-violet-400">Sevk Edildi</div>
            <div className="text-xl font-bold text-violet-700 dark:text-violet-400">{stats.sevk}</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Teslim</div>
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{stats.teslim}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Scale className="w-3 h-3" /> Toplam Brüt
            </div>
            <div className="text-xl font-bold tabular-nums">{formatKg(stats.totalGross)}</div>
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
                  placeholder="İrsaliye no, müşteri veya takip no ara..."
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

      {/* Tablo */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <Truck className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">İrsaliye bulunamadı</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Yeni İrsaliye Oluştur
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">İrsaliye No</TableHead>
                    <TableHead className="min-w-[180px]">Müşteri</TableHead>
                    <TableHead className="min-w-[100px]">Tarih</TableHead>
                    <TableHead className="min-w-[110px]">Durum</TableHead>
                    <TableHead className="text-center min-w-[80px]">Kalem</TableHead>
                    <TableHead className="text-right min-w-[100px]">Brüt Ağırlık</TableHead>
                    <TableHead className="min-w-[110px]">Kargo</TableHead>
                    <TableHead className="text-right min-w-[110px]">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => {
                    const status = getIrsaliyeStatusMeta(i.status)
                    return (
                      <TableRow key={i.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(i)}>
                        <TableCell className="font-mono text-xs font-semibold">{i.number}</TableCell>
                        <TableCell className="font-medium truncate">
                          <div className="flex items-center gap-2">
                            <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{i.customer?.name ?? '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(i.date)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px]', status.color)}>
                            <status.icon className="w-3 h-3 mr-1" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-xs">
                          {i._count?.lines ?? i.lines?.length ?? 0}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {formatKg(i.totalGrossWeight)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {i.carrier ? getCarrierLabel(i.carrier) : '—'}
                          {i.trackingNo && <div className="text-[10px]">{i.trackingNo}</div>}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost" size="sm" className="h-7 w-7 p-0"
                                  onClick={() => openPdf(i)}
                                  title="PDF Önizle"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>PDF Önizle</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost" size="sm" className="h-7 w-7 p-0"
                                  onClick={() => openDetail(i)}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Detay</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost" size="sm" className="h-7 w-7 p-0"
                                  onClick={() => openEdit(i)}
                                  disabled={i.status === 'sevk_edildi' || i.status === 'teslim_edildi'}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Düzenle</TooltipContent>
                            </Tooltip>
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

      {/* Footer */}
      {!isLoading && items.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Truck className="w-3.5 h-3.5" />
            <span>{items.length} / {total} irsaliye gösteriliyor</span>
          </div>
        </div>
      )}

      {/* Detail Dialog (inline) */}
      <IrsaliyeDetailDialog
        irsaliye={detailIrs}
        open={detailOpen}
        onOpenChange={(v) => {
          setDetailOpen(v)
          if (!v) setTimeout(() => setDetailIrs(null), 100)
        }}
        onEdit={openEdit}
        onPdf={openPdf}
        onDelete={() => setDeleteOpen(true)}
      />

      {/* Form Dialog */}
      <IrsaliyeFormDialog open={addOpen} onOpenChange={setAddOpen} />
      <IrsaliyeFormDialog
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v)
          if (!v) setTimeout(() => setEditIrs(null), 100)
        }}
        editIrsaliye={editIrs}
      />

      {/* PDF Dialog */}
      <IrsaliyePdfDialog
        irsaliyeId={pdfIrs?.id ?? null}
        irsaliyeNumber={pdfIrs?.number ?? null}
        open={pdfOpen}
        onOpenChange={(v) => {
          setPdfOpen(v)
          if (!v) setTimeout(() => setPdfIrs(null), 100)
        }}
      />

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>İrsaliyeyi sil?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{detailIrs?.number}</strong> numaralı irsaliyeyi silmek üzeresiniz.
              Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
              Evet, Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================
// Basit Detay Dialog (inline — liste ile ilişkili)
// ============================================================
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'

function IrsaliyeDetailDialog({
  irsaliye, open, onOpenChange, onEdit, onPdf, onDelete,
}: {
  irsaliye: Irsaliye | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onEdit: (i: Irsaliye) => void
  onPdf: (i: Irsaliye) => void
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const { data: detail, isLoading } = useQuery({
    queryKey: ['irsaliye', irsaliye?.id],
    queryFn: () => apiGet<Irsaliye>(`/api/irsaliye/${irsaliye!.id}`),
    enabled: !!irsaliye && open,
  })

  if (!irsaliye) return null
  const d = detail ?? irsaliye
  const status = getIrsaliyeStatusMeta(d.status)

  // Hızlı durum aksiyonları — sevk akışı: taslak/hazir → sevk_edildi → teslim_edildi
  // sevk_edildi otomatik stok düşümü tetikler (API tarafında); geri alma stoka iade yapar
  const changeStatus = async (newStatus: string, label: string) => {
    try {
      const res = await apiPatch<{ stockAdjustments?: number }>(`/api/irsaliye/${d.id}`, { status: newStatus })
      const extra = res?.stockAdjustments
        ? ` · ${res.stockAdjustments} kalem için stok otomatik güncellendi`
        : ''
      toast.success(`Durum: ${label}${extra}`)
      qc.invalidateQueries({ queryKey: ['irsaliye'] })
      qc.invalidateQueries({ queryKey: ['documents-orders'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Durum güncellenemedi')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <Truck className="w-5 h-5 text-violet-600 shrink-0" />
                <span className="font-mono">{d.number}</span>
                <Badge variant="outline" className={cn('text-[10px]', status.color)}>
                  <status.icon className="w-3 h-3 mr-1" />
                  {status.label}
                </Badge>
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {d.customer?.name}
                {d.order && <span className="ml-2">· Sipariş: {d.order.number}</span>}
                · Tarih: {formatDate(d.date)}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="outline" size="sm" onClick={() => onPdf(d)}>
                <FileText className="w-3.5 h-3.5 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => onEdit(d)} disabled={d.status === 'sevk_edildi' || d.status === 'teslim_edildi'}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Düzenle
              </Button>
              <Button
                variant="outline" size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900/50"
                onClick={onDelete}
                disabled={d.status === 'sevk_edildi' || d.status === 'teslim_edildi'}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* HIZLI DURUM AKSİYONLARI — sevk akışı */}
        <div className="flex items-center gap-2 flex-wrap p-2.5 rounded-lg border bg-muted/20">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Sevk Akışı:</span>
          {(d.status === 'taslak' || d.status === 'hazir') && (
            <Button
              size="sm"
              className="h-7 text-[11px] bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => changeStatus('sevk_edildi', 'Sevk Edildi')}
            >
              <Send className="w-3 h-3 mr-1" /> Sevk Et
              <span className="ml-1 font-normal opacity-80">(stok otomatik düşer)</span>
            </Button>
          )}
          {d.status === 'sevk_edildi' && (
            <Button
              size="sm"
              className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => changeStatus('teslim_edildi', 'Teslim Edildi')}
            >
              <CheckCheck className="w-3 h-3 mr-1" /> Teslim Alındı
            </Button>
          )}
          {(d.status === 'sevk_edildi' || d.status === 'teslim_edildi') && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => changeStatus('hazir', 'Hazır (stok iade edildi)')}
            >
              <Undo2 className="w-3 h-3 mr-1" /> Geri Al (Stok İade)
            </Button>
          )}
          {d.status !== 'iptal' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
              onClick={() => changeStatus('iptal', 'İptal')}
            >
              <Ban className="w-3 h-3 mr-1" /> İptal
            </Button>
          )}
          {d.status === 'iptal' && (
            <span className="text-[11px] text-red-600">Bu irsaliye iptal edildi.</span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            {/* Ağırlık & sevkiyat özeti */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="bg-muted/30">
                <CardContent className="p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Net Ağırlık</div>
                  <div className="text-sm font-bold mt-0.5 tabular-nums">{formatKg(d.totalNetWeight)}</div>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Palet Ağırlığı</div>
                  <div className="text-sm font-bold mt-0.5 tabular-nums">{formatKg(d.palletWeight)}</div>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Brüt Ağırlık</div>
                  <div className="text-sm font-bold mt-0.5 tabular-nums text-violet-700 dark:text-violet-400">{formatKg(d.totalGrossWeight)}</div>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Palet Sayısı</div>
                  <div className="text-sm font-bold mt-0.5 tabular-nums">{d.palletCount ?? '—'}</div>
                </CardContent>
              </Card>
            </div>

            {/* Sevkiyat */}
            {(d.shippingAddress || d.carrier || d.trackingNo) && (
              <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
                <div className="font-semibold mb-1 text-foreground">Sevkiyat Bilgileri</div>
                {d.shippingAddress && <div>{d.shippingAddress}</div>}
                {d.carrier && <div>Kargo: {getCarrierLabel(d.carrier)}</div>}
                {d.trackingNo && (
                  <div>
                    Takip No: <span className="font-mono">{d.trackingNo}</span>
                    {getCarrierTrackingUrl(d.carrier, d.trackingNo) && (
                      <a
                        href={getCarrierTrackingUrl(d.carrier, d.trackingNo)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-0.5 text-violet-600 hover:underline dark:text-violet-400"
                      >
                        <ExternalLink className="w-3 h-3" /> Kargoyu Takip Et
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Notlar */}
            {d.notes && (
              <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300">
                <div className="font-semibold mb-1">Notlar</div>
                {d.notes}
              </div>
            )}

            <Separator />

            {/* Kalemler */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Package className="w-4 h-4" />
                Kalemler ({d.lines?.length ?? 0})
              </h4>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Açıklama</TableHead>
                      <TableHead className="text-right">Miktar</TableHead>
                      <TableHead>Birim</TableHead>
                      <TableHead className="text-right">Birim Ağırlık</TableHead>
                      <TableHead className="text-right">Toplam Ağırlık</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(d.lines ?? []).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="font-medium">{l.description}</div>
                          {l.product?.sku && <div className="text-[10px] text-muted-foreground">{l.product.sku}</div>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{l.qty}</TableCell>
                        <TableCell className="text-xs">{l.unit}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{formatKg(l.weightPerUnit)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-medium">{formatKg(l.totalWeight)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
