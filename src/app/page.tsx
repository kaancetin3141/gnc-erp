'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/app/app-shell'
import { PublicBookingFlow } from '@/components/public/public-booking-flow'

function HomeContent() {
  const searchParams = useSearchParams()
  const isBookingMode = searchParams.get('booking') !== null

  if (isBookingMode) {
    return <PublicBookingFlow />
  }
  return <AppShell />
}

export default function Home() {
  // useSearchParams() requires a Suspense boundary in Next.js 16
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-foreground rounded-full animate-spin" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  )
}
