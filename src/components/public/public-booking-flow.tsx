'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  type WorkingHours,
  type DaySchedule,
  dayKeyFromDate,
  DAY_LABELS,
  DAY_KEYS,
} from '@/lib/appointment-utils'
import { formatCurrency } from '@/lib/format'
import { toast } from 'sonner'
import {
  Check,
  Clock,
  Tag,
  Scissors,
  Phone,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  User,
  MessageCircle,
  CheckCircle2,
  Sparkles,
  Store,
  Search,
  ArrowRight,
  ExternalLink,
  Loader2,
} from 'lucide-react'

// ============================================================
// Brand colors by provider type
// (kuaför=pink, berber=blue, diş=teal per task spec)
// ============================================================

interface Brand {
  /** Primary button + active accent */
  bg: string
  /** Soft background tint */
  bgSoft: string
  /** Soft hover */
  bgSoftHover: string
  /** Active ring */
  ring: string
  /** Active border */
  border: string
  /** Accent text color */
  text: string
  /** Gradient (for avatar / hero) */
  gradient: string
  /** Emoji */
  emoji: string
  /** Type label */
  label: string
}

const BRAND: Record<string, Brand> = {
  berber: {
    bg: 'bg-blue-600 hover:bg-blue-700',
    bgSoft: 'bg-blue-50 dark:bg-blue-950/20',
    bgSoftHover: 'hover:bg-blue-100 dark:hover:bg-blue-900/30',
    ring: 'ring-blue-600',
    border: 'border-blue-500',
    text: 'text-blue-700 dark:text-blue-300',
    gradient: 'from-blue-500 to-sky-700',
    emoji: '💈',
    label: 'Berber',
  },
  kuafor: {
    bg: 'bg-pink-600 hover:bg-pink-700',
    bgSoft: 'bg-pink-50 dark:bg-pink-950/20',
    bgSoftHover: 'hover:bg-pink-100 dark:hover:bg-pink-900/30',
    ring: 'ring-pink-600',
    border: 'border-pink-500',
    text: 'text-pink-700 dark:text-pink-300',
    gradient: 'from-pink-500 to-rose-700',
    emoji: '💇',
    label: 'Kuaför',
  },
  disci: {
    bg: 'bg-teal-600 hover:bg-teal-700',
    bgSoft: 'bg-teal-50 dark:bg-teal-950/20',
    bgSoftHover: 'hover:bg-teal-100 dark:hover:bg-teal-900/30',
    ring: 'ring-teal-600',
    border: 'border-teal-500',
    text: 'text-teal-700 dark:text-teal-300',
    gradient: 'from-teal-500 to-cyan-700',
    emoji: '🦷',
    label: 'Diş Hekimi',
  },
  guzellik: {
    bg: 'bg-rose-600 hover:bg-rose-700',
    bgSoft: 'bg-rose-50 dark:bg-rose-950/20',
    bgSoftHover: 'hover:bg-rose-100 dark:hover:bg-rose-900/30',
    ring: 'ring-rose-600',
    border: 'border-rose-500',
    text: 'text-rose-700 dark:text-rose-300',
    gradient: 'from-rose-500 to-fuchsia-700',
    emoji: '💅',
    label: 'Güzellik Merkezi',
  },
  spa: {
    bg: 'bg-emerald-600 hover:bg-emerald-700',
    bgSoft: 'bg-emerald-50 dark:bg-emerald-950/20',
    bgSoftHover: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/30',
    ring: 'ring-emerald-600',
    border: 'border-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    gradient: 'from-emerald-500 to-teal-700',
    emoji: '🧖',
    label: 'SPA',
  },
  dovme: {
    bg: 'bg-orange-600 hover:bg-orange-700',
    bgSoft: 'bg-orange-50 dark:bg-orange-950/20',
    bgSoftHover: 'hover:bg-orange-100 dark:hover:bg-orange-900/30',
    ring: 'ring-orange-600',
    border: 'border-orange-500',
    text: 'text-orange-700 dark:text-orange-300',
    gradient: 'from-amber-500 to-orange-700',
    emoji: '🎨',
    label: 'Dövme',
  },
}

function getBrand(type: string | null | undefined): Brand {
  if (type && BRAND[type]) return BRAND[type]
  // Default — neutral emerald
  return {
    bg: 'bg-emerald-600 hover:bg-emerald-700',
    bgSoft: 'bg-emerald-50 dark:bg-emerald-950/20',
    bgSoftHover: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/30',
    ring: 'ring-emerald-600',
    border: 'border-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    gradient: 'from-emerald-500 to-teal-700',
    emoji: '🏪',
    label: 'İşletme',
  }
}

// ============================================================
// Tipler
// ============================================================

interface Service {
  id: string
  name: string
  description: string | null
  duration: number
  price: number
  currency: string
  category: string | null
  photo: string | null
}

interface Staff {
  id: string
  name: string
  title: string | null
  photo: string | null
  bio: string | null
  serviceIds: string[]
}

interface Provider {
  id: string
  slug: string
  name: string
  type: string
  address: string | null
  city: string | null
  district: string | null
  phone: string | null
  email: string | null
  photo: string | null
  workingHours: WorkingHours
}

interface ProviderListItem {
  id: string
  slug: string
  name: string
  type: string
  address: string | null
  city: string | null
  district: string | null
  photo: string | null
  phone: string | null
  workingHours: WorkingHours
  services: { id: string; name: string; duration: number; price: number; currency: string; category: string | null }[]
}

interface AvailabilitySlot {
  time: string
  available: boolean
}

interface AvailabilityResponse {
  slots: AvailabilitySlot[]
  workingHours: DaySchedule
  dayKey: string
  serviceDuration: number
  slotInterval: number
  nextAvailable: string | null
  nextAvailableLabel: string | null
  reason?: string
}

interface BookResponse {
  id: string
  status: string
  providerName: string
  providerPhone: string | null
  serviceName: string
  staffName: string | null
  staffTitle: string | null
  date: string
  time: string
  isoDate: string
  price: number
  currency: string
  customerName: string
  customerPhone: string
  whatsappLink: string
  customerWhatsappLink: string
  appointmentCode: string
}

interface AppointmentDetailResponse {
  id: string
  appointmentCode: string
  status: string
  providerName: string
  providerPhone: string | null
  providerAddress: string | null
  providerCity: string | null
  providerSlug: string | null
  serviceName: string | null
  serviceDuration: number | null
  servicePrice: number
  serviceCurrency: string
  staffName: string | null
  staffTitle: string | null
  date: string
  time: string
  isoDate: string
  customerName: string
  customerPhone: string
  customerEmail: string | null
  customerNote: string | null
  whatsappLink: string
}

// ============================================================
// Helper: navigate (URL-based step transitions)
// ============================================================

function useNav() {
  const router = useRouter()
  const sp = useSearchParams()

  function buildQuery(params: Record<string, string | null | undefined>): string {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v) q.set(k, v)
    }
    const s = q.toString()
    return s ? `/?${s}` : '/'
  }

  function go(params: Record<string, string | null | undefined>) {
    router.push(buildQuery(params))
  }

  function replaceGo(params: Record<string, string | null | undefined>) {
    router.replace(buildQuery(params))
  }

  return { sp, go, replaceGo }
}

// ============================================================
// PublicBookingFlow — outer Suspense wrapper
// ============================================================

export function PublicBookingFlow() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-white to-rose-50 dark:from-pink-950/20 dark:via-background dark:to-rose-950/20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PublicBookingFlowInner />
    </Suspense>
  )
}

function PublicBookingFlowInner() {
  const { sp } = useNav()
  const booking = sp.get('booking')
  if (!booking) return null
  return <BookingContent mode={booking} />
}

// ============================================================
// BookingContent — switch by `booking` query param
// ============================================================

function BookingContent({ mode }: { mode: string }) {
  const { sp, go, replaceGo } = useNav()
  const slug = sp.get('slug')
  const serviceId = sp.get('service')
  const staffId = sp.get('staff')
  const date = sp.get('date')
  const time = sp.get('time')
  const apptId = sp.get('apptId')

  switch (mode) {
    case 'provider':
      if (!slug) return <ProvidersListPage onPick={(slugPicked) => go({ booking: 'service', slug: slugPicked })} />
      // Provider info + service selection step combined when slug given and no service
      return (
        <ProviderDetailPage
          slug={slug}
          serviceId={serviceId}
          onPickService={(sid) => go({ booking: 'staff', slug, service: sid })}
        />
      )
    case 'service':
      // Same as provider detail — slug given, picking service
      if (!slug) return <ProvidersListPage onPick={(slugPicked) => go({ booking: 'service', slug: slugPicked })} />
      return (
        <ProviderDetailPage
          slug={slug}
          serviceId={serviceId}
          onPickService={(sid) => go({ booking: 'staff', slug, service: sid })}
        />
      )
    case 'staff':
      if (!slug || !serviceId) {
        // bounce to provider detail
        return <ProvidersListPage onPick={(slugPicked) => go({ booking: 'service', slug: slugPicked })} />
      }
      return (
        <StaffSelectionPage
          slug={slug}
          serviceId={serviceId}
          onPick={(sid) => go({ booking: 'calendar', slug, service: serviceId, staff: sid })}
        />
      )
    case 'calendar':
      if (!slug || !serviceId) {
        return <ProvidersListPage onPick={(slugPicked) => go({ booking: 'service', slug: slugPicked })} />
      }
      return (
        <CalendarPage
          slug={slug}
          serviceId={serviceId}
          staffId={staffId}
          date={date || undefined}
          time={time || undefined}
          onPick={(datePicked, timePicked) =>
            replaceGo({ booking: 'confirm', slug, service: serviceId, staff: staffId, date: datePicked, time: timePicked })
          }
        />
      )
    case 'confirm':
      if (!slug || !serviceId || !date || !time) {
        return <ProvidersListPage onPick={(slugPicked) => go({ booking: 'service', slug: slugPicked })} />
      }
      return (
        <ConfirmPage
          slug={slug}
          serviceId={serviceId}
          staffId={staffId}
          date={date}
          time={time}
          onSuccess={(apptId) => go({ booking: 'success', apptId })}
        />
      )
    case 'success':
      if (!apptId) {
        return <ProvidersListPage onPick={(slugPicked) => go({ booking: 'service', slug: slugPicked })} />
      }
      return <SuccessPage apptId={apptId} onReset={() => go({ booking: 'provider' })} />
    default:
      return <ProvidersListPage onPick={(slugPicked) => go({ booking: 'service', slug: slugPicked })} />
  }
}

// ============================================================
// Step 1: Providers List — public landing page
// ============================================================

function ProvidersListPage({ onPick }: { onPick: (slug: string) => void }) {
  const [search, setSearch] = useState('')
  const { data, isLoading, error } = useQuery<{ items: ProviderListItem[] }>({
    queryKey: ['public-providers'],
    queryFn: async () => {
      const res = await fetch('/api/public/providers')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'İşletmeler yüklenemedi')
      return json as { items: ProviderListItem[] }
    },
  })

  const items = data?.items ?? []

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.trim().toLowerCase()
    return items.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.district?.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q),
    )
  }, [items, search])

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 dark:from-pink-950/20 dark:via-background dark:to-rose-950/20">
      {/* Hero */}
      <div className="bg-gradient-to-br from-pink-600 via-rose-600 to-fuchsia-700 text-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <CalendarIcon className="w-7 h-7" />
            Randevu Al
          </h1>
          <p className="text-sm sm:text-base text-white/90 mt-1">
            Kuaför, berber, diş hekimi, güzellik merkezi — online randevu, anında onay.
          </p>
          <div className="relative mt-4">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İşletme, şehir veya hizmet ara..."
              className="pl-10 h-11 bg-white/95 dark:bg-white/95 text-foreground border-0"
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : error ? (
          <Card className="p-6 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : 'İşletmeler yüklenemedi'}
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <Store className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {items.length === 0 ? 'Henüz kayıtlı işletme yok.' : 'Aramanızla eşleşen işletme yok.'}
            </p>
          </Card>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              {filtered.length} işletme bulundu
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((p) => {
                const brand = getBrand(p.type)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onPick(p.slug)}
                    className="text-left bg-card rounded-2xl border overflow-hidden hover:shadow-md hover:border-foreground/20 transition-all group"
                  >
                    <div className="flex items-start gap-3 p-3">
                      {p.photo ? (
                        <img
                          src={p.photo}
                          alt={p.name}
                          className="w-16 h-16 rounded-xl object-cover shrink-0"
                        />
                      ) : (
                        <div className={cn(
                          'w-16 h-16 rounded-xl bg-gradient-to-br flex items-center justify-center text-3xl shrink-0',
                          brand.gradient,
                        )}>
                          {brand.emoji}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{p.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5', brand.text, brand.border)}>
                            {brand.emoji} {brand.label}
                          </Badge>
                          {p.services.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {p.services.length} hizmet
                            </span>
                          )}
                        </div>
                        {(p.district || p.city) && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <MapPin className="w-3 h-3" />
                            {[p.district, p.city].filter(Boolean).join(' / ')}
                          </div>
                        )}
                        {p.address && (
                          <div className="text-[11px] text-muted-foreground truncate">{p.address}</div>
                        )}
                      </div>
                      <ArrowRight className={cn('w-4 h-4 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity', brand.text)} />
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-auto py-6 text-center text-xs text-muted-foreground">
        <p>GNC Randevu · Online rezervasyon sistemi</p>
      </footer>
    </div>
  )
}

// ============================================================
// Step 2/3: Provider Detail + Service Selection (combined)
// ============================================================

function ProviderDetailPage({
  slug,
  serviceId,
  onPickService,
}: {
  slug: string
  serviceId: string | null
  onPickService: (serviceId: string) => void
}) {
  const { data, isLoading, error } = useQuery<{ provider: Provider; services: Service[]; staff: Staff[] }>({
    queryKey: ['public-provider', slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/providers/${slug}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'İşletme bulunamadı')
      return json as { provider: Provider; services: Service[]; staff: Staff[] }
    },
    enabled: !!slug,
  })

  const provider = data?.provider
  const services = data?.services ?? []
  const brand = getBrand(provider?.type)

  // Group services by category — computed inline to respect hook order
  // (early returns below must come after any hooks)
  const servicesByCat = useMemo(() => {
    const map = new Map<string, Service[]>()
    for (const s of services) {
      const cat = s.category || 'Diğer'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(s)
    }
    return Array.from(map.entries())
  }, [services])

  if (isLoading) {
    return (
      <Shell brand={brand}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-8 w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        </div>
      </Shell>
    )
  }

  if (error || !provider) {
    return (
      <Shell brand={brand}>
        <div className="max-w-md mx-auto px-4 sm:px-6 py-12">
          <Card className="p-8 text-center">
            <Store className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'İşletme bulunamadı veya aktif değil.'}
            </p>
          </Card>
        </div>
      </Shell>
    )
  }

  const workingHours: WorkingHours = provider.workingHours

  return (
    <Shell brand={brand} providerName={provider.name} providerSlug={slug}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        {/* Provider header card */}
        <Card className="overflow-hidden mb-4">
          <div className={cn('bg-gradient-to-br p-5 text-white', brand.gradient)}>
            <div className="flex items-start gap-4">
              {provider.photo ? (
                <img
                  src={provider.photo}
                  alt={provider.name}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-white/30"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-3xl sm:text-4xl shrink-0">
                  {brand.emoji}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-xl font-bold">{provider.name}</h1>
                <div className="flex items-center gap-2 mt-1 text-xs text-white/90">
                  <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/20">
                    {brand.emoji} {brand.label}
                  </Badge>
                  {(provider.district || provider.city) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {[provider.district, provider.city].filter(Boolean).join(' / ')}
                    </span>
                  )}
                </div>
                {provider.address && (
                  <div className="flex items-center gap-1 text-xs text-white/85 mt-1">
                    <MapPin className="w-3 h-3" />
                    {provider.address}
                  </div>
                )}
              </div>
            </div>
          </div>
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {provider.phone && (
                <a
                  href={`tel:${provider.phone.replace(/[\s\-()]/g, '')}`}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Phone className={cn('w-4 h-4', brand.text)} />
                  <span className="text-sm">{provider.phone}</span>
                </a>
              )}
              <div className="flex items-start gap-2 p-2">
                <Clock className={cn('w-4 h-4 shrink-0 mt-0.5', brand.text)} />
                <div className="text-xs space-y-0.5">
                  {DAY_KEYS.map((dk) => {
                    const sched = workingHours[dk]
                    return (
                      <div key={dk} className="flex justify-between gap-3">
                        <span className="text-muted-foreground">{DAY_LABELS[dk]}</span>
                        <span className="font-medium">
                          {!sched || sched.closed
                            ? 'Kapalı'
                            : `${sched.start} - ${sched.end}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Services */}
        <div className="mb-3">
          <h2 className="font-semibold text-base sm:text-lg">Hizmet Seçin</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Hangi hizmeti almak istiyorsunuz?</p>
        </div>

        {services.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Henüz hizmet tanımlanmamış.</p>
          </Card>
        ) : (
          servicesByCat.map(([cat, items]) => (
            <div key={cat} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Tag className={cn('w-3.5 h-3.5', brand.text)} />
                <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  {cat}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((s) => {
                  const selected = serviceId === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onPickService(s.id)}
                      className={cn(
                        'text-left p-3 rounded-xl border transition-all',
                        selected
                          ? cn(brand.border, brand.bgSoft, 'ring-2', brand.ring)
                          : cn('hover:bg-muted/50', brand.bgSoftHover),
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {s.photo ? (
                          <img
                            src={s.photo}
                            alt={s.name}
                            className="w-12 h-12 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className={cn('w-12 h-12 rounded-lg bg-gradient-to-br text-white flex items-center justify-center shrink-0', brand.gradient)}>
                            <Scissors className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{s.name}</div>
                          {s.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2">{s.description}</div>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {s.duration} dk
                            </span>
                            <span className={cn('font-semibold', brand.text)}>
                              {formatCurrency(s.price, s.currency)}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className={cn('w-4 h-4 shrink-0 mt-1', brand.text)} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        )}

        {/* Geri */}
        <Button variant="ghost" size="sm" onClick={() => (window.location.href = '/?booking=provider')}>
          <ChevronLeft className="w-4 h-4 mr-1" /> İşletme Listesine Dön
        </Button>
      </div>
    </Shell>
  )
}

// ============================================================
// Step 3: Staff Selection
// ============================================================

function StaffSelectionPage({
  slug,
  serviceId,
  onPick,
}: {
  slug: string
  serviceId: string
  onPick: (staffId: string) => void
}) {
  const { data, isLoading, error } = useQuery<{ provider: Provider; services: Service[]; staff: Staff[] }>({
    queryKey: ['public-provider', slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/providers/${slug}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'İşletme bulunamadı')
      return json as { provider: Provider; services: Service[]; staff: Staff[] }
    },
    enabled: !!slug,
  })

  const provider = data?.provider
  const services = data?.services ?? []
  const staffList = data?.staff ?? []
  const brand = getBrand(provider?.type)
  const service = services.find((s) => s.id === serviceId)

  const eligibleStaff = useMemo(() => {
    return staffList.filter((s) => s.serviceIds.includes(serviceId))
  }, [staffList, serviceId])

  const STEPS = ['Hizmet', 'Personel', 'Tarih', 'Bilgiler', 'Onay']
  const currentStep = 2

  return (
    <Shell brand={brand} providerName={provider?.name} providerSlug={slug}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <ProgressSteps steps={STEPS} current={currentStep} brand={brand} />

        <div className="mb-3">
          <h2 className="font-semibold text-base sm:text-lg">Personel Seçin</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {service ? `${service.name} için ` : ''}kimden randevu almak istersiniz?
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : error ? (
          <Card className="p-4 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : 'İşletme bulunamadı'}
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onPick('any')}
              className={cn(
                'text-left p-3 rounded-xl border transition-all hover:bg-muted/50',
                brand.bgSoftHover,
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn('w-12 h-12 rounded-full bg-gradient-to-br text-white flex items-center justify-center shrink-0', brand.gradient)}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">Herhangi Bir Personel</div>
                  <div className="text-xs text-muted-foreground">Müsait olan ilk personel</div>
                </div>
                <ChevronRight className={cn('w-4 h-4', brand.text)} />
              </div>
            </button>
            {eligibleStaff.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.id)}
                className={cn(
                  'text-left p-3 rounded-xl border transition-all hover:bg-muted/50',
                  brand.bgSoftHover,
                )}
              >
                <div className="flex items-start gap-3">
                  {s.photo ? (
                    <img
                      src={s.photo}
                      alt={s.name}
                      className="w-12 h-12 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className={cn('w-12 h-12 rounded-full bg-gradient-to-br text-white flex items-center justify-center shrink-0', brand.gradient)}>
                      <User className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{s.name}</div>
                    {s.title && <div className="text-xs text-muted-foreground truncate">{s.title}</div>}
                    {s.bio && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{s.bio}</div>}
                  </div>
                  <ChevronRight className={cn('w-4 h-4 shrink-0 mt-1', brand.text)} />
                </div>
              </button>
            ))}
          </div>
        )}

        {eligibleStaff.length === 0 && !isLoading && (
          <Card className="p-6 text-center mt-3">
            <p className="text-sm text-muted-foreground">Bu hizmeti verebilecek personel yok.</p>
          </Card>
        )}

        <div className="flex gap-2 mt-4">
          <Button variant="ghost" className="flex-1" onClick={() => (window.location.href = `/?booking=service&slug=${encodeURIComponent(slug)}`)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Geri
          </Button>
        </div>
      </div>
    </Shell>
  )
}

// ============================================================
// Step 4: Calendar — date & time
// ============================================================

function CalendarPage({
  slug,
  serviceId,
  staffId,
  date: dateParam,
  time: timeParam,
  onPick,
}: {
  slug: string
  serviceId: string
  staffId: string | null
  date?: string
  time?: string
  onPick: (date: string, time: string) => void
}) {
  const { data, isLoading: providerLoading, error } = useQuery<{ provider: Provider; services: Service[]; staff: Staff[] }>({
    queryKey: ['public-provider', slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/providers/${slug}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'İşletme bulunamadı')
      return json as { provider: Provider; services: Service[]; staff: Staff[] }
    },
    enabled: !!slug,
  })

  const provider = data?.provider
  const services = data?.services ?? []
  const brand = getBrand(provider?.type)
  const service = services.find((s) => s.id === serviceId)
  const workingHours = provider?.workingHours ?? {}

  // Default date: today, but if dateParam given, use it
  const [selectedDate, setSelectedDate] = useState<string>(dateParam || '')

  useEffect(() => {
    if (!selectedDate) {
      const today = new Date()
      const yyyy = today.getFullYear()
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      setSelectedDate(`${yyyy}-${mm}-${dd}`)
    }
  }, [selectedDate])

  // Generate next 14 days
  const dateOptions = useMemo(() => {
    const dates: { value: string; label: string; dayLabel: string; isClosed: boolean; weekday: string }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 14; i++) {
      const d = new Date(today.getTime() + i * 86400000)
      const dk = dayKeyFromDate(d)
      const sched = workingHours[dk]
      const isClosed = !sched || sched.closed
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      dates.push({
        value: `${yyyy}-${mm}-${dd}`,
        label: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
        dayLabel: i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : d.toLocaleDateString('tr-TR', { weekday: 'short' }),
        isClosed,
        weekday: d.toLocaleDateString('tr-TR', { weekday: 'long' }),
      })
    }
    return dates
  }, [workingHours])

  // Availability fetch
  const { data: availData, isLoading: availLoading } = useQuery<AvailabilityResponse>({
    queryKey: ['public-availability', slug, selectedDate, serviceId, staffId],
    queryFn: async () => {
      const params = new URLSearchParams({
        date: selectedDate,
        serviceId,
      })
      if (staffId && staffId !== 'any') params.set('staffId', staffId)
      else params.set('staffId', 'any')
      const res = await fetch(`/api/public/providers/${slug}/availability?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Müsaitlik bilgisi alınamadı')
      return json as AvailabilityResponse
    },
    enabled: !!slug && !!serviceId && !!selectedDate,
  })

  const STEPS = ['Hizmet', 'Personel', 'Tarih', 'Bilgiler', 'Onay']
  const currentStep = 3

  return (
    <Shell brand={brand} providerName={provider?.name} providerSlug={slug}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <ProgressSteps steps={STEPS} current={currentStep} brand={brand} />

        <div className="mb-3">
          <h2 className="font-semibold text-base sm:text-lg">Tarih ve Saat</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Müsait bir zaman seçin</p>
        </div>

        {providerLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <Card className="p-4 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : 'İşletme bulunamadı'}
          </Card>
        ) : (
          <>
            {/* Date selector */}
            <div className="mb-3">
              <Label className="text-xs text-muted-foreground">Tarih</Label>
              <div className="flex gap-2 overflow-x-auto pb-2 mt-1.5 -mx-1 px-1 custom-scroll">
                {dateOptions.map((d) => {
                  const isSelected = selectedDate === d.value
                  return (
                    <button
                      key={d.value}
                      type="button"
                      disabled={d.isClosed}
                      onClick={() => setSelectedDate(d.value)}
                      className={cn(
                        'shrink-0 w-16 p-2 rounded-xl border text-center transition-all',
                        d.isClosed && 'opacity-40 cursor-not-allowed',
                        isSelected
                          ? cn(brand.bg, 'text-white border-transparent')
                          : cn('hover:bg-muted/50', brand.bgSoftHover),
                      )}
                    >
                      <div className="text-[10px] uppercase">{d.dayLabel}</div>
                      <div className="text-sm font-semibold">{d.label}</div>
                      {d.isClosed && <div className="text-[9px]">kapalı</div>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time slots */}
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                Saat {service && <span className="text-[10px] text-muted-foreground">· {service.duration} dk</span>}
              </Label>
              {availLoading ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-1.5">
                  {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : availData && availData.slots.length > 0 ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-1.5">
                  {availData.slots.map((s) => {
                    const isSelected = timeParam === s.time && selectedDate === dateParam
                    return (
                      <button
                        key={s.time}
                        type="button"
                        disabled={!s.available}
                        onClick={() => onPick(selectedDate, s.time)}
                        className={cn(
                          'h-10 rounded-lg border text-sm font-medium transition-all',
                          !s.available && 'opacity-30 cursor-not-allowed bg-muted/30 line-through',
                          isSelected
                            ? cn(brand.bg, 'text-white border-transparent')
                            : s.available
                              ? cn('hover:bg-muted/50', brand.bgSoftHover)
                              : '',
                        )}
                      >
                        {s.time}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Bu gün için müsait saat yok. Lütfen başka bir gün seçin.
                </div>
              )}
              {availData?.nextAvailableLabel && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  En yakın müsait: <span className="font-medium">{availData.nextAvailableLabel}</span>
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mt-5">
              <Button variant="ghost" className="flex-1" onClick={() => (window.location.href = `/?booking=staff&slug=${encodeURIComponent(slug)}&service=${encodeURIComponent(serviceId)}`)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Geri
              </Button>
              <Button
                disabled={!timeParam || !dateParam || selectedDate !== dateParam}
                className={cn('flex-1', brand.bg)}
                onClick={() => selectedDate && timeParam && onPick(selectedDate, timeParam)}
              >
                Devam Et <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}

// ============================================================
// Step 5: Confirm — customer info form
// ============================================================

function ConfirmPage({
  slug,
  serviceId,
  staffId,
  date,
  time,
  onSuccess,
}: {
  slug: string
  serviceId: string
  staffId: string | null
  date: string
  time: string
  onSuccess: (apptId: string) => void
}) {
  const qc = useQueryClient()
  const { data, isLoading: providerLoading } = useQuery<{ provider: Provider; services: Service[]; staff: Staff[] }>({
    queryKey: ['public-provider', slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/providers/${slug}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'İşletme bulunamadı')
      return json as { provider: Provider; services: Service[]; staff: Staff[] }
    },
    enabled: !!slug,
  })

  const provider = data?.provider
  const services = data?.services ?? []
  const staffList = data?.staff ?? []
  const brand = getBrand(provider?.type)
  const service = services.find((s) => s.id === serviceId)
  const staff = staffId && staffId !== 'any' ? staffList.find((s) => s.id === staffId) : null

  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    note: '',
  })
  const [honeypot, setHoneypot] = useState('')
  const [booking, setBooking] = useState(false)

  async function handleBook() {
    if (!provider) return
    if (!customer.name.trim()) {
      toast.error('Ad Soyad gerekli')
      return
    }
    if (!customer.phone.trim()) {
      toast.error('Telefon gerekli')
      return
    }
    setBooking(true)
    try {
      const res = await fetch('/api/public/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerSlug: slug,
          serviceId,
          staffId: staffId && staffId !== 'any' ? staffId : 'any',
          date,
          time,
          customerName: customer.name.trim(),
          customerPhone: customer.phone.trim(),
          customerEmail: customer.email.trim() || undefined,
          customerNote: customer.note.trim() || undefined,
          website: honeypot,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Randevu oluşturulamadı')
      // Invalidate caches
      qc.invalidateQueries({ queryKey: ['public-availability', slug] })
      qc.invalidateQueries({ queryKey: ['public-providers'] })
      toast.success('Randevunuz oluşturuldu!')
      onSuccess(json.id as string)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Randevu oluşturulamadı')
    } finally {
      setBooking(false)
    }
  }

  const STEPS = ['Hizmet', 'Personel', 'Tarih', 'Bilgiler', 'Onay']
  const currentStep = 4

  // Build a date display
  const dateLabel = useMemo(() => {
    const [y, m, d] = date.split('-').map(Number)
    const dt = new Date(y, m - 1, d, 0, 0, 0, 0)
    return dt.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }, [date])

  return (
    <Shell brand={brand} providerName={provider?.name} providerSlug={slug}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <ProgressSteps steps={STEPS} current={currentStep} brand={brand} />

        <div className="mb-3">
          <h2 className="font-semibold text-base sm:text-lg">İletişim Bilgileri</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Randevu onayı için bilgilerinizi girin</p>
        </div>

        {providerLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : provider ? (
          <>
            {/* Summary */}
            <div className={cn('rounded-lg p-3 text-sm space-y-1.5 mb-4', brand.bgSoft)}>
              <div className="flex items-center gap-2">
                <Scissors className={cn('w-3.5 h-3.5', brand.text)} />
                <span className="font-medium">{service?.name ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className={cn('w-3.5 h-3.5', brand.text)} />
                <span>{staff ? staff.name : 'Herhangi Bir Personel'}</span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarIcon className={cn('w-3.5 h-3.5', brand.text)} />
                <span className="capitalize">{dateLabel} · {time}</span>
              </div>
              {service && (
                <div className="flex items-center gap-2 font-semibold">
                  <Tag className={cn('w-3.5 h-3.5', brand.text)} />
                  <span className={brand.text}>{formatCurrency(service.price, service.currency)}</span>
                </div>
              )}
            </div>

            {/* Form */}
            <div className="space-y-3">
              <div>
                <Label htmlFor="c-name">Ad Soyad *</Label>
                <Input
                  id="c-name"
                  value={customer.name}
                  onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                  placeholder="Adınız Soyadınız"
                  className="mt-1 h-11"
                  autoComplete="name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="c-phone">Telefon *</Label>
                <Input
                  id="c-phone"
                  type="tel"
                  value={customer.phone}
                  onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                  placeholder="+90 5xx xxx xx xx"
                  className="mt-1 h-11"
                  autoComplete="tel"
                  required
                />
              </div>
              <div>
                <Label htmlFor="c-email">E-posta (opsiyonel)</Label>
                <Input
                  id="c-email"
                  type="email"
                  value={customer.email}
                  onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                  placeholder="email@örnek.com"
                  className="mt-1 h-11"
                  autoComplete="email"
                />
              </div>
              <div>
                <Label htmlFor="c-note">Not (opsiyonel)</Label>
                <Textarea
                  id="c-note"
                  value={customer.note}
                  onChange={(e) => setCustomer((c) => ({ ...c, note: e.target.value }))}
                  placeholder="Özel istekleriniz..."
                  className="mt-1 resize-none"
                  rows={2}
                />
              </div>
              {/* Honeypot */}
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mt-5">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => (window.location.href = `/?booking=calendar&slug=${encodeURIComponent(slug)}&service=${encodeURIComponent(serviceId)}${staffId ? `&staff=${encodeURIComponent(staffId)}` : ''}`)}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Geri
              </Button>
              <Button
                onClick={handleBook}
                disabled={booking || !customer.name.trim() || !customer.phone.trim()}
                className={cn('flex-1 h-11', brand.bg)}
              >
                {booking ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Oluşturuluyor...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1" /> Randevuyu Oluştur
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <Card className="p-6 text-center text-sm text-muted-foreground">İşletme bulunamadı.</Card>
        )}
      </div>
    </Shell>
  )
}

// ============================================================
// Step 6: Success page
// ============================================================

function SuccessPage({ apptId, onReset }: { apptId: string; onReset: () => void }) {
  const { data, isLoading, error } = useQuery<AppointmentDetailResponse>({
    queryKey: ['public-appointment', apptId],
    queryFn: async () => {
      const res = await fetch(`/api/public/appointments/${apptId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Randevu bulunamadı')
      return json as AppointmentDetailResponse
    },
    enabled: !!apptId,
  })

  const brand = getBrand(undefined) // success → neutral emerald
  // Use provider type from data once loaded
  const finalBrand = useMemo(() => {
    // We don't have provider type in AppointmentDetailResponse, fall back to neutral
    // For success we use emerald theme regardless
    return brand
  }, [brand])

  if (isLoading) {
    return (
      <Shell brand={finalBrand}>
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
          <Card className="overflow-hidden">
            <Skeleton className="h-32 w-full" />
            <CardContent className="p-6 space-y-4">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        </div>
      </Shell>
    )
  }

  if (error || !data) {
    return (
      <Shell brand={finalBrand}>
        <div className="max-w-md mx-auto px-4 sm:px-6 py-12">
          <Card className="p-8 text-center">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Randevu bulunamadı'}
            </p>
            <Button variant="outline" className="mt-4" onClick={onReset}>
              Yeni Randevu
            </Button>
          </Card>
        </div>
      </Shell>
    )
  }

  const statusLabel = data.status === 'onaylandi' ? 'Onaylandı' : data.status === 'beklemede' ? 'Onay Bekliyor' : data.status

  return (
    <Shell brand={finalBrand}>
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-6">
        <Card className="overflow-hidden">
          {/* Hero */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-center text-white">
            <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-3">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold">Randevunuz Oluşturuldu!</h1>
            <p className="text-sm text-white/90 mt-1">
              {statusLabel} · {data.providerName}
            </p>
            <Badge className="mt-2 bg-white/20 text-white border-white/30 hover:bg-white/20">
              No: {data.appointmentCode}
            </Badge>
          </div>

          <CardContent className="p-4 sm:p-6 space-y-4">
            {/* Details */}
            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <CalendarIcon className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-semibold capitalize">{data.date} · {data.time}</div>
                  {data.serviceDuration && (
                    <div className="text-xs text-muted-foreground">{data.serviceDuration} dk</div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Hizmet</div>
                    <div className="font-medium">{data.serviceName ?? '—'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Personel</div>
                    <div className="font-medium">{data.staffName ?? 'Herhangi Biri'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Tutar</div>
                    <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(data.servicePrice, data.serviceCurrency)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer info */}
            <div className="text-sm space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Müşteri Bilgileri</div>
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span>{data.customerName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                <span>{data.customerPhone}</span>
              </div>
              {data.customerEmail && (
                <div className="text-xs text-muted-foreground">{data.customerEmail}</div>
              )}
              {data.customerNote && (
                <div className="text-xs text-muted-foreground italic mt-1">Not: {data.customerNote}</div>
              )}
            </div>

            {/* WhatsApp */}
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  Hatırlatma için WhatsApp
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Randevu detaylarını telefonunuza gönderin (yeni sekmede açılır):
              </p>
              <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700">
                <a href={data.whatsappLink} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  WhatsApp ile Detayları Gönder
                </a>
              </Button>
            </div>

            {/* Provider */}
            <div className="rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <Store className="w-4 h-4 text-emerald-600" />
                <span className="font-medium">{data.providerName}</span>
              </div>
              {data.providerAddress && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <MapPin className="w-3 h-3" />
                  {[data.providerAddress, data.providerCity].filter(Boolean).join(', ')}
                </div>
              )}
              {data.providerPhone && (
                <a
                  href={`tel:${data.providerPhone.replace(/[\s\-()]/g, '')}`}
                  className="flex items-center gap-2 text-xs text-muted-foreground mt-1 hover:text-foreground"
                >
                  <Phone className="w-3 h-3" />
                  {data.providerPhone}
                </a>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onReset}>
                Yeni Randevu
              </Button>
              {data.providerSlug && (
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => (window.location.href = `/?booking=service&slug=${encodeURIComponent(data.providerSlug!)}`)}
                >
                  Bu İşletmeden Başka
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  )
}

// ============================================================
// Shell — wrapper with brand background + header
// ============================================================

function Shell({
  children,
  brand,
  providerName,
  providerSlug,
}: {
  children: React.ReactNode
  brand: Brand
  providerName?: string
  providerSlug?: string
}) {
  return (
    <div className={cn('min-h-screen flex flex-col bg-gradient-to-br from-white to-muted/30 dark:from-background dark:to-background')}>
      {/* Top bar */}
      <header className={cn('bg-gradient-to-r text-white shadow-sm', brand.gradient)}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarIcon className="w-5 h-5 shrink-0" />
            <span className="font-bold text-sm truncate">Randevu</span>
            {providerName && (
              <>
                <span className="text-white/40 text-xs">/</span>
                {providerSlug ? (
                  <a
                    href={`/?booking=service&slug=${encodeURIComponent(providerSlug)}`}
                    className="text-xs text-white/90 hover:text-white truncate max-w-[140px]"
                  >
                    {providerName}
                  </a>
                ) : (
                  <span className="text-xs text-white/90 truncate max-w-[140px]">{providerName}</span>
                )}
              </>
            )}
          </div>
          <a
            href="/?booking=provider"
            className="text-xs text-white/90 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors shrink-0"
            aria-label="İşletme listesine dön"
          >
            <Store className="w-4 h-4" />
            <span className="sr-only">İşletme Listesi</span>
          </a>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto py-4 text-center text-xs text-muted-foreground">
        <p>GNC Randevu · Online rezervasyon</p>
      </footer>
    </div>
  )
}

// ============================================================
// Progress Steps indicator
// ============================================================

function ProgressSteps({ steps, current, brand }: { steps: string[]; current: number; brand: Brand }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between">
        {steps.map((label, i) => {
          const num = i + 1
          const isDone = num < current
          const isActive = num === current
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center min-w-0">
                <div
                  className={cn(
                    'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0',
                    isDone
                      ? cn(brand.bg, 'text-white')
                      : isActive
                        ? cn(brand.bgSoft, brand.text, 'ring-2', brand.ring)
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : num}
                </div>
                <span
                  className={cn(
                    'text-[10px] mt-1 hidden sm:block truncate max-w-[60px]',
                    isActive || isDone ? 'text-foreground font-medium' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn('h-0.5 flex-1 mx-1 transition-colors', isDone ? brand.bg : 'bg-muted')} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Re-export for the `ExternalLink` import lint warning (kept for future use)
void ExternalLink
