'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import {
  FileText, Pencil, Trash2, RefreshCw, User, Calendar,
  Clock, CheckCircle2, Receipt, TrendingUp, Printer, Send,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatWeight, calculateTotalWeight } from '@/lib/weight-utils'
import type { Quote } from './types'
import { QUOTE_STATUSES, getQuoteStatusMeta } from './quote-utils'
import { SendDialog } from './send-dialog'
import { QuotePdfDialog } from './quote-pdf-dialog'

// ============================================================
// Teklif Detay Dialog
// ============================================================

export function QuoteDetailDialog({
  quote, open, onOpenChange, onEdit,
}: {
  quote: Quote | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onEdit: (q: Quote) => void
}) {
  const qc = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [changing, setChanging] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)

  // Detay sorgu
  const { data: detail, isLoading } = useQuery({
    queryKey: ['quote', quote?.id],
    queryFn: () => apiGet<Quote>(`/api/quotes/${quote!.id}`),
    enabled: !!quote && open,
  })

  if (!quote) return null

  const isProforma = !!quote.isProforma
  const status = getQuoteStatusMeta(quote.status)
  const d = detail ?? quote
  const lines = d.lines ?? []
  // Ağırlık var mı? (en az bir kalemin totalWeight > 0)
  const hasWeight = lines.some((l) => l.totalWeight != null && l.totalWeight > 0)
  const totalNetWeight = hasWeight
    ? calculateTotalWeight(lines.map((l) => ({ qty: l.qty, weightPerUnit: l.weightPerUnit ?? null })))
    : null

  const changeStatus = async (newStatus: string) => {
    setChanging(true)
    try {
      await apiPatch(`/api/quotes/${quote.id}`, { status: newStatus })
      toast.success('Durum güncellendi')
      qc.invalidateQueries({ queryKey: ['quote', quote.id] })
      qc.invalidateQueries({ queryKey: ['quotes'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncelleme başarısız')
    } finally {
      setChanging(false)
    }
  }

  const createInvoice = async () => {
    setChanging(true)
    try {
      // Önce durumu faturalandi yap
      if (quote.status !== 'faturalandi') {
        await apiPatch(`/api/quotes/${quote.id}`, { status: 'faturalandi' })
      }
      // Fatura oluştur
      await apiPost('/api/invoices', { fromQuoteId: quote.id })
      toast.success('Fatura oluşturuldu')
      qc.invalidateQueries({ queryKey: ['quote', quote.id] })
      qc.invalidateQueries({ queryKey: ['quotes'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fatura oluşturma başarısız')
    } finally {
      setChanging(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await apiDelete(`/api/quotes/${quote.id}`)
      toast.success('Teklif silindi')
      qc.invalidateQueries({ queryKey: ['quotes'] })
      setDeleteOpen(false)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silme başarısız')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto custom-scroll">
          <DialogHeader className="print:hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="font-mono">{quote.number}</span>
                  <Badge variant="outline" className={cn('text-[10px]', status.color)}>
                    <status.icon className="w-3 h-3 mr-1" />
                    {status.label}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="mt-1 flex items-center gap-2 flex-wrap text-xs">
                  <User className="w-3 h-3" />
                  {quote.customer?.name ?? '—'}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 dark:bg-teal-950/30 dark:border-teal-900/50 dark:text-teal-300"
                      onClick={() => setSendOpen(true)}
                    >
                      <Send className="w-3.5 h-3.5 mr-1" /> Gönder
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isProforma ? 'Proformayı WhatsApp/e-posta ile gönder' : 'Teklifi WhatsApp/e-posta ile gönder'}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => setPdfOpen(true)}>
                      <Printer className="w-3.5 h-3.5 mr-1" /> PDF
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isProforma ? 'Proforma PDF görüntüle' : 'Teklif PDF görüntüle'}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => onEdit(quote)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Düzenle
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Teklifi düzenle</TooltipContent>
                </Tooltip>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900/50"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Bilgi kartları */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-1">
            <Card className="bg-muted/30">
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Düzenleme
                </div>
                <div className="text-sm font-bold mt-0.5">{formatDate(quote.issueDate)}</div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Geçerlilik
                </div>
                <div className="text-sm font-bold mt-0.5">{formatDate(quote.validUntil)}</div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Para Birimi</div>
                <div className="text-sm font-bold mt-0.5">{quote.currency}</div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Kalem Sayısı</div>
                <div className="text-sm font-bold mt-0.5">{quote._count?.lines ?? lines.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Toplamlar */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-muted/20">
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ara Toplam</div>
                <div className="text-base font-bold mt-0.5 tabular-nums">{formatCurrency(d.subtotal, d.currency)}</div>
              </CardContent>
            </Card>
            <Card className="bg-muted/20">
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">KDV</div>
                <div className="text-base font-bold mt-0.5 tabular-nums">{formatCurrency(d.taxTotal, d.currency)}</div>
              </CardContent>
            </Card>
            <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50">
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Genel Toplam</div>
                <div className="text-base font-bold mt-0.5 tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(d.total, d.currency)}</div>
                {totalNetWeight != null && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                    Net Ağırlık: {formatWeight(totalNetWeight, 'kg')}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Kalemler tablosu */}
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Açıklama</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right w-16">Miktar</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">B. Fiyat</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right w-14">KDV</TableHead>
                  {hasWeight && (
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right w-24">Ağırlık</TableHead>
                  )}
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Tutar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={hasWeight ? 6 : 5}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ) : lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={hasWeight ? 6 : 5} className="text-center text-sm text-muted-foreground py-6">
                      Kalem bulunamadı
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((l) => (
                    <TableRow key={l.id ?? l.productId} className="even:bg-muted/20">
                      <TableCell className="text-sm">
                        <div className="font-medium">{l.description}</div>
                        {l.product && (
                          <div className="text-[10px] text-muted-foreground">
                            {l.product.name} {l.product.sku ? `· ${l.product.sku}` : ''}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{l.qty}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatCurrency(l.unitPrice, d.currency)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">%{l.taxRate}</TableCell>
                      {hasWeight && (
                        <TableCell className="text-right text-sm tabular-nums">
                          {l.totalWeight != null && l.totalWeight > 0
                            ? formatWeight(l.totalWeight, l.weightUnit || 'kg')
                            : '—'}
                        </TableCell>
                      )}
                      <TableCell className="text-right text-sm font-medium tabular-nums">{formatCurrency(l.lineTotal, d.currency)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Separator />

          {/* Durum aksiyonları */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <h4 className="text-sm font-semibold">Durum Yönetimi</h4>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUOTE_STATUSES.map((s) => (
                <Button
                  key={s.value}
                  variant={quote.status === s.value ? 'default' : 'outline'}
                  size="sm"
                  disabled={changing || quote.status === s.value}
                  onClick={() => changeStatus(s.value)}
                  className={cn(
                    quote.status === s.value && 'bg-emerald-600 hover:bg-emerald-700',
                  )}
                >
                  <s.icon className="w-3.5 h-3.5 mr-1" />
                  {s.label}
                </Button>
              ))}
            </div>

            {quote.status !== 'faturalandi' && (
              <Button
                variant="outline"
                size="sm"
                className="bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:border-violet-900/50 dark:text-violet-300"
                onClick={createInvoice}
                disabled={changing}
              >
                <Receipt className="w-3.5 h-3.5 mr-1.5" />
                Faturaya Dönüştür
              </Button>
            )}
            {quote.status === 'faturalandi' && (
              <div className="p-2 rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900/50 text-xs text-violet-700 dark:text-violet-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Bu teklif faturalandırıldı.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Silme onayı */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isProforma ? 'Proformayı sil?' : 'Teklifi sil?'}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{quote.number}</strong> numaralı {isProforma ? 'proformayı' : 'teklifi'} silmek üzeresiniz.
              Bu işlem geri alınamaz ve tüm kalemler de silinecek.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
              Evet, Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF önizleme — hem proforma hem teklif için (şablonlu) */}
      <QuotePdfDialog
        quoteId={quote.id}
        open={pdfOpen}
        onOpenChange={setPdfOpen}
      />
      {/* Gönderme diyalogu — proforma VE teklif için */}
      <SendDialog
        proformaId={isProforma ? quote.id : null}
        quoteId={isProforma ? null : quote.id}
        open={sendOpen}
        onOpenChange={(v) => {
          setSendOpen(v)
          if (!v) {
            qc.invalidateQueries({ queryKey: ['quote', quote.id] })
            qc.invalidateQueries({ queryKey: ['quotes'] })
          }
        }}
        onPrint={() => {
          setSendOpen(false)
          setPdfOpen(true)
        }}
      />
    </>
  )
}
