// Sektör bazlı dashboard tipleri — backend (dashboard-sectors.ts) ile hizalı
import type { TenantSector } from '@/lib/tenant-sector'

// ----- CAFE -----
export interface CafeDashboardData {
  sector: 'cafe'
  cafe: {
    cafeNames: string[]
    totalCafes: number
    totalTables: number
    activeTables: number
    todayRevenue: number
    rangeRevenue: number
    todayOrderCount: number
    rangeOrderCount: number
    topItems: { name: string; qty: number; revenue: number }[]
    dailyRevenue: { date: string; revenue: number }[]
    orderByType: { type: string; count: number }[]
  }
}

// ----- MARKET -----
export interface MarketDashboardData {
  sector: 'market'
  market: {
    marketNames: string[]
    totalMarkets: number
    activeShifts: number
    lowStockProducts: number
    todayRevenue: number
    rangeRevenue: number
    todayTxCount: number
    rangeTxCount: number
    todayCash: number
    todayCard: number
    topProducts: { name: string; qty: number; revenue: number }[]
    dailyRevenue: { date: string; revenue: number }[]
    paymentMethods: { method: string; count: number }[]
  }
}

// ----- SITE -----
export interface SiteDashboardData {
  sector: 'site'
  site: {
    siteNames: string[]
    totalSites: number
    residentsCount: number
    apartmentsCount: number
    staffCount: number
    openComplaints: number
    totalDuesExpected: number
    totalDuesCollected: number
    collectionRate: number
    paidCount: number
    unpaidCount: number
    overdueCount: number
    collectedThisMonth: number
    monthlyCollection: { month: string; amount: number }[]
    recentComplaints: {
      id: string
      title: string
      category: string
      priority: string
      status: string
      createdAt: string
      resident: { name: string } | null
    }[]
    recentAnnouncements: {
      id: string
      title: string
      type: string
      isPinned: boolean
      publishDate: string
    }[]
  }
}

// ----- APPOINTMENTS -----
export interface AppointmentsDashboardData {
  sector: 'appointments'
  appointments: {
    providerNames: string[]
    todayCount: number
    weekCount: number
    pendingCount: number
    todayRevenue: number
    rangeRevenue: number
    rangeCompletedCount: number
    topServices: { name: string; count: number; revenue: number }[]
    dailyAppointments: { date: string; count: number }[]
    todayAppointments: {
      id: string
      status: string
      customerName: string
      price: number
      date: string
      service: { name: string } | null
      staff: { name: string } | null
    }[]
  }
}

export type SectorDashboardData =
  | CafeDashboardData
  | MarketDashboardData
  | SiteDashboardData
  | AppointmentsDashboardData

export type { TenantSector }
