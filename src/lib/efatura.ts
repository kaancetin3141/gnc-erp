// ============================================================
// GNC CRM — e-Arşiv Fatura (GİB UBL-TR 1.2) XML üreteci
// Fatura kaydından GİB e-Fatura portalına yüklenebilecek
// UBL 1.2 (CustomizationID TR1.2, ProfileID EARSIVFATURA) XML'i üretir.
// Kimlik bilgisi gerektirmez — XML dosyası kullanıcı tarafından
// GİB e-Arşiv portalına veya entegratörüne yüklenebilir.
// ============================================================

import { createHash } from 'crypto'

// ── Yardımcılar ──────────────────────────────────────────────

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Para miktarı — GİB zorunlu 2 ondalık, nokta ayraç */
function money(n: number): string {
  return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)
}

/**
 * ETTN — faturaya deterministik UUID türetir (aynı fatura → aynı ETTN).
 * GİB'in tekrar yüklemelerde aynı faturayı tanıyabilmesi için tutarlılık sağlar.
 */
export function deriveEttn(invoiceId: string): string {
  const h = createHash('md5').update(`gnc-efatura:${invoiceId}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/**
 * GİB numaralandırma: 3 harf seri + 4 hane yıl + 9 hane sıra (16 karakter).
 * FAT-0007 → FAT + issueYear + 000000007. Rakam yoksa hash'ten türetilir.
 */
export function deriveGibNumber(invoiceNumber: string, issueDate: Date): string {
  const letters = (invoiceNumber.match(/[A-Za-zçğıöşüÇĞİÖŞÜ]{2,3}/)?.[0] ?? 'GNC')
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c.toLowerCase()] ?? c))
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X')
  const digits = invoiceNumber.replace(/\D/g, '')
  // FAT-2026-005 gibi desenlerde YIL grubunu atla — yalnızca son rakam grubu sıradır
  const lastGroup = invoiceNumber.match(/(\d+)\s*$/)?.[1] ?? ''
  const seq = (lastGroup && lastGroup.length <= 6 ? lastGroup : digits)
    .slice(-9).padStart(9, '0')
  const year = issueDate.getFullYear().toString()
  return `${letters}${year}${seq}`
}

/** VKN (10 hane) ya da TCKN (11 hane) doğrulaması — temiz ve doğruysa döner */
function normalizeTaxId(raw: string | null | undefined): { value: string; type: 'VKN' | 'TCKN' } | null {
  const v = String(raw ?? '').replace(/\D/g, '')
  if (v.length === 10) return { value: v, type: 'VKN' }
  if (v.length === 11) return { value: v, type: 'TCKN' }
  return null
}

/** Birim kodu eşlemesi — GİB yaygın birim kodları */
function unitCode(description: string): string {
  const d = description.toLowerCase()
  if (/(kg|kilo)/.test(d)) return 'KGM'
  if (/(litre|lt\b|lt )/.test(d)) return 'LTR'
  if (/(metre|m\b|ml\b)/.test(d)) return 'MTR'
  if (/(paket|paket)/.test(d)) return 'HUR'
  if (/(saat|hour)/.test(d)) return 'HUR'
  return 'C62' // adet
}

// ── Tipler ───────────────────────────────────────────────────

export interface EfaturaLine {
  description: string
  qty: number
  unitPrice: number
  taxRate: number
  lineTotal: number
}

export interface EfaturaParty {
  name: string
  legalName?: string | null
  address?: string | null
  city?: string | null
  taxNumber?: string | null
  taxOffice?: string | null
  phone?: string | null
  email?: string | null
}

export interface EfaturaInvoice {
  number: string
  issueDate: Date
  dueDate?: Date | null
  currency: string
  subtotal: number
  taxTotal: number
  total: number
  customer: EfaturaParty
  company: EfaturaParty
  lines: EfaturaLine[]
}

// ── UBL-TR 1.2 XML üretimi ───────────────────────────────────

export function buildEarsivUblXml(inv: EfaturaInvoice): string {
  const ettn = deriveEttn(`${inv.number}:${inv.issueDate.getTime()}`)
  const gibNo = deriveGibNumber(inv.number, inv.issueDate)
  const issue = inv.issueDate
  const issueDate = issue.toISOString().slice(0, 10)
  const issueTime = issue.toISOString().slice(11, 19)
  const cur = inv.currency || 'TRY'

  // KDV grupları — orana göre subtotal toplamları
  // Konvansiyon: lineTotal KDV HARİÇ (net), vergi üstüne eklenir (total = subtotal + taxTotal)
  const taxGroups = new Map<number, { base: number; amount: number }>()
  for (const l of inv.lines) {
    const net = l.lineTotal
    const tax = net * (l.taxRate / 100)
    const g = taxGroups.get(l.taxRate) ?? { base: 0, amount: 0 }
    g.base += net
    g.amount += tax
    taxGroups.set(l.taxRate, g)
  }
  const taxExclusive = inv.subtotal || Array.from(taxGroups.values()).reduce((s, g) => s + g.base, 0)
  const payable = inv.total || taxExclusive + inv.taxTotal

  const partyXml = (p: EfaturaParty, tag: string): string => {
    const id = normalizeTaxId(p.taxNumber)
    // VKN/TCKN yoksa PartyIdentification yazılmaz — GİB doğrulaması uyarı header'ıyla kullanıcıya bildirilir
    const idXml = id
      ? `      <cac:PartyIdentification>
        <cbc:ID schemeID="${id.type}">${esc(id.value)}</cbc:ID>
      </cac:PartyIdentification>\n`
      : ''
    return `  <cac:${tag}>
    <cac:Party>
${idXml}      <cac:PartyName>
        <cbc:Name>${esc(p.legalName || p.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(p.address ?? '')}</cbc:StreetName>
        <cbc:City>${esc(p.city ?? '')}</cbc:City>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:TaxScheme>
          <cbc:Name>${esc(p.taxOffice ?? '')}</cbc:Name>
        </cbc:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:Telephone>${esc(p.phone ?? '')}</cbc:Telephone>
        <cbc:ElectronicMail>${esc(p.email ?? '')}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:${tag}>`
  }

  const taxSubtotals = Array.from(taxGroups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, g]) => `      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${cur}">${money(g.base)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${cur}">${money(g.amount)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>${rate}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:Name>KDV</cbc:Name>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>`)
    .join('\n')

  const linesXml = inv.lines
    .map((l, i) => {
      const net = l.lineTotal
      const tax = net * (l.taxRate / 100)
      return `    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${unitCode(l.description)}">${l.qty}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${cur}">${money(net)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${cur}">${money(tax)}</cbc:TaxAmount>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${esc(l.description)}</cbc:Name>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${cur}">${money(l.unitPrice)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>1.2</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>EARSIVFATURA</cbc:ProfileID>
  <cbc:ID>${esc(gibNo)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${ettn}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:Note>${esc(`Fatura No: ${inv.number}`)}</cbc:Note>
  <cbc:DocumentCurrencyCode>${esc(cur)}</cbc:DocumentCurrencyCode>
${partyXml(inv.company, 'AccountingSupplierParty')}
${partyXml(inv.customer, 'AccountingCustomerParty')}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${money(inv.taxTotal)}</cbc:TaxAmount>
${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${cur}">${money(taxExclusive)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${cur}">${money(taxExclusive)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${cur}">${money(payable)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${cur}">${money(payable)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>`
}

/** VKN/TCKN eksik müşteri uyarısı — route tarafında X-Efatura-Warn header'ı olarak verilir */
export function efaturaWarnings(inv: EfaturaInvoice): string[] {
  const w: string[] = []
  if (!normalizeTaxId(inv.customer.taxNumber)) {
    w.push('Müşteri VKN/TCKN alanı boş veya hatalı — GİB portalında düzeltmeniz gerekebilir')
  }
  if (!normalizeTaxId(inv.company.taxNumber)) {
    w.push('Şirket VKN/TCKN tanımlı değil (Fatura Şablonu ayarlarından ekleyin)')
  }
  return w
}
