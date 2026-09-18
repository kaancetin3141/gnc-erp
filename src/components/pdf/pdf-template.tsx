// ============================================================
// PDF Şablon Hook — InvoiceTemplate'i tüm PDF'lere uygular
// Tüm PDF render'ları bu hook + PdfHeader + PdfFooter kullanır
// ============================================================

'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { cn } from '@/lib/utils'

export interface InvoiceTemplate {
  id: string
  logoUrl: string | null
  logoPosition: string
  primaryColor: string
  accentColor: string
  textColor: string
  fontFamily: string
  fontSize: number
  headerText: string | null
  footerText: string | null
  companyName: string | null
  companyAddress: string | null
  companyPhone: string | null
  companyEmail: string | null
  companyWeb: string | null
  taxNumber: string | null
  taxOffice: string | null
  showBankInfo: boolean
  bankInfo: { bankName: string; iban: string; accountHolder: string }[] | null
  showSignature: boolean
  signatureText: string | null
  pageSize: string
  marginMm: number
  notes: string | null
}

export function useInvoiceTemplate() {
  return useQuery({
    queryKey: ['invoice-template'],
    queryFn: () => apiGet<InvoiceTemplate>('/api/settings/invoice-template'),
    staleTime: 5 * 60 * 1000,
  })
}

// Şablon yüklü değilken / hiç yokken kullanılan varsayılan şablon
export const DEFAULT_TPL: InvoiceTemplate = {
  id: 'default',
  logoUrl: null,
  logoPosition: 'top-left',
  primaryColor: '#10b981',
  accentColor: '#0d9488',
  textColor: '#000000',
  fontFamily: 'Arial, sans-serif',
  fontSize: 12,
  headerText: null,
  footerText: null,
  companyName: null,
  companyAddress: null,
  companyPhone: null,
  companyEmail: null,
  companyWeb: null,
  taxNumber: null,
  taxOffice: null,
  showBankInfo: false,
  bankInfo: null,
  showSignature: false,
  signatureText: null,
  pageSize: 'A4',
  marginMm: 15,
  notes: null,
}

// tpl her zaman tanımlı döner — PDF bileşenleri null-safe çalışır
export function resolveTpl(tpl?: InvoiceTemplate | null): InvoiceTemplate {
  return tpl ?? DEFAULT_TPL
}

export function getPdfStyle(tpl: InvoiceTemplate): React.CSSProperties {
  return {
    padding: `${tpl.marginMm}mm`,
    fontFamily: tpl.fontFamily,
    fontSize: tpl.fontSize,
    color: tpl.textColor,
    background: 'white',
  }
}

export function PdfHeader({ tpl: tplInput, title, docNumber, date }: {
  tpl?: InvoiceTemplate | null
  title: string
  docNumber: string
  date: string
}) {
  const tpl = resolveTpl(tplInput)
  const showLogoLeft = tpl.logoUrl && tpl.logoPosition === 'top-left'
  const showLogoRight = tpl.logoUrl && tpl.logoPosition === 'top-right'
  const showLogoCenter = tpl.logoUrl && tpl.logoPosition === 'top-center'

  // Ortalanmış logo varyantı
  if (showLogoCenter) {
    return (
      <div className="mb-6 pb-4 border-b-2 text-center" style={{ borderColor: tpl.primaryColor }}>
        <img src={tpl.logoUrl!} alt="Logo" className="h-16 object-contain mx-auto mb-2" />
        <div style={{ color: tpl.primaryColor }} className="font-bold text-xl">
          {tpl.companyName || 'Şirket Adı'}
        </div>
        {tpl.headerText && (
          <div className="text-xs text-gray-500 mt-1">{tpl.headerText}</div>
        )}
        <div className="mt-3 flex items-baseline justify-center gap-4">
          <div style={{ color: tpl.accentColor }} className="text-2xl font-bold">{title}</div>
          <div className="text-sm font-mono text-gray-700">{docNumber}</div>
          <div className="text-xs text-gray-500">Tarih: {date}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start justify-between mb-6 pb-4 border-b-2" style={{ borderColor: tpl.primaryColor }}>
      <div className="min-w-0">
        {showLogoLeft && (
          <img src={tpl.logoUrl!} alt="Logo" className="h-14 object-contain mb-2" />
        )}
        <div style={{ color: tpl.primaryColor }} className="font-bold text-xl">
          {tpl.companyName || 'Şirket Adı'}
        </div>
        {tpl.headerText && (
          <div className="text-xs text-gray-500 mt-1">{tpl.headerText}</div>
        )}
      </div>
      <div className="text-right shrink-0">
        {showLogoRight && (
          <img src={tpl.logoUrl!} alt="Logo" className="h-14 object-contain mb-2 ml-auto" />
        )}
        <div style={{ color: tpl.accentColor }} className="text-2xl font-bold">{title}</div>
        <div className="text-sm font-mono mt-1 text-gray-700">{docNumber}</div>
        <div className="text-xs text-gray-500 mt-1">Tarih: {date}</div>
      </div>
    </div>
  )
}

export function PdfFooter({ tpl: tplInput }: { tpl?: InvoiceTemplate | null }) {
  const tpl = resolveTpl(tplInput)
  return (
    <div className="mt-8 pt-4 border-t" style={{ borderColor: tpl.accentColor }}>
      {tpl.footerText && (
        <p className="text-xs text-gray-600 text-center mb-3">{tpl.footerText}</p>
      )}
      <div className="text-[10px] text-gray-500 grid grid-cols-2 gap-2">
        <div>
          {tpl.companyName && <div className="font-semibold">{tpl.companyName}</div>}
          {tpl.companyAddress && <div>{tpl.companyAddress}</div>}
          {tpl.companyPhone && <div>Tel: {tpl.companyPhone}</div>}
        </div>
        <div className="text-right">
          {tpl.companyEmail && <div>{tpl.companyEmail}</div>}
          {tpl.companyWeb && <div>{tpl.companyWeb}</div>}
          {tpl.taxOffice && tpl.taxNumber && (
            <div>{tpl.taxOffice} VKN: {tpl.taxNumber}</div>
          )}
        </div>
      </div>
      {tpl.showBankInfo && (tpl.bankInfo ?? []).length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-200 text-[10px]">
          <div className="font-semibold mb-1">Banka Bilgileri:</div>
          {(tpl.bankInfo ?? []).map((b, i) => (
            <div key={i} className="flex justify-between">
              <span>{b.bankName || 'Banka'} — {b.accountHolder || ''}</span>
              <span className="font-mono">{b.iban || 'IBAN'}</span>
            </div>
          ))}
        </div>
      )}
      {tpl.showSignature && (
        <div className="mt-4 text-right text-[10px]">
          <div className="border-t border-gray-400 inline-block pt-1 px-8">
            {tpl.signatureText || 'Yetkili İmza'}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// TemplateA4Page — InvoiceTemplate ayarlarını (margin, font,
// font size, text color) her PDF sayfasına uygular.
// Tüm PDF önizlemeleri içeriklerini bunun içine koymalı.
// ============================================================
export function TemplateA4Page({ tpl, children, className }: {
  tpl: InvoiceTemplate | undefined
  children: React.ReactNode
  className?: string
}) {
  if (!tpl) {
    // Şablon yüklenene kadar varsayılan A4
    return <div className={cn('a4-page print-content', className)}>{children}</div>
  }
  return (
    <div
      className={cn('a4-page print-content', className)}
      style={{
        padding: `${tpl.marginMm || 15}mm`,
        fontFamily: tpl.fontFamily || 'Arial, sans-serif',
        fontSize: `${tpl.fontSize || 12}px`,
        color: tpl.textColor || '#000000',
      }}
    >
      {children}
    </div>
  )
}

// useInvoiceTemplate yükleme durumu için yardımcı
export function useTemplateOrDefault() {
  const { data: tpl, isLoading } = useInvoiceTemplate()
  return { tpl, isLoading }
}

