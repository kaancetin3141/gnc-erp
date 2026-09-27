// ============================================================
// İHRACAT BELGESİ TİPLERİ — Belge Yönetimi > İhracat sekmesi
// ============================================================

export type ExportDocType = 'atr' | 'eur1' | 'mense' | 'gumruk' | 'konsimento' | 'sigorta'

export interface ExportDocTypeMeta {
  key: ExportDocType
  label: string
  shortLabel: string
  description: string
  color: string // tailwind classes for badge
}

export const EXPORT_DOC_TYPES: Record<ExportDocType, ExportDocTypeMeta> = {
  atr: {
    key: 'atr',
    label: 'ATR Dolaşım Belgesi',
    shortLabel: 'ATR',
    description: 'AB ülkelerine ihracatta gümrük muafiyeti (Gümrük Birliği)',
    color: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900',
  },
  eur1: {
    key: 'eur1',
    label: 'EUR.1 Dolaşım Belgesi',
    shortLabel: 'EUR.1',
    description: 'Serbest Ticaret Anlaşması yapılan ülkelere (STA)',
    color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-900',
  },
  mense: {
    key: 'mense',
    label: 'Menşe Şahadetnamesi',
    shortLabel: 'Menşe',
    description: 'Malın menşe ülkesini belgeler (Certificate of Origin)',
    color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
  },
  gumruk: {
    key: 'gumruk',
    label: 'İhracat Beyannamesi',
    shortLabel: 'Beyanname',
    description: 'Gümrük müessesesine verilen resmi ihracat beyanı',
    color: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900',
  },
  konsimento: {
    key: 'konsimento',
    label: 'Konşimento (Bill of Lading)',
    shortLabel: 'Konşimento',
    description: 'Denizyolu taşıma senedi — malın teslim belgesi',
    color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900',
  },
  sigorta: {
    key: 'sigorta',
    label: 'Sigorta Poliçesi',
    shortLabel: 'Sigorta',
    description: 'Nakliye sigortası kapsamı (CIF/CIP teslimlerde zorunlu)',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900',
  },
}

export const EXPORT_DOC_TYPE_KEYS = Object.keys(EXPORT_DOC_TYPES) as ExportDocType[]

export const EXPORT_DOC_STATUS_META: Record<string, { label: string; color: string }> = {
  taslak: { label: 'Taslak', color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
  hazir: { label: 'Hazır', color: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900' },
  imzalandi: { label: 'İmzalandı', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900' },
  gonderildi: { label: 'Gönderildi', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900' },
  iptal: { label: 'İptal', color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900' },
}

export const TRANSPORT_MODES: { key: string; label: string }[] = [
  { key: 'karayolu', label: 'Karayolu (TIR)' },
  { key: 'denizyolu', label: 'Denizyolu (Gemi)' },
  { key: 'havayolu', label: 'Havayolu (Uçak)' },
  { key: 'demiryolu', label: 'Demiryolu (Tren)' },
]

export const INCOTERMS: { key: string; label: string }[] = [
  { key: 'EXW', label: 'EXW — Ex Works (Fabrikada)' },
  { key: 'FCA', label: 'FCA — Free Carrier (Taşıyıcıya Teslim)' },
  { key: 'FOB', label: 'FOB — Free On Board (Gemide)' },
  { key: 'CFR', label: 'CFR — Cost & Freight (Navlun Dahil)' },
  { key: 'CIF', label: 'CIF — Cost, Insurance & Freight' },
  { key: 'CPT', label: 'CPT — Carriage Paid To' },
  { key: 'CIP', label: 'CIP — Carriage & Insurance Paid' },
  { key: 'DAP', label: 'DAP — Delivered At Place' },
  { key: 'DPU', label: 'DPU — Delivered At Place Unloaded' },
  { key: 'DDP', label: 'DDP — Delivered Duty Paid' },
]

// PDF detay verisi — GET /api/export-docs/[id] yanıtı
export interface ExportDocPdfData {
  id: string
  tenantId: string
  orderId: string
  customerId: string
  type: ExportDocType
  number: string
  status: string
  issueDate: string
  transportMode: string | null
  incoterms: string | null
  destinationCountry: string | null
  portOfLoading: string | null
  portOfDischarge: string | null
  vesselName: string | null
  containerNo: string | null
  vehiclePlate: string | null
  carrierName: string | null
  insuranceCompany: string | null
  policyAmount: number | null
  policyCurrency: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  customer: {
    id: string
    name: string
    address: string | null
    city: string | null
    country: string | null
    taxNumber: string | null
  }
  order: {
    id: string
    number: string
    orderDate: string
    currency: string
    quote?: { number: string } | null
  }
  goods: {
    description: string
    qty: number
    unitPrice: number
    lineTotal: number
    totalWeight: number | null
  }[]
  currency: string
  tenantName: string | null
}
