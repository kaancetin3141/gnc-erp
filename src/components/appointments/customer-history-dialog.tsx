'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getStatusMeta } from '@/lib/appointment-utils'
import { formatCurrency, formatDateTime, formatPhone, whatsappLink } from '@/lib/format'
import { cn } from '@/lib/utils'
import { History, Phone, CalendarCheck, CheckCircle2, XCircle, Wallet, MessageCircle } from 'lucide-react'

// ============================================================
// Müşteri randevu geçmişi — telefon numarasına göre tüm
// geçmiş + yaklaşan randevular ve özet istatistikler.
// ============================================================

interface HistoryAppointment {
  id: string
  customerName: string
  customerPhone: string
  date: string
  endTime: string | null
  status: string
  price: number
  notes: string | null
  staff: { id: string; name: string } | null
  service: { id: string; name: string; duration: number; price: number } | null
}

export function CustomerHistoryDialog({
  providerId,
  customerName,
  phone,
  onOpenChange,
}: {
  providerId: string
  customerName: string
  phone: string
  onOpenChange: (open: boolean) => void
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['appointment-history', providerId, phone],
    queryFn: () => apiGet<HistoryAppointment[]>(
      `/api/appointments/providers/${providerId}/appointments?phone=${encodeURIComponent(phone)}`,
    ),
    enabled: !!providerId && !!phone,
    staleTime: 0,
  })

  const appts = useMemo(() => (Array.isArray(data) ? data : []), [data])

  const stats = useMemo(() => {
    const now = new Date()
    const upcoming = appts
      .filter((a) => ['beklemede', 'onaylandi'].includes(a.status) && new Date(a.date) >= now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const completed = appts.filter((a) => a.status === 'tamamlandi')
    const cancelled = appts.filter((a) => a.status === 'iptal' || a.status === 'gelmedi' || a.status === 'reddedildi')
    const spent = completed.reduce((s, a) => s + (a.price || 0), 0)
    return { total: appts.length, completed: completed.length, cancelled: cancelled.length, spent, upcoming }
  }, [appts])

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-600" />
            Müşteri Geçmişi
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground">{customerName}</span>
            <span className="tabular-nums">{formatPhone(phone)}</span>
            <a
              href={whatsappLink(phone, `Merhaba ${customerName},`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#25D366] hover:underline font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              <MessageCircle className="w-3 h-3" /> WhatsApp
            </a>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : isError ? (
          <div className="text-sm text-red-600 py-6 text-center">Geçmiş yüklenemedi</div>
        ) : (
          <div className="space-y-3">
            {/* İstatistik kartları */}
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg border p-2 text-center">
                <CalendarCheck className="w-3.5 h-3.5 mx-auto text-muted-foreground" />
                <div className="text-lg font-bold tabular-nums">{stats.total}</div>
                <div className="text-[9px] text-muted-foreground">Toplam</div>
              </div>
              <div className="rounded-lg border p-2 text-center">
                <CheckCircle2 className="w-3.5 h-3.5 mx-auto text-teal-600" />
                <div className="text-lg font-bold tabular-nums text-teal-600">{stats.completed}</div>
                <div className="text-[9px] text-muted-foreground">Tamamlanan</div>
              </div>
              <div className="rounded-lg border p-2 text-center">
                <XCircle className="w-3.5 h-3.5 mx-auto text-rose-600" />
                <div className="text-lg font-bold tabular-nums text-rose-600">{stats.cancelled}</div>
                <div className="text-[9px] text-muted-foreground">İptal/Gelmedi</div>
              </div>
              <div className="rounded-lg border p-2 text-center">
                <Wallet className="w-3.5 h-3.5 mx-auto text-emerald-600" />
                <div className="text-sm font-bold tabular-nums text-emerald-600 mt-1">{formatCurrency(stats.spent)}</div>
                <div className="text-[9px] text-muted-foreground">Harcama</div>
              </div>
            </div>

            {/* Yaklaşan randevu */}
            {stats.upcoming.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900/60 p-2.5 text-xs">
                <div className="font-medium text-emerald-800 dark:text-emerald-300">
                  Sıradaki randevu: {formatDateTime(stats.upcoming[0].date)}
                  {stats.upcoming[0].service?.name ? ` · ${stats.upcoming[0].service.name}` : ''}
                </div>
              </div>
            )}

            {/* Randevu listesi */}
            {appts.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Bu telefon numarasına ait randevu kaydı yok
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
                {appts.slice(0, 30).map((a) => {
                  const meta = getStatusMeta(a.status)
                  const past = new Date(a.date) < new Date()
                  return (
                    <div key={a.id} className={cn('flex items-center gap-2 p-2.5', !past && 'bg-emerald-50/40 dark:bg-emerald-950/10')}>
                      <div className="text-[11px] tabular-nums shrink-0 w-28">
                        <div className="font-medium">{formatDateTime(a.date)}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{a.service?.name ?? '—'}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {a.staff?.name ?? 'Herhangi biri'}
                        </div>
                      </div>
                      <div className="text-xs tabular-nums shrink-0">{formatCurrency(a.price)}</div>
                      <Badge variant="outline" className={cn('text-[9px] shrink-0', meta.color, meta.bg, 'border-0')}>
                        {meta.label}
                      </Badge>
                    </div>
                  )
                })}
                {appts.length > 30 && (
                  <div className="p-2 text-center text-[10px] text-muted-foreground">
                    +{appts.length - 30} eski kayıt
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Phone className="w-3 h-3" />
              Arama yaparak geçmiş randevulara hızlıca ulaşabilirsiniz
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
