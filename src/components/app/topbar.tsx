'use client'

import { useState } from 'react'
import { useAppStore } from '@/store/app-store'
import { apiDelete } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { useTheme } from 'next-themes'
import { Sun, Moon, LogOut, Search, Menu, ChevronDown, Building2, Command, KeyRound } from 'lucide-react'
import { initials } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/rbac'
import { NotificationCenter } from './notification-center'
import { PasswordChangeDialog } from './password-change-dialog'

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Genel Bakış',
  customers: 'Müşteri Portföyü',
  'customer-360': 'Müşteri Detayı',
  'leads-maps': 'Potansiyel Müşteri Madenciliği',
  pipeline: 'Satış Fırsatları',
  tasks: 'Görevler & Hatırlatıcılar',
  reports: 'Raporlar & Analiz',
  users: 'Kullanıcı & Rol Yönetimi',
  settings: 'Ayarlar',
  chat: 'Mesajlar',
  'whatsapp-hub': 'WhatsApp Merkezi',
  erp: 'Ürün & Stok',
  quotes: 'Teklifler',
  invoices: 'Faturalar',
  orders: 'Siparişler',
  production: 'Üretim Listesi',
  irsaliye: 'Belge Yönetimi',
  expenses: 'Giderler',
  cafe: 'Kafe ERP',
  market: 'Market Yönetimi',
  site: 'Site Yönetimi',
  'resident-portal': 'Sakin Portalı',
  appointments: 'Randevular',
  social: 'Sosyal Medya',
  distribution: 'Dağıtım Merkezi',
  admin: 'Admin Paneli',
}

export function Topbar() {
  const { user, view, logout, toggleSidebar, setCommandOpen } = useAppStore()
  const { theme, setTheme } = useTheme()
  const [pwOpen, setPwOpen] = useState(false)

  if (!user) return null

  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-30 flex items-center gap-2 lg:gap-3 px-4 lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden shrink-0"
        onClick={toggleSidebar}
      >
        <Menu className="w-5 h-5" />
      </Button>

      <div className="flex-1 min-w-0">
        <h1 className="text-base lg:text-lg font-semibold truncate">
          {VIEW_TITLES[view] ?? 'GNC CRM'}
        </h1>
      </div>

      {/* Command Palette trigger */}
      <button
        onClick={() => setCommandOpen(true)}
        className="hidden md:flex items-center gap-2 h-9 px-3 rounded-lg bg-muted/60 hover:bg-muted border border-transparent hover:border-border transition-colors text-sm text-muted-foreground w-56 lg:w-64 group"
      >
        <Search className="w-4 h-4 shrink-0 group-hover:text-foreground transition-colors" />
        <span className="flex-1 text-left">Ara...</span>
        <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-background rounded border border-border text-muted-foreground shrink-0">
          <Command className="w-2.5 h-2.5" />K
        </kbd>
      </button>

      {/* Mobile search button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden shrink-0"
        onClick={() => setCommandOpen(true)}
      >
        <Search className="w-[18px] h-[18px]" />
      </Button>

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title="Tema değiştir"
      >
        <Sun className="w-[18px] h-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute w-[18px] h-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Tema değiştir</span>
      </Button>

      {/* Notification Center */}
      <NotificationCenter />

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 px-1.5 lg:px-2 py-1.5 rounded-lg hover:bg-muted transition-colors">
            <Avatar className="w-8 h-8 border border-border">
              <AvatarFallback className="bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900 dark:to-teal-900 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden lg:block text-left">
              <div className="text-sm font-medium leading-tight max-w-[140px] truncate">{user.name}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{ROLE_LABELS[user.role]}</div>
            </div>
            <ChevronDown className="hidden lg:block w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="pb-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900 dark:to-teal-900 flex items-center justify-center text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                {initials(user.name)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{user.name}</div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="w-3 h-3" />
              <span className="truncate">{user.tenant.name}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <Sun className="w-4 h-4 mr-2" />
            <span>Tema: {theme === 'dark' ? 'Koyu' : 'Açık'}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer" onClick={() => setPwOpen(true)}>
            <KeyRound className="w-4 h-4 mr-2" />
            <span>Şifre Değiştir</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer text-red-600 focus:text-red-600"
            onClick={() => {
              // Sunucudaki oturumu da iptal et (arka planda)
              apiDelete('/api/auth').catch(() => null)
              logout()
            }}
          >
            <LogOut className="w-4 h-4 mr-2" />
            <span>Çıkış Yap</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <PasswordChangeDialog open={pwOpen} onOpenChange={setPwOpen} />
    </header>
  )
}
