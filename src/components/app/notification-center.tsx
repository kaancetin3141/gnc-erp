'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  Bell, Clock, AlertTriangle, Users, TrendingUp, Trophy,
  CheckCircle2, ChevronRight, CheckCheck, X, CalendarClock, CalendarCheck,
} from 'lucide-react'

interface Notification {
  id: string
  type: 'overdue_task' | 'due_soon_task' | 'stale_customer' | 'deal_closing' | 'won_deal' | 'appointment_pending' | 'appointment_reminder'
  severity: 'urgent' | 'warning' | 'info' | 'success'
  title: string
  description: string
  entityId?: string
  entityType?: 'task' | 'customer' | 'deal' | 'appointment'
  meta?: Record<string, unknown>
}

interface NotificationData {
  notifications: Notification[]
  urgentCount: number
  totalCount: number
}

const SEVERITY_CONFIG: Record<string, { icon: typeof Clock; color: string; bg: string; ring: string }> = {
  urgent: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30', ring: 'ring-red-100 dark:ring-red-900/50' },
  warning: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30', ring: 'ring-amber-100 dark:ring-amber-900/50' },
  info: { icon: TrendingUp, color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-950/30', ring: 'ring-sky-100 dark:ring-sky-900/50' },
  success: { icon: Trophy, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', ring: 'ring-emerald-100 dark:ring-emerald-900/50' },
}

const TYPE_LABELS: Record<string, string> = {
  overdue_task: 'Gecikmiş Görev',
  due_soon_task: 'Yaklaşan Görev',
  stale_customer: 'İletişimsiz Müşteri',
  deal_closing: 'Kapanış Yakını',
  won_deal: 'Kazanılan Fırsat',
  appointment_pending: 'Onay Bekleyen Randevu',
  appointment_reminder: 'Yaklaşan Randevu',
}

// Randevu bildirimleri takvim ikonu kullanır
const TYPE_ICONS: Partial<Record<string, typeof Clock>> = {
  appointment_pending: CalendarClock,
  appointment_reminder: CalendarCheck,
}

const READ_STORAGE_KEY = 'gnc-notifications-read'

function getReadIds(): Set<string> {
  try {
    const stored = localStorage.getItem(READ_STORAGE_KEY)
    if (!stored) return new Set()
    const data = JSON.parse(stored) as { ids: string[]; ts: number }
    // Expire read status after 7 days (notifications are dynamic)
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - data.ts > sevenDays) return new Set()
    return new Set(data.ids)
  } catch {
    return new Set()
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify({ ids: Array.from(ids), ts: Date.now() }))
  } catch {
    // ignore
  }
}

export function NotificationCenter() {
  const { openCustomer, setView } = useAppStore()
  const [open, setOpen] = useState(false)
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    // Lazy initializer — runs once on mount, no effect needed
    if (typeof window === 'undefined') return new Set()
    return getReadIds()
  })

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiGet<NotificationData>('/api/notifications'),
    refetchInterval: 60_000,
  })

  const notifications = data?.notifications ?? []
  const urgentCount = data?.urgentCount ?? 0

  // Compute unread notifications
  const unreadNotifications = notifications.filter((n) => !readIds.has(n.id))
  const unreadCount = unreadNotifications.length
  const unreadUrgentCount = unreadNotifications.filter((n) => n.severity === 'urgent').length

  // Mark all as read when popover opens
  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen && notifications.length > 0) {
      // Mark all current notifications as read after a short delay
      // (so the user sees the unread state briefly)
      setTimeout(() => {
        const newReadIds = new Set(readIds)
        for (const n of notifications) {
          newReadIds.add(n.id)
        }
        setReadIds(newReadIds)
        saveReadIds(newReadIds)
      }, 1500)
    }
  }, [notifications, readIds])

  const handleMarkAllRead = () => {
    const newReadIds = new Set(readIds)
    for (const n of notifications) {
      newReadIds.add(n.id)
    }
    setReadIds(newReadIds)
    saveReadIds(newReadIds)
  }

  const handleClick = (n: Notification) => {
    // Mark as read on click
    const newReadIds = new Set(readIds)
    newReadIds.add(n.id)
    setReadIds(newReadIds)
    saveReadIds(newReadIds)
    setOpen(false)

    if (n.type === 'stale_customer') {
      setView('customers')
    } else if (n.entityType === 'customer' && n.entityId) {
      openCustomer(n.entityId)
    } else if (n.type === 'due_soon_task' || n.type === 'overdue_task') {
      setView('tasks')
    } else if (n.type === 'deal_closing' || n.type === 'won_deal') {
      setView('pipeline')
    } else if (n.type === 'appointment_pending' || n.type === 'appointment_reminder') {
      setView('appointments')
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 relative"
          title="Bildirimler"
        >
          <Bell className={cn('w-[18px] h-[18px] transition-transform', open && 'scale-110')} />
          {unreadCount > 0 && (
            <span className={cn(
              'absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center ring-2 ring-background animate-scale-in',
              unreadUrgentCount > 0 ? 'bg-red-500' : 'bg-emerald-500',
            )}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 lg:w-96 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Bildirimler</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-medium text-white bg-red-500 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2 text-emerald-600 hover:text-emerald-700"
                onClick={handleMarkAllRead}
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1" />
                Tümünü okundu işaretle
              </Button>
            )}
          </div>
        </div>

        {/* Summary bar */}
        {unreadCount > 0 && (
          <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-3 text-xs">
            {unreadUrgentCount > 0 && (
              <span className="flex items-center gap-1 text-red-600 font-medium">
                <AlertTriangle className="w-3 h-3" />
                {unreadUrgentCount} acil
              </span>
            )}
            {unreadUrgentCount > 0 && unreadCount > unreadUrgentCount && <span className="text-muted-foreground">·</span>}
            {unreadCount > unreadUrgentCount && (
              <span className="text-muted-foreground">
                {unreadCount - unreadUrgentCount} bildirim
              </span>
            )}
          </div>
        )}

        <ScrollArea className="max-h-[400px]">
          <div className="p-1.5">
            {isLoading && (
              <div className="py-8 text-center">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-muted-foreground mt-2">Yükleniyor...</p>
              </div>
            )}

            {!isLoading && notifications.length === 0 && (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-sm font-medium">Her şey güncel!</p>
                <p className="text-xs text-muted-foreground mt-1">Bekleyen bildirimin yok</p>
              </div>
            )}

            {!isLoading && notifications.map((n) => {
              const config = SEVERITY_CONFIG[n.severity]
              const Icon = TYPE_ICONS[n.type] ?? config.icon
              const isUnread = !readIds.has(n.id)
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    'w-full flex items-start gap-3 p-2.5 rounded-lg transition-colors text-left group relative',
                    isUnread ? 'bg-emerald-50/40 dark:bg-emerald-950/10 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/20' : 'hover:bg-muted/70 opacity-70',
                  )}
                >
                  {/* Unread indicator */}
                  {isUnread && (
                    <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-emerald-500" />
                  )}
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ml-1',
                    config.bg, config.color, config.ring,
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-[10px] font-semibold uppercase tracking-wide',
                        isUnread ? 'text-foreground' : 'text-muted-foreground',
                      )}>
                        {TYPE_LABELS[n.type]}
                      </span>
                      {isUnread && n.severity === 'urgent' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      )}
                    </div>
                    <div className={cn(
                      'text-sm truncate mt-0.5',
                      isUnread ? 'font-medium' : 'font-normal',
                    )}>{n.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{n.description}</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0 mt-1" />
                </button>
              )
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border p-2 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-8"
            onClick={() => { setOpen(false); setView('tasks') }}
          >
            Tüm Görevleri Gör
          </Button>
          {unreadCount > 0 && (
            <span className="text-[10px] text-muted-foreground pr-2">
              {unreadCount} okunmamış
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
