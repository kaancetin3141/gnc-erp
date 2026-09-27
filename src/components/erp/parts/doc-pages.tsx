'use client'

// ============================================================
// Ortak A4 Belge Sayfaları — birleşik sipariş + şirket toplu
// yazdırma diyalogları tarafından paylaşılır.
// Her bileşen TemplateA4Page içinde tam bir A4 belge sayfası
// render eder; dış sarmalayıcı print:break-after-page ekler.
// ============================================================

import { TemplateA4Page, PdfHeader, PdfFooter, DocVerifyQr, type InvoiceTemplate } from '@/components/pdf/pdf-template'
import { formatCurrency, formatDate } from '@/lib/format'
import { formatWeight, calculateTotalWeight } from '@/lib/weight-utils'
import { cn } from '@/lib/utils'
import type { Invoice } from './types'
import type { IrsaliyePdfData } from './irsaliye-types'
import { getIrsaliyeStatusMeta, formatKg } from './irsaliye-utils'
import type { ExportDocPdfData } from './export-doc-types'
import { EXPORT_DOC_TYPES, TRANSPORT_MODES, INCOTERMS } from './export-doc-types'

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
      <PdfFooter
        tpl={tpl}
        qr={
          <DocVerifyQr
            data={{
              docType: 'FATURA',
              docNumber: invoice.number,
              companyName: tpl?.companyName,
              partyName: invoice.customer?.name,
              amount: formatCurrency(invoice.total, invoice.currency),
              date: formatDate(invoice.issueDate),
            }}
          />
        }
      />
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
      <PdfFooter
        tpl={tpl}
        qr={
          <DocVerifyQr
            data={{
              docType: 'İRSALİYE',
              docNumber: irs.number,
              companyName: irs.tenantName,
              partyName: irs.customer?.name,
              amount: `Brüt ${formatKg(irs.weights.totalGrossWeight)}`,
              date: formatDate(irs.date),
            }}
          />
        }
      />
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
  )
}

// ----- İHRACAT BELGESİ SAYFASI (ATR / EUR.1 / Menşe / Beyanname / Konşimento / Sigorta) -----
export function ExportDocDocPage({ doc, tpl: tplInput }: { doc: ExportDocPdfData; tpl?: InvoiceTemplate | null }) {
  const tpl = tplInput ?? undefined
  const meta = EXPORT_DOC_TYPES[doc.type]
  const title = meta?.label?.toUpperCase() ?? 'İHRACAT BELGESİ'
  const hasPrices = doc.goods.some((g) => g.unitPrice > 0)
  const totalQty = doc.goods.reduce((s, g) => s + g.qty, 0)
  const totalValue = doc.goods.reduce((s, g) => s + g.lineTotal, 0)
  const totalWeight = doc.goods.reduce((s, g) => s + (g.totalWeight ?? 0), 0)
  const transportLabel = TRANSPORT_MODES.find((t) => t.key === doc.transportMode)?.label ?? doc.transportMode
  const incotermLabel = doc.incoterms
    ? (INCOTERMS.find((i) => i.key === doc.incoterms)?.label ?? doc.incoterms)
    : null

  // Belgeye özel ek bloklar
  const renderTypeSpecific = () => {
    switch (doc.type) {
      case 'konsimento':
        return (
          <div className="mb-6 grid grid-cols-2 gap-4 text-sm border border-gray-200 rounded-md p-4">
            <div className="space-y-1.5">
              <InfoRow label="Gemi Adı" value={doc.vesselName} />
              <InfoRow label="Konteyner No" value={doc.containerNo} />
              <InfoRow label="Taşıyıcı" value={doc.carrierName} />
            </div>
            <div className="space-y-1.5">
              <InfoRow label="Yükleme Limanı" value={doc.portOfLoading} />
              <InfoRow label="Boşaltma Limanı" value={doc.portOfDischarge} />
            </div>
          </div>
        )
      case 'sigorta':
        return (
          <div className="mb-6 text-sm border rounded-md p-4 bg-emerald-50/50 border-emerald-200">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <InfoRow label="Sigorta Şirketi" value={doc.insuranceCompany} />
                <InfoRow label="Poliçe Tutarı" value={doc.policyAmount != null ? formatCurrency(doc.policyAmount, doc.policyCurrency || doc.currency) : null} />
              </div>
              <div className="space-y-1.5">
                <InfoRow label="Teminat Kapsamı" value={incotermLabel ? `Incoterms ${doc.incoterms}` : null} />
                <InfoRow label="Taşıma Şekli" value={transportLabel} />
              </div>
            </div>
          </div>
        )
      case 'gumruk':
        return (
          <div className="mb-6 grid grid-cols-2 gap-4 text-sm border border-violet-200 rounded-md p-4">
            <div className="space-y-1.5">
              <InfoRow label="Taşıma Şekli" value={transportLabel} />
              <InfoRow label="Araç Plakası" value={doc.vehiclePlate} />
            </div>
            <div className="space-y-1.5">
              <InfoRow label="Çıkış Gümrüğü" value={doc.portOfLoading} />
              <InfoRow label="Varış Gümrüğü" value={doc.portOfDischarge} />
            </div>
          </div>
        )
      default:
        return (
          <div className="mb-6 grid grid-cols-2 gap-4 text-sm border border-gray-200 rounded-md p-4">
            <div className="space-y-1.5">
              <InfoRow label="Taşıma Şekli" value={transportLabel} />
              {doc.type !== 'mense' && <InfoRow label="Araç Plakası" value={doc.vehiclePlate} />}
            </div>
            <div className="space-y-1.5">
              <InfoRow label="Hedef Ülke" value={doc.destinationCountry} />
              {doc.type !== 'mense' && <InfoRow label="Varış Yeri" value={doc.portOfDischarge} />}
            </div>
          </div>
        )
    }
  }

  return (
    <TemplateA4Page tpl={tpl}>
      <PdfHeader
        tpl={tpl}
        title={title}
        docNumber={doc.number}
        date={formatDate(doc.issueDate)}
      />
      {/* Belge açıklaması */}
      <p className="text-xs text-gray-500 mb-4">{meta?.description}</p>

      {/* Taraflar */}
      <div className="mb-5 grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">İhracatçı (Satıcı)</div>
          <div className="text-sm font-semibold">{tpl?.companyName ?? '—'}</div>
          {tpl?.companyAddress && <div className="text-xs text-gray-600 mt-0.5">{tpl.companyAddress}</div>}
          {tpl?.taxNumber && <div className="text-xs text-gray-600">VKN: {tpl.taxNumber}</div>}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">İthalatçı (Alıcı)</div>
          <div className="text-sm font-semibold">{doc.customer.name}</div>
          {doc.customer.address && <div className="text-xs text-gray-600 mt-0.5">{doc.customer.address}</div>}
          <div className="text-xs text-gray-600">
            Ülke: {doc.customer.country || doc.destinationCountry || '—'}
            {doc.customer.taxNumber ? ` · VKN: ${doc.customer.taxNumber}` : ''}
          </div>
        </div>
      </div>

      {/* Ticari bilgiler satırı */}
      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-1 text-xs bg-gray-50 rounded-md px-3 py-2.5 border border-gray-200">
        <span>Sipariş: <span className="font-mono font-semibold">{doc.order.number}</span></span>
        {doc.order.quote?.number && <span>Teklif: <span className="font-mono">{doc.order.quote.number}</span></span>}
        {doc.incoterms && <span>Incoterms: <span className="font-semibold">{doc.incoterms}</span></span>}
        {transportLabel && <span>Taşıma: <span className="font-semibold">{transportLabel}</span></span>}
        {doc.destinationCountry && <span>Hedef: <span className="font-semibold">{doc.destinationCountry}</span></span>}
      </div>

      {renderTypeSpecific()}

      {/* Mal kalemleri */}
      <table className="w-full text-sm mb-6 border border-gray-200">
        <thead>
          <tr className="bg-gray-50 border-b-2 border-gray-300">
            <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-10">#</th>
            <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600">Malın Tanımı</th>
            <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-20">Miktar</th>
            {hasPrices && (
              <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-28">Değer ({doc.currency})</th>
            )}
            {totalWeight > 0 && (
              <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-gray-600 w-24">Ağırlık</th>
            )}
          </tr>
        </thead>
        <tbody>
          {doc.goods.length > 0 ? doc.goods.map((g, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-2 px-3 text-gray-500 tabular-nums">{i + 1}</td>
              <td className="py-2 px-3 font-medium">{g.description}</td>
              <td className="text-right py-2 px-3 tabular-nums">{g.qty}</td>
              {hasPrices && (
                <td className="text-right py-2 px-3 tabular-nums font-medium">{formatCurrency(g.lineTotal, doc.currency)}</td>
              )}
              {totalWeight > 0 && (
                <td className="text-right py-2 px-3 tabular-nums">{g.totalWeight != null ? formatKg(g.totalWeight) : '—'}</td>
              )}
            </tr>
          )) : (
            <tr>
              <td colSpan={hasPrices ? 5 : 4} className="py-4 text-center text-gray-400 text-xs">Kalem bulunamadı</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Özet */}
      <div className="flex justify-end mb-8">
        <div className="w-full max-w-xs space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Toplam Miktar:</span>
            <span className="tabular-nums font-medium">{totalQty}</span>
          </div>
          {totalWeight > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Toplam Ağırlık:</span>
              <span className="tabular-nums font-medium">{formatKg(totalWeight)}</span>
            </div>
          )}
          {hasPrices && (
            <div className="flex justify-between text-base font-bold pt-2 border-t-2 border-gray-300">
              <span>Toplam Değer:</span>
              <span className="tabular-nums" style={{ color: tpl?.primaryColor || '#047857' }}>
                {formatCurrency(totalValue, doc.currency)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Notlar + imza */}
      <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-200">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Notlar</div>
          <div className="text-xs text-gray-700 whitespace-pre-line">{doc.notes || '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">İmza &amp; Kaşe</div>
          <div className="mt-6 ml-auto w-40 h-14 border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">
            {tpl?.companyName ?? ''}
          </div>
        </div>
      </div>
      <PdfFooter
        tpl={tpl}
        qr={
          <DocVerifyQr
            data={{
              docType: title,
              docNumber: doc.number,
              companyName: tpl?.companyName,
              partyName: doc.customer.name,
              amount: hasPrices ? formatCurrency(totalValue, doc.currency) : totalWeight > 0 ? `Brüt ${formatKg(totalWeight)}` : null,
              date: formatDate(doc.issueDate),
            }}
          />
        }
      />
    </TemplateA4Page>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 min-w-[110px]">{label}</span>
      <span className="font-medium text-sm">{value || '—'}</span>
    </div>
  )
}
