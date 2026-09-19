'use client'

import { useAppStore } from '@/store/app-store'
import { LoginScreen } from './login-screen'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { CommandPalette } from './command-palette'
import { DashboardView } from '@/components/dashboard/dashboard-view'
import { CustomerList } from '@/components/customers/customer-list'
import { Customer360 } from '@/components/customers/customer-360'
import { LeadMiningView } from '@/components/maps/lead-mining-view'
import { KanbanBoard } from '@/components/pipeline/kanban-board'
import { TasksView } from '@/components/tasks/tasks-view'
import { ReportsView } from '@/components/reports/reports-view'
import { UsersView } from '@/components/users/users-view'
import { SettingsView } from '@/components/users/settings-view'
import { ProductsView } from '@/components/erp/products-view'
import { QuotesView } from '@/components/erp/quotes-view'
import { InvoicesView } from '@/components/erp/invoices-view'
import { OrdersView } from '@/components/erp/orders-view'
import { DepoSiparisView } from '@/components/erp/depo-siparis-view'
import { DocumentsView } from '@/components/erp/documents-view'
import { ProductionView } from '@/components/erp/production-view'
import { ChatView } from '@/components/chat/chat-view'
import { WhatsAppHubView } from '@/components/whatsapp/whatsapp-hub-view'
import { CafeView } from '@/components/cafe/cafe-view'
import { MarketView } from '@/components/market/market-view'
import { ExpensesView } from '@/components/expenses/expenses-view'
import { AppointmentsView } from '@/components/appointments/appointments-view'
import { SiteView } from '@/components/site/site-view'
import { ResidentPortal } from '@/components/site/resident-portal'
import { SocialView } from '@/components/social/social-view'
import { DistributionCenter } from '@/components/distribution/distribution-center'
import { AdminPanel } from '@/components/admin/admin-panel'
import { hasPermission } from '@/lib/rbac'
import { Card } from '@/components/ui/card'
import { ShieldX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'
import type { PermissionKey } from '@/types'

function NoPermission({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="p-8 max-w-md text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-4">
          <ShieldX className="w-7 h-7 text-red-500" />
        </div>
        <h3 className="font-semibold text-lg mb-2">Yetkisiz Erişim</h3>
        <p className="text-sm text-muted-foreground">{message}</p>
      </Card>
    </div>
  )
}

// Bir view'ı render et — permission kontrolü ile
function ProtectedView({ perm, children, message }: {
  perm: PermissionKey
  children: React.ReactNode
  message: string
}) {
  const { user } = useAppStore()
  if (!user || !hasPermission(user, perm)) {
    return <NoPermission message={message} />
  }
  return <>{children}</>
}

export function AppShell() {
  const user = useAppStore((s) => s.user)

  // Login ekranı — kullanıcı yoksa demo girişini göster
  if (!user) {
    return <LoginScreen />
  }

  return <AuthenticatedApp />
}

// Oturum açmış uygulama — yetki kontrolü + view yönlendirme + render
function AuthenticatedApp() {
  const { user, view, setView } = useAppStore()

  // Login olunca: yetkisiz view'da ise dashboard'a yönlendir
  useEffect(() => {
    if (!user) return

    // Stock rolü → üretim listesi
    if (user.role === 'stock' && view !== 'production') {
      setView('production')
      return
    }

    // Mevcut view için yetki kontrolü — yetkisi yoksa dashboard'a dön
    const viewPermissions: Record<string, PermissionKey> = {
      dashboard: 'dashboard.view',
      customers: 'customers.view.own',
      'customer-360': 'customers.view.own',
      'leads-maps': 'maps.search',
      pipeline: 'deals.manage',
      tasks: 'tasks.view',
      chat: 'messages.view',
      reports: 'reports.view',
      erp: 'erp.manage',
      quotes: 'erp.manage',
      invoices: 'erp.manage',
      orders: 'orders.view',
      production: 'production.view',
      irsaliye: 'irsaliye.view',
      cafe: 'cafe.view',
      market: 'market.view',
      expenses: 'expenses.view',
      appointments: 'appointments.view',
      site: 'site.view',
      social: 'social.view',
      distribution: 'admin.access',
      admin: 'admin.access',
      users: 'users.manage',
      settings: 'settings.manage',
    }

    const requiredPerm = viewPermissions[view]
    if (requiredPerm && !hasPermission(user, requiredPerm)) {
      // Yetkisi yok — dashboard'a dön (eğer dashboard yetkisi varsa)
      if (hasPermission(user, 'dashboard.view')) {
        setView('dashboard')
      } else if (hasPermission(user, 'cafe.view')) {
        setView('cafe')
      } else if (hasPermission(user, 'market.view')) {
        setView('market')
      } else if (hasPermission(user, 'production.view')) {
        setView('production')
      }
    }
  }, [user, view, setView])

  // Genel render — her view permission kontrolü ile
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto custom-scroll">
          <div className={cn('p-4 lg:p-6 max-w-[1600px] mx-auto')}>
            {view === 'dashboard' && (
              <ProtectedView perm="dashboard.view" message="Dashboard görüntüleme yetkiniz yok.">
                <DashboardView />
              </ProtectedView>
            )}
            {view === 'customers' && (
              <ProtectedView perm="customers.view.own" message="Müşteri görüntüleme yetkiniz yok.">
                <CustomerList />
              </ProtectedView>
            )}
            {view === 'customer-360' && (
              <ProtectedView perm="customers.view.own" message="Müşteri görüntüleme yetkiniz yok.">
                <Customer360 />
              </ProtectedView>
            )}
            {view === 'leads-maps' && (
              <ProtectedView perm="maps.search" message="Potansiyel müşteri madenciliği için yetkiniz yok.">
                <LeadMiningView />
              </ProtectedView>
            )}
            {view === 'pipeline' && (
              <ProtectedView perm="deals.manage" message="Fırsat pipeline'ını görüntüleme yetkiniz yok.">
                <KanbanBoard />
              </ProtectedView>
            )}
            {view === 'tasks' && (
              <ProtectedView perm="tasks.view" message="Görevleri görüntüleme yetkiniz yok.">
                <TasksView />
              </ProtectedView>
            )}
            {view === 'chat' && (
              <ProtectedView perm="messages.view" message="Mesajlaşma için yetkiniz yok.">
                <ChatView />
              </ProtectedView>
            )}
            {view === 'whatsapp-hub' && (
              <ProtectedView perm="messages.view" message="WhatsApp Mesaj Merkezi için yetkiniz yok.">
                <WhatsAppHubView />
              </ProtectedView>
            )}
            {view === 'reports' && (
              <ProtectedView perm="reports.view" message="Raporları görüntüleme yetkiniz yok.">
                <ReportsView />
              </ProtectedView>
            )}
            {view === 'erp' && (
              <ProtectedView perm="erp.manage" message="ERP modülü için yetkiniz yok.">
                <ProductsView />
              </ProtectedView>
            )}
            {view === 'quotes' && (
              <ProtectedView perm="erp.manage" message="ERP modülü için yetkiniz yok.">
                <QuotesView />
              </ProtectedView>
            )}
            {view === 'invoices' && (
              <ProtectedView perm="erp.manage" message="ERP modülü için yetkiniz yok.">
                <InvoicesView />
              </ProtectedView>
            )}
            {view === 'orders' && (
              <ProtectedView perm="orders.view" message="Siparişleri görüntüleme yetkiniz yok.">
                {user && (user.role === 'depo_sorumlusu' || user.role === 'stock')
                  ? <DepoSiparisView />
                  : <OrdersView />}
              </ProtectedView>
            )}
            {view === 'production' && (
              <ProtectedView perm="production.view" message="Üretim listesini görüntüleme yetkiniz yok.">
                <ProductionView />
              </ProtectedView>
            )}
            {view === 'irsaliye' && (
              <ProtectedView perm="irsaliye.view" message="Belgeleri görüntüleme yetkiniz yok.">
                <DocumentsView />
              </ProtectedView>
            )}
            {view === 'cafe' && (
              <ProtectedView perm="cafe.view" message="Kafe modülü için yetkiniz yok.">
                <CafeView />
              </ProtectedView>
            )}
            {view === 'market' && (
              <ProtectedView perm="market.view" message="Market modülü için yetkiniz yok.">
                <MarketView />
              </ProtectedView>
            )}
            {view === 'expenses' && (
              <ProtectedView perm="expenses.view" message="Giderleri görüntüleme yetkiniz yok.">
                <ExpensesView />
              </ProtectedView>
            )}
            {view === 'appointments' && (
              <ProtectedView perm="appointments.view" message="Randevu sistemi için yetkiniz yok.">
                <AppointmentsView />
              </ProtectedView>
            )}
            {view === 'site' && (
              <ProtectedView perm="site.view" message="Site Yönetimi için yetkiniz yok.">
                <SiteView />
              </ProtectedView>
            )}
            {view === 'social' && (
              <ProtectedView perm="social.view" message="Sosyal medya görüntüleme yetkiniz yok.">
                <SocialView />
              </ProtectedView>
            )}
            {view === 'distribution' && (
              <ProtectedView perm="admin.access" message="Dağıtım Merkezi yalnızca Program Admini (superadmin) içindir.">
                <DistributionCenter />
              </ProtectedView>
            )}
            {view === 'admin' && (
              <ProtectedView perm="admin.access" message="Admin Paneli için yetkiniz yok. Bu alan sadece adminlere özeldir.">
                <AdminPanel />
              </ProtectedView>
            )}
            {view === 'users' && (
              <ProtectedView perm="users.manage" message="Kullanıcı yönetimi için yetkiniz yok.">
                <UsersView />
              </ProtectedView>
            )}
            {view === 'settings' && (
              <ProtectedView perm="settings.manage" message="Ayarları yönetme yetkiniz yok.">
                <SettingsView />
              </ProtectedView>
            )}
            {view === 'resident-portal' && <ResidentPortal />}
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
