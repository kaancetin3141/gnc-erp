'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Droplets, Wind, MapPin, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WeatherData } from './types'
import { LiveBadge } from './live-badge'

interface WeatherWidgetProps {
  data?: WeatherData
  cities: string[]
  onCityChange: (city: string) => void
  onRefresh: () => void
  refreshing?: boolean
}

const DAY_FMT = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' })

export function WeatherWidget({
  data,
  cities,
  onCityChange,
  onRefresh,
  refreshing,
}: WeatherWidgetProps) {
  if (!data) {
    return <Skeleton className="h-56 rounded-xl" />
  }

  const live = data.source === 'open-meteo'
  const daily = data.daily ?? []
  const activeCity = data.city.toLocaleLowerCase('tr-TR')

  return (
    <Card className="relative overflow-hidden border-0 text-white shadow-sm">
      {/* Emerald gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600" />
      {/* Decorative dots */}
      <div
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 80%, white 1.5px, transparent 1.5px), radial-gradient(circle at 80% 20%, white 1.5px, transparent 1.5px)',
          backgroundSize: '50px 50px',
        }}
      />
      <CardContent className="relative z-10 p-5">
        {/* Üst satır: şehir + canlı rozeti + yenile */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <MapPin className="w-3.5 h-3.5 text-white/80 shrink-0" />
            <span className="text-sm font-medium text-white/90 truncate">{data.city}</span>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none text-white',
              live ? 'bg-white/25' : 'bg-black/25 text-white/80',
            )}
            title={live ? 'Open-Meteo canlı veri' : 'API erişilemedi — özet veri'}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                live ? 'bg-lime-300 animate-pulse' : 'bg-white/50',
              )}
            />
            {live ? 'Canlı' : 'Çevrimdışı'}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Yenile"
            aria-label="Hava durumunu yenile"
            className="rounded-full bg-white/15 p-1.5 text-white hover:bg-white/30 transition-colors disabled:opacity-60 shrink-0"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          </button>
        </div>

        {/* Sıcaklık + durum */}
        <div className="flex items-center justify-between gap-3 mt-3">
          <div className="flex items-center gap-4">
            <div className="text-5xl leading-none">{data.icon}</div>
            <div>
              <div className="text-4xl font-bold tracking-tight tabular-nums">{data.temp}°</div>
              <div className="text-xs text-white/80 mt-0.5">{data.condition}</div>
            </div>
          </div>
          <div className="text-[10px] text-white/70 uppercase tracking-wide text-right">
            {data.date}
          </div>
        </div>

        {/* Nem / rüzgar / yüksek-düşük */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/20">
          <div className="flex items-center gap-1.5 text-xs">
            <Droplets className="w-3.5 h-3.5 text-white/80" />
            <span className="text-white/90">%{data.humidity}</span>
            <span className="text-white/60">nem</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Wind className="w-3.5 h-3.5 text-white/80" />
            <span className="text-white/90">{data.wind} km/s</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="text-white/90 font-medium">↑{data.high}°</span>
            <span className="text-white/60">↓{data.low}°</span>
          </div>
        </div>

        {/* Şehir seçici (yatay kaydırılabilir çipler) */}
        <div
          className="mt-3 -mx-1 px-1 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Şehir seç"
        >
          {cities.map((c) => {
            const active = c.toLocaleLowerCase('tr-TR') === activeCity
            return (
              <button
                key={c}
                type="button"
                onClick={() => onCityChange(c)}
                aria-pressed={active}
                className={cn(
                  'shrink-0 h-8 px-3 rounded-full text-xs font-medium transition-colors',
                  active
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'bg-white/15 text-white hover:bg-white/30',
                )}
              >
                {c}
              </button>
            )
          })}
        </div>

        {/* 3 günlük mini tahmin */}
        {daily.length > 0 && (
          <div className="mt-1 grid grid-cols-3 divide-x divide-white/15 border-t border-white/20 pt-3">
            {daily.map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-1 px-1">
                <span className="text-[10px] text-white/70 capitalize">
                  {DAY_FMT.format(new Date(`${d.date}T12:00:00`))}
                </span>
                <span className="text-lg leading-none" aria-hidden>
                  {d.icon}
                </span>
                <span className="text-[11px] tabular-nums whitespace-nowrap">
                  <span className="font-semibold">{d.max}°</span>{' '}
                  <span className="text-white/60">{d.min}°</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
