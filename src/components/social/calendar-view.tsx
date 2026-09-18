'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatTime, formatDateTime } from '@/lib/format'
import type { SocialCalendarItem } from '@/lib/social/types'
import { PlatformDot } from './platform-badge'
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, Send,
} from 'lucide-react'

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const TR_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

const STATUS_COLORS: Record<string, string> = {
  yayinlandi: 'bg-emerald-500',
  zamanlandi: 'bg-amber-500',
  taslak: 'bg-slate-400',
  basarisiz: 'bg-red-500',
  iptal: 'bg-gray-400',
}

interface CalendarCell {
  date: Date
  inMonth: boolean
  posts: SocialCalendarItem[]
  isToday: boolean
}

function buildMonthGrid(year: number, month: number, posts: SocialCalendarItem[]): CalendarCell[] {
  // ilk günün hafta başlangıcı (Pazartesi=0)
  const first = new Date(year, month, 1)
  const firstDay = (first.getDay() + 6) % 7 // 0=Pzt
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysPrevMonth = new Date(year, month, 0).getDate()
  const today = new Date()
  const isToday = (d: Date) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()

  const cells: CalendarCell[] = []
  // 6 satır × 7 sütun = 42
  for (let i = 0; i < 42; i++) {
    let dayNum: number
    let cellDate: Date
    let inMonth = true
    if (i < firstDay) {
      dayNum = daysPrevMonth - firstDay + i + 1
      cellDate = new Date(year, month - 1, dayNum)
      inMonth = false
    } else if (i >= firstDay + daysInMonth) {
      dayNum = i - firstDay - daysInMonth + 1
      cellDate = new Date(year, month + 1, dayNum)
      inMonth = false
    } else {
      dayNum = i - firstDay + 1
      cellDate = new Date(year, month, dayNum)
    }
    // Bu güne ait post'lar
    const dayPosts = posts.filter((p) => {
      const ref = p.scheduledAt || p.publishedAt
      if (!ref) return false
      const d = new Date(ref)
      return d.getDate() === cellDate.getDate() &&
        d.getMonth() === cellDate.getMonth() &&
        d.getFullYear() === cellDate.getFullYear()
    })
    cells.push({ date: cellDate, inMonth, posts: dayPosts, isToday: isToday(cellDate) })
  }
  return cells
}

export function CalendarView() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const monthParam = `${year}-${String(month + 1).padStart(2, '0')}`
  const { data: posts, isLoading } = useQuery<SocialCalendarItem[]>({
    queryKey: ['social-calendar', monthParam],
    queryFn: () => apiGet<SocialCalendarItem[]>(`/api/social/calendar?month=${monthParam}`),
  })

  const cells = useMemo(
    () => buildMonthGrid(year, month, posts ?? []),
    [year, month, posts],
  )

  function prevMonth() {
    if (month === 0) {
      setMonth(11)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
    setSelectedDay(null)
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
    setSelectedDay(null)
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelectedDay(today)
  }

  // İstatistik
  const monthPosts = (posts ?? []).length
  const scheduledCount = (posts ?? []).filter((p) => p.status === 'zamanlandi').length
  const publishedCount = (posts ?? []).filter((p) => p.status === 'yayinlandi').length

  // Seçili günün postları (eğer seçili gün bu ayın dışındaysa da göster)
  const selectedDayPosts = selectedDay
    ? (posts ?? []).filter((p) => {
        const ref = p.scheduledAt || p.publishedAt
        if (!ref) return false
        const d = new Date(ref)
        return d.getDate() === selectedDay.getDate() &&
          d.getMonth() === selectedDay.getMonth() &&
          d.getFullYear() === selectedDay.getFullYear()
      })
    : []

  return (
    <div className="space-y-4">
      {/* Üst bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-lg font-semibold min-w-[140px] text-center">
            {TR_MONTHS[month]} {year}
          </div>
          <Button size="icon" variant="outline" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={goToday}>
            Bugün
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <CalIcon className="w-3 h-3" /> {monthPosts} gönderi
          </Badge>
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {scheduledCount} zamanlandı
          </Badge>
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            {publishedCount} yayınlandı
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Takvim grid */}
        <Card className="lg:col-span-3">
          <CardContent className="p-3 sm:p-4">
            {/* Gün başlıkları */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {TR_DAYS.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1.5">
                  {d}
                </div>
              ))}
            </div>
            {/* Hücreler */}
            {isLoading ? (
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-md" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedDay(cell.date)}
                    className={cn(
                      'aspect-square sm:min-h-[80px] flex flex-col items-stretch rounded-md border p-1.5 text-left transition-colors',
                      !cell.inMonth && 'opacity-40',
                      cell.isToday && 'border-primary ring-1 ring-primary/30',
                      selectedDay && selectedDay.toDateString() === cell.date.toDateString()
                        ? 'bg-primary/5 border-primary'
                        : 'hover:bg-accent',
                    )}
                  >
                    <div className={cn(
                      'text-xs font-medium mb-1',
                      cell.isToday ? 'text-primary' : 'text-foreground',
                    )}>
                      {cell.date.getDate()}
                    </div>
                    <div className="flex flex-wrap gap-0.5 content-start flex-1 overflow-hidden">
                      {cell.posts.slice(0, 4).map((p, i) => (
                        <Tooltip key={i}>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                'w-2 h-2 rounded-full',
                                STATUS_COLORS[p.status] ?? 'bg-slate-400',
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <div className="text-xs">
                              <div className="font-semibold">{formatTime(p.scheduledAt || p.publishedAt)}</div>
                              <div className="line-clamp-1 max-w-[200px]">{p.content}</div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                      {cell.posts.length > 4 && (
                        <span className="text-[9px] text-muted-foreground">+{cell.posts.length - 4}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {/* Legend */}
            <div className="mt-3 flex flex-wrap items-center gap-3 pt-3 border-t text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Yayınlandı
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Zamanlandı
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-400" /> Taslak
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Başarısız
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Seçili gün detayı */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">
              {selectedDay ? (
                <span>
                  {selectedDay.getDate()} {TR_MONTHS[selectedDay.getMonth()]}
                </span>
              ) : (
                <span className="text-muted-foreground text-sm">Gün seçin</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!selectedDay ? (
              <p className="text-xs text-muted-foreground">
                Detayları görmek için takvimden bir gün seçin.
              </p>
            ) : selectedDayPosts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Bu gün için zamanlanmış/yayınlanmış gönderi yok.
              </p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {selectedDayPosts
                  .slice()
                  .sort((a, b) => {
                    const aT = new Date(a.scheduledAt || a.publishedAt || 0).getTime()
                    const bT = new Date(b.scheduledAt || b.publishedAt || 0).getTime()
                    return aT - bT
                  })
                  .map((p) => (
                    <div key={p.id} className="rounded-lg border p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(p.scheduledAt || p.publishedAt)}
                        </span>
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full',
                          STATUS_COLORS[p.status] ? `text-white ${STATUS_COLORS[p.status]}` : 'bg-gray-200 text-gray-700',
                        )}>
                          {p.status === 'yayinlandi' ? 'Yayınlandı' :
                            p.status === 'zamanlandi' ? 'Zamanlandı' :
                            p.status === 'taslak' ? 'Taslak' : p.status}
                        </span>
                      </div>
                      <p className="text-xs line-clamp-3">{p.content}</p>
                      <div className="flex flex-wrap items-center gap-0.5">
                        {p.platforms.map((pl) => (
                          <PlatformDot key={pl} platform={pl} size={14} />
                        ))}
                      </div>
                      {p.campaignName && (
                        <Badge variant="outline" className="text-[9px]">🎯 {p.campaignName}</Badge>
                      )}
                    </div>
                  ))}
              </div>
            )}
            {/* Bugün özeti */}
            {selectedDay && selectedDay.toDateString() === today.toDateString() && (
              <div className="pt-2 border-t mt-2">
                <Button size="sm" className="w-full" onClick={() => {
                  // Bugün için "yayınla" aksiyonu yok ama özet göster
                }} disabled>
                  <Send className="w-3.5 h-3.5" /> Bugün ({selectedDayPosts.length} gönderi)
                </Button>
              </div>
            )}
            {selectedDay && (
              <div className="text-[10px] text-muted-foreground pt-2 border-t">
                {formatDateTime(selectedDay)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
