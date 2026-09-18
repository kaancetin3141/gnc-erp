'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import {
  Package, Eye, RefreshCw, CheckCircle2, Clock, Factory,
  Printer, FileText,
} from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Order } from './parts/types'

// ============================================================
// Üretim kalemleri tipi (production API'sinden dönen)
// ============================================================
interface ProductionItem {
  id: string
  orderId: string
  productId: string | null
  productName: string | null
  description: string
  qty: number
  status: string // bekliyor | uretiliyor | uretildi
  producedAt: string | null
  producedBy: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

interface ProductionListResponse {
  items: ProductionItem[]
  total: number
  limit: number
  offset: number
}

// Siparişin bağlı olduğu teklif/fatura kalemleri
interface OrderLine {
  productId: string | null
  description: string
  qty: number
}

// Order detail API — quote/invoice lines'ı içerir
interface OrderDetail extends Order {
  quote?: { id: string; number: string; lines?: OrderLine[] } | null
  invoice?: { id: string; number: string; lines?: OrderLine[] } | null
}

// ============================================================
// Durum yardımcıları
// ============================================================
const STATUS_META: Record<string, { color: string; bg: string; label: string; icon: typeof Clock }> = {
  bekliyor: {
    color: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50',
    label: 'Bekliyor',
    icon: Clock,
  },
  uretiliyor: {
    color: 'text-sky-700 dark:text-sky-400',
    bg: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50',
    label: 'Üretiliyor',
    icon: RefreshCw,
  },
  uretildi: {
    color: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50',
    label: 'Üretildi',
    icon: CheckCircle2,
  },
}

function getProdMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.bekliyor
}

// ============================================================
// Order Production Preview — Sipariş Detay + Üretim Durumu
// Depo rolü için: FİYAT YOK, sadece üretim takibi
// ============================================================

export function OrderProductionPreview({
  order, open, onOpenChange,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [pdfOpen, setPdfOpen] = useState(false)

  // Sipariş detayı — quote/invoice lines'ı almak için
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['order', order?.id],
    queryFn: () => apiGet<OrderDetail>(`/api/orders/${order!.id}`),
    enabled: !!order && open,
  })

  // Bu siparişe bağlı üretim kalemleri
  const { data: prodData, isLoading: prodLoading } = useQuery({
    queryKey: ['production', { orderId: order?.id }],
    queryFn: () => apiGet<ProductionListResponse>(`/api/production?orderId=${order!.id}&limit=200`),
    enabled: !!order && open,
    refetchInterval: 30_000,
  })

  const orderDetail = detail
  const productionItems = prodData?.items ?? []

  // Kaynak kalemleri belirle (fatura öncelikli, yoksa teklif)
  const sourceLines: OrderLine[] = useMemo(() => {
    if (!orderDetail) return []
    const invoiceLines = orderDetail.invoice?.lines ?? []
    const quoteLines = orderDetail.quote?.lines ?? []
    return invoiceLines.length > 0 ? invoiceLines : quoteLines
  }, [orderDetail])

  // Eğer kaynak kalemler yoksa, üretim kalemlerini kaynak olarak kullan
  const effectiveLines: OrderLine[] = useMemo(() => {
    if (sourceLines.length > 0) return sourceLines
    return productionItems.map((p) => ({
      productId: p.productId,
      description: p.description,
      qty: p.qty,
    }))
  }, [sourceLines, productionItems])

  // Üretim kalemini ürün/description'a göre eşle
  const findProdItem = (line: OrderLine) => {
    if (line.productId) {
      const byProduct = productionItems.find((p) => p.productId === line.productId)
      if (byProduct) return byProduct
    }
    // İsimle eşle
    return productionItems.find((p) => p.description === line.description)
  }

  // Özet hesapla
  const summary = useMemo(() => {
    const totalLines = effectiveLines.length
    let produced = 0
    let inProgress = 0
    let waiting = 0
    for (const line of effectiveLines) {
      const item = findProdItem(line)
      if (!item) {
        waiting++
      } else if (item.status === 'uretildi') {
        produced++
      } else if (item.status === 'uretiliyor') {
        inProgress++
      } else {
        waiting++
      }
    }
    const progress = totalLines > 0 ? Math.round((produced / totalLines) * 100) : 0
    return { totalLines, produced, inProgress, waiting, progress }
  }, [effectiveLines, productionItems])

  if (!order) return null

  const isLoading = detailLoading || prodLoading

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto custom-scroll">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <Package className="w-5 h-5 text-violet-600 shrink-0" />
                  <span className="font-mono">{order.number}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {order.customer?.name ?? '—'}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs">
                  Üretim Durumu Önizleme · Sipariş Tarihi: {formatDate(order.orderDate)}
                </DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setPdfOpen(true)}>
                <Printer className="w-3.5 h-3.5 mr-1" /> Üretim Durumu PDF
              </Button>
            </div>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              {/* Özet kartları + ilerleme çubuğu */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg border bg-muted/20">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Toplam Kalem</div>
                    <div className="text-xl font-bold">{summary.totalLines}</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40">
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Üretildi</div>
                    <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{summary.produced}</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-sky-50/50 dark:bg-sky-950/20 border-sky-200/60 dark:border-sky-900/40">
                    <div className="text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400">Üretiliyor</div>
                    <div className="text-xl font-bold text-sky-700 dark:text-sky-400">{summary.inProgress}</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/40">
                    <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Bekliyor</div>
                    <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{summary.waiting}</div>
                  </div>
                </div>

                {/* İlerleme çubuğu */}
                <div className="p-3 rounded-lg border bg-muted/20 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Üretim İlerlemesi</span>
                    <span className="font-semibold tabular-nums">
                      {summary.produced}/{summary.totalLines} kalem ({summary.progress}%)
                    </span>
                  </div>
                  <Progress value={summary.progress} className="h-2" />
                </div>
              </div>

              <Separator />

              {/* Kalemler tablosu */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Factory className="w-4 h-4 text-emerald-600" />
                  Üretim Kalemleri
                </h4>
                {effectiveLines.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                    Bu siparişte kalem bulunamadı (fatura/teklif yok, üretim kalemi yok).
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[200px]">Ürün / Açıklama</TableHead>
                          <TableHead className="text-right w-24">Sipariş Mik.</TableHead>
                          <TableHead className="text-center w-32">Durum</TableHead>
                          <TableHead className="min-w-[120px]">Üretim Tarihi</TableHead>
                          <TableHead className="min-w-[140px]">Üreten</TableHead>
                          <TableHead className="text-right w-20">İşlem</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {effectiveLines.map((line, idx) => {
                          const item = findProdItem(line)
                          const meta = item ? getProdMeta(item.status) : STATUS_META.bekliyor
                          const Icon = meta.icon
                          return (
                            <TableRow key={idx} className={cn('hover:bg-muted/30', meta.bg)}>
                              <TableCell>
                                <div className="font-medium">{line.description}</div>
                                {item?.productName && item.productName !== line.description && (
                                  <div className="text-[10px] text-muted-foreground">{item.productName}</div>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{line.qty}</TableCell>
                              <TableCell className="text-center">
                                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border font-semibold', meta.color, meta.bg)}>
                                  <Icon className="w-3 h-3" />
                                  {meta.label}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {item?.producedAt ? formatDate(item.producedAt) : '—'}
                              </TableCell>
                              <TableCell className="text-xs">
                                {item?.producedBy ?? '—'}
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {item ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help">{formatDateTime(item.updatedAt).split(' ')[0]}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>Son güncelleme: {formatDateTime(item.updatedAt)}</TooltipContent>
                                  </Tooltip>
                                ) : '—'}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Bilgi notu */}
              <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300">
                <div className="font-semibold mb-1 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> Depo Görünümü
                </div>
                Bu görünümden üretim kalemlerinin durumunu izleyebilirsiniz.
                Üretim kalemlerini işaretlemek için &quot;Üretim Listesi&quot; modülünü kullanın.
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* PDF (inline rendered) */}
      {pdfOpen && order && (
        <ProductionPdfDialog
          order={order}
          orderDetail={orderDetail}
          productionItems={productionItems}
          open={pdfOpen}
          onOpenChange={setPdfOpen}
        />
      )}
    </>
  )
}

// ============================================================
// Üretim Durumu PDF (basit — print edilebilir A4)
// ============================================================
function ProductionPdfDialog({
  order, orderDetail, productionItems, open, onOpenChange,
}: {
  order: Order
  orderDetail: OrderDetail | undefined
  productionItems: ProductionItem[]
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const sourceLines: OrderLine[] = orderDetail
    ? (orderDetail.invoice?.lines ?? orderDetail.quote?.lines ?? [])
    : productionItems.map((p) => ({
        productId: p.productId,
        description: p.description,
        qty: p.qty,
      }))

  const findProdItem = (line: OrderLine) => {
    if (line.productId) {
      const byProduct = productionItems.find((p) => p.productId === line.productId)
      if (byProduct) return byProduct
    }
    return productionItems.find((p) => p.description === line.description)
  }

  const summary = useMemo(() => {
    let produced = 0
    let inProgress = 0
    let waiting = 0
    for (const line of sourceLines) {
      const item = findProdItem(line)
      if (!item) waiting++
      else if (item.status === 'uretildi') produced++
      else if (item.status === 'uretiliyor') inProgress++
      else waiting++
    }
    return {
      total: sourceLines.length,
      produced,
      inProgress,
      waiting,
      progress: sourceLines.length > 0 ? Math.round((produced / sourceLines.length) * 100) : 0,
    }
  }, [sourceLines, productionItems])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto custom-scroll print:max-w-none print:max-h-none print:p-0 print:shadow-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                Üretim Durumu PDF
              </DialogTitle>
              <DialogDescription className="mt-1">
                Sipariş <span className="font-mono">{order.number}</span> — Fiyat bilgisi içermez.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" /> Yazdır / PDF
            </Button>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[70vh] print:overflow-visible print:max-h-none">
          <div className="a4-page print-content">
            {/* Header */}
            <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-200">
              <div>
                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-bold text-white text-xl mb-3">
                  G
                </div>
                <div className="font-bold text-xl">{order.customer?.name ?? 'Şirket'}</div>
                <div className="text-xs text-gray-500 mt-0.5">GNC CRM — Üretim Takip</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-emerald-700 tracking-tight">ÜRETİM DURUMU</div>
                <div className="text-sm font-mono mt-1.5 text-gray-700">{order.number}</div>
                <div className="text-xs text-gray-500 mt-1">Sipariş Tarihi: {formatDate(order.orderDate)}</div>
                <div className="text-xs text-gray-500">Beklenen Teslimat: {formatDate(order.expectedDelivery)}</div>
              </div>
            </div>

            {/* Summary */}
            <div className="mb-6 p-4 rounded border border-gray-200 bg-gray-50">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Toplam Kalem</div>
                  <div className="text-2xl font-bold">{summary.total}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-emerald-600">Üretildi</div>
                  <div className="text-2xl font-bold text-emerald-700">{summary.produced}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-sky-600">Üretiliyor</div>
                  <div className="text-2xl font-bold text-sky-700">{summary.inProgress}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-amber-600">Bekliyor</div>
                  <div className="text-2xl font-bold text-amber-700">{summary.waiting}</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200 text-sm">
                İlerleme: <span className="font-bold text-emerald-700">{summary.progress}%</span>
                <span className="ml-2 text-gray-500">({summary.produced}/{summary.total} kalem üretildi)</span>
              </div>
            </div>

            {/* Lines table */}
            {sourceLines.length > 0 ? (
              <table className="w-full text-sm mb-6 border border-gray-200">
                <thead>
                  <tr className="bg-gray-50 border-b-2 border-gray-300">
                    <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-10">#</th>
                    <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600">Ürün / Açıklama</th>
                    <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-24">Sipariş Mik.</th>
                    <th className="text-center py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-28">Durum</th>
                    <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-32">Üretim Tarihi</th>
                    <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600">Üreten</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceLines.map((line, i) => {
                    const item = findProdItem(line)
                    const status = item?.status ?? 'bekliyor'
                    const statusLabel = status === 'uretildi' ? '✅ Üretildi' : status === 'uretiliyor' ? '🔄 Üretiliyor' : '⏳ Bekliyor'
                    return (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 px-3 text-gray-500 tabular-nums">{i + 1}</td>
                        <td className="py-2 px-3">
                          <div className="font-medium">{line.description}</div>
                          {item?.productName && item.productName !== line.description && (
                            <div className="text-[10px] text-gray-500">{item.productName}</div>
                          )}
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">{line.qty}</td>
                        <td className="text-center py-2 px-3 text-xs">{statusLabel}</td>
                        <td className="py-2 px-3 text-xs text-gray-600">
                          {item?.producedAt ? formatDate(item.producedAt) : '—'}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-600">
                          {item?.producedBy ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="mb-6 p-4 bg-gray-50 rounded text-sm text-gray-500 text-center border border-gray-200">
                Bu siparişte kalem bulunamadı.
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-4 border-t text-xs text-gray-400 text-center">
              <p>Bu belge GNC CRM tarafından oluşturulmuştur · {formatDate(new Date())}</p>
              <p className="mt-1">© {new Date().getFullYear()} {order.customer?.name ?? 'Şirket'}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
