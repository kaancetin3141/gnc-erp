'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Droplets, Wind, MapPin } from 'lucide-react'
import type { WeatherData } from './types'

export function WeatherWidget({ data }: { data?: WeatherData }) {
  if (!data) {
    return <Skeleton className="h-40 rounded-xl" />
  }

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
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-white/80" />
            <span className="text-sm font-medium text-white/90">{data.city}</span>
          </div>
          <span className="text-[10px] text-white/70 uppercase tracking-wide">{data.date}</span>
        </div>

        <div className="flex items-center gap-4 mt-3">
          <div className="text-5xl leading-none">{data.icon}</div>
          <div>
            <div className="text-4xl font-bold tracking-tight tabular-nums">
              {data.temp}°
            </div>
            <div className="text-xs text-white/80 mt-0.5">{data.condition}</div>
          </div>
        </div>

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
      </CardContent>
    </Card>
  )
}
