'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiDelete, apiPost } from '@/lib/api-client'

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
  Receipt, Pencil, Trash2, RefreshCw, User, Calendar,
  Clock, CheckCircle2, AlertTriangle, TrendingUp, FileText,
  Printer, Plus, CircleCheckBig, Undo2, MessageCircle, CalendarClock,
  HandCoins, Loader2,
} from 'lucide-react'
import { formatCurrency, formatDate, whatsappLink } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatWeight, calculateTotalWeight } from '@/lib/weight-utils'
import {
  useInvoiceTemplate, TemplateA4Page, PdfHeader, PdfFooter,
} from '@/components/pdf/pdf-template'
import type { Invoice, InvoiceLine } from './types'
import {
  INVOICE_STATUSES, getInvoiceStatusMeta,
  buildInvoiceWhatsAppMessage, overdueDays,
} from './invoice-utils'

// ============================================================
// Fatura Detay Dialog
// ============================================================

export function InvoiceDetailDialog({
  invoice, open, onOpenChange, onEdit,
}: {
  invoice: Invoice | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onEdit: (inv: Invoice) => void
}) {
  const qc = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [changing, setChanging] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [quickBusy, setQuickBusy] = useState<string | null>(null)

  // Detay sorgu
  const { data: detail, isLoading } = useQuery({
    queryKey: ['invoice', invoice?.id],
    queryFn: () => apiGet<Invoice>(`/api/invoices/${invoice!.id}`),
    enabled: !!invoice && open,
  })

  if (!invoice) return null

  const d = detail ?? invoice
  const status = getInvoiceStatusMeta(d.status)

  const changeStatus = async (newStatus: string) => {
    setChanging(true)
    try {
      await apiPatch(`/api/invoices/${invoice.id}`, { status: newStatus })
      toast.success('Durum güncellendi')
      qc.invalidateQueries({ queryKey: ['invoice', invoice.id] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncelleme başarısız')
    } finally {
      setChanging(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await apiDelete(`/api/invoices/${invoice.id}`)
      toast.success('Fatura silindi')
      qc.invalidateQueries({ queryKey: ['invoices'] })
      setDeleteOpen(false)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silme başarısız')
    } finally {
      setDeleting(false)
    }
  }

  // Gecikmiş mi? — canlı detay (d) üzerinden okunur; hızlı aksiyonlar
  // sonrası prop güncellenmeden bile arayüz doğru duruma geçer
  const isOverdue = d.status === 'odeme_bekliyor' && d.dueDate
    ? new Date(d.dueDate).getTime() < Date.now()
    : false

  // ----- Hızlı tahsilat aksiyonları (liste menüsündeki aksiyonların detaya taşınması) -----
  const isPending = d.status === 'odeme_bekliyor' || d.status === 'gecikti'
  const quickActionInvalid = (e: unknown, fallback: string) => {
    toast.error(e instanceof Error ? e.message : fallback)
  }

  // Ödendi işaretle / geri al
  const handleQuickStatus = async (status: 'odendi' | 'odeme_bekliyor') => {
    setQuickBusy(status)
    try {
      await apiPatch(`/api/invoices/${invoice.id}`, { status })
      qc.invalidateQueries({ queryKey: ['invoice', invoice.id] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success(
        status === 'odendi'
          ? `${invoice.number} ödendi olarak işaretlendi 🎉`
          : `${invoice.number} ödeme bekliyor durumuna alındı`,
      )
    } catch (e) {
      quickActionInvalid(e, 'İşlem başarısız')
    } finally {
      setQuickBusy(null)
    }
  }

  // Vade uzat +7 gün
  const handleExtendDue = async () => {
    setQuickBusy('extend')
    try {
      const base = invoice.dueDate && !isNaN(new Date(invoice.dueDate).getTime())
        ? new Date(invoice.dueDate)
        : new Date()
      base.setDate(base.getDate() + 7)
      await apiPatch(`/api/invoices/${invoice.id}`, { dueDate: base.toISOString() })
      qc.invalidateQueries({ queryKey: ['invoice', invoice.id] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success(`${invoice.number} vadesi ${formatDate(base.toISOString())} olarak uzatıldı`)
    } catch (e) {
      quickActionInvalid(e, 'Vade uzatılamadı')
    } finally {
      setQuickBusy(null)
    }
  }

  // Ödeme hatırlatma (WhatsApp) — detaydaki müşteri telefonuyla wa.me linki + aktivite kaydı
  const handleRemind = async () => {
    setQuickBusy('remind')
    try {
      const phone = d.customer?.phone ?? null
      if (!phone) {
        toast.error(`${d.customer?.name ?? 'Müşteri'} için telefon numarası kayıtlı değil`)
        return
      }
      const overdue = isOverdue || d.status === 'gecikti'
      const msg = buildInvoiceWhatsAppMessage({
        number: invoice.number,
        customerName: d.customer?.name ?? '',
        total: invoice.total,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        isOverdue: overdue,
      })
      window.open(whatsappLink(phone, msg), '_blank', 'noopener,noreferrer')
      toast.success(`${invoice.number} için hatırlatma mesajı hazırlandı`)

      // Müşteri 360 zaman tüneliğine kaydet
      const customerId = d.customer?.id ?? invoice.customerId
      if (customerId) {
        try {
          await apiPost('/api/customers/' + customerId + '/activities', {
            type: 'whatsapp',
            subject: `Ödeme hatırlatması gönderildi: ${invoice.number}`,
            detail: `${invoice.total.toLocaleString('tr-TR')} ${invoice.currency} · Vade: ${invoice.dueDate ? formatDate(invoice.dueDate) : '—'}`,
            outcome: overdue ? null : 'basarili',
          })
        } catch { /* aktivite kaydı akışı etkilemez */ }
      }
    } catch (e) {
      quickActionInvalid(e, 'Hatırlatma hazırlanamadı')
    } finally {
      setQuickBusy(null)
    }
  }

  const lines: InvoiceLine[] = d.lines ?? []
  // Ağırlık kontrolü (F4)
  const hasWeight = lines.some((l) => l.totalWeight != null && l.totalWeight > 0)
  const totalNetWeight = hasWeight
    ? calculateTotalWeight(lines.map((l) => ({ qty: l.qty, weightPerUnit: l.weightPerUnit ?? null })))
    : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto custom-scroll">
          <DialogHeader className="print:hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <Receipt className="w-5 h-5 text-amber-600 shrink-0" />
                  <span className="font-mono">{invoice.number}</span>
                  <Badge variant="outline" className={cn('text-[10px]', status.color)}>
                    <status.icon className="w-3 h-3 mr-1" />
                    {status.label}
                  </Badge>
                  {isOverdue && (
                    <Badge variant="outline" className="text-[10px] text-red-700 bg-red-50 border-red-200">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Vade Geçti
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="mt-1 flex items-center gap-2 flex-wrap text-xs">
                  <User className="w-3 h-3" />
                  {invoice.customer?.name ?? '—'}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => setPdfOpen(true)}>
                      <FileText className="w-3.5 h-3.5 mr-1" /> PDF Görüntüle
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fatura PDF önizleme</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => onEdit(invoice)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Düzenle
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Faturayı düzenle</TooltipContent>
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

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <>
              {/* Bilgi kartları */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-1">
                <Card className="bg-muted/30">
                  <CardContent className="p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Düzenleme
                    </div>
                    <div className="text-sm font-bold mt-0.5">{formatDate(d.issueDate)}</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Vade
                    </div>
                    <div className="text-sm font-bold mt-0.5">{formatDate(d.dueDate)}</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Ödeme Tarihi
                    </div>
                    <div className="text-sm font-bold mt-0.5">{formatDate(d.paidDate)}</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Para Birimi</div>
                    <div className="text-sm font-bold mt-0.5">{d.currency}</div>
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
                <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50">
                  <CardContent className="p-3">
                    <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Genel Toplam</div>
                    <div className="text-base font-bold mt-0.5 tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(d.total, d.currency)}</div>
                  </CardContent>
                </Card>
              </div>

              <Separator />

              {/* Satır detayları (lines) */}
              {lines.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <h4 className="text-sm font-semibold">Kalemler ({lines.length})</h4>
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground py-2">Açıklama</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground py-2 text-right">Miktar</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground py-2 text-right">Birim</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground py-2 text-right">KDV</TableHead>
                          {hasWeight && (
                            <TableHead className="text-xs uppercase tracking-wider text-muted-foreground py-2 text-right">Ağırlık</TableHead>
                          )}
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground py-2 text-right">Tutar</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((line) => (
                          <TableRow key={line.id} className="text-sm">
                            <TableCell className="py-2">
                              {line.description}
                              {line.product && (
                                <span className="text-[10px] text-muted-foreground ml-1">({line.product.sku || line.product.name})</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right py-2 tabular-nums">{line.qty}</TableCell>
                            <TableCell className="text-right py-2 tabular-nums">{formatCurrency(line.unitPrice, d.currency)}</TableCell>
                            <TableCell className="text-right py-2 tabular-nums">%{line.taxRate}</TableCell>
                            {hasWeight && (
                              <TableCell className="text-right py-2 tabular-nums">
                                {line.totalWeight != null && line.totalWeight > 0
                                  ? formatWeight(line.totalWeight, line.weightUnit || 'kg')
                                  : '—'}
                              </TableCell>
                            )}
                            <TableCell className="text-right py-2 tabular-nums font-medium">{formatCurrency(line.lineTotal, d.currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {totalNetWeight != null && (
                    <div className="flex justify-end">
                      <div className="text-xs text-muted-foreground">
                        Toplam Net Ağırlık: <span className="font-medium text-foreground tabular-nums">{formatWeight(totalNetWeight, 'kg')}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Durum aksiyonları */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                  <h4 className="text-sm font-semibold">Durum Yönetimi</h4>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {INVOICE_STATUSES.map((s) => (
                    <Button
                      key={s.value}
                      variant={d.status === s.value ? 'default' : 'outline'}
                      size="sm"
                      disabled={changing || d.status === s.value}
                      onClick={() => changeStatus(s.value)}
                      className={cn(
                        d.status === s.value && 'bg-amber-600 hover:bg-amber-700',
                      )}
                    >
                      <s.icon className="w-3.5 h-3.5 mr-1" />
                      {s.label}
                    </Button>
                  ))}
                </div>

                {d.status === 'odendi' && d.paidDate && (
                  <div className="p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Ödendi — {formatDate(d.paidDate)}
                  </div>
                )}
                {isOverdue && (
                  <div className="p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Vade tarihi geçti. &quot;Gecikti&quot; olarak işaretleyebilirsiniz.
                  </div>
                )}

                {/* Hızlı tahsilat aksiyonları — listedeki menünün aynısı, detaydan erişilebilir */}
                {(isPending || d.status === 'odendi') && (
                  <div className="pt-1">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <HandCoins className="w-3.5 h-3.5 text-fuchsia-600" />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Hızlı Tahsilat</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {isPending && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={quickBusy !== null}
                            onClick={() => handleQuickStatus('odendi')}
                            className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 h-8 text-xs"
                          >
                            {quickBusy === 'odendi'
                              ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              : <CircleCheckBig className="w-3.5 h-3.5 mr-1" />}
                            Ödendi İşaretle
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={quickBusy !== null}
                            onClick={handleRemind}
                            className="h-8 text-xs border-sky-200 dark:border-sky-900/50 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                          >
                            {quickBusy === 'remind'
                              ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              : <MessageCircle className="w-3.5 h-3.5 mr-1" />}
                            Hatırlat (WhatsApp)
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={quickBusy !== null}
                            onClick={handleExtendDue}
                            className="h-8 text-xs"
                          >
                            {quickBusy === 'extend'
                              ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              : <CalendarClock className="w-3.5 h-3.5 mr-1" />}
                            Vade Uzat +7
                          </Button>
                        </>
                      )}
                      {d.status === 'odendi' && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={quickBusy !== null}
                          onClick={() => handleQuickStatus('odeme_bekliyor')}
                          className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 h-8 text-xs"
                        >
                          {quickBusy === 'odeme_bekliyor'
                            ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                            : <Undo2 className="w-3.5 h-3.5 mr-1" />}
                          Ödemeyi Geri Al
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Çeki Listesi (Packing List) & İrsaliye & Sipariş */}
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-violet-600" />
                  <h4 className="text-sm font-semibold">Belge Yönetimi</h4>
                </div>

                {/* Sipariş bağlantısı */}
                <div className="p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sipariş</span>
                    {d.order ? (
                      <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">
                        {d.order.number}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Siparişe bağlı değil</span>
                    )}
                  </div>
                  {d.order && (
                    <div className="text-xs text-muted-foreground">
                      Sipariş No: <span className="font-mono font-medium text-foreground">{d.order.number}</span>
                      <span className="ml-2">Durum: {d.order.status}</span>
                    </div>
                  )}
                </div>

                {/* Çeki Listesi */}
                <div className="p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Çeki Listesi (Packing List)</span>
                    {d.packingListNo ? (
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                        Düzenlendi
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={async () => {
                          const packingNo = `CL-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`
                          try {
                            await apiPatch(`/api/invoices/${invoice.id}`, {
                              packingListNo: packingNo,
                              packingListDate: new Date().toISOString(),
                            })
                            toast.success('Çeki listesi oluşturuldu', { description: packingNo })
                            qc.invalidateQueries({ queryKey: ['invoice', invoice.id] })
                            qc.invalidateQueries({ queryKey: ['invoices'] })
                          } catch (e) {
                            toast.error('Çeki listesi oluşturulamadı')
                          }
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Çeki Listesi Oluştur
                      </Button>
                    )}
                  </div>
                  {d.packingListNo ? (
                    <div className="text-xs space-y-1">
                      <div>No: <span className="font-mono font-medium">{d.packingListNo}</span></div>
                      {d.packingListDate && <div>Tarih: {formatDate(d.packingListDate)}</div>}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] mt-1"
                        onClick={() => window.print()}
                      >
                        <Printer className="w-3 h-3 mr-1" /> Çeki Listesi Yazdır
                      </Button>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Henüz çeki listesi oluşturulmadı.</div>
                  )}
                </div>

                {/* İrsaliye */}
                <div className="p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">İrsaliye (Dispatch Note)</span>
                    {d.dispatchNo ? (
                      <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200">
                        Düzenlendi
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Yok</span>
                    )}
                  </div>
                  {d.dispatchNo ? (
                    <div className="text-xs space-y-1">
                      <div>No: <span className="font-mono font-medium">{d.dispatchNo}</span></div>
                      {d.dispatchDate && <div>Tarih: {formatDate(d.dispatchDate)}</div>}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Henüz irsaliye düzenlenmedi.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* PDF Önizleme */}
      {pdfOpen && (
        <InvoicePdfDialog invoice={invoice} detail={detail} onClose={() => setPdfOpen(false)} />
      )}

      {/* Silme onayı */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Faturayı sil?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{invoice.number}</strong> numaralı faturayı silmek üzeresiniz.
              Bu işlem geri alınamaz.
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
    </>
  )
}

// ============================================================
// Invoice PDF Preview Dialog
// ============================================================
// Fatura PDF önizleme — Belge Yönetimi sayfasından da kullanılır (export)
// detail verilmezse kendi çeker (Belge Yönetimi senaryosu)
export function InvoicePdfDialog({ invoice, detail, onClose }: {
  invoice: Invoice
  detail: Invoice | null
  onClose: () => void
}) {
  // Şablon — Ayarlar > Fatura Şablonu (logo, renk, font, footer)
  const { data: tpl } = useInvoiceTemplate()
  // Belge Yönetimi'nden yalnızca id ile gelirse detayı fetch et
  const shouldFetch = !detail && invoice && !invoice.lines
  const { data: fetched } = useQuery({
    queryKey: ['invoice', invoice?.id],
    queryFn: () => apiGet<Invoice>(`/api/invoices/${invoice!.id}`),
    enabled: !!shouldFetch,
  })
  const d = fetched ?? detail ?? invoice
  const lines = (d as Invoice & { lines?: { id: string; description: string; qty: number; unitPrice: number; taxRate: number; lineTotal: number; weightPerUnit?: number | null; weightUnit?: string | null; totalWeight?: number | null; product?: { name: string; sku: string | null } | null }[] }).lines ?? []
  // Ağırlık kontrolü (F4)
  const hasWeight = lines.some((l) => l.totalWeight != null && l.totalWeight > 0)
  const totalNetWeight = hasWeight
    ? calculateTotalWeight(lines.map((l) => ({ qty: l.qty, weightPerUnit: l.weightPerUnit ?? null })))
    : null

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] print:max-w-none print:max-h-none print:p-0 print:shadow-none">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <DialogTitle>Fatura PDF Önizleme</DialogTitle>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" /> Yazdır / PDF
            </Button>
          </div>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[60vh] print:overflow-visible print:max-h-none">
          <TemplateA4Page tpl={tpl}>
            {/* Şablon başlık — logo + şirket adı + FATURA */}
            <PdfHeader tpl={tpl} title="FATURA" docNumber={d.number} date={formatDate(d.issueDate)} />

            {/* Customer */}
            <div className="mb-6">
              <div className="text-xs text-gray-500 mb-1">Sayın</div>
              <div className="font-semibold">{d.customer?.name ?? '—'}</div>
              {d.customer?.address && <div className="text-xs text-gray-600 mt-0.5">{d.customer.address}</div>}
              {d.customer?.taxNumber && <div className="text-xs text-gray-600">VKN: {d.customer.taxNumber}</div>}
            </div>

            {/* Status */}
            <div className="mb-6 flex items-center gap-2">
              <span className="text-xs text-gray-500">Durum:</span>
              <span className="text-sm font-medium">
                {d.status === 'odeme_bekliyor' ? 'Ödeme Bekliyor' : d.status === 'odendi' ? 'Ödendi' : d.status === 'gecikti' ? 'Gecikti' : 'İptal'}
              </span>
            </div>

            {/* Lines */}
            {lines.length > 0 && (
              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2 text-xs uppercase tracking-wider text-gray-500">Açıklama</th>
                    <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">Miktar</th>
                    <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">Birim Fiyat</th>
                    <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">KDV</th>
                    {hasWeight && (
                      <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">Ağırlık</th>
                    )}
                    <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-b border-gray-100">
                      <td className="py-2">{line.description}</td>
                      <td className="text-right py-2 tabular-nums">{line.qty}</td>
                      <td className="text-right py-2 tabular-nums">{formatCurrency(line.unitPrice, d.currency)}</td>
                      <td className="text-right py-2 tabular-nums">%{line.taxRate}</td>
                      {hasWeight && (
                        <td className="text-right py-2 tabular-nums">
                          {line.totalWeight != null && line.totalWeight > 0
                            ? formatWeight(line.totalWeight, line.weightUnit || 'kg')
                            : '—'}
                        </td>
                      )}
                      <td className="text-right py-2 tabular-nums font-medium">{formatCurrency(line.lineTotal, d.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Totals */}
            <div className="ml-auto w-full max-w-xs space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Ara Toplam:</span>
                <span className="tabular-nums">{formatCurrency(d.subtotal, d.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">KDV Toplam:</span>
                <span className="tabular-nums">{formatCurrency(d.taxTotal, d.currency)}</span>
              </div>
              {totalNetWeight != null && (
                <div className="flex justify-between text-sm border-t border-gray-200 pt-1 mt-1">
                  <span className="text-gray-600">Toplam Net Ağırlık:</span>
                  <span className="tabular-nums font-medium">{formatWeight(totalNetWeight, 'kg')}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t-2 border-gray-300">
                <span>Genel Toplam:</span>
                <span className="tabular-nums text-emerald-700">{formatCurrency(d.total, d.currency)}</span>
              </div>
            </div>

            {/* Footer — şablon: footer text + şirket bilgileri + banka + imza */}
            <PdfFooter tpl={tpl} />
          </TemplateA4Page>
        </div>
      </DialogContent>
    </Dialog>
  )
}
