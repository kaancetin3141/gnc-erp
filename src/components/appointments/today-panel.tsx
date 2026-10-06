'use client'

// ============================================================
// BUGÜN PANELİ — takvimin birleşik "bugün özeti" diyaloğu
// · Bugünün randevuları (saat sıralı, durum rozetli)
// · Bugün doğum günü olan müşteriler (WhatsApp kutlama linkli)
// · Bugün izinli personel + işletme tatili durumu
// · Tamamı client-side — görünen veriden hesaplanır, ek API yok
// ============================================================

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { getStatusMeta } from '@/lib/appointment-utils'
import { formatCurrency, whatsappLink } from '@/lib/format'
import { timeOffLabel } from '@/lib/appointment-timeoff'
import {
  CalendarDays, Cake, Palmtree, Building2, MessageCircle,
  CircleDollarSign, Users, ListChecks,
} from 'lucide-react'

interface ApptLike {
  id: string
  customerName: string
  customerPhone: string
  date: string
  endTime?: string | null
  status: string
  price: number
  staffId?: string | null
  staff?: { id: string; name: string } | null
  service?: { id: string; name: string } | null
}

interface BirthdayLike {
  id: string
  name: string
  phone: string
  isToday: boolean
}

interface TimeOffLikeEntry {
  id: string
  staffId: string
  date: string
  isFullDay: boolean
  startTime: string | null
  endTime: string | null
  reason: string | null
}

interface ClosureLikeEntry {
  id: string
  date: string
  isFullDay: boolean
  startTime: string | null
  endTime: string | null
  reason: string | null
}

export function TodayPanelDialog({
  open,
  onOpenChange,
  appointments,
  birthdays,
  staffList,
  timeOffs,
  closures,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  appointments: ApptLike[]
  birthdays: BirthdayLike[]
  staffList: { id: string; name: string }[]
  timeOffs: TimeOffLikeEntry[]
  closures: ClosureLikeEntry[]
}) {
  const todayKey = new Date().toDateString()

  const todayAppts = useMemo(
    () => appointments
      .filter((a) => new Date(a.date).toDateString() === todayKey)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [appointments, todayKey],
  )
  const todayBirthdays = useMemo(
    () => birthdays.filter((b) => b.isToday),
    [birthdays],
  )
  const todayLeaves = useMemo(
    () => timeOffs.filter((t) => new Date(t.date).toDateString() === todayKey),
    [timeOffs, todayKey],
  )
  const todayClosures = useMemo(
    () => closures.filter((c) => new Date(c.date).toDateString() === todayKey),
    [closures, todayKey],
  )

  const active = todayAppts.filter((a) => !['iptal', 'reddedildi', 'gelmedi'].includes(a.status))
  const pending = todayAppts.filter((a) => a.status === 'beklemede')
  const expectedRevenue = active.reduce((s, a) => s + (a.price || 0), 0)

  const isClosed = todayClosures.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-emerald-600" />
            Bugün — {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </DialogTitle>
          <DialogDescription>
            Randevular, doğum günleri, izinler ve tatil durumu tek bakışta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Üst kartlar */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border p-2.5 bg-muted/20">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Randevu
              </div>
              <div className="text-lg font-bold tabular-nums">{active.length}</div>
              {pending.length > 0 && (
                <div className="text-[9px] text-amber-600">{pending.length} onay bekliyor</div>
              )}
            </div>
            <div className="rounded-lg border p-2.5 bg-muted/20">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <CircleDollarSign className="w-3 h-3" /> Beklenen Ciro
              </div>
              <div className="text-lg font-bold tabular-nums">{formatCurrency(expectedRevenue)}</div>
            </div>
            <div className="rounded-lg border p-2.5 bg-muted/20">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" /> Durum
              </div>
              {isClosed ? (
                <Badge className="mt-0.5 bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-900/50 dark:text-rose-200">
                  Kapalı
                </Badge>
              ) : (
                <Badge className="mt-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200">
                  Açık
                </Badge>
              )}
            </div>
          </div>

          {/* İşletme tatili */}
          {todayClosures.length > 0 && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/60 p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-800 dark:text-rose-200">
                <Building2 className="w-3.5 h-3.5" />
                İşletme Tatili
              </div>
              <ul className="mt-1 space-y-0.5 text-[11px] text-rose-700 dark:text-rose-300">
                {todayClosures.map((c) => (
                  <li key={c.id}>
                    • {c.reason || 'Tatil'} — {c.isFullDay ? 'tam gün' : `${c.startTime}-${c.endTime}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bugünün randevuları */}
          <div>
            <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
              Bugünün Randevuları ({todayAppts.length})
            </div>
            {todayAppts.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1.5 italic">Bugün randevu yok.</p>
            ) : (
              <ul className="space-y-1">
                {todayAppts.map((a) => {
                  const meta = getStatusMeta(a.status)
                  const d = new Date(a.date)
                  return (
                    <li key={a.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
                      <span className="text-[11px] font-bold tabular-nums w-10 shrink-0">
                        {String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')}
                      </span>
                      <span className="text-xs font-medium truncate flex-1">{a.customerName}</span>
                      <span className="text-[10px] text-muted-foreground truncate hidden sm:inline max-w-24">
                        {a.service?.name}
                      </span>
                      {a.staff?.name && (
                        <span className="text-[10px] text-muted-foreground truncate hidden sm:inline max-w-20">
                          {a.staff.name}
                        </span>
                      )}
                      <Badge className={cn('text-[9px] py-0 shrink-0', meta.bg, meta.color)} variant="outline">
                        {meta.label}
                      </Badge>
                      <a
                        href={whatsappLink(a.customerPhone, `Merhaba ${a.customerName}, bugünkü randevunuzu hatırlatmak istedik. 📅`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-emerald-100 dark:bg-emerald-900/50 p-1 hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors shrink-0"
                        title="WhatsApp hatırlatma gönder"
                      >
                        <MessageCircle className="w-3 h-3 text-emerald-700 dark:text-emerald-300" />
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Doğum günleri */}
          {todayBirthdays.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                <Cake className="w-3.5 h-3.5 text-pink-600" />
                Doğum Günü 🎉 ({todayBirthdays.length})
              </div>
              <ul className="space-y-1">
                {todayBirthdays.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 rounded-md border border-pink-200 bg-pink-50 dark:bg-pink-950/30 dark:border-pink-900/60 px-2.5 py-1.5">
                    <span>🎂</span>
                    <span className="text-xs font-medium flex-1 truncate">{b.name}</span>
                    <a
                      href={whatsappLink(b.phone, `Merhaba ${b.name}, doğum gününüz kutlu olsun! 🎉`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-emerald-100 dark:bg-emerald-900/50 p-1 hover:bg-emerald-200 transition-colors"
                      title="WhatsApp ile kutlama gönder"
                    >
                      <MessageCircle className="w-3 h-3 text-emerald-700 dark:text-emerald-300" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* İzinliler */}
          {todayLeaves.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                <Palmtree className="w-3.5 h-3.5 text-amber-600" />
                Bugün İzinli ({todayLeaves.length})
              </div>
              <ul className="space-y-1">
                {todayLeaves.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 px-2.5 py-1.5">
                    <span className="text-xs font-medium flex-1 truncate">
                      {staffList.find((s) => s.id === t.staffId)?.name ?? 'Personel'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{timeOffLabel(t)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
