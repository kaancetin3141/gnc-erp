'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  getStatusMeta, APPOINTMENT_STATUSES, type AppointmentStatus,
  type WorkingHours, type DaySchedule, dayKeyFromDate, minutesToTime,
  timeToMinutes,
} from '@/lib/appointment-utils'
import { formatCurrency, whatsappLink, formatPhone } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus,
  Phone, MessageCircle, CheckCircle2, XCircle,
  UserX, Check, Clock, Trash2, Pencil, CalendarDays,
} from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

interface Staff {
  id: string
  name: string
  title: string | null
  photo: string | null
}

interface Service {
  id: string
  name: string
  duration: number
  price: number
  currency: string
}

interface Appointment {
  id: string
  staffId: string | null
  serviceId: string | null
  customerName: string
  customerPhone: string
  customerEmail: string | null
  customerNote: string | null
  date: string
  endTime: string | null
  status: string
  price: number
  notes: string | null
  source: string
  staff?: Staff | null
  service?: Service | null
}

interface ApptsResponse { items: Appointment[] }
interface StaffResponse { items: Staff[] }
interface ServiceResponse { items: Service[] }
interface ProviderResponse {
  workingHours: string
}

// ============================================================
// Calendar (Day/Week view)
// ============================================================

interface CalendarProps {
  providerId: string
}

export function AppointmentCalendar({ providerId }: CalendarProps) {
  const qc = useQueryClient()
  const [view, setView] = useState<'day' | 'week'>('day')
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [staffFilter, setStaffFilter] = useState<string>('all')

  // Detail dialog
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null)

  // Provider (çalışma saatleri)
  const { data: providerData } = useQuery({
    queryKey: ['appointment-provider', providerId],
    queryFn: () => apiGet<ProviderResponse>(`/api/appointments/providers/${providerId}`),
    enabled: !!providerId,
  })

  const workingHours: WorkingHours = useMemo(() => {
    if (!providerData?.workingHours) return {}
    try {
      return JSON.parse(providerData.workingHours) as WorkingHours
    } catch {
      return {}
    }
  }, [providerData])

  const { data: staffData } = useQuery({
    queryKey: ['appointment-staff', providerId],
    queryFn: () => apiGet<StaffResponse>(`/api/appointments/providers/${providerId}/staff`),
    enabled: !!providerId,
  })
  const staffList = staffData?.items ?? []

  const { data: serviceData } = useQuery({
    queryKey: ['appointment-services', providerId],
    queryFn: () => apiGet<ServiceResponse>(`/api/appointments/providers/${providerId}/services`),
    enabled: !!providerId,
  })
  const services = serviceData?.items ?? []

  const dateRange = useMemo(() => {
    const start = new Date(currentDate)
    start.setHours(0, 0, 0, 0)
    if (view === 'week') {
      const day = (start.getDay() + 6) % 7
      start.setDate(start.getDate() - day)
    }
    const days: Date[] = []
    const numDays = view === 'week' ? 7 : 1
    for (let i = 0; i < numDays; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      days.push(d)
    }
    return days
  }, [currentDate, view])

  const rangeStart = dateRange[0]
  const rangeEnd = new Date(dateRange[dateRange.length - 1].getTime() + 24 * 60 * 60_000)

  const { data: apptData, isLoading } = useQuery({
    queryKey: ['appointment-appointments', providerId, rangeStart.toISOString(), rangeEnd.toISOString(), staffFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        startDate: rangeStart.toISOString(),
        endDate: rangeEnd.toISOString(),
      })
      if (staffFilter !== 'all') params.set('staffId', staffFilter)
      return apiGet<ApptsResponse>(
        `/api/appointments/providers/${providerId}/appointments?${params.toString()}`,
      )
    },
    enabled: !!providerId,
  })
  const appointments = apptData?.items ?? []

  const { visStart, visEnd } = useMemo(() => {
    let minMin = 24 * 60
    let maxMin = 0
    for (const day of dateRange) {
      const dk = dayKeyFromDate(day)
      const sched: DaySchedule | undefined = workingHours[dk]
      if (!sched || sched.closed || !sched.start || !sched.end) continue
      minMin = Math.min(minMin, timeToMinutes(sched.start))
      maxMin = Math.max(maxMin, timeToMinutes(sched.end))
    }
    if (minMin === 24 * 60) minMin = 9 * 60
    if (maxMin === 0) maxMin = 19 * 60
    return { visStart: minMin, visEnd: maxMin }
  }, [dateRange, workingHours])

  const hourSlots = useMemo(() => {
    const slots: { min: number; label: string }[] = []
    for (let m = visStart; m < visEnd; m += 30) {
      slots.push({ min: m, label: minutesToTime(m) })
    }
    return slots
  }, [visStart, visEnd])

  const apptsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const appt of appointments) {
      const d = new Date(appt.date)
      const key = d.toDateString()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(appt)
    }
    return map
  }, [appointments])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editAppt, setEditAppt] = useState<Appointment | null>(null)
  const [form, setForm] = useState({
    staffId: 'any',
    serviceId: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerNote: '',
    date: '',
    time: '',
    status: 'beklemede' as AppointmentStatus,
  })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null)

  function prevPeriod() {
    const d = new Date(currentDate)
    d.setDate(d.getDate() - (view === 'week' ? 7 : 1))
    setCurrentDate(d)
  }
  function nextPeriod() {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + (view === 'week' ? 7 : 1))
    setCurrentDate(d)
  }
  function goToday() {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    setCurrentDate(d)
  }

  function openCreate(date?: Date, hour?: number, minute?: number) {
    setEditAppt(null)
    const targetDate = date ?? new Date()
    targetDate.setHours(hour ?? 10, minute ?? 0, 0, 0)
    setForm({
      staffId: staffFilter !== 'all' ? staffFilter : 'any',
      serviceId: services[0]?.id ?? '',
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      customerNote: '',
      date: targetDate.toISOString().slice(0, 10),
      time: `${String(targetDate.getHours()).padStart(2, '0')}:${String(targetDate.getMinutes()).padStart(2, '0')}`,
      status: 'beklemede',
    })
    setDialogOpen(true)
  }

  function openEdit(appt: Appointment) {
    setDetailAppt(null)
    setEditAppt(appt)
    const d = new Date(appt.date)
    setForm({
      staffId: appt.staffId ?? 'any',
      serviceId: appt.serviceId ?? '',
      customerName: appt.customerName,
      customerPhone: appt.customerPhone,
      customerEmail: appt.customerEmail ?? '',
      customerNote: appt.customerNote ?? '',
      date: d.toISOString().slice(0, 10),
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      status: appt.status as AppointmentStatus,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.customerName.trim()) {
      toast.error('Müşteri adı gerekli')
      return
    }
    if (!form.customerPhone.trim()) {
      toast.error('Müşteri telefonu gerekli')
      return
    }
    if (!form.serviceId) {
      toast.error('Hizmet seçimi gerekli')
      return
    }
    if (!form.date || !form.time) {
      toast.error('Tarih ve saat gerekli')
      return
    }
    setSaving(true)
    try {
      const [y, m, d] = form.date.split('-').map(Number)
      const [hh, mm] = form.time.split(':').map(Number)
      const start = new Date(y, m - 1, d, hh, mm, 0, 0)
      const payload = {
        staffId: form.staffId,
        serviceId: form.serviceId,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail || undefined,
        customerNote: form.customerNote || undefined,
        date: start.toISOString(),
        status: form.status,
      }
      if (editAppt) {
        await apiPatch(
          `/api/appointments/providers/${providerId}/appointments/${editAppt.id}`,
          payload,
        )
        toast.success('Randevu güncellendi')
      } else {
        await apiPost(
          `/api/appointments/providers/${providerId}/appointments`,
          payload,
        )
        toast.success('Randevu oluşturuldu')
      }
      qc.invalidateQueries({ queryKey: ['appointment-appointments', providerId] })
      setDialogOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(appt: Appointment, status: AppointmentStatus) {
    try {
      await apiPatch(
        `/api/appointments/providers/${providerId}/appointments/${appt.id}`,
        { status },
      )
      qc.invalidateQueries({ queryKey: ['appointment-appointments', providerId] })
      setDetailAppt(null)
      toast.success(`Durum: ${getStatusMeta(status).label}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await apiDelete(
        `/api/appointments/providers/${providerId}/appointments/${deleteTarget.id}`,
      )
      qc.invalidateQueries({ queryKey: ['appointment-appointments', providerId] })
      toast.success('Randevu iptal edildi')
      setDeleteTarget(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İptal edilemedi')
    }
  }

  if (isLoading) {
    return (
      <Card>
        <Skeleton className="h-96 w-full" />
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="icon" variant="outline" className="h-9 w-9" onClick={prevPeriod}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={goToday}>
                Bugün
              </Button>
              <Button size="icon" variant="outline" className="h-9 w-9" onClick={nextPeriod}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <CalendarIcon className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold text-sm truncate">
                {view === 'day'
                  ? currentDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })
                  : `${rangeStart.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} - ${new Date(rangeEnd.getTime() - 86400000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Select value={staffFilter} onValueChange={setStaffFilter}>
                <SelectTrigger className="h-9 w-40 text-xs">
                  <SelectValue placeholder="Tüm personel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Personel</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex border rounded-md overflow-hidden">
                <Button
                  size="sm"
                  variant={view === 'day' ? 'default' : 'ghost'}
                  className={cn('rounded-none h-9', view === 'day' && 'bg-emerald-600 hover:bg-emerald-700')}
                  onClick={() => setView('day')}
                >
                  Gün
                </Button>
                <Button
                  size="sm"
                  variant={view === 'week' ? 'default' : 'ghost'}
                  className={cn('rounded-none h-9', view === 'week' && 'bg-emerald-600 hover:bg-emerald-700')}
                  onClick={() => setView('week')}
                >
                  Hafta
                </Button>
              </div>
              <Button size="sm" onClick={() => openCreate()} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Randevu</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className={cn('grid min-w-[640px]', view === 'week' ? 'grid-cols-[60px_repeat(7,1fr)]' : 'grid-cols-[60px_1fr]')}>
            <div className="border-b border-r bg-muted/30 p-2 text-[10px] text-muted-foreground text-right">
              S
            </div>
            {dateRange.map((d) => {
              const isToday = d.toDateString() === new Date().toDateString()
              const dk = dayKeyFromDate(d)
              const sched = workingHours[dk]
              const isClosed = !sched || sched.closed
              return (
                <div
                  key={d.toISOString()}
                  className={cn(
                    'border-b border-r p-2 text-center',
                    isToday && 'bg-emerald-50 dark:bg-emerald-950/20',
                    isClosed && 'bg-muted/20',
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {d.toLocaleDateString('tr-TR', { weekday: 'short' })}
                  </div>
                  <div className={cn('text-sm font-semibold', isToday && 'text-emerald-600')}>
                    {d.getDate()}
                  </div>
                  {isClosed && (
                    <div className="text-[9px] text-muted-foreground">kapalı</div>
                  )}
                </div>
              )
            })}

            {hourSlots.map((slot) => (
              <SlotRow
                key={slot.min}
                slot={slot}
                dateRange={dateRange}
                apptsByDay={apptsByDay}
                workingHours={workingHours}
                onSlotClick={(date) => openCreate(date, slot.min / 60, slot.min % 60)}
                onApptClick={(appt) => setDetailAppt(appt)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
        <span>Durum:</span>
        {APPOINTMENT_STATUSES.slice(0, 5).map((s) => (
          <span key={s.value} className="flex items-center gap-1">
            <span className={cn('w-2.5 h-2.5 rounded-sm', s.bg)} />
            {s.label}
          </span>
        ))}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailAppt} onOpenChange={(o) => !o && setDetailAppt(null)}>
        <DialogContent className="max-w-md">
          {detailAppt && (() => {
            const meta = getStatusMeta(detailAppt.status)
            const d = new Date(detailAppt.date)
            const end = detailAppt.endTime ? new Date(detailAppt.endTime) : null
            const waLink = whatsappLink(
              detailAppt.customerPhone,
              `Merhaba ${detailAppt.customerName}, ${d.toLocaleDateString('tr-TR')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} tarihli randevunuz hakkında hatırlatma.`,
            )
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-emerald-600" />
                    Randevu Detayı
                  </DialogTitle>
                  <DialogDescription>
                    {d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    {' · '}
                    {String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')}
                    {end && ` - ${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className={cn('rounded-lg p-3 border', meta.bg, meta.border)}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-base">{detailAppt.customerName}</div>
                      <Badge className={cn(meta.bg, meta.color, 'border-0')}>{meta.label}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Hizmet</div>
                      <div className="font-medium">{detailAppt.service?.name ?? '—'}</div>
                      {detailAppt.service && (
                        <div className="text-xs text-muted-foreground">
                          {detailAppt.service.duration} dk · {formatCurrency(detailAppt.service.price, detailAppt.service.currency)}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Personel</div>
                      <div className="font-medium">{detailAppt.staff?.name ?? 'Herhangi biri'}</div>
                      {detailAppt.staff?.title && (
                        <div className="text-xs text-muted-foreground">{detailAppt.staff.title}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Telefon</div>
                      <a href={`tel:${detailAppt.customerPhone}`} className="font-medium text-emerald-700 dark:text-emerald-300 hover:underline">
                        {formatPhone(detailAppt.customerPhone)}
                      </a>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">E-posta</div>
                      <div className="font-medium truncate">{detailAppt.customerEmail || '—'}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-xs text-muted-foreground">Tutar</div>
                      <div className="font-semibold text-lg">{formatCurrency(detailAppt.price)}</div>
                    </div>
                    {detailAppt.customerNote && (
                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground">Müşteri Notu</div>
                        <div className="text-sm bg-muted/30 p-2 rounded">{detailAppt.customerNote}</div>
                      </div>
                    )}
                    {detailAppt.notes && (
                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground">İç Notlar</div>
                        <div className="text-sm bg-muted/30 p-2 rounded">{detailAppt.notes}</div>
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row">
                  <div className="flex flex-wrap gap-1.5 w-full">
                    <Button size="sm" variant="outline" asChild>
                      <a href={waLink} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="w-3.5 h-3.5 mr-1" />
                        WhatsApp
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`tel:${detailAppt.customerPhone}`}>
                        <Phone className="w-3.5 h-3.5 mr-1" />
                        Ara
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(detailAppt)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Düzenle
                    </Button>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Durum Değiştir
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Durumu değiştir</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleStatusChange(detailAppt, 'onaylandi')}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Onayla
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(detailAppt, 'tamamlandi')}>
                        <Check className="w-3.5 h-3.5 mr-2 text-teal-600" /> Tamamlandı
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(detailAppt, 'beklemede')}>
                        <Clock className="w-3.5 h-3.5 mr-2 text-amber-600" /> Beklemede
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(detailAppt, 'gelmedi')}>
                        <UserX className="w-3.5 h-3.5 mr-2 text-rose-600" /> Gelmedi
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(detailAppt, 'iptal')}
                        className="text-red-600"
                      >
                        <XCircle className="w-3.5 h-3.5 mr-2" /> İptal Et
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editAppt ? 'Randevu Düzenle' : 'Yeni Randevu'}</DialogTitle>
            <DialogDescription>
              {editAppt ? 'Randevu bilgilerini güncelleyin.' : 'Yeni randevu oluşturun.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="a-date" className="text-xs">Tarih</Label>
                <Input
                  id="a-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="a-time" className="text-xs">Saat</Label>
                <Input
                  id="a-time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="a-service" className="text-xs">Hizmet *</Label>
              <Select value={form.serviceId} onValueChange={(v) => setForm((f) => ({ ...f, serviceId: v }))}>
                <SelectTrigger id="a-service" className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Hizmet seçin" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {s.duration}dk · {formatCurrency(s.price, s.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="a-staff" className="text-xs">Personel</Label>
              <Select value={form.staffId} onValueChange={(v) => setForm((f) => ({ ...f, staffId: v }))}>
                <SelectTrigger id="a-staff" className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Personel seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Herhangi biri</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{s.title ? ` · ${s.title}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="a-name" className="text-xs">Müşteri Adı *</Label>
                <Input
                  id="a-name"
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  placeholder="Ad Soyad"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="a-phone" className="text-xs">Telefon *</Label>
                <Input
                  id="a-phone"
                  value={form.customerPhone}
                  onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                  placeholder="+90 5xx..."
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="a-email" className="text-xs">E-posta (opsiyonel)</Label>
              <Input
                id="a-email"
                type="email"
                value={form.customerEmail}
                onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))}
                placeholder="email@..."
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="a-note" className="text-xs">Müşteri Notu</Label>
              <Textarea
                id="a-note"
                value={form.customerNote}
                onChange={(e) => setForm((f) => ({ ...f, customerNote: e.target.value }))}
                placeholder="Özel istekler..."
                className="mt-1 resize-none text-sm"
                rows={2}
              />
            </div>
            {editAppt && (
              <div>
                <Label htmlFor="a-status" className="text-xs">Durum</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as AppointmentStatus }))}>
                  <SelectTrigger id="a-status" className="mt-1 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPOINTMENT_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            {editAppt && (
              <Button
                variant="outline"
                className="text-red-600 hover:text-red-700 mr-auto"
                onClick={() => { setDeleteTarget(editAppt); setDialogOpen(false) }}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                İptal Et
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Kapat
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Kaydediliyor...' : editAppt ? 'Güncelle' : 'Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Randevuyu iptal et</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.customerName}</strong> adına ait randevuyu iptal etmek istediğinize emin misiniz?
              (Randevu silinmez, durumu "iptal" olarak işaretlenir.)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              İptal Et
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================
// Slot row — bir zaman dilimi için tüm günleri render eder
// ============================================================

function SlotRow({
  slot,
  dateRange,
  apptsByDay,
  workingHours,
  onSlotClick,
  onApptClick,
}: {
  slot: { min: number; label: string }
  dateRange: Date[]
  apptsByDay: Map<string, Appointment[]>
  workingHours: WorkingHours
  onSlotClick: (date: Date) => void
  onApptClick: (appt: Appointment) => void
}) {
  const isHourLine = slot.min % 60 === 0
  return (
    <>
      <div
        className={cn(
          'border-r border-b bg-muted/20 p-1 text-[10px] text-muted-foreground text-right align-top',
          isHourLine ? 'border-b-border' : 'border-b-muted/40',
        )}
      >
        {isHourLine ? slot.label : ''}
      </div>
      {dateRange.map((d) => {
        const dk = dayKeyFromDate(d)
        const sched = workingHours[dk]
        const isClosed = !sched || sched.closed || !sched.start || !sched.end
        const inHours = !isClosed &&
          slot.min >= timeToMinutes(sched!.start!) &&
          slot.min < timeToMinutes(sched!.end!)

        const dayAppts = apptsByDay.get(d.toDateString()) ?? []
        const slotAppts = dayAppts.filter((a) => {
          const ad = new Date(a.date)
          const aMin = ad.getHours() * 60 + ad.getMinutes()
          return aMin >= slot.min && aMin < slot.min + 30
        })

        return (
          <div
            key={`${d.toISOString()}-${slot.min}`}
            className={cn(
              'border-r border-b relative h-7 group',
              isHourLine ? 'border-b-border' : 'border-b-muted/40',
              inHours ? 'bg-card hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 cursor-pointer' : 'bg-muted/10',
            )}
            onClick={() => inHours && onSlotClick(new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(slot.min / 60), slot.min % 60))}
          >
            {slotAppts.map((appt) => {
              const meta = getStatusMeta(appt.status)
              const isCancelled = appt.status === 'iptal' || appt.status === 'reddedildi'
              return (
                <button
                  key={appt.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onApptClick(appt) }}
                  className={cn(
                    'absolute inset-x-0.5 top-0.5 px-1.5 py-0.5 rounded text-[10px] text-left truncate transition-shadow hover:shadow-md z-10',
                    meta.bg, meta.color,
                    isCancelled && 'opacity-50 line-through',
                  )}
                  title={`${appt.customerName} · ${appt.service?.name ?? ''} · ${appt.staff?.name ?? 'Herhangi biri'}`}
                >
                  <span className="font-semibold">{appt.customerName}</span>
                  {appt.service && <span className="opacity-80"> · {appt.service.name}</span>}
                </button>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
