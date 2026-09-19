'use client'

// ============================================================
// Ortak A4 Belge Sayfaları — birleşik sipariş + şirket toplu
// yazdırma diyalogları tarafından paylaşılır.
// Her bileşen TemplateA4Page içinde tam bir A4 belge sayfası
// render eder; dış sarmalayıcı print:break-after-page ekler.
// ============================================================

import { TemplateA4Page, PdfHeader, PdfFooter, type InvoiceTemplate } from '@/components/pdf/pdf-template'
import { formatCurrency, formatDate } from '@/lib/format'
import { formatWeight, calculateTotalWeight } from '@/lib/weight-utils'
import { cn } from '@/lib/utils'
import type { Invoice } from './types'
import type { IrsaliyePdfData } from './irsaliye-types'
import { getIrsaliyeStatusMeta, formatKg } from './irsaliye-utils'

// ----- FATURA SAYFASI -----
export function InvoiceDocPage({ invoice, tpl: tplInput }: { invoice: Invoice; tpl?: InvoiceTemplate | null }) {
  const tpl = tplInput ?? undefined
  return (
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
  )
}

// ----- İRSALİYE SAYFASI -----
export function IrsaliyeDocPage({ irs, tpl: tplInput }: { irs: IrsaliyePdfData; tpl?: InvoiceTemplate | null }) {
  const tpl = tplInput ?? undefined
  const sm = getIrsaliyeStatusMeta(irs.status)
  return (
    <TemplateA4Page tpl={tpl}>
      <PdfHeader tpl={tpl} title="İRSALİYE" docNumber={irs.number} date={formatDate(irs.date)} />
      {sm && (
        <div className="mb-4">
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border font-semibold', sm.color)}>{sm.label}</span>
        </div>
      )}
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
  )
}

// ----- ÇEKİ LİSTESİ SAYFASI (fiyatsız) -----
export function PackingDocPage({
  invoice,
  orderNumber,
  tpl: tplInput,
}: {
  invoice: Invoice
  orderNumber: string
  tpl?: InvoiceTemplate | null
}) {
  const tpl = tplInput ?? undefined
  const lines = invoice.lines ?? []
  const hasWeight = lines.some((l) => l.totalWeight != null && l.totalWeight > 0)
  const totalNetWeight = hasWeight
    ? calculateTotalWeight(lines.map((l) => ({ qty: l.qty, weightPerUnit: l.weightPerUnit ?? null })))
    : null
  const totalQty = lines.reduce((s, l) => s + l.qty, 0)
  return (
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
          <div className="text-sm font-mono">{orderNumber}</div>
          <div className="text-xs text-gray-600 mt-0.5">Fatura: {invoice.number}</div>
        </div>
      </div>
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
  )
}
