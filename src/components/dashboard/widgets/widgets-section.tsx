'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { WeatherWidget } from './weather-widget'
import { MessagesWidget } from './messages-widget'
import { NewsWidget } from './news-widget'
import { CurrencyWidget } from './currency-widget'
import { StreakWidget } from './streak-widget'
import { SocialMediaWidget } from './social-widget'
import type { WidgetsData } from './types'

const POPULAR_CITIES = [
  'İstanbul',
  'Ankara',
  'İzmir',
  'Bursa',
  'Antalya',
  'Adana',
  'Konya',
  'Trabzon',
]
const CITY_STORAGE_KEY = 'gnc-dashboard-city'

export function WidgetsSection() {
  const { openCustomer } = useAppStore()
  const queryClient = useQueryClient()
  const [city, setCity] = useState(POPULAR_CITIES[0])

  // Kayıtlı şehri localStorage'dan hydrate et
  useEffect(() => {
    const saved = window.localStorage.getItem(CITY_STORAGE_KEY)
    if (saved && POPULAR_CITIES.includes(saved)) setCity(saved)
  }, [])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['widgets', city],
    queryFn: () => apiGet<WidgetsData>(`/api/widgets?city=${encodeURIComponent(city)}`),
    refetchInterval: 5 * 60 * 1000, // 5 dakikada bir yenile
    staleTime: 60_000,
    placeholderData: (prev) => prev, // şehir değişiminde layout zıplamasın
  })

  const handleCityChange = (c: string) => {
    setCity(c)
    window.localStorage.setItem(CITY_STORAGE_KEY, c)
  }

  // Sunucu 30dk cache'ini de saygılı yenileme (invalidate → refetch)
  const handleRefresh = () => queryClient.invalidateQueries({ queryKey: ['widgets', city] })

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Widget&apos;lar</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Canlı hava durumu, döviz, haberler ve daha fazlası — bir bakışta.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Weather (1 col) */}
        <WeatherWidget
          data={isLoading ? undefined : data?.weather}
          cities={POPULAR_CITIES}
          onCityChange={handleCityChange}
          onRefresh={handleRefresh}
          refreshing={isFetching}
        />
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
