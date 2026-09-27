'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { WeatherWidget } from './weather-widget'
import { MessagesWidget } from './messages-widget'
import { NewsWidget } from './news-widget'
import { CurrencyWidget } from './currency-widget'
import { StreakWidget } from './streak-widget'
import { SocialMediaWidget } from './social-widget'
import type { WidgetsData } from './types'

export function WidgetsSection() {
  const { openCustomer } = useAppStore()
  const { data, isLoading } = useQuery({
    queryKey: ['widgets'],
    queryFn: () => apiGet<WidgetsData>('/api/widgets'),
    refetchInterval: 5 * 60 * 1000, // 5 dakikada bir yenile
    staleTime: 60_000,
  })

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Widget'lar</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hava durumu, döviz, haberler ve daha fazlası — bir bakışta.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Weather (1 col) */}
        <WeatherWidget data={isLoading ? undefined : data?.weather} />
        {/* Messages (2 col on lg) */}
        <div className="sm:col-span-2">
          <MessagesWidget
            data={isLoading ? undefined : data?.recentMessages}
            onOpenCustomer={openCustomer}
          />
        </div>
        {/* Currency (1 col) */}
        <CurrencyWidget data={isLoading ? undefined : data?.currency} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* News (2 col) */}
        <div className="lg:col-span-2">
          <NewsWidget data={isLoading ? undefined : data?.news} />
        </div>
        {/* Social media (1 col) */}
        <SocialMediaWidget />
        {/* Streak (1 col) */}
        <StreakWidget data={isLoading ? undefined : data?.streak} />
      </div>
    </section>
  )
}
