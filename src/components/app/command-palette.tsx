'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import { apiGet } from '@/lib/api-client'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { initials, formatCurrency, formatDate } from '@/lib/format'
import {
  Search, Users, KanbanSquare, CheckSquare, MapPin,
  LayoutDashboard, UserCog, Settings, BarChart3,
  Plus, ArrowRight, Clock, AlertTriangle, TrendingUp, Phone,
} from 'lucide-react'
import type { AppView } from '@/store/app-store'

interface SearchResult {
  customers: Array<{
    id: string; name: string; sector: string; city: string
    phone: string | null; status: string; segment: string
    owner: { name: string } | null
  }>
  deals: Array<{
    id: string; title: string; value: number; currency: string
    stage: string; customerId: string; customer: { id: string; name: string }
  }>
  tasks: Array<{
    id: string; title: string; dueDate: string; priority: string
    status: string; customerId: string | null
    customer: { id: string; name: string } | null
  }>
  leads: Array<{
    id: string; name: string; category: string; city: string
    status: string; phone: string | null
  }>
}

const NAV_ITEMS: { view: AppView; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { view: 'dashboard', label: 'Genel Bakış', icon: LayoutDashboard, group: 'Sayfalar' },
  { view: 'customers', label: 'Müşteri Portföyü', icon: Users, group: 'Sayfalar' },
  { view: 'leads-maps', label: 'Potansiyel Müşteri', icon: MapPin, group: 'Sayfalar' },
  { view: 'pipeline', label: 'Satış Fırsatları', icon: KanbanSquare, group: 'Sayfalar' },
  { view: 'tasks', label: 'Görevler', icon: CheckSquare, group: 'Sayfalar' },
  { view: 'reports', label: 'Raporlar', icon: BarChart3, group: 'Sayfalar' },
  { view: 'users', label: 'Kullanıcılar', icon: UserCog, group: 'Sayfalar' },
  { view: 'settings', label: 'Ayarlar', icon: Settings, group: 'Sayfalar' },
]

const QUICK_ACTIONS: { label: string; icon: typeof Plus; view: AppView; hint: string }[] = [
  { label: 'Yeni Müşteri Ekle', icon: Plus, view: 'customers', hint: 'Müşteri portfölüne git' },
  { label: 'Yeni Fırsat Aç', icon: KanbanSquare, view: 'pipeline', hint: "Pipeline'a git" },
  { label: 'Yeni Görev Oluştur', icon: CheckSquare, view: 'tasks', hint: 'Görevlere git' },
  { label: 'Potansiyel Müşteri Ara', icon: MapPin, view: 'leads-maps', hint: 'Maps madenciliğine git' },
]

const STAGE_LABELS: Record<string, string> = {
  yeni: 'Yeni', iletisim: 'İletişim', teklif: 'Teklif',
  muzakere: 'Müzakere', kazanıldı: 'Kazanıldı', kaybedildi: 'Kaybedildi',
}

const SEGMENT_COLORS: Record<string, string> = {
  vip: 'bg-amber-100 text-amber-700 border-amber-200',
  kurumsal: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  standart: 'bg-sky-100 text-sky-700 border-sky-200',
  potansiyel: 'bg-violet-100 text-violet-700 border-violet-200',
}

export function CommandPalette() {
  const { commandOpen, setCommandOpen, setView, openCustomer } = useAppStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults(null)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const data = await apiGet<SearchResult>(`/api/search?q=${encodeURIComponent(query)}`)
        setResults(data)
      } catch {
        setResults({ customers: [], deals: [], tasks: [], leads: [] })
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  // Reset on open/close
  useEffect(() => {
    if (commandOpen) {
      setQuery('')
      setResults(null)
      setActiveIndex(0)
    }
  }, [commandOpen])

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandOpen(!commandOpen)
      }
      if (e.key === 'Escape' && commandOpen) {
        setCommandOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandOpen, setCommandOpen])

  // Build flat list of items for keyboard navigation
  const flatItems = useCallback(() => {
    const items: Array<{ type: string; data: Record<string, unknown>; index: number }> = []
    if (!results || !query.trim()) return items
    results.customers.forEach((c) => items.push({ type: 'customer', data: c, index: items.length }))
    results.deals.forEach((d) => items.push({ type: 'deal', data: d, index: items.length }))
    results.tasks.forEach((t) => items.push({ type: 'task', data: t, index: items.length }))
    results.leads.forEach((l) => items.push({ type: 'lead', data: l, index: items.length }))
    return items
  }, [results, query])

  // Keyboard navigation
  useEffect(() => {
    if (!commandOpen) return
    const handler = (e: KeyboardEvent) => {
      const items = flatItems()
      if (query.trim() && items.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActiveIndex((i) => Math.min(i + 1, items.length - 1 + NAV_ITEMS.length + QUICK_ACTIONS.length - 1))
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActiveIndex((i) => Math.max(i - 1, 0))
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandOpen, query, flatItems])

  const handleNavigate = (view: AppView) => {
    setView(view)
    setCommandOpen(false)
  }

  const handleOpenCustomer = (id: string) => {
    openCustomer(id)
    setCommandOpen(false)
  }

  const hasResults = results && (results.customers.length > 0 || results.deals.length > 0 || results.tasks.length > 0 || results.leads.length > 0)
  const showSearch = query.trim().length > 0

  return (
    <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden top-[15%] translate-y-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Hızlı Arama</DialogTitle>
        </DialogHeader>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0) }}
            placeholder="Müşteri, fırsat, görev ara... veya sayfaya git"
            className="flex-1 h-14 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted rounded border border-border">
            ESC
          </kbd>
        </div>

        <ScrollArea className="max-h-[450px]">
          <div className="p-2">
            {/* Search results */}
            {showSearch && hasResults && results && (
              <div className="space-y-1">
                {results.customers.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                      <Users className="w-3 h-3" /> Müşteriler ({results.customers.length})
                    </div>
                    {results.customers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleOpenCustomer(c.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/70 transition-colors text-left group"
                      >
                        <Avatar className="w-8 h-8 border border-border shrink-0">
                          <AvatarFallback className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                            {initials(c.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {c.sector}{c.city ? ` · ${c.city}` : ''}{c.phone ? ` · ${c.phone}` : ''}
                          </div>
                        </div>
                        {c.segment && (
                          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4.5 shrink-0', SEGMENT_COLORS[c.segment] ?? '')}>
                            {c.segment}
                          </Badge>
                        )}
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                      </button>
                    ))}
                  </>
                )}

                {results.deals.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                      <KanbanSquare className="w-3 h-3" /> Fırsatlar ({results.deals.length})
                    </div>
                    {results.deals.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => d.customer && handleOpenCustomer(d.customer.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/70 transition-colors text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center shrink-0">
                          <TrendingUp className="w-4 h-4 text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{d.title}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {d.customer.name} · {STAGE_LABELS[d.stage] ?? d.stage}
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-emerald-600 shrink-0">{formatCurrency(d.value, d.currency)}</span>
                      </button>
                    ))}
                  </>
                )}

                {results.tasks.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                      <CheckSquare className="w-3 h-3" /> Görevler ({results.tasks.length})
                    </div>
                    {results.tasks.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => t.customer && handleOpenCustomer(t.customer.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/70 transition-colors text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
                          <Clock className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{t.title}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {t.customer ? `${t.customer.name} · ` : ''}{formatDate(t.dueDate)}
                          </div>
                        </div>
                        {t.priority === 'acil' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      </button>
                    ))}
                  </>
                )}

                {results.leads.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" /> Potansiyel Müşteriler ({results.leads.length})
                    </div>
                    {results.leads.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => handleNavigate('leads-maps')}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/70 transition-colors text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/30 flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4 text-sky-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{l.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {l.category}{l.city ? ` · ${l.city}` : ''}
                          </div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* No results */}
            {showSearch && !hasResults && !loading && (
              <div className="py-12 text-center">
                <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  "{query}" için sonuç bulunamadı
                </p>
              </div>
            )}

            {/* Default: navigation + quick actions */}
            {!showSearch && (
              <div className="space-y-4 py-2">
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Hızlı Eylemler
                  </div>
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleNavigate(action.view)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/70 transition-colors text-left group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                        <action.icon className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{action.label}</div>
                        <div className="text-xs text-muted-foreground">{action.hint}</div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                    </button>
                  ))}
                </div>

                <div>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Sayfalar
                  </div>
                  {NAV_ITEMS.map((item) => (
                    <button
                      key={item.view}
                      onClick={() => handleNavigate(item.view)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/70 transition-colors text-left group"
                    >
                      <item.icon className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
                      <span className="text-sm flex-1">{item.label}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background rounded border border-border font-mono">↑↓</kbd>
              gezin
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background rounded border border-border font-mono">↵</kbd>
              seç
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/60">
            GNC CRM · Global Arama
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
