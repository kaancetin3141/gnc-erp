'use client'

import { useState, useMemo, useEffect } from 'react'
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
  getProviderTypeMeta,
  type WorkingHours, type DaySchedule, dayKeyFromDate,
  DAY_LABELS,
} from '@/lib/appointment-utils'
import { formatCurrency, whatsappLink, formatPhone } from '@/lib/format'
import { toast } from 'sonner'
import {
  Check, Clock, Tag, Scissors, Phone, MapPin, ChevronLeft, ChevronRight,
  Calendar as CalendarIcon, User, MessageCircle, CheckCircle2, Sparkles,
  Store,
} from 'lucide-react'

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
  name: string
  type: string
  address: string | null
  city: string | null
  district: string | null
  phone: string | null
  email: string | null
  photo: string | null
  workingHours: string
}

interface AvailabilityResponse {
  slots: string[]
  workingHours: DaySchedule | undefined
  dayKey: string
  serviceDuration: number
}

interface BookResponse {
  id: string
  customerName: string
  customerPhone: string
  customerEmail: string | null
  date: string
  endTime: string | null
  status: string
  price: number
  staff?: { name: string; title: string | null; photo: string | null } | null
  service?: { name: string; duration: number; price: number } | null
}

// ============================================================
// Public Booking
// ============================================================

interface PublicBookingProps {
  providerId: string
  onExit?: () => void
}

const STEPS = [
  { num: 1, label: 'Hizmet' },
  { num: 2, label: 'Personel' },
  { num: 3, label: 'Tarih & Saat' },
  { num: 4, label: 'Bilgiler' },
  { num: 5, label: 'Onay' },
]

export function PublicBooking({ providerId, onExit }: PublicBookingProps) {
  const qc = useQueryClient()
  const [step, setStep] = useState(1)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<Staff | 'any' | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    note: '',
  })
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState<BookResponse | null>(null)
  const [honeypot, setHoneypot] = useState('')

  // Provider + services + staff (public endpoint)
  const { data, isLoading } = useQuery({
    queryKey: ['public-provider', providerId],
    queryFn: async () => {
      const res = await fetch(`/api/appointments/public/providers/${providerId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'İşletme bulunamadı')
      return json as {
        provider: Provider
        staff: Staff[]
        services: Service[]
      }
    },
    enabled: !!providerId,
  })

  const provider = data?.provider
  const services = data?.services ?? []
  const staffList = data?.staff ?? []

  const workingHours: WorkingHours = useMemo(() => {
    if (!provider?.workingHours) return {}
    try {
      return JSON.parse(provider.workingHours) as WorkingHours
    } catch {
      return {}
    }
  }, [provider])

  // Group services by category
  const servicesByCat = useMemo(() => {
    const map = new Map<string, Service[]>()
    for (const s of services) {
      const cat = s.category || 'Diğer'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(s)
    }
    return Array.from(map.entries())
  }, [services])

  // Eligible staff for the selected service
  const eligibleStaff = useMemo(() => {
    if (!selectedService) return []
    return staffList.filter((s) => s.serviceIds.includes(selectedService.id))
  }, [selectedService, staffList])

  // Default date — today
  useEffect(() => {
    if (!selectedDate) {
      const t = new Date()
      setSelectedDate(t.toISOString().slice(0, 10))
    }
  }, [selectedDate])

  // Availability for selected date/staff/service
  const { data: availData, isLoading: availLoading } = useQuery({
    queryKey: ['public-availability', providerId, selectedDate, selectedStaff, selectedService?.id],
    queryFn: async () => {
      const staffIdParam = selectedStaff === 'any' || !selectedStaff
        ? 'any'
        : (selectedStaff as Staff).id
      const params = new URLSearchParams({
        date: selectedDate,
        serviceId: selectedService!.id,
        staffId: staffIdParam,
      })
      const res = await fetch(
        `/api/appointments/public/providers/${providerId}/availability?${params.toString()}`,
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Müsaitlik bilgisi alınamadı')
      return json as AvailabilityResponse
    },
    enabled: !!providerId && !!selectedService && !!selectedDate && step >= 3,
  })

  function selectService(s: Service) {
    setSelectedService(s)
    setSelectedStaff(null)
    setSelectedTime('')
    setStep(2)
  }

  function selectStaff(s: Staff | 'any') {
    setSelectedStaff(s)
    setSelectedTime('')
    setStep(3)
  }

  function selectTime(t: string) {
    setSelectedTime(t)
    setStep(4)
  }

  async function handleBook() {
    if (!selectedService || !selectedDate || !selectedTime) {
      toast.error('Lütfen tüm adımları tamamlayın')
      return
    }
    if (!customer.name.trim() || !customer.phone.trim()) {
      toast.error('Ad soyad ve telefon gerekli')
      return
    }
    setBooking(true)
    try {
      const [y, m, d] = selectedDate.split('-').map(Number)
      const [hh, mm] = selectedTime.split(':').map(Number)
      const start = new Date(y, m - 1, d, hh, mm, 0, 0)
      const res = await fetch(
        `/api/appointments/public/providers/${providerId}/book`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staffId: selectedStaff === 'any' ? 'any' : (selectedStaff as Staff).id,
            serviceId: selectedService.id,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerEmail: customer.email || undefined,
            customerNote: customer.note || undefined,
            date: start.toISOString(),
            website: honeypot,
          }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Randevu oluşturulamadı')
      setBooked(json as BookResponse)
      setStep(5)
      qc.invalidateQueries({ queryKey: ['public-availability', providerId] })
      toast.success('Randevunuz oluşturuldu!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Randevu oluşturulamadı')
    } finally {
      setBooking(false)
    }
  }

  function reset() {
    setStep(1)
    setSelectedService(null)
    setSelectedStaff(null)
    setSelectedTime('')
    setCustomer({ name: '', phone: '', email: '', note: '' })
    setBooked(null)
  }

  // Generate next 14 days for date selector
  const dateOptions = useMemo(() => {
    const dates: { value: string; label: string; dayLabel: string; isClosed: boolean }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 14; i++) {
      const d = new Date(today.getTime() + i * 86400000)
      const dk = dayKeyFromDate(d)
      const sched = workingHours[dk]
      const isClosed = !sched || sched.closed
      dates.push({
        value: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
        dayLabel: i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : d.toLocaleDateString('tr-TR', { weekday: 'short' }),
        isClosed,
      })
    }
    return dates
  }, [workingHours])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/20 dark:via-background dark:to-teal-950/20 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!provider) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-8 text-center max-w-md">
          <p className="text-sm text-muted-foreground">İşletme bulunamadı veya aktif değil.</p>
          {onExit && (
            <Button onClick={onExit} variant="outline" className="mt-4">
              <ChevronLeft className="w-4 h-4 mr-1" /> Geri Dön
            </Button>
          )}
        </Card>
      </div>
    )
  }

  const typeMeta = getProviderTypeMeta(provider.type)

  // SUCCESS SCREEN
  if (booked) {
    const d = new Date(booked.date)
    const end = booked.endTime ? new Date(booked.endTime) : null
    const waText = `Merhaba ${booked.customerName}, ${d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} tarihindeki randevunuz onaylanmıştır. ${provider.name}`
    const waLink = whatsappLink(booked.customerPhone, waText)

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/20 dark:via-background dark:to-teal-950/20 p-4 sm:p-6">
        <div className="max-w-xl mx-auto">
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-center text-white">
              <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h1 className="text-2xl font-bold">
                {booked.status === 'onaylandi' ? 'Randevunuz Onaylandı!' : 'Randevunuz Alındı!'}
              </h1>
              <p className="text-sm text-white/90 mt-1">
                {booked.status === 'onaylandi'
                  ? `Onaylandı · ${provider.name}`
                  : `Onay bekliyor · ${provider.name} onayladığında bilgi verilecek`}
              </p>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <CalendarIcon className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-semibold">
                      {d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')}
                      {end && ` - ${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Hizmet</div>
                      <div className="font-medium">{booked.service?.name ?? '—'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Personel</div>
                      <div className="font-medium">{booked.staff?.name ?? 'Herhangi biri'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 col-span-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Tutar</div>
                      <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(booked.price)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {booked.status === 'onaylandi' && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                      Hatırlatma için WhatsApp
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Randevu detaylarını telefonunuza gönderin:
                  </p>
                  <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700">
                    <a href={waLink} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="w-4 h-4 mr-2" />
                      WhatsApp ile Hatırlat
                    </a>
                  </Button>
                </div>
              )}
              {booked.status !== 'onaylandi' && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      Onay Bekleniyor
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Randevunuz {provider.name} tarafından onaylandığında WhatsApp üzerinden bilgilendirileceksiniz.
                  </p>
                </div>
              )}

              <div className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Store className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium">{provider.name}</span>
                </div>
                {provider.address && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <MapPin className="w-3 h-3" />
                    {provider.address}
                  </div>
                )}
                {provider.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Phone className="w-3 h-3" />
                    {provider.phone}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={reset}>
                  Yeni Randevu
                </Button>
                {onExit && (
                  <Button variant="outline" className="flex-1" onClick={onExit}>
                    Yönetim Paneline Dön
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/20 dark:via-background dark:to-teal-950/20 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          {onExit && (
            <Button size="icon" variant="ghost" onClick={onExit} className="shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          )}
          {provider.photo ? (
            <img
              src={provider.photo}
              alt={provider.name}
              className="w-12 h-12 rounded-xl object-cover shrink-0"
            />
          ) : (
            <div className={cn(
              'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-2xl shrink-0',
              typeMeta.gradient,
            )}>
              {typeMeta.emoji}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold truncate">{provider.name}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {typeMeta.label}
              {provider.district && ` · ${provider.district}`}
              {provider.city && ` / ${provider.city}`}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={s.num} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                    step > s.num
                      ? 'bg-emerald-600 text-white'
                      : step === s.num
                        ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-600'
                        : 'bg-muted text-muted-foreground',
                  )}>
                    {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
                  </div>
                  <span className={cn(
                    'text-[10px] mt-1 hidden sm:block',
                    step >= s.num ? 'text-foreground font-medium' : 'text-muted-foreground',
                  )}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn(
                    'h-0.5 flex-1 mx-1 transition-colors',
                    step > s.num ? 'bg-emerald-600' : 'bg-muted',
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            {/* Step 1: Service */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-lg">Hizmet Seçin</h2>
                  <p className="text-sm text-muted-foreground">Hangi hizmeti almak istiyorsunuz?</p>
                </div>
                {services.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Henüz hizmet tanımlanmamış.
                  </p>
                ) : (
                  servicesByCat.map(([cat, items]) => (
                    <div key={cat}>
                      <div className="flex items-center gap-2 mb-2">
                        <Tag className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                          {cat}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {items.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => selectService(s)}
                            className="text-left p-3 rounded-xl border hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-all group"
                          >
                            <div className="flex items-start gap-3">
                              {s.photo ? (
                                <img
                                  src={s.photo}
                                  alt={s.name}
                                  className="w-12 h-12 rounded-lg object-cover shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-400 to-purple-600 text-white flex items-center justify-center shrink-0">
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
                                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                                    {formatCurrency(s.price, s.currency)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Step 2: Staff */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-lg">Personel Seçin</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedService?.name} için kimden randevu almak istersiniz?
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Any staff */}
                  <button
                    type="button"
                    onClick={() => selectStaff('any')}
                    className="text-left p-3 rounded-xl border hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white flex items-center justify-center shrink-0">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm">Herhangi Biri</div>
                        <div className="text-xs text-muted-foreground">Müsait olan ilk personel</div>
                      </div>
                    </div>
                  </button>
                  {eligibleStaff.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectStaff(s)}
                      className="text-left p-3 rounded-xl border hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-all"
                    >
                      <div className="flex items-start gap-3">
                        {s.photo ? (
                          <img
                            src={s.photo}
                            alt={s.name}
                            className="w-12 h-12 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white flex items-center justify-center shrink-0">
                            <User className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{s.name}</div>
                          {s.title && (
                            <div className="text-xs text-muted-foreground truncate">{s.title}</div>
                          )}
                          {s.bio && (
                            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{s.bio}</div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {eligibleStaff.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Bu hizmeti verebilecek personel bulunamadı.
                  </p>
                )}
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Geri
                </Button>
              </div>
            )}

            {/* Step 3: Date & Time */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-lg">Tarih ve Saat</h2>
                  <p className="text-sm text-muted-foreground">Müsait bir zaman seçin</p>
                </div>

                {/* Date selector */}
                <div>
                  <Label className="text-xs text-muted-foreground">Tarih</Label>
                  <div className="flex gap-2 overflow-x-auto pb-2 mt-1.5 -mx-1 px-1 custom-scroll">
                    {dateOptions.map((d) => {
                      const isSelected = selectedDate === d.value
                      return (
                        <button
                          key={d.value}
                          type="button"
                          disabled={d.isClosed}
                          onClick={() => { setSelectedDate(d.value); setSelectedTime('') }}
                          className={cn(
                            'shrink-0 w-16 p-2 rounded-xl border text-center transition-all',
                            d.isClosed && 'opacity-40 cursor-not-allowed',
                            isSelected
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'hover:border-emerald-400 hover:bg-emerald-50/30',
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
                  <Label className="text-xs text-muted-foreground">
                    Saat {selectedService && `(${selectedService.duration} dk)`}
                  </Label>
                  {availLoading ? (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-1.5">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : availData && availData.slots.length > 0 ? (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-1.5">
                      {availData.slots.map((t) => {
                        const isSelected = selectedTime === t
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => selectTime(t)}
                            className={cn(
                              'h-10 rounded-lg border text-sm font-medium transition-all',
                              isSelected
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'hover:border-emerald-400 hover:bg-emerald-50/30',
                            )}
                          >
                            {t}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      Bu gün için müsait saat yok. Lütfen başka bir gün seçin.
                    </div>
                  )}
                </div>

                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Geri
                </Button>
              </div>
            )}

            {/* Step 4: Customer Info */}
            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-lg">İletişim Bilgileri</h2>
                  <p className="text-sm text-muted-foreground">Randevu onayı için bilgilerinizi girin</p>
                </div>

                {/* Summary */}
                <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <Scissors className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{selectedService?.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      {selectedStaff === 'any' || !selectedStaff
                        ? 'Herhangi biri'
                        : selectedStaff.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      {new Date(selectedDate + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      {' · '}
                      {selectedTime}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                    <Tag className="w-3.5 h-3.5" />
                    <span>{formatCurrency(selectedService?.price ?? 0)}</span>
                  </div>
                </div>

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

                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setStep(3)} className="flex-1">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Geri
                  </Button>
                  <Button
                    onClick={handleBook}
                    disabled={booking || !customer.name.trim() || !customer.phone.trim()}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-11"
                  >
                    {booking ? 'Oluşturuluyor...' : 'Randevuyu Onayla'}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 5: Success handled above */}
          </CardContent>
        </Card>

        {/* Footer info */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          <Store className="w-3 h-3 inline mr-1" />
          {provider.name} · {provider.phone && (
            <>
              <Phone className="w-3 h-3 inline mx-1" />
              {formatPhone(provider.phone)}
            </>
          )}
        </p>
      </div>
    </div>
  )
}
