// ============================================================
// ERP Modülü — Paylaşılan Tipler
// Bu dosya products / quotes / invoices view'ları ve part'ları
// tarafından ortak kullanılan tipleri içerir.
// ============================================================

// ----- Ürünler -----
export interface Product {
  id: string
  tenantId: string
  name: string
  sku: string | null
  description: string | null
  price: number
  currency: string
  taxRate: number
  stock: number
  minStock: number
  unit: string
  category: string | null
  photo: string | null
  // Ağırlık & ambalaj (F4)
  weight: number | null
  weightUnit: string // gr | kg | ton
  packagingWeight: number | null
  packagingType: string | null
  paletType: string | null
  paletCount: number | null
  carrier: string | null
  trackingNumber: string | null
  createdAt: string
  updatedAt: string
  _count?: { stockMovements: number; quoteLines: number }
}

export interface ProductDetail extends Product {
  stockMovements: StockMovement[]
}

export interface StockMovement {
  id: string
  productId: string
  quantity: number
  type: string // giris | cikis | duzeltme | transfer
  reason: string | null
  refType: string | null
  refId: string | null
  createdAt: string
}

export interface ProductListResponse {
  items: Product[]
  total: number
  limit: number
  offset: number
}

// ----- Teklifler -----
export interface QuoteLine {
  id?: string
  productId: string | null
  description: string
  qty: number
  unitPrice: number
  taxRate: number
  lineTotal: number
  // Ağırlık (F4)
  weightPerUnit?: number | null
  weightUnit?: string | null
  totalWeight?: number | null
  color?: string | null
  product?: { id: string; name: string; sku?: string | null } | null
}

export interface Quote {
  id: string
  tenantId: string
  customerId: string
  number: string
  status: string
  isProforma?: boolean
  subtotal: number
  taxTotal: number
  total: number
  currency: string
  issueDate: string
  validUntil: string | null
  createdAt: string
  updatedAt: string
  customer?: { id: string; name: string; segment?: string; status?: string; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; taxNumber?: string | null }
  lines?: QuoteLine[]
  _count?: { lines: number }
  order?: { id: string; number: string; status?: string } | null
}

export interface QuoteListResponse {
  items: Quote[]
  total: number
  limit: number
  offset: number
}

// ----- Faturalar -----
export interface InvoiceLine {
  id: string
  description: string
  qty: number
  unitPrice: number
  taxRate: number
  lineTotal: number
  // Ağırlık (F4)
  weightPerUnit?: number | null
  weightUnit?: string | null
  totalWeight?: number | null
  color?: string | null
  product?: { name: string; sku: string | null } | null
}

export interface Invoice {
  id: string
  tenantId: string
  customerId: string
  number: string
  status: string
  subtotal: number
  taxTotal: number
  total: number
  currency: string
  issueDate: string
  dueDate: string | null
  paidDate: string | null
  createdAt: string
  updatedAt: string
  // Çeki listesi (packing list)
  packingListNo?: string | null
  packingListDate?: string | null
  // Sipariş bağlantısı
  orderId?: string | null
  order?: { id: string; number: string; status?: string } | null
  customer?: {
    id: string
    name: string
    segment?: string
    status?: string
    // Detay API'si ek alanlar döner (telefon/adres/VKN)
    phone?: string | null
    address?: string | null
    taxNumber?: string | null
  }
  lines?: InvoiceLine[]
}

export interface InvoiceListResponse {
  items: Invoice[]
  total: number
  limit: number
  offset: number
}

// ----- Paylaşılan basit tipler (form select'leri için) -----
export interface ErpCustomer {
  id: string
  name: string
  segment?: string
  status?: string
}

export interface ErpCustomerListResponse {
  items: ErpCustomer[]
  total: number
}

export interface ErpProductSimple {
  id: string
  name: string
  sku?: string | null
  price: number
  currency: string
  taxRate: number
  unit?: string
  // Ağırlık (F4) — quote/invoice formunda autofill için
  weight?: number | null
  weightUnit?: string | null
  packagingWeight?: number | null
  packagingType?: string | null
}

export interface ErpProductListResponse {
  items: ErpProductSimple[]
  total: number
}

// ----- Siparişler (Orders) -----
export interface OrderTrackingStep {
  id: string
  orderId: string
  step: string
  note: string | null
  userId: string | null
  createdAt: string
}

export interface Order {
  id: string
  tenantId: string
  customerId: string
  quoteId: string | null
  invoiceId: string | null
  number: string
  status: string
  totalAmount: number
  currency: string
  orderDate: string
  expectedDelivery: string | null
  deliveredAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  customer?: { id: string; name: string; segment?: string; status?: string; phone?: string | null; email?: string | null; address?: string | null; city?: string | null }
  quote?: { id: string; number: string; status?: string; isProforma?: boolean } | null
  invoice?: { id: string; number: string; status: string } | null
  trackingSteps?: OrderTrackingStep[]
  _count?: { trackingSteps: number }
}

export interface OrderListResponse {
  items: Order[]
  total: number
  limit: number
  offset: number
}

