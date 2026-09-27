'use client'

// ============================================================
// GÜN/HAFTA ÖZETİ DİYALOĞU
// · Görünen aralıktaki (gün görünümü = 1 gün, hafta = 7 gün) randevu analizi
// · Üst kartlar: toplam/onaylı/bekleyen/tamamlanan/ciro/doluluk
// · Gün kırılımı: doluluk barlarıyla tablo
// · Personel kırılımı: randevu sayısı, ciro, en yoğun gün
// Tamamı client-side hesaplanır — ekstra API çağrısı yok.
// ============================================================

import { useMemo } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BarChart3, CalendarCheck, Clock3, CheckCircle2, Wallet, Gauge, TrendingUp } from 'lucide-react'

interface SummaryAppointment {
  id: string
  staffId: string | null
  customerName: string
  date: string
  endTime: string | null
  status: string
  price: number
  serviceId: string | null
  staff?: { id: string; name: string } | null
  service?: { duration?: number } | null
}

interface SummaryStaff {
  id: string
  name: string
}

interface SummaryDay {
  date: Date
  workMinutes: number
}

const ACTIVE_STATUSES = ['beklemede', 'onaylandi', 'tamamlandi']
const REVENUE_STATUSES = ['beklemede', 'onaylandi', 'tamamlandi']

function apptEndMs(a: SummaryAppointment) {
  const st = new Date(a.date).getTime()
  return a.endTime ? new Date(a.endTime).getTime() : st + (a.service?.duration || 30) * 60_000
}

export function WeekSummaryDialog({
  open,
  onOpenChange,
  appointments,
  staffList,
  days,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  appointments: SummaryAppointment[]
  staffList: SummaryStaff[]
  days: SummaryDay[]
}) {
  const analysis = useMemo(() => {
    const relevant = appointments.filter((a) => !['iptal', 'reddedildi'].includes(a.status))
    const confirmed = relevant.filter((a) => a.status === 'onaylandi').length
    const pending = relevant.filter((a) => a.status === 'beklemede').length
    const completed = relevant.filter((a) => a.status === 'tamamlandi').length
    const revenue = relevant
      .filter((a) => REVENUE_STATUSES.includes(a.status))
      .reduce((s, a) => s + (a.price || 0), 0)

    const totalWorkMin = days.reduce((s, d) => s + d.workMinutes, 0)
    const totalBookedMin = relevant
      .filter((a) => ACTIVE_STATUSES.includes(a.status))
      .reduce((s, a) => s + Math.max(0, (apptEndMs(a) - new Date(a.date).getTime()) / 60_000), 0)
    const utilization = totalWorkMin > 0 ? Math.min(100, Math.round((totalBookedMin / totalWorkMin) * 100)) : 0

    // Gün kırılımı
    const perDay = days.map((d) => {
      const dayStr = d.date.toDateString()
      const list = relevant.filter((a) => new Date(a.date).toDateString() === dayStr)
      const bookedMin = list
        .filter((a) => ACTIVE_STATUSES.includes(a.status))
        .reduce((s, a) => s + Math.max(0, (apptEndMs(a) - new Date(a.date).getTime()) / 60_000), 0)
      return {
        date: d.date,
        count: list.length,
        pending: list.filter((a) => a.status === 'beklemede').length,
        revenue: list
          .filter((a) => REVENUE_STATUSES.includes(a.status))
          .reduce((s, a) => s + (a.price || 0), 0),
        pct: d.workMinutes > 0 ? Math.min(100, Math.round((bookedMin / d.workMinutes) * 100)) : 0,
      }
    })

    // Personel kırılımı
    const perStaff = staffList
      .map((s) => {
        const list = relevant.filter((a) => a.staffId === s.id)
        const byDay = new Map<string, number>()
        for (const a of list) {
          const k = new Date(a.date).toDateString()
          byDay.set(k, (byDay.get(k) ?? 0) + 1)
        }
        let busiestDay: string | null = null
        let busiestCount = 0
        for (const [k, v] of byDay) {
          if (v > busiestCount) {
            busiestCount = v
            busiestDay = k
          }
        }
        return {
          id: s.id,
          name: s.name,
          count: list.length,
          revenue: list
            .filter((a) => REVENUE_STATUSES.includes(a.status))
            .reduce((sum, a) => sum + (a.price || 0), 0),
          busiestDayLabel: busiestDay
            ? new Date(busiestDay).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })
            : null,
        }
      })
      .sort((a, b) => b.count - a.count)

    const busiestDayEntry = [...perDay].sort((a, b) => b.count - a.count)[0]

    return { relevant, confirmed, pending, completed, revenue, utilization, perDay, perStaff, busiestDayEntry }
  }, [appointments, staffList, days])

  function dayLabel(d: Date) {
    return d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            {days.length > 1 ? 'Hafta Özeti' : 'Gün Özeti'}
            <span className="text-xs font-normal text-muted-foreground">
              {days.length > 1
                ? `${dayLabel(days[0].date)} – ${dayLabel(days[days.length - 1].date)}`
                : dayLabel(days[0]?.date ?? new Date())}
            </span>
          </DialogTitle>
          <DialogDescription>
            Görünen zaman aralığındaki randevu analizi — doluluk, ciro ve personel performansı.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Üst kartlar */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <CalendarCheck className="w-3 h-3" /> Toplam Randevu
              </div>
              <div className="text-xl font-bold tabular-nums">{analysis.relevant.length}</div>
            </div>
            <div className="rounded-lg border p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Onaylı
              </div>
              <div className="text-xl font-bold tabular-nums text-emerald-600">{analysis.confirmed}</div>
            </div>
            <div className="rounded-lg border p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock3 className="w-3 h-3 text-amber-600" /> Bekleyen
              </div>
              <div className="text-xl font-bold tabular-nums text-amber-600">{analysis.pending}</div>
            </div>
            <div className="rounded-lg border p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Wallet className="w-3 h-3 text-teal-600" /> Beklenen Ciro
              </div>
              <div className="text-lg font-bold tabular-nums text-teal-600">{formatCurrency(analysis.revenue)}</div>
            </div>
            <div className="rounded-lg border p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Gauge className="w-3 h-3" /> Doluluk
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold tabular-nums">%{analysis.utilization}</span>
                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      analysis.utilization > 90 ? 'bg-rose-500' : analysis.utilization > 70 ? 'bg-amber-500' : 'bg-emerald-500',
                    )}
                    style={{ width: `${analysis.utilization}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="rounded-lg border p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <TrendingUp className="w-3 h-3 text-violet-600" /> En Yoğun Gün
              </div>
              <div className="text-sm font-bold truncate pt-0.5">
                {analysis.busiestDayEntry && analysis.busiestDayEntry.count > 0
                  ? `${dayLabel(analysis.busiestDayEntry.date)} · ${analysis.busiestDayEntry.count}`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Gün kırılımı */}
          {days.length > 1 && (
            <div>
              <div className="text-xs font-semibold mb-2">Gün Kırılımı</div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground">
                      <th className="text-left font-medium py-1.5 px-2.5">Gün</th>
                      <th className="text-center font-medium py-1.5 px-2">Randevu</th>
                      <th className="text-center font-medium py-1.5 px-2">Bekleyen</th>
                      <th className="text-right font-medium py-1.5 px-2">Ciro</th>
                      <th className="text-right font-medium py-1.5 px-2.5 w-24">Doluluk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.perDay.map((d, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-1.5 px-2.5 font-medium">{dayLabel(d.date)}</td>
                        <td className="py-1.5 px-2 text-center tabular-nums">{d.count}</td>
                        <td className="py-1.5 px-2 text-center tabular-nums">
                          {d.pending > 0 ? (
                            <span className="text-amber-600 font-medium">{d.pending}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(d.revenue)}</td>
                        <td className="py-1.5 px-2.5">
                          <div className="flex items-center gap-1.5 justify-end">
                            <div className="h-1 w-10 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  d.pct > 90 ? 'bg-rose-500' : d.pct > 70 ? 'bg-amber-500' : 'bg-emerald-500',
                                )}
                                style={{ width: `${d.pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">
                              %{d.pct}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Personel kırılımı */}
          <div>
            <div className="text-xs font-semibold mb-2">Personel Performansı</div>
            {analysis.perStaff.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Personel kaydı yok.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {analysis.perStaff.map((s) => (
                  <div key={s.id} className="rounded-lg border p-2.5 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      {s.name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {s.count} randevu · {formatCurrency(s.revenue)}
                        {s.busiestDayLabel && <> · yoğun: {s.busiestDayLabel}</>}
                      </div>
                    </div>
                    {s.count > 0 && (
                      <Badge variant="secondary" className="text-[9px] py-0 shrink-0">
                        {s.count}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
