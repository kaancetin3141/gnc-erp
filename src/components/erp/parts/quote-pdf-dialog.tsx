'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Printer, FileText } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatWeight, calculateTotalWeight } from '@/lib/weight-utils'
import {
  useInvoiceTemplate, TemplateA4Page, PdfHeader, PdfFooter, DocVerifyQr,
} from '@/components/pdf/pdf-template'
import type { Quote } from './types'
import { getProformaStatusMeta } from './proforma-utils'

// ============================================================
// QuotePdfDialog — TEKLİF + PROFORMA ortak PDF önizleme
// · Proforma ve teklif için tek birleşik doküman üreticidir.
// · InvoiceTemplate (Ayarlar > Fatura Şablonu) uygulanır:
//   logo, renkler, font, alt bilgi, banka, imza.
// · isProforma=true → "PROFORMA FATURA", false → "TEKLİF"
// ============================================================

interface Props {
  quoteId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function QuotePdfDialog({ quoteId, open, onOpenChange }: Props) {
  const { data: tpl } = useInvoiceTemplate()

  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote-pdf', quoteId],
    queryFn: () => apiGet<Quote>(`/api/quotes/${quoteId}`),
    enabled: !!quoteId && open,
  })

  const isProforma = !!quote?.isProforma
  const docTitle = isProforma ? 'PROFORMA FATURA' : 'TEKLİF'
  const lines = quote?.lines ?? []
  const statusMeta = quote ? getProformaStatusMeta(quote.status) : null

  // Ağırlık hesabı
  const hasWeight = lines.some((l) => l.totalWeight != null && l.totalWeight > 0)
  const totalNetWeight = hasWeight
    ? calculateTotalWeight(lines.map((l) => ({ qty: l.qty, weightPerUnit: l.weightPerUnit ?? null })))
    : null

  const accent = tpl?.accentColor || (isProforma ? '#0f766e' : '#047857')

  const totalText = useMemo(() => {
    if (!quote) return ''
    const symbol = quote.currency === 'TRY' ? '₺' : quote.currency === 'USD' ? '$' : quote.currency === 'EUR' ? '€' : quote.currency
    const num = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(quote.total)
    return `${num} ${symbol}`
  }, [quote])

  if (!quoteId) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto custom-scroll print:max-w-none print:max-h-none print:p-0 print:shadow-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                {isProforma ? 'Proforma Önizleme' : 'Teklif Önizleme'}
              </DialogTitle>
              <DialogDescription className="mt-1">
                Şirket şablonu uygulandı. &quot;Yazdır&quot; butonu ile PDF olarak kaydedebilirsiniz.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" /> Yazdır / PDF
            </Button>
          </div>
        </DialogHeader>

        {isLoading || !quote ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[70vh] print:overflow-visible print:max-h-none">
            <TemplateA4Page tpl={tpl}>
              {/* Şablon başlık: logo + şirket + doküman başlığı */}
              <PdfHeader tpl={tpl} title={docTitle} docNumber={quote.number} date={formatDate(quote.issueDate)} />

              {/* Customer info */}
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Sayın</div>
                  <div className="text-base font-semibold">{quote.customer?.name ?? '—'}</div>
                  {quote.customer?.address && (
                    <div className="text-xs text-gray-600 mt-0.5">{quote.customer.address}</div>
                  )}
                  {quote.customer?.city && (
                    <div className="text-xs text-gray-600">{quote.customer.city}</div>
                  )}
                  {quote.customer?.phone && (
                    <div className="text-xs text-gray-600 mt-0.5">Tel: {quote.customer.phone}</div>
                  )}
                  {quote.customer?.email && (
                    <div className="text-xs text-gray-600">E-posta: {quote.customer.email}</div>
                  )}
                  {quote.customer?.taxNumber && (
                    <div className="text-xs text-gray-600">VKN: {quote.customer.taxNumber}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Durum</div>
                  {statusMeta && (
                    <Badge variant="outline" className={cn('text-xs', statusMeta.color)}>
                      {statusMeta.label}
                    </Badge>
                  )}
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-3 mb-1">Para Birimi</div>
                  <div className="text-sm font-medium">{quote.currency}</div>
                  {quote.validUntil && (
                    <>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-3 mb-1">Geçerlilik</div>
                      <div className="text-sm font-medium">{formatDate(quote.validUntil)}</div>
                    </>
                  )}
                </div>
              </div>

              {/* Line items table */}
              {lines.length > 0 ? (
                <table className="w-full text-sm mb-6 border border-gray-200">
                  <thead>
                    <tr style={{ backgroundColor: `${tpl?.accentColor || '#f9fafb'}14` }} className="border-b-2 border-gray-300">
                      <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600">#</th>
                      <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600">Kalem</th>
                      <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-20">Miktar</th>
                      <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-28">Birim Fiyat</th>
                      <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-14">KDV</th>
                      {hasWeight && (
                        <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-24">Ağırlık</th>
                      )}
                      <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-28">Tutar</th>
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
                          {line.color && (
                            <div className="text-[10px] text-gray-600">Renk: {line.color}</div>
                          )}
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">{line.qty}</td>
                        <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(line.unitPrice, quote.currency)}</td>
                        <td className="text-right py-2 px-3 tabular-nums text-gray-600">%{line.taxRate}</td>
                        {hasWeight && (
                          <td className="text-right py-2 px-3 tabular-nums text-gray-700">
                            {line.totalWeight != null && line.totalWeight > 0
                              ? formatWeight(line.totalWeight, line.weightUnit || 'kg')
                              : '—'}
                          </td>
                        )}
                        <td className="text-right py-2 px-3 tabular-nums font-medium">{formatCurrency(line.lineTotal, quote.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="mb-6 p-4 bg-gray-50 rounded text-sm text-gray-500 text-center border border-gray-200">
                  Bu belge için kalem bilgisi bulunamadı.
                </div>
              )}

              {/* Totals */}
              <div className="flex justify-end mb-8">
                <div className="w-full max-w-xs space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Ara Toplam:</span>
                    <span className="tabular-nums">{formatCurrency(quote.subtotal, quote.currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">KDV:</span>
                    <span className="tabular-nums">{formatCurrency(quote.taxTotal, quote.currency)}</span>
                  </div>
                  {totalNetWeight != null && (
                    <div className="flex justify-between text-sm border-t border-gray-200 pt-1.5">
                      <span className="text-gray-600">Toplam Net Ağırlık:</span>
                      <span className="tabular-nums font-medium">{formatWeight(totalNetWeight, 'kg')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold pt-2 border-t-2 border-gray-300">
                    <span>Genel Toplam:</span>
                    <span className="tabular-nums" style={{ color: accent }}>{totalText}</span>
                  </div>
                </div>
              </div>

              {/* Validity note */}
              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-200">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Geçerlilik</div>
                  <div className="text-xs text-gray-700">
                    {quote.validUntil
                      ? `Bu ${isProforma ? 'proforma' : 'teklif'} ${formatDate(quote.validUntil)} tarihine kadar geçerlidir.`
                      : `Bu ${isProforma ? 'proforma' : 'teklif'} 30 gün geçerlidir.`}
                  </div>
                  <div className="text-xs text-gray-600 mt-2">
                    Fiyatlar KDV dahil değildir; ayrı belirtilmedikçe nakliye hariçtir.
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">İmza &amp; Kaşe</div>
                  <div className="mt-6 ml-auto w-40 h-14 border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">
                    {tpl?.companyName || quote.customer?.name || '—'}
                  </div>
                </div>
              </div>

              {/* Şablon alt bilgi: footer text + şirket bilgileri + banka + imza */}
              <PdfFooter
                tpl={tpl}
                qr={
                  <DocVerifyQr
                    data={{
                      docType: docTitle,
                      docNumber: quote.number,
                      companyName: tpl?.companyName,
                      partyName: quote.customer?.name,
                      amount: formatCurrency(quote.total, quote.currency),
                      date: formatDate(quote.issueDate),
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
