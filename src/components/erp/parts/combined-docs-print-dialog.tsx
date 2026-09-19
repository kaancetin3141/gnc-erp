'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Printer, Layers, Loader2, FileCheck2, Receipt, Truck, ClipboardList } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  useInvoiceTemplate, TemplateA4Page, PdfHeader, PdfFooter,
} from '@/components/pdf/pdf-template'
import type { Invoice } from './types'
import type { IrsaliyePdfData } from './irsaliye-types'
import {
  getIrsaliyeStatusMeta, formatKg,
} from './irsaliye-utils'
import { formatWeight, calculateTotalWeight } from '@/lib/weight-utils'

// ============================================================
// CombinedOrderPrintDialog — SİPARİŞİN TÜM BELGELERİNİ TEK
// YAZDIRMADA BİRLEŞTİRİR (her belge ayrı A4 sayfası).
// · Yetkiye göre Fatura / İrsaliye / Çeki Listesi üretir
//   (generate-document idempotent — mevcut belgeyi yeniden üretmez)
// · window.print() ile hepsi tek PDF'te ardışık sayfalar olarak çıkar
// ============================================================

interface OrderRef {
  id: string
  number: string
  customerName?: string
}

interface Props {
  order: OrderRef | null
  canSeeInvoice: boolean
  canSeeIrsaliye: boolean
  open: boolean
  onOpenChange: (v: boolean) => void
}

interface DocChecklistItem {
  kind: 'invoice' | 'irsaliye' | 'packing'
  label: string
  number: string
  icon: typeof Receipt
  cls: string
}

const genKey = (order: OrderRef, type: string) => `${order.id}:${type}`

export function CombinedOrderPrintDialog({ order, canSeeInvoice, canSeeIrsaliye, open, onOpenChange }: Props) {
  const { data: tpl } = useInvoiceTemplate()

  const [preparing, setPreparing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checklist, setChecklist] = useState<DocChecklistItem[]>([])
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [irsaliyeId, setIrsaliyeId] = useState<string | null>(null)
  const [packingInvoiceId, setPackingInvoiceId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const reset = useCallback(() => {
    setPreparing(false)
    setProgress('')
    setError(null)
    setChecklist([])
    setInvoiceId(null)
    setIrsaliyeId(null)
    setPackingInvoiceId(null)
    setReady(false)
  }, [])

  // Açılışta eksik belgeleri sırayla üret (idempotent)
  useEffect(() => {
    if (!open || !order) return
    let cancelled = false

    const ensure = async () => {
      reset()
      setPreparing(true)
      const list: DocChecklistItem[] = []
      let invId: string | null = null
      let irsId: string | null = null
      let packInvId: string | null = null

      try {
        const steps = canSeeInvoice
          ? (['invoice', 'irsaliye', 'packing_list'] as const)
          : canSeeIrsaliye
            ? (['irsaliye', 'packing_list'] as const)
            : ([] as const)
        let step = 0
        for (const type of steps) {
          step++
          if (cancelled) return
          setProgress(`Belgeler hazırlanıyor (${step}/${steps.length})...`)
          const res = await apiPost<{
            type: string
            document: { id: string; number: string; packingListNo?: string | null }
          }>(`/api/orders/${order.id}/generate-document`, { type })

          if (type === 'invoice') {
            invId = res.document.id
            list.push({ kind: 'invoice', label: 'Fatura', number: res.document.number, icon: Receipt, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300' })
          } else if (type === 'irsaliye') {
            irsId = res.document.id
            list.push({ kind: 'irsaliye', label: 'İrsaliye', number: res.document.number, icon: Truck, cls: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300' })
          } else {
            packInvId = res.document.id
            list.push({ kind: 'packing', label: 'Çeki Listesi', number: res.document.packingListNo || res.document.number, icon: ClipboardList, cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300' })
          }
        }
        if (cancelled) return
        setChecklist(list)
        setInvoiceId(invId)
        setIrsaliyeId(irsId)
        setPackingInvoiceId(packInvId)
        setReady(true)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Belgeler hazırlanamadı')
      } finally {
        if (!cancelled) setPreparing(false)
      }
    }
    ensure()
    return () => { cancelled = true }
  }, [open, order, canSeeInvoice, canSeeIrsaliye, reset])

  // Fatura verisi (fatura + çeki listesi ortak kaynaktır)
  const effectiveInvoiceId = invoiceId ?? packingInvoiceId
  const { data: invoice } = useQuery({
    queryKey: ['combined-invoice', effectiveInvoiceId],
    queryFn: () => apiGet<Invoice>(`/api/invoices/${effectiveInvoiceId}`),
    enabled: !!effectiveInvoiceId && open && ready,
  })

  const { data: irs } = useQuery({
    queryKey: ['combined-irsaliye', irsaliyeId],
    queryFn: () => apiGet<IrsaliyePdfData>(`/api/irsaliye/${irsaliyeId}/pdf`),
    enabled: !!irsaliyeId && open && ready,
  })

  if (!order) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false) }}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto custom-scroll print:max-w-none print:max-h-none print:p-0 print:shadow-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-violet-600" />
                Tüm Belgeler — {order.number}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {order.customerName ?? ''} · Her belge ayrı A4 sayfasına yazdırılır. Tek PDF olarak kaydedebilirsiniz.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!ready || preparing}>
              <Printer className="w-4 h-4 mr-1.5" /> Yazdır / PDF
            </Button>
          </div>

          {/* Üretim checklist'i */}
          {!preparing && checklist.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {checklist.map((c) => (
                <Badge key={c.kind} variant="outline" className={cn('text-[10px] gap-1', c.cls)}>
                  <c.icon className="w-3 h-3" />
                  {c.label}: {c.number}
                  <FileCheck2 className="w-3 h-3" />
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        {preparing || error ? (
          <div className="py-10 text-center space-y-3">
            {error ? (
              <>
                <div className="text-sm text-red-600 font-medium">{error}</div>
                <Button variant="outline" size="sm" onClick={() => { onOpenChange(false) }}>Kapat</Button>
              </>
            ) : (
              <>
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-violet-600" />
                <div className="text-sm text-muted-foreground">{progress}</div>
                <Skeleton className="h-40 w-full mt-2" />
              </>
            )}
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[70vh] print:overflow-visible print:max-h-none">
            {/* ===== SAYFA 1: FATURA ===== */}
            {invoice && invoiceId && (
              <div className={cn('a4-wrap', (irs || (packingInvoiceId && invoice)) ? 'border-b-8 border-dashed border-muted mb-6 pb-6' : '', 'print:border-0 print:mb-0 print:pb-0 print:break-after-page')}>
                <TemplateA4Page tpl={tpl}>
                  <PdfHeader tpl={tpl} title="FATURA" docNumber={invoice.number} date={formatDate(invoice.issueDate)} />
                  <div className="mb-6">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Sayın</div>
                    <div className="font-semibold">{invoice.customer?.name ?? '—'}</div>
                    {invoice.customer?.address && <div className="text-xs text-gray-600 mt-0.5">{invoice.customer.address}</div>}
                    {invoice.customer?.taxNumber && <div className="text-xs text-gray-600">VKN: {invoice.customer.taxNumber}</div>}
                  </div>
                  <table className="w-full text-sm mb-6">
                    <thead>
                      <tr className="border-b-2 border-gray-300">
                        <th className="text-left py-2 text-xs uppercase tracking-wider text-gray-500">Açıklama</th>
                        <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">Miktar</th>
                        <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">Birim Fiyat</th>
                        <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">KDV</th>
                        <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(invoice.lines ?? []).map((l) => (
                        <tr key={l.id} className="border-b border-gray-100">
                          <td className="py-2">{l.description}</td>
                          <td className="text-right py-2 tabular-nums">{l.qty}</td>
                          <td className="text-right py-2 tabular-nums">{formatCurrency(l.unitPrice, invoice.currency)}</td>
                          <td className="text-right py-2 tabular-nums">%{l.taxRate}</td>
                          <td className="text-right py-2 tabular-nums font-medium">{formatCurrency(l.lineTotal, invoice.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="ml-auto w-full max-w-xs space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Ara Toplam:</span>
                      <span className="tabular-nums">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">KDV Toplam:</span>
                      <span className="tabular-nums">{formatCurrency(invoice.taxTotal, invoice.currency)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold pt-2 border-t-2 border-gray-300">
                      <span>Genel Toplam:</span>
                      <span className="tabular-nums" style={{ color: tpl?.primaryColor || '#047857' }}>
                        {formatCurrency(invoice.total, invoice.currency)}
                      </span>
                    </div>
                  </div>
                  <PdfFooter tpl={tpl} />
                </TemplateA4Page>
              </div>
            )}

            {/* ===== SAYFA 2: İRSALİYE ===== */}
            {irs && (
              <div className={cn('a4-wrap', packingInvoiceId && invoice ? 'border-b-8 border-dashed border-muted mb-6 pb-6' : '', 'print:border-0 print:mb-0 print:pb-0 print:break-after-page')}>
                <TemplateA4Page tpl={tpl}>
                  <PdfHeader tpl={tpl} title="İRSALİYE" docNumber={irs.number} date={formatDate(irs.date)} />
                  {(() => {
                    const sm = getIrsaliyeStatusMeta(irs.status)
                    return sm ? (
                      <div className="mb-4">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border font-semibold', sm.color)}>{sm.label}</span>
                      </div>
                    ) : null
                  })()}
                  <div className="mb-6 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Müşteri</div>
                      {irs.customer && (
                        <>
                          <div className="text-base font-semibold">{irs.customer.name}</div>
                          {irs.customer.address && <div className="text-xs text-gray-600 mt-0.5">{irs.customer.address}</div>}
                          {irs.customer.phone && <div className="text-xs text-gray-600 mt-0.5">Tel: {irs.customer.phone}</div>}
                        </>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Sevkiyat Bilgileri</div>
                      {irs.order && <div className="text-xs text-gray-600">Sipariş No: <span className="font-mono">{irs.order.number}</span></div>}
                      {irs.shipping.shippingAddress && <div className="text-xs text-gray-600 mt-1">{irs.shipping.shippingAddress}</div>}
                    </div>
                  </div>
                  <table className="w-full text-sm mb-6 border border-gray-200">
                    <thead>
                      <tr className="bg-gray-50 border-b-2 border-gray-300">
                        <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-10">#</th>
                        <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600">Açıklama / Ürün</th>
                        <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-20">Miktar</th>
                        <th className="text-center py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-16">Birim</th>
                        <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-28">Toplam Ağr.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {irs.lines.map((l, i) => (
                        <tr key={l.id} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-500 tabular-nums">{i + 1}</td>
                          <td className="py-2 px-3 font-medium">{l.description}{l.product?.sku ? ` · ${l.product.sku}` : ''}</td>
                          <td className="text-right py-2 px-3 tabular-nums">{l.qty}</td>
                          <td className="text-center py-2 px-3 text-gray-600 text-xs">{l.unit}</td>
                          <td className="text-right py-2 px-3 tabular-nums font-medium">{l.totalWeight ? formatKg(l.totalWeight) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-end mb-8">
                    <div className="w-full max-w-sm space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Net Ağırlık:</span>
                        <span className="tabular-nums font-medium">{formatKg(irs.weights.totalNetWeight)}</span>
                      </div>
                      <div className="flex justify-between text-base font-bold pt-2 border-t-2 border-gray-300">
                        <span>Brüt Toplam:</span>
                        <span className="tabular-nums" style={{ color: tpl?.accentColor || '#6d28d9' }}>{formatKg(irs.weights.totalGrossWeight)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-200">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Notlar</div>
                      <div className="text-xs text-gray-700">{irs.notes || '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">İmza &amp; Kaşe</div>
                      <div className="mt-6 ml-auto w-40 h-14 border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">
                        {irs.tenantName}
                      </div>
                    </div>
                  </div>
                  <PdfFooter tpl={tpl} />
                </TemplateA4Page>
              </div>
            )}

            {/* ===== SAYFA 3: ÇEKİ LİSTESİ ===== */}
            {packingInvoiceId && invoice && (
              <div className="a4-wrap print:break-after-page">
                <TemplateA4Page tpl={tpl}>
                  <PdfHeader
                    tpl={tpl}
                    title="ÇEKİ LİSTESİ"
                    docNumber={invoice.packingListNo || '—'}
                    date={formatDate(invoice.packingListDate ?? invoice.issueDate)}
                  />
                  <div className="mb-6 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Alıcı</div>
                      <div className="text-base font-semibold">{invoice.customer?.name ?? '—'}</div>
                      {invoice.customer?.address && <div className="text-xs text-gray-600 mt-0.5">{invoice.customer.address}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">İlgili Sipariş</div>
                      <div className="text-sm font-mono">{order.number}</div>
                      <div className="text-xs text-gray-600 mt-0.5">Fatura: {invoice.number}</div>
                    </div>
                  </div>
                  {(() => {
                    const lines = invoice.lines ?? []
                    const hasWeight = lines.some((l) => l.totalWeight != null && l.totalWeight > 0)
                    const totalNetWeight = hasWeight
                      ? calculateTotalWeight(lines.map((l) => ({ qty: l.qty, weightPerUnit: l.weightPerUnit ?? null })))
                      : null
                    const totalQty = lines.reduce((s, l) => s + l.qty, 0)
                    return (
                      <>
                        <table className="w-full text-sm mb-6 border border-gray-200">
                          <thead>
                            <tr className="bg-gray-50 border-b-2 border-gray-300">
                              <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-10">#</th>
                              <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600">Ürün / Açıklama</th>
                              <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-20">Miktar</th>
                              {lines.some((l) => l.color) && (
                                <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-24">Renk</th>
                              )}
                              {hasWeight && (
                                <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-24">Toplam Ağr.</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((l, i) => (
                              <tr key={l.id ?? i} className="border-b border-gray-100">
                                <td className="py-2 px-3 text-gray-500 tabular-nums">{i + 1}</td>
                                <td className="py-2 px-3 font-medium">{l.description}{l.product?.sku ? ` · ${l.product.sku}` : ''}</td>
                                <td className="text-right py-2 px-3 tabular-nums">{l.qty}</td>
                                {lines.some((x) => x.color) && <td className="py-2 px-3 text-xs text-gray-700">{l.color || '—'}</td>}
                                {hasWeight && (
                                  <td className="text-right py-2 px-3 tabular-nums font-medium">
                                    {l.totalWeight != null && l.totalWeight > 0 ? formatWeight(l.totalWeight, l.weightUnit || 'kg') : '—'}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex justify-end mb-8">
                          <div className="w-full max-w-xs space-y-1.5">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Toplam Kalem Sayısı:</span>
                              <span className="tabular-nums font-medium">{lines.length}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Toplam Miktar:</span>
                              <span className="tabular-nums font-medium">{totalQty}</span>
                            </div>
                            {totalNetWeight != null && (
                              <div className="flex justify-between text-base font-bold pt-2 border-t-2 border-gray-300">
                                <span>Toplam Net Ağırlık:</span>
                                <span className="tabular-nums" style={{ color: tpl?.accentColor || '#b45309' }}>{formatWeight(totalNetWeight, 'kg')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )
                  })()}
                  <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-200">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Teslim Eden</div>
                      <div className="mt-8 w-40 h-14 border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">İmza</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 text-right">Teslim Alan</div>
                      <div className="mt-8 ml-auto w-40 h-14 border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">İmza</div>
                    </div>
                  </div>
                  <PdfFooter tpl={tpl} />
                </TemplateA4Page>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
