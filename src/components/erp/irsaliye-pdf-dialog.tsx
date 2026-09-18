'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Printer, Truck } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  useInvoiceTemplate, TemplateA4Page, PdfHeader, PdfFooter,
} from '@/components/pdf/pdf-template'
import type { IrsaliyePdfData } from './parts/irsaliye-types'
import {
  getIrsaliyeStatusMeta, getCarrierLabel, getCarrierTrackingUrl, getPalletTypeLabel, formatKg,
} from './parts/irsaliye-utils'

interface Props {
  irsaliyeId: string | null
  irsaliyeNumber: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

// ============================================================
// İrsaliye PDF Dialog
// A4 formatında, fiyat YOK, ağırlık özetleri var.
// .a4-page sınıfı kullanır (globals.css).
// window.print() ile PDF olarak kaydedilebilir.
// ============================================================

export function IrsaliyePdfDialog({ irsaliyeId, irsaliyeNumber, open, onOpenChange }: Props) {
  // Şablon — Ayarlar > Fatura Şablonu (logo, renk, font, footer)
  const { data: tpl } = useInvoiceTemplate()

  const { data: irs, isLoading } = useQuery({
    queryKey: ['irsaliye-pdf', irsaliyeId],
    queryFn: () => apiGet<IrsaliyePdfData>(`/api/irsaliye/${irsaliyeId}/pdf`),
    enabled: !!irsaliyeId && open,
  })

  if (!irsaliyeId) return null

  const statusMeta = irs ? getIrsaliyeStatusMeta(irs.status) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto custom-scroll print:max-w-none print:max-h-none print:p-0 print:shadow-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-violet-600" />
                İrsaliye Önizleme
              </DialogTitle>
              <DialogDescription className="mt-1">
                Fiyat bilgisi içermez. &quot;Yazdır&quot; butonu ile PDF olarak kaydedebilirsiniz.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" /> Yazdır / PDF
            </Button>
          </div>
        </DialogHeader>

        {isLoading || !irs ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[70vh] print:overflow-visible print:max-h-none">
            <TemplateA4Page tpl={tpl}>
              {/* Şablon başlık — logo + şirket + İRSALİYE */}
              <PdfHeader tpl={tpl} title="İRSALİYE" docNumber={irs.number} date={formatDate(irs.date)} />

              {/* Durum rozeti (şablon başlığın altında) */}
              {statusMeta && (
                <div className="mb-4">
                  <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border font-semibold', statusMeta.color)}>
                    {statusMeta.label}
                  </span>
                </div>
              )}

              {/* Customer + Shipping info */}
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Müşteri</div>
                  {irs.customer ? (
                    <>
                      <div className="text-base font-semibold">{irs.customer.name}</div>
                      {irs.customer.address && <div className="text-xs text-gray-600 mt-0.5">{irs.customer.address}</div>}
                      {irs.customer.city && <div className="text-xs text-gray-600">{irs.customer.city}</div>}
                      {irs.customer.phone && <div className="text-xs text-gray-600 mt-0.5">Tel: {irs.customer.phone}</div>}
                      {irs.customer.email && <div className="text-xs text-gray-600">E-posta: {irs.customer.email}</div>}
                      {irs.customer.taxNumber && <div className="text-xs text-gray-600">VKN: {irs.customer.taxNumber}</div>}
                    </>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Sevkiyat Bilgileri</div>
                  {irs.shipping.carrier && (
                    <div className="text-sm text-gray-700">
                      Kargo: <span className="font-medium">{getCarrierLabel(irs.shipping.carrier)}</span>
                    </div>
                  )}
                  {irs.shipping.trackingNo && (
                    <div className="text-xs text-gray-600 mt-0.5">
                      Takip No: <span className="font-mono">{irs.shipping.trackingNo}</span>
                      {getCarrierTrackingUrl(irs.shipping.carrier, irs.shipping.trackingNo) && (
                        <>
                          {' · '}
                          <a
                            href={getCarrierTrackingUrl(irs.shipping.carrier, irs.shipping.trackingNo)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            Online Takip
                          </a>
                        </>
                      )}
                    </div>
                  )}
                  {irs.shipping.shippingAddress && (
                    <div className="text-xs text-gray-600 mt-1 text-left max-w-[200px] ml-auto">
                      Teslimat Adresi: {irs.shipping.shippingAddress}
                    </div>
                  )}
                  {irs.order && (
                    <div className="text-xs text-gray-600 mt-1">
                      Sipariş No: <span className="font-mono">{irs.order.number}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Lines table */}
              {irs.lines.length > 0 ? (
                <table className="w-full text-sm mb-6 border border-gray-200">
                  <thead>
                    <tr className="bg-gray-50 border-b-2 border-gray-300">
                      <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-10">#</th>
                      <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600">Açıklama / Ürün</th>
                      <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-20">Miktar</th>
                      <th className="text-center py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-16">Birim</th>
                      <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-24">Birim Ağr.</th>
                      <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-28">Toplam Ağr.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {irs.lines.map((line, i) => (
                      <tr key={line.id} className="border-b border-gray-100">
                        <td className="py-2 px-3 text-gray-500 tabular-nums">{i + 1}</td>
                        <td className="py-2 px-3">
                          <div className="font-medium">{line.description}</div>
                          {line.product && (
                            <div className="text-[10px] text-gray-500">
                              {line.product.name}
                              {line.product.sku ? ` · ${line.product.sku}` : ''}
                            </div>
                          )}
                          {line.notes && (
                            <div className="text-[10px] text-gray-400">{line.notes}</div>
                          )}
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">{line.qty}</td>
                        <td className="text-center py-2 px-3 text-gray-600 text-xs">{line.unit}</td>
                        <td className="text-right py-2 px-3 tabular-nums text-gray-600">
                          {line.weightPerUnit ? formatKg(line.weightPerUnit) : '—'}
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums font-medium">
                          {line.totalWeight ? formatKg(line.totalWeight) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="mb-6 p-4 bg-gray-50 rounded text-sm text-gray-500 text-center border border-gray-200">
                  Bu irsaliyede kalem bulunmuyor.
                </div>
              )}

              {/* Weights summary */}
              <div className="flex justify-end mb-8">
                <div className="w-full max-w-sm">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 pb-1 border-b border-gray-200">
                    Ağırlık Özeti
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Net Ağırlık:</span>
                      <span className="tabular-nums font-medium">{formatKg(irs.weights.totalNetWeight)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Ambalaj Ağırlığı:</span>
                      <span className="tabular-nums">{formatKg(irs.weights.totalPackagingWeight)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Palet Ağırlığı:</span>
                      <span className="tabular-nums">{formatKg(irs.weights.palletWeight)}</span>
                    </div>
                    {irs.weights.palletCount && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Palet Sayısı / Tipi:</span>
                        <span>
                          {irs.weights.palletCount} × {getPalletTypeLabel(irs.weights.palletType)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold pt-2 mt-1 border-t-2 border-gray-300">
                      <span>Brüt Toplam:</span>
                      <span className="tabular-nums text-violet-700">{formatKg(irs.weights.totalGrossWeight)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes + signature area */}
              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-200">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Notlar</div>
                  <div className="text-xs text-gray-700">
                    {irs.notes || '—'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">İmza &amp; Kaşe</div>
                  <div className="mt-6 ml-auto w-40 h-14 border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">
                    {irs.tenantName}
                  </div>
                </div>
              </div>

              {/* Footer — şablon: footer text + şirket bilgileri + banka + imza */}
              <PdfFooter tpl={tpl} />
            </TemplateA4Page>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
