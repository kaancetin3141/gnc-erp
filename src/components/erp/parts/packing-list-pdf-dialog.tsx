'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Printer, ClipboardList } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { formatWeight, calculateTotalWeight } from '@/lib/weight-utils'
import {
  useInvoiceTemplate, TemplateA4Page, PdfHeader, PdfFooter, DocVerifyQr,
} from '@/components/pdf/pdf-template'
import type { Invoice } from './types'

// ============================================================
// PackingListPdfDialog — ÇEKİ LİSTESİ (Packing List)
// · Fiyat YOK — yalnızca ürün, miktar, renk ve ağırlıklar
// · InvoiceTemplate (Ayarlar > Fatura Şablonu) uygulanır
// · Belge Yönetimi ve Fatura Detay sayfalarından kullanılır
// ============================================================

interface Props {
  invoiceId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function PackingListPdfDialog({ invoiceId, open, onOpenChange }: Props) {
  const { data: tpl } = useInvoiceTemplate()

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => apiGet<Invoice>(`/api/invoices/${invoiceId}`),
    enabled: !!invoiceId && open,
  })

  const lines = invoice?.lines ?? []
  const hasWeight = lines.some((l) => l.totalWeight != null && l.totalWeight > 0)
  const totalNetWeight = hasWeight
    ? calculateTotalWeight(lines.map((l) => ({ qty: l.qty, weightPerUnit: l.weightPerUnit ?? null })))
    : null
  const totalQty = lines.reduce((s, l) => s + l.qty, 0)

  if (!invoiceId) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto custom-scroll print:max-w-none print:max-h-none print:p-0 print:shadow-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-amber-600" />
                Çeki Listesi Önizleme
              </DialogTitle>
              <DialogDescription className="mt-1">
                Fiyat bilgisi içermez — ürün, miktar, renk ve ağırlık listeler.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" /> Yazdır / PDF
            </Button>
          </div>
        </DialogHeader>

        {isLoading || !invoice ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[70vh] print:overflow-visible print:max-h-none">
            <TemplateA4Page tpl={tpl}>
              <PdfHeader
                tpl={tpl}
                title="ÇEKİ LİSTESİ"
                docNumber={invoice.packingListNo || '—'}
                date={formatDate(invoice.packingListDate ?? invoice.issueDate)}
              />

              {/* Müşteri + fatura bağlantısı */}
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Alıcı</div>
                  <div className="text-base font-semibold">{invoice.customer?.name ?? '—'}</div>
                  {invoice.customer?.address && (
                    <div className="text-xs text-gray-600 mt-0.5">{invoice.customer.address}</div>
                  )}
                  {invoice.customer?.city && (
                    <div className="text-xs text-gray-600">{invoice.customer.city}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">İlgili Fatura</div>
                  <div className="text-sm font-mono">{invoice.number}</div>
                  {invoice.order && (
                    <div className="text-xs text-gray-600 mt-0.5">Sipariş: {invoice.order.number}</div>
                  )}
                </div>
              </div>

              {/* Kalemler — fiyat yok */}
              {lines.length > 0 ? (
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
                        <>
                          <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-24">Birim Ağr.</th>
                          <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-24">Toplam Ağr.</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => (
                      <tr key={line.id ?? i} className="border-b border-gray-100">
                        <td className="py-2 px-3 text-gray-500 tabular-nums">{i + 1}</td>
                        <td className="py-2 px-3">
                          <div className="font-medium">{line.description}</div>
                          {line.product && (
                            <div className="text-[10px] text-gray-500">
                              {line.product.name}
                              {line.product.sku ? ` · ${line.product.sku}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">{line.qty}</td>
                        {lines.some((l) => l.color) && (
                          <td className="py-2 px-3 text-xs text-gray-700">{line.color || '—'}</td>
                        )}
                        {hasWeight && (
                          <>
                            <td className="text-right py-2 px-3 tabular-nums text-gray-600">
                              {line.weightPerUnit != null && line.weightPerUnit > 0
                                ? formatWeight(line.weightPerUnit, line.weightUnit || 'kg')
                                : '—'}
                            </td>
                            <td className="text-right py-2 px-3 tabular-nums font-medium">
                              {line.totalWeight != null && line.totalWeight > 0
                                ? formatWeight(line.totalWeight, line.weightUnit || 'kg')
                                : '—'}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="mb-6 p-4 bg-gray-50 rounded text-sm text-gray-500 text-center border border-gray-200">
                  Bu çeki listesi için kalem bulunamadı.
                </div>
              )}

              {/* Özet — toplam kalem + ağırlık (fiyat yok) */}
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
                      <span className="tabular-nums text-amber-700">{formatWeight(totalNetWeight, 'kg')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* İmza alanları */}
              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-200">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Teslim Eden</div>
                  <div className="mt-8 w-40 h-14 border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">
                    İmza
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 text-right">Teslim Alan</div>
                  <div className="mt-8 ml-auto w-40 h-14 border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">
                    İmza
                  </div>
                </div>
              </div>

              <PdfFooter
                tpl={tpl}
                qr={
                  <DocVerifyQr
                    data={{
                      docType: 'ÇEKİ LİSTESİ',
                      docNumber: invoice.packingListNo || invoice.number,
                      companyName: tpl?.companyName,
                      partyName: invoice.customer?.name,
                      amount: totalNetWeight != null ? `Net ${formatWeight(totalNetWeight, 'kg')}` : `Kalem ${lines.length}`,
                      date: formatDate(invoice.packingListDate ?? invoice.issueDate),
                    }}
                  />
                }
              />
            </TemplateA4Page>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
