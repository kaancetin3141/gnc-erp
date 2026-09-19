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
import { cn } from '@/lib/utils'
import {
  useInvoiceTemplate,
} from '@/components/pdf/pdf-template'
import type { Invoice } from './types'
import type { IrsaliyePdfData } from './irsaliye-types'
import { InvoiceDocPage, IrsaliyeDocPage, PackingDocPage } from './doc-pages'

// ============================================================
// CombinedOrderPrintDialog — SİPARİŞİN TÜM BELGELERİNİ TEK
// YAZDIRMADA BİRLEŞTİRİR (her belge ayrı A4 sayfası).
// · Yetkiye göre Fatura / İrsaliye / Çeki Listesi üretir
//   (generate-document idempotent — mevcut belgeyi yeniden üretmez)
// · window.print() ile hepsi tek PDF'te ardışık sayfalar olarak çıkar
// ============================================================

export interface OrderRef {
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

export interface DocChecklistItem {
  kind: 'invoice' | 'irsaliye' | 'packing'
  label: string
  number: string
  icon: typeof Receipt
  cls: string
}

export const DOC_BADGE_CLS: Record<DocChecklistItem['kind'], string> = {
  invoice: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
  irsaliye: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300',
  packing: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
}

// Bir sipariş için yetkiye göre belge üretim adımları
export function docStepsFor(canSeeInvoice: boolean, canSeeIrsaliye: boolean): readonly ('invoice' | 'irsaliye' | 'packing_list')[] {
  return canSeeInvoice
    ? (['invoice', 'irsaliye', 'packing_list'] as const)
    : canSeeIrsaliye
      ? (['irsaliye', 'packing_list'] as const)
      : ([] as readonly ('invoice' | 'irsaliye' | 'packing_list')[])
}

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
        const steps = docStepsFor(canSeeInvoice, canSeeIrsaliye)
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
            list.push({ kind: 'invoice', label: 'Fatura', number: res.document.number, icon: Receipt, cls: DOC_BADGE_CLS.invoice })
          } else if (type === 'irsaliye') {
            irsId = res.document.id
            list.push({ kind: 'irsaliye', label: 'İrsaliye', number: res.document.number, icon: Truck, cls: DOC_BADGE_CLS.irsaliye })
          } else {
            packInvId = res.document.id
            list.push({ kind: 'packing', label: 'Çeki Listesi', number: res.document.packingListNo || res.document.number, icon: ClipboardList, cls: DOC_BADGE_CLS.packing })
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
                <InvoiceDocPage invoice={invoice} tpl={tpl} />
              </div>
            )}

            {/* ===== SAYFA 2: İRSALİYE ===== */}
            {irs && (
              <div className={cn('a4-wrap', packingInvoiceId && invoice ? 'border-b-8 border-dashed border-muted mb-6 pb-6' : '', 'print:border-0 print:mb-0 print:pb-0 print:break-after-page')}>
                <IrsaliyeDocPage irs={irs} tpl={tpl} />
              </div>
            )}

            {/* ===== SAYFA 3: ÇEKİ LİSTESİ ===== */}
            {packingInvoiceId && invoice && (
              <div className="a4-wrap print:break-after-page">
                <PackingDocPage invoice={invoice} orderNumber={order.number} tpl={tpl} />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
