'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SessionUser } from '@/types'
import { queryClient } from '@/lib/query-client'

export type AppView =
  | 'dashboard'
  | 'customers'
  | 'customer-360'
  | 'leads-maps'
  | 'pipeline'
  | 'tasks'
  | 'reports'
  | 'users'
  | 'settings'
  | 'erp'
  | 'quotes'
  | 'invoices'
  | 'orders'
  | 'chat'
  | 'whatsapp-hub'
  | 'production'
  | 'admin'
  | 'cafe'
  | 'market'
  | 'expenses'
  | 'appointments'
  | 'site'
  | 'resident-portal'
  | 'social'
  | 'distribution'
  | 'irsaliye'
  | 'hr'
  | 'support'

interface AppState {
  // Session
  user: SessionUser | null
  sessionId: string | null
  setSession: (user: SessionUser | null, sessionId: string | null) => void
  logout: () => void

  // Navigation
  view: AppView
  setView: (view: AppView) => void
  selectedCustomerId: string | null
  selectedLeadId: string | null
  openCustomer: (id: string) => void
  openLead: (id: string) => void

  // Cafe ERP — seçili kafe (multi-cafe tenant'lar için)
  selectedCafeId: string | null
  setSelectedCafeId: (id: string | null) => void

  // Market ERP — seçili market (multi-market tenant'lar için)
  selectedMarketId: string | null
  setSelectedMarketId: (id: string | null) => void

  // Site Yönetimi — seçili site (multi-site tenant'lar için)
  selectedSiteId: string | null
  setSelectedSiteId: (id: string | null) => void

  // Resident Portal — site sakini oturumu (CRM oturumundan ayrı)
  residentSession: { residentId: string; token: string } | null
  setResidentSession: (s: { residentId: string; token: string } | null) => void

  // Sidebar
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Global command palette
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      sessionId: null,
      setSession: (user, sessionId) => {
        // Oturum değişiminde tüm sorgu önbelleğini temizle:
        // önceki kullanıcının (farklı tenant olabilir) verileri yeni
        // kullanıcıya bir anlığına gösterilmemeli (gizlilik).
        queryClient.clear()
        set({ user, sessionId })
      },
      logout: () => {
        queryClient.clear()
        set({ user: null, sessionId: null, view: 'dashboard', selectedCustomerId: null, selectedLeadId: null })
      },

      view: 'dashboard',
      setView: (view) => set({ view }),
      selectedCustomerId: null,
      selectedLeadId: null,
      openCustomer: (id) => set({ selectedCustomerId: id, view: 'customer-360' }),
      openLead: (id) => set({ selectedLeadId: id, view: 'leads-maps' }),

      selectedCafeId: null,
      setSelectedCafeId: (id) => set({ selectedCafeId: id }),

      selectedMarketId: null,
      setSelectedMarketId: (id) => set({ selectedMarketId: id }),

      selectedSiteId: null,
      setSelectedSiteId: (id) => set({ selectedSiteId: id }),

      residentSession: null,
      setResidentSession: (s) => set({ residentSession: s }),

      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      commandOpen: false,
      setCommandOpen: (open) => set({ commandOpen: open }),
    }),
    {
      name: 'gnc-crm-store',
      partialize: (s) => ({
        user: s.user,
        sessionId: s.sessionId,
        view: s.view,
        sidebarCollapsed: s.sidebarCollapsed,
        selectedCafeId: s.selectedCafeId,
        selectedMarketId: s.selectedMarketId,
        selectedSiteId: s.selectedSiteId,
        residentSession: s.residentSession,
      }),
    },
  ),
)
