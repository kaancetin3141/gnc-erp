// Sektör bazlı rapor tipleri — backend (reports-sectors.ts) ile hizalı
import type { TenantSector } from '@/lib/tenant-sector'

// ----- CAFE -----
export interface CafeReportsData {
  sector: 'cafe'
  cafe: {
    cafeNames: string[]
    totalCafes: number
    totalRevenue: number
    totalOrders: number
    avgTicket: number
    activeTables: number
    totalTables: number
    dailyRevenue: { date: string; revenue: number; orders: number }[]
    hourlyBreakdown: { hour: number; revenue: number; orders: number }[]
    orderTypeMix: { type: 'dine_in' | 'takeaway' | 'pickup' | string; count: number; revenue: number }[]
    topItems: { name: string; qty: number; revenue: number }[]
    perCafe: { id: string; name: string; revenue: number; orders: number; avgTicket: number }[]
  }
}

// ----- MARKET -----
export interface MarketReportsData {
  sector: 'market'
  market: {
    marketNames: string[]
    totalMarkets: number
    totalRevenue: number
    totalTx: number
    avgBasket: number
    lowStockCount: number
    outOfStockCount: number
    dailyRevenue: { date: string; revenue: number; tx: number }[]
    paymentMethodMix: { method: string; count: number; revenue: number }[]
    topProducts: { name: string; qty: number; revenue: number; currentStock: number }[]
    stockTurnover: { name: string; soldQty: number; currentStock: number; daysOfCover: number | null }[]
    cashierPerformance: { userId: string; name: string; txCount: number; totalRevenue: number; avgBasket: number }[]
    lowStockProducts: { name: string; stock: number; minStock: number; category: string | null }[]
  }
}

// ----- SITE -----
export interface SiteReportsData {
  sector: 'site'
  site: {
    siteNames: string[]
    totalSites: number
    residentsCount: number
    apartmentsCount: number
    staffCount: number
    collectionRate: number
    totalDuesExpected: number
    totalDuesCollected: number
    monthlyCollection: { month: string; collected: number; expected: number }[]
    complaintStats: {
      total: number
      open: number
      resolved: number
      avgResolutionHours: number | null
      byCategory: { category: string; count: number; avgHours: number }[]
      byPriority: { priority: string; count: number }[]
    }
    residentGrowth: { month: string; newResidents: number; cumulative: number }[]
    staffWorkload: { userId: string; name: string; assignedComplaints: number; resolvedComplaints: number }[]
  }
}

// ----- APPOINTMENTS -----
export interface AppointmentsReportsData {
  sector: 'appointments'
  appointments: {
    providerNames: string[]
    totalCount: number
    completedCount: number
    cancelledCount: number
    noShowCount: number
    noShowRate: number
    totalRevenue: number
    dailyAppointments: { date: string; count: number; revenue: number }[]
    revenueByService: { name: string; count: number; revenue: number; avgPrice: number }[]
    staffPerformance: { userId: string; name: string; total: number; completed: number; cancelled: number; noShow: number; revenue: number }[]
    busyHours: { dayOfWeek: number; hour: number; count: number }[]
  }
}

export type SectorReportsData =
  | CafeReportsData
  | MarketReportsData
  | SiteReportsData
  | AppointmentsReportsData

export type { TenantSector }
