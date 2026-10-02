// ============================================================
// İrsaliye Tipleri (frontend)
// ============================================================

export interface IrsaliyeLine {
  id?: string
  irsaliyeId: string
  productId: string | null
  description: string
  qty: number
  unit: string
  weightPerUnit: number | null
  totalWeight: number | null
  notes: string | null
  product?: { id: string; name: string; sku?: string | null } | null
}

export interface Irsaliye {
  id: string
  tenantId: string
  orderId: string | null
  customerId: string
  number: string
  date: string
  status: string
  totalNetWeight: number | null
  totalPackagingWeight: number | null
  palletWeight: number | null
  totalGrossWeight: number | null
  palletCount: number | null
  palletType: string | null
  shippingAddress: string | null
  carrier: string | null
  trackingNo: string | null
  notes: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
  deliveredAt: string | null
  customer?: { id: string; name: string; segment?: string; status?: string; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; taxNumber?: string | null } | null
  order?: { id: string; number: string; status?: string } | null
  lines?: IrsaliyeLine[]
  _count?: { lines: number }
}

export interface IrsaliyeListResponse {
  items: Irsaliye[]
  total: number
  limit: number
  offset: number
}

export interface IrsaliyePdfData {
  id: string
  number: string
  date: string
  status: string
  deliveredAt: string | null
  tenantName: string
  customer: {
    id: string
    name: string
    address: string | null
    city: string | null
    phone: string | null
    email: string | null
    taxNumber: string | null
  } | null
  order: { id: string; number: string; status: string } | null
  weights: {
    totalNetWeight: number
    totalPackagingWeight: number
    palletWeight: number
    totalGrossWeight: number
    palletCount: number | null
    palletType: string | null
  }
  shipping: {
    shippingAddress: string | null
    carrier: string | null
    trackingNo: string | null
  }
  lines: {
    id: string
    description: string
    qty: number
    unit: string
    weightPerUnit: number | null
    totalWeight: number | null
    notes: string | null
    product: { id: string; name: string; sku: string | null } | null
  }[]
  notes: string | null
  createdAt: string
}
