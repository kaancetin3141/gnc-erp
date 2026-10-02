'use client'

import { useQuery } from '@tanstack/react-query'
import { useAppStore, type AppView } from '@/store/app-store'
import { hasPermission, isCafeRole, isMarketRole } from '@/lib/rbac'
import { apiGet } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, MapPin, KanbanSquare, CheckSquare,
  BarChart3, UserCog, Settings, ChevronLeft, Sparkles, Boxes,
  FileText, Receipt, Package, MessageCircle, ClipboardCheck,
  ShieldCheck, Coffee, Store, Calendar, Building2, Home, Share2, Rocket, FileStack,
  MessageSquareText,
} from 'lucide-react'
import type { PermissionKey } from '@/types'

interface NavItem {
  view: AppView
  label: string
  icon: typeof LayoutDashboard
  permission: PermissionKey  // HER öğenin permission'ı ZORUNLU
  badge?: string
}

interface UnreadMessagesResponse {
  items: { id: string; isRead: boolean; receiverId: string }[]
  total: number
}

// ============================================================
// NAV ITEMS — Her öğe bir permission'a bağlı
// Sadece o permission'a sahip kullanıcılar görür
// ============================================================
const NAV_ITEMS: { group: string; items: NavItem[] }[] = [
  {
    group: 'Genel',
    items: [
      { view: 'dashboard', label: 'Genel Bakış', icon: LayoutDashboard, permission: 'dashboard.view' },
    ],
  },
  {
    group: 'CRM',
    items: [
      { view: 'customers', label: 'Müşteriler', icon: Users, permission: 'customers.view.own' },
      { view: 'leads-maps', label: 'Potansiyel Müşteri', icon: MapPin, permission: 'maps.search' },
      { view: 'pipeline', label: 'Fırsatlar', icon: KanbanSquare, permission: 'deals.manage' },
      { view: 'tasks', label: 'Görevler', icon: CheckSquare, permission: 'tasks.view' },
      { view: 'chat', label: 'Mesajlar', icon: MessageCircle, permission: 'messages.view' },
      { view: 'whatsapp-hub', label: 'WhatsApp Merkezi', icon: MessageSquareText, permission: 'messages.view' },
    ],
  },
  {
    group: 'Analiz',
    items: [
      { view: 'reports', label: 'Raporlar', icon: BarChart3, permission: 'reports.view' },
    ],
  },
  {
    group: 'ERP',
    items: [
      { view: 'erp', label: 'Ürün & Stok', icon: Boxes, permission: 'erp.manage' },
      { view: 'quotes', label: 'Teklifler', icon: FileText, permission: 'erp.manage' },
      { view: 'invoices', label: 'Faturalar', icon: Receipt, permission: 'erp.manage' },
      { view: 'orders', label: 'Siparişler', icon: Package, permission: 'orders.view' },
      { view: 'production', label: 'Üretim Listesi', icon: ClipboardCheck, permission: 'production.view' },
      { view: 'irsaliye', label: 'Belge Yönetimi', icon: FileStack, permission: 'irsaliye.view' },
      { view: 'expenses', label: 'Giderler', icon: Receipt, permission: 'expenses.view' },
    ],
  },
  {
    group: 'Kafe',
    items: [
      { view: 'cafe', label: 'Kafe Yönetimi', icon: Coffee, permission: 'cafe.view' },
    ],
  },
  {
    group: 'Market',
    items: [
      { view: 'market', label: 'Market Yönetimi', icon: Store, permission: 'market.view' },
    ],
  },
  {
    group: 'Site Yönetimi',
    items: [
      { view: 'site', label: 'Site Yönetimi', icon: Building2, permission: 'site.view' },
    ],
  },
  {
    group: 'Randevu',
    items: [
      { view: 'appointments', label: 'Randevular', icon: Calendar, permission: 'appointments.view' },
    ],
  },
  {
    group: 'Sosyal Medya',
    items: [
      { view: 'social', label: 'Sosyal Medya', icon: Share2, permission: 'social.view' },
    ],
  },
  {
    group: 'Dağıtım',
    items: [
      // Dağıtım Merkezi SADECE superadmin (admin.access artık yalnızca
      // superadmin rolünde var). Dağıtım = tüm şirketleri tek panelde görmek.
      { view: 'distribution', label: 'Dağıtım Merkezi', icon: Rocket, permission: 'admin.access' },
    ],
  },
  {
    group: 'Yönetim',
    items: [
      { view: 'admin', label: 'Admin Paneli', icon: ShieldCheck, permission: 'admin.access' },
      { view: 'users', label: 'Kullanıcılar', icon: UserCog, permission: 'users.manage' },
      { view: 'settings', label: 'Ayarlar', icon: Settings, permission: 'settings.manage' },
    ],
  },
]

export function Sidebar() {
  const { user, view, setView, sidebarCollapsed, toggleSidebar } = useAppStore()

  // Unread message count for badge
  const { data: unreadData } = useQuery({
    queryKey: ['unread-messages'],
    queryFn: () => apiGet<UnreadMessagesResponse>('/api/messages?unread=1&limit=100'),
    enabled: !!user && hasPermission(user, 'messages.view'),
    refetchInterval: 15_000,
  })

  const unreadCount = unreadData?.items?.length ?? 0

  if (!user) return null

  // PERMISSION-BASED FILTERING — her menü öğesi kullanıcının yetkisine göre filtrelenir
  // Hardcoded role check yok — sadece permission kontrolü
  const filteredNav = NAV_ITEMS.map((group) => {
    const items = group.items.filter((item) => hasPermission(user, item.permission))
    return { ...group, items }
  }).filter((group) => group.items.length > 0)

  return (
    <>
      {/* Mobile overlay backdrop */}
      {!sidebarCollapsed && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={toggleSidebar}
        />
      )}
      <aside
        className={cn(
          'shrink-0 border-r border-border bg-sidebar flex flex-col transition-all duration-200',
          sidebarCollapsed ? 'w-[68px]' : 'w-60',
          'fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto',
          sidebarCollapsed ? '-translate-x-full lg:translate-x-0' : 'translate-x-0',
        )}
      >
      {/* Logo */}
      <div className="h-16 flex items-center gap-2.5 px-4 border-b border-border">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-bold text-white text-base shrink-0 shadow-sm">
          G
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <div className="font-bold text-sm tracking-tight leading-tight">GNC CRM</div>
            <div className="text-[10px] text-muted-foreground leading-tight truncate">{user.tenant.name}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5 custom-scroll">
        {filteredNav.map((group) => (
          <div key={group.group}>
            {!sidebarCollapsed && (
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.group}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = view === item.view || (view === 'customer-360' && item.view === 'customers')
                const isChat = item.view === 'chat'
                const badgeCount = isChat ? unreadCount : 0
                return (
                  <button
                    key={item.view}
                    onClick={() => { setView(item.view); if (window.innerWidth < 1024) toggleSidebar(); }}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all relative group',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                    )}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-emerald-500" />
                    )}
                    <item.icon className={cn('w-[18px] h-[18px] shrink-0', isActive && 'text-emerald-600')} />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    {!sidebarCollapsed && isChat && badgeCount > 0 && (
                      <span className="ml-auto bg-emerald-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-2 space-y-1">
        {!sidebarCollapsed && (
          <div className="px-3 py-2 mb-1 rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-100 dark:border-emerald-900/50">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Süper App</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-tight">CRM + ERP + Kafe + Market + Site + Randevu + Sosyal</p>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          <ChevronLeft className={cn('w-[18px] h-[18px] shrink-0 transition-transform', sidebarCollapsed && 'rotate-180')} />
          {!sidebarCollapsed && <span>Daralt</span>}
        </button>
      </div>
      </aside>
    </>
  )
}
