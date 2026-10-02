'use client'

// ============================================================
// CompanyDocsPrintDialog — ŞİRKET BAZLI TOPLU BELGE YAZDIRMA
// Bir şirketin TÜM siparişlerinin belgelerini (yetkiye göre
// Fatura / İrsaliye / Çeki Listesi) sırayla üretip tek
// yazdırmada birleştirir. Her belge ayrı A4 sayfasına çıkar.
// · generate-document idempotent — mevcut belgeler yeniden üretilmez
// · Sıralı üretim + canlı ilerleme ("Sipariş 2/5: SIP-… …")
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Printer, Building2, Loader2, FileCheck2, Receipt, Truck, ClipboardList, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInvoiceTemplate } from '@/components/pdf/pdf-template'
import type { Invoice } from './types'
import type { IrsaliyePdfData } from './irsaliye-types'
import { InvoiceDocPage, IrsaliyeDocPage, PackingDocPage } from './doc-pages'
import { docStepsFor } from './combined-docs-print-dialog'

export interface CompanyOrderRef {
  id: string
  number: string
}

interface Props {
  company: { name: string; orders: CompanyOrderRef[] } | null
  canSeeInvoice: boolean
  canSeeIrsaliye: boolean
  open: boolean
  onOpenChange: (v: boolean) => void
}

interface OrderDocs {
  orderId: string
  orderNumber: string
  invoice?: Invoice | null
  irs?: IrsaliyePdfData | null
  packingInvoice?: Invoice | null
  hasInvoice: boolean
  hasIrs: boolean
  hasPacking: boolean
  error?: string
}

export function CompanyDocsPrintDialog({ company, canSeeInvoice, canSeeIrsaliye, open, onOpenChange }: Props) {
  const { data: tpl } = useInvoiceTemplate()

  const [preparing, setPreparing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [docs, setDocs] = useState<OrderDocs[]>([])
  const [warnCount, setWarnCount] = useState(0)
  const [ready, setReady] = useState(false)

  const reset = useCallback(() => {
    setPreparing(false)
    setProgress('')
    setError(null)
    setDocs([])
    setWarnCount(0)
    setReady(false)
  }, [])

  // Açılışta tüm siparişlerin belgelerini sırayla üret + verilerini çek
  useEffect(() => {
    if (!open || !company) return
    let cancelled = false

    const ensure = async () => {
      reset()
      setPreparing(true)
      const steps = docStepsFor(canSeeInvoice, canSeeIrsaliye)
      const collected: OrderDocs[] = []
      let warnings = 0

      try {
        for (let i = 0; i < company.orders.length; i++) {
          if (cancelled) return
          const o = company.orders[i]
          setProgress(`Sipariş ${i + 1}/${company.orders.length}: ${o.number} belgeleri hazırlanıyor...`)

          const entry: OrderDocs = {
            orderId: o.id,
            orderNumber: o.number,
            hasInvoice: false,
            hasIrs: false,
            hasPacking: false,
          }

          let invoiceId: string | null = null
          let packingInvoiceId: string | null = null
          let irsaliyeId: string | null = null

          try {
            for (const type of steps) {
              if (cancelled) return
              const res = await apiPost<{
                type: string
                document: { id: string; number: string; packingListNo?: string | null }
              }>(`/api/orders/${o.id}/generate-document`, { type })
              if (type === 'invoice') invoiceId = res.document.id
              else if (type === 'irsaliye') irsaliyeId = res.document.id
              else packingInvoiceId = res.document.id
            }

            // Belgelerin verilerini getir (fiyat gizliliği API'de korunur)
            const detailId = invoiceId ?? packingInvoiceId
            if (invoiceId) {
              entry.invoice = await apiGet<Invoice>(`/api/invoices/${invoiceId}`)
              entry.hasInvoice = true
            }
            if (packingInvoiceId) {
              entry.packingInvoice = await apiGet<Invoice>(`/api/invoices/${packingInvoiceId}`)
              entry.hasPacking = true
            }
            if (irsaliyeId) {
              entry.irs = await apiGet<IrsaliyePdfData>(`/api/irsaliye/${irsaliyeId}/pdf`)
              entry.hasIrs = true
            }
            if (detailId) {
              // invoice + packing aynı fatura kaynağını paylaşır — çeki listesi
              // ayrı istekte geliyor; fatura yoksa packing verisi yeterli.
            }
          } catch (orderErr) {
            // Tek sipariş hatası tüm paketi bozmasın
            entry.error = orderErr instanceof Error ? orderErr.message : 'Belge hazırlanamadı'
            warnings++
          }

          collected.push(entry)
          if (!cancelled) setDocs([...collected])
        }
        if (cancelled) return
        setWarnCount(warnings)
        if (collected.every((d) => d.error)) {
          setError('Hiçbir sipariş için belge hazırlanamadı')
        } else {
          setReady(true)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Belgeler hazırlanamadı')
      } finally {
        if (!cancelled) setPreparing(false)
      }
    }
    ensure()
    return () => { cancelled = true }
  }, [open, company, canSeeInvoice, canSeeIrsaliye, reset])

  if (!company) return null

  const okDocs = docs.filter((d) => !d.error)
  const totalDocs = okDocs.reduce((s, d) => s + (d.hasInvoice ? 1 : 0) + (d.hasIrs ? 1 : 0) + (d.hasPacking ? 1 : 0), 0)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false) }}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto custom-scroll print:max-w-none print:max-h-none print:p-0 print:shadow-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-violet-600 shrink-0" />
                <span className="truncate">Tüm Belgeler — {company.name}</span>
              </DialogTitle>
              <DialogDescription className="mt-1">
                {company.orders.length} siparişin tüm belgeleri tek yazdırmada · her belge ayrı A4 sayfası
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!ready || preparing} className="shrink-0">
              <Printer className="w-4 h-4 mr-1.5" /> Yazdır / PDF
            </Button>
          </div>

          {/* Özet rozetleri */}
          {!preparing && ready && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300">
                {okDocs.length} sipariş
              </Badge>
              {okDocs.some((d) => d.hasInvoice) && (
                <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <Receipt className="w-3 h-3" /> {okDocs.filter((d) => d.hasInvoice).length} fatura
                </Badge>
              )}
              {okDocs.some((d) => d.hasIrs) && (
                <Badge variant="outline" className="text-[10px] gap-1 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300">
                  <Truck className="w-3 h-3" /> {okDocs.filter((d) => d.hasIrs).length} irsaliye
                </Badge>
              )}
              {okDocs.some((d) => d.hasPacking) && (
                <Badge variant="outline" className="text-[10px] gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300">
                  <ClipboardList className="w-3 h-3" /> {okDocs.filter((d) => d.hasPacking).length} çeki listesi
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                toplam {totalDocs} sayfa
              </Badge>
              {warnCount > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1 text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-300 dark:border-amber-800 dark:bg-amber-950/40">
                  <AlertTriangle className="w-3 h-3" /> {warnCount} siparişte hata
                </Badge>
              )}
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
            {docs.map((d, idx) => {
              const hasNext = docs.slice(idx + 1).some((x) => x.hasInvoice || x.hasIrs || x.hasPacking)
              const pageSep = hasNext ? 'border-b-8 border-dashed border-muted mb-6 pb-6 print:border-0 print:mb-0 print:pb-0' : ''
              return (
                <div key={d.orderId}>
                  {/* Sipariş ayırıcı başlığı (ekranda) */}
                  <div className="flex items-center gap-2 py-1.5 print:hidden">
                    <span className="font-mono text-[11px] font-semibold text-violet-700 dark:text-violet-300">{d.orderNumber}</span>
                    <div className="flex-1 h-px bg-border" />
                    <div className="flex items-center gap-1">
                      {d.hasInvoice && <FileCheck2 className="w-3 h-3 text-emerald-600" aria-label="Fatura hazır" />}
                      {d.hasIrs && <Truck className="w-3 h-3 text-violet-600" aria-label="İrsaliye hazır" />}
                      {d.hasPacking && <ClipboardList className="w-3 h-3 text-amber-600" aria-label="Çeki listesi hazır" />}
                      {d.error && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                          <AlertTriangle className="w-3 h-3" /> {d.error}
                        </span>
                      )}
                    </div>
                  </div>

                  {d.invoice && d.hasInvoice && (
                    <div className={cn('a4-wrap', (d.hasIrs || d.hasPacking) ? 'border-b-8 border-dashed border-muted mb-6 pb-6 print:border-0 print:mb-0 print:pb-0' : '', 'print:break-after-page')}>
                      <InvoiceDocPage invoice={d.invoice} tpl={tpl} />
                    </div>
                  )}
                  {d.irs && d.hasIrs && (
                    <div className={cn('a4-wrap', d.hasPacking ? 'border-b-8 border-dashed border-muted mb-6 pb-6 print:border-0 print:mb-0 print:pb-0' : '', 'print:break-after-page')}>
                      <IrsaliyeDocPage irs={d.irs} tpl={tpl} />
                    </div>
                  )}
                  {d.packingInvoice && d.hasPacking && (
                    <div className={cn('a4-wrap', pageSep, 'print:break-after-page')}>
                      <PackingDocPage invoice={d.packingInvoice} orderNumber={d.orderNumber} tpl={tpl} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
