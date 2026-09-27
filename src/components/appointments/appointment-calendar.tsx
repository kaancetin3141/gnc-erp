'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
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
import { RejectDialog, type RejectTarget } from './reject-dialog'
import { CustomerHistoryDialog } from './customer-history-dialog'
import { CustomerAutocomplete } from './customer-autocomplete'
import { CustomerDetailDialog } from './customer-manager'
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus,
  Phone, MessageCircle, CheckCircle2, XCircle, Ban, History,
  UserX, Check, Clock, Trash2, Pencil, CalendarDays, AlertTriangle,
  Users, Move, LayoutGrid,
} from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

interface Staff {
  id: string
  name: string
  title: string | null
  photo: string | null
  isActive?: boolean
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
  customerId?: string | null
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

type ApptsResponse = Appointment[]
interface StaffResponse { items: Staff[] }
interface ServiceResponse { items: Service[] }
interface ProviderResponse {
  workingHours: string
  autoApprove?: boolean
}

const STAFF_COLORS = [
  'bg-emerald-600', 'bg-teal-600', 'bg-amber-600', 'bg-rose-500',
  'bg-violet-600', 'bg-cyan-600', 'bg-orange-500', 'bg-pink-500',
]

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

function apptEndMs(a: Appointment) {
  const st = new Date(a.date).getTime()
  return a.endTime ? new Date(a.endTime).getTime() : st + (a.service?.duration || 30) * 60_000
}

function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Slot hücresi tanımı — gün/hafta ve personel görünümünde ortak
interface SlotCellSpec {
  key: string
  date: Date
  appts: Appointment[]
  inHours: boolean
  isToday: boolean
  staffId?: string // drop hedefi (personel görünümü) — 'any' = atanmamış kolonu
}

// ============================================================
// Calendar (Day / Staff / Week view)
// ============================================================

interface CalendarProps {
  providerId: string
}

export function AppointmentCalendar({ providerId }: CalendarProps) {
  const qc = useQueryClient()
  const [view, setView] = useState<'day' | 'staff' | 'week'>('day')
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [staffFilter, setStaffFilter] = useState<string>('all')

  // "Şimdi" göstergesi — her dakika güncellenir
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
  })
  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date()
      setNowMin(n.getHours() * 60 + n.getMinutes())
    }, 60_000)
    return () => clearInterval(t)
  }, [])

  // Detail dialog
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null)
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null)
  const [historyTarget, setHistoryTarget] = useState<{ name: string; phone: string } | null>(null)

  // Sürükle-bırak
  const [dragAppt, setDragAppt] = useState<Appointment | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

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
    queryFn: () => apiGet<StaffResponse | Staff[]>(`/api/appointments/providers/${providerId}/staff`),
    enabled: !!providerId,
  })
  const staffList = useMemo(() => (Array.isArray(staffData) ? staffData : staffData?.items ?? []), [staffData])

  const { data: serviceData } = useQuery({
    queryKey: ['appointment-services', providerId],
    queryFn: () => apiGet<ServiceResponse | Service[]>(`/api/appointments/providers/${providerId}/services`),
    enabled: !!providerId,
  })
  const services = useMemo(() => (Array.isArray(serviceData) ? serviceData : serviceData?.items ?? []), [serviceData])

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
  const appointments = useMemo(() => (Array.isArray(apptData) ? apptData : (apptData as unknown as { items?: Appointment[] })?.items ?? []), [apptData])

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

  const todayKey = new Date().toDateString()

  // ---------- Doluluk (utilization) ----------
  const utilByDay = useMemo(() => {
    const map = new Map<string, { pct: number; booked: number; work: number; count: number }>()
    for (const day of dateRange) {
      const dk = dayKeyFromDate(day)
      const sched = workingHours[dk]
      const workMin = !sched || sched.closed || !sched.start || !sched.end
        ? 0
        : Math.max(0, timeToMinutes(sched.end) - timeToMinutes(sched.start))
      const list = apptsByDay.get(day.toDateString()) ?? []
      const booked = list
        .filter((a) => ['beklemede', 'onaylandi', 'tamamlandi'].includes(a.status))
        .reduce((s, a) => s + Math.max(0, (apptEndMs(a) - new Date(a.date).getTime()) / 60_000), 0)
      const pct = workMin > 0 ? Math.min(100, Math.round((booked / workMin) * 100)) : 0
      map.set(day.toDateString(), {
        pct,
        booked,
        work: workMin,
        count: list.filter((a) => !['iptal', 'reddedildi'].includes(a.status)).length,
      })
    }
    return map
  }, [dateRange, apptsByDay, workingHours])

  // ---------- Çakışma tespiti (görsel) ----------
  const overlapIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [, list] of apptsByDay) {
      const active = list.filter((a) => ['beklemede', 'onaylandi'].includes(a.status))
      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          const a = active[i]
          const b = active[j]
          if (a.staffId && b.staffId && a.staffId !== b.staffId) continue
          const aStart = new Date(a.date).getTime()
          const bStart = new Date(b.date).getTime()
          if (aStart < apptEndMs(b) && bStart < apptEndMs(a)) {
            ids.add(a.id)
            ids.add(b.id)
          }
        }
      }
    }
    return ids
  }, [apptsByDay])

  // ---------- Personel görünümü kolonları ----------
  const staffColumns = useMemo(() => {
    if (view !== 'staff') return []
    let cols: { id: string; name: string; title: string | null }[] = staffList
      .filter((s) => s.isActive !== false)
      .map((s) => ({ id: s.id, name: s.name, title: s.title }))
    if (staffFilter !== 'all') {
      cols = cols.filter((c) => c.id === staffFilter)
    }
    const dayAppts = apptsByDay.get(dateRange[0].toDateString()) ?? []
    if (dayAppts.some((a) => !a.staffId) && staffFilter === 'all') {
      cols.push({ id: 'unassigned', name: 'Atanmamış', title: null })
    }
    return cols
  }, [view, staffList, staffFilter, apptsByDay, dateRange])

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
  const [customerDetailId, setCustomerDetailId] = useState<string | null>(null)

  // ---------- Form çakışma uyarısı ----------
  const formConflicts = useMemo(() => {
    if (!form.date || !form.time || !form.serviceId) return []
    const [y, m, d] = form.date.split('-').map(Number)
    const [hh, mm] = form.time.split(':').map(Number)
    if (!y || !m || !d || isNaN(hh) || isNaN(mm)) return []
    const start = new Date(y, m - 1, d, hh, mm, 0, 0)
    const svc = services.find((s) => s.id === form.serviceId)
    const end = new Date(start.getTime() + (svc?.duration || 30) * 60_000)
    const sid = form.staffId === 'any' ? null : form.staffId
    return appointments.filter((a) => {
      if (editAppt && a.id === editAppt.id) return false
      if (!['beklemede', 'onaylandi', 'tamamlandi'].includes(a.status)) return false
      if (sid) {
        if (a.staffId !== sid) return false
      } else if (a.staffId) {
        return false
      }
      const as = new Date(a.date)
      if (as.toDateString() !== start.toDateString()) return false
      const aeMs = apptEndMs(a)
      return as < end && aeMs > start.getTime()
    })
  }, [form, appointments, editAppt, services])

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

  function openCreate(date?: Date, hour?: number, minute?: number, staffOverride?: string) {
    setEditAppt(null)
    const targetDate = date ?? new Date()
    targetDate.setHours(hour ?? 10, minute ?? 0, 0, 0)
    setForm({
      staffId: staffOverride ?? (staffFilter !== 'all' ? staffFilter : 'any'),
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
        staffId: form.staffId === 'any' ? undefined : form.staffId,
        serviceId: form.serviceId,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail || undefined,
        customerNote: form.customerNote || undefined,
        date: start.toISOString(),
        status: form.status,
        // Çakışma varsa kullanıcı uyarıldı — bilinçli override
        force: formConflicts.length > 0 ? true : undefined,
      }
      if (editAppt) {
        await apiPatch(
          `/api/appointments/providers/${providerId}/appointments/${editAppt.id}`,
          { ...payload, staffId: form.staffId },
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

  // ---------- Sürükle-bırak taşıma ----------
  async function handleDrop(target: Date, staffColId?: string) {
    const appt = dragAppt
    setDragAppt(null)
    setDragOverKey(null)
    if (!appt) return
    // target = hedef hücrenin TAM tarihi + saati (gün/hafta/personel görünümünden)
    const old = new Date(appt.date)
    const nd = target
    const newStaff = staffColId === undefined ? undefined : staffColId === 'any' ? 'any' : staffColId
    const sameTime = nd.getTime() === old.getTime()
    const sameStaff = newStaff === undefined || newStaff === (appt.staffId ?? 'any')
    if (sameTime && sameStaff) return
    try {
      const payload: Record<string, unknown> = { date: nd.toISOString() }
      if (newStaff !== undefined) payload.staffId = newStaff
      await apiPatch(`/api/appointments/providers/${providerId}/appointments/${appt.id}`, payload)
      qc.invalidateQueries({ queryKey: ['appointment-appointments', providerId] })
      toast.success('Randevu taşındı', {
        description: `${appt.customerName} → ${nd.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' })} ${hhmm(nd)}`,
      })
    } catch (e) {
      toast.error('Taşıma başarısız', {
        description: e instanceof Error ? e.message : 'Saat dilimi dolu olabilir',
      })
    }
  }

  // handleDrop'a her zaman güncel erişim (native document dinleyicileri için)
  const handleDropRef = useRef(handleDrop)
  handleDropRef.current = handleDrop

  // Sürükleme aktifken document-seviyesi native dragover/drop —
  // React'ın root capture-phase drop kaydı untrusted event'lerde tetiklenmediği için
  // native dinleyici kullanılır (gerçek tarayıcı + otomasyon uyumlu).
  useEffect(() => {
    if (!dragAppt) return
    const onDocDragOver = (e: DragEvent) => {
      const cell = (e.target as HTMLElement | null)?.closest?.('[data-appt-cell]') as HTMLElement | null
      if (cell && cell.dataset.inHours === '1') {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        const key = cell.dataset.cellKey ?? null
        setDragOverKey((prev) => (prev === key ? prev : key))
      } else {
        setDragOverKey((prev) => (prev === null ? prev : null))
      }
    }
    const onDocDrop = (e: DragEvent) => {
      const cell = (e.target as HTMLElement | null)?.closest?.('[data-appt-cell]') as HTMLElement | null
      if (!cell) return
      e.preventDefault()
      const dayIso = cell.dataset.dayIso
      const slotMin = Number(cell.dataset.slotMin)
      if (!dayIso || isNaN(slotMin)) return
      const d = new Date(dayIso)
      const staffId = cell.dataset.staffId // undefined = personeli koru (gün/hafta)
      handleDropRef.current(
        new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(slotMin / 60), slotMin % 60),
        staffId,
      )
    }
    const onDocDragEnd = () => {
      setDragAppt(null)
      setDragOverKey(null)
    }
    document.addEventListener('dragover', onDocDragOver)
    document.addEventListener('drop', onDocDrop)
    document.addEventListener('dragend', onDocDragEnd)
    return () => {
      document.removeEventListener('dragover', onDocDragOver)
      document.removeEventListener('drop', onDocDrop)
      document.removeEventListener('dragend', onDocDragEnd)
    }
  }, [dragAppt])

  // ---------- Slot hücresi üretimi ----------
  function buildDayWeekCells(slot: { min: number }): SlotCellSpec[] {
    return dateRange.map((d) => {
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
      return {
        key: `${d.toISOString()}-${slot.min}`,
        date: d,
        appts: slotAppts,
        inHours,
        isToday: d.toDateString() === todayKey,
      }
    })
  }

  function buildStaffCells(slot: { min: number }): SlotCellSpec[] {
    const day = dateRange[0]
    const dk = dayKeyFromDate(day)
    const sched = workingHours[dk]
    const inHours = !!sched && !sched.closed && !!sched.start && !!sched.end &&
      slot.min >= timeToMinutes(sched.start) &&
      slot.min < timeToMinutes(sched.end)
    const dayAppts = apptsByDay.get(day.toDateString()) ?? []
    return staffColumns.map((col) => {
      const colAppts = dayAppts.filter((a) => {
        if (col.id === 'unassigned') return !a.staffId
        return a.staffId === col.id
      }).filter((a) => {
        const ad = new Date(a.date)
        const aMin = ad.getHours() * 60 + ad.getMinutes()
        return aMin >= slot.min && aMin < slot.min + 30
      })
      return {
        key: `${col.id}-${slot.min}`,
        date: day,
        appts: colAppts,
        inHours,
        isToday: day.toDateString() === todayKey,
        staffId: col.id === 'unassigned' ? 'any' : col.id,
      }
    })
  }

  function handleSlotClick(cell: SlotCellSpec, hour: number, minute: number) {
    openCreate(
      new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate(), hour, minute),
      hour,
      minute,
      cell.staffId && cell.staffId !== 'any' ? cell.staffId : undefined,
    )
  }

  if (isLoading) {
    return (
      <Card>
        <Skeleton className="h-96 w-full" />
      </Card>
    )
  }

  const utilToday = utilByDay.get(dateRange[0].toDateString())
  const gridCols = view === 'week'
    ? 'grid-cols-[60px_repeat(7,1fr)]'
    : 'grid-cols-[60px_1fr]'

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
                {view === 'week'
                  ? `${rangeStart.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} - ${new Date(rangeEnd.getTime() - 86400000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : currentDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}
              </span>
              {/* Doluluk göstergesi */}
              {view !== 'week' && utilToday && utilToday.work > 0 && (
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        utilToday.pct > 90 ? 'bg-rose-500' : utilToday.pct > 70 ? 'bg-amber-500' : 'bg-emerald-500',
                      )}
                      style={{ width: `${utilToday.pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                    %{utilToday.pct} dolu
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
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
                  className={cn('rounded-none h-9 px-2.5', view === 'day' && 'bg-emerald-600 hover:bg-emerald-700')}
                  onClick={() => setView('day')}
                >
                  <CalendarDays className="w-3.5 h-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Gün</span>
                </Button>
                <Button
                  size="sm"
                  variant={view === 'staff' ? 'default' : 'ghost'}
                  className={cn('rounded-none h-9 px-2.5', view === 'staff' && 'bg-emerald-600 hover:bg-emerald-700')}
                  onClick={() => setView('staff')}
                >
                  <Users className="w-3.5 h-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Personel</span>
                </Button>
                <Button
                  size="sm"
                  variant={view === 'week' ? 'default' : 'ghost'}
                  className={cn('rounded-none h-9 px-2.5', view === 'week' && 'bg-emerald-600 hover:bg-emerald-700')}
                  onClick={() => setView('week')}
                >
                  <LayoutGrid className="w-3.5 h-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Hafta</span>
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
      {view === 'staff' && staffColumns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Personel görünümü için önce personel ekleyin veya bu güne randevu girin
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div
              className={cn('grid', view !== 'staff' && `min-w-[640px] ${gridCols}`)}
              style={view === 'staff'
                ? {
                    gridTemplateColumns: `60px repeat(${staffColumns.length}, minmax(110px, 1fr))`,
                    minWidth: 60 + staffColumns.length * 120,
                  }
                : undefined}
            >
              {/* Başlık satırı */}
              <div className="border-b border-r bg-muted/30 p-2 text-[10px] text-muted-foreground text-right">
                S
              </div>

              {view === 'staff'
                ? staffColumns.map((col, i) => {
                    const dayAppts = apptsByDay.get(dateRange[0].toDateString()) ?? []
                    const colCount = dayAppts.filter((a) =>
                      col.id === 'unassigned' ? !a.staffId : a.staffId === col.id,
                    ).filter((a) => !['iptal', 'reddedildi'].includes(a.status)).length
                    const u = utilByDay.get(dateRange[0].toDateString())
                    return (
                      <div key={col.id} className="border-b border-r p-2 bg-muted/30">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0',
                              col.id === 'unassigned' ? 'bg-slate-400' : STAFF_COLORS[i % STAFF_COLORS.length],
                            )}
                          >
                            {col.id === 'unassigned' ? '?' : initials(col.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{col.name}</div>
                            {col.title && (
                              <div className="text-[9px] text-muted-foreground truncate">{col.title}</div>
                            )}
                          </div>
                          <span className="ml-auto text-[9px] text-muted-foreground tabular-nums shrink-0">
                            {colCount} rnd
                          </span>
                        </div>
                        {u && u.work > 0 && (
                          <div className="mt-1.5 h-1 rounded-full bg-background/80 overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                u.pct > 90 ? 'bg-rose-500' : u.pct > 70 ? 'bg-amber-500' : 'bg-emerald-500',
                              )}
                              style={{ width: `${u.pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })
                : dateRange.map((d) => {
                    const isToday = d.toDateString() === todayKey
                    const dk = dayKeyFromDate(d)
                    const sched = workingHours[dk]
                    const isClosed = !sched || sched.closed
                    const u = utilByDay.get(d.toDateString())
                    return (
                      <div
                        key={d.toISOString()}
                        className={cn(
                          'border-b border-r p-2 text-center',
                          isToday && 'bg-emerald-50 dark:bg-emerald-950/20',
                          isClosed && 'bg-muted/20',
                          view === 'week' && 'cursor-pointer hover:bg-accent/50 transition-colors',
                        )}
                        onClick={view === 'week'
                          ? () => { setCurrentDate(new Date(d.getFullYear(), d.getMonth(), d.getDate())); setView('day') }
                          : undefined}
                        title={view === 'week' ? 'Gün görünümüne geç' : undefined}
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
                        {u && u.work > 0 && (
                          <div className="mt-1 flex items-center justify-center gap-1">
                            <div className="h-0.5 w-8 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  u.pct > 90 ? 'bg-rose-500' : u.pct > 70 ? 'bg-amber-500' : 'bg-emerald-500',
                                )}
                                style={{ width: `${u.pct}%` }}
                              />
                            </div>
                            <span className="text-[8px] text-muted-foreground tabular-nums">{u.count}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}

              {/* Zaman dilimi satırları */}
              {hourSlots.map((slot) => (
                <SlotRow
                  key={slot.min}
                  slot={slot}
                  cells={view === 'staff' ? buildStaffCells(slot) : buildDayWeekCells(slot)}
                  nowMin={nowMin}
                  dragActive={!!dragAppt}
                  dragOverKey={dragOverKey}
                  overlapIds={overlapIds}
                  onSlotClick={handleSlotClick}
                  onApptClick={(appt) => setDetailAppt(appt)}
                  onDragStartAppt={setDragAppt}
                  onDragEndAppt={() => { setDragAppt(null); setDragOverKey(null) }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend + ipucu */}
      <div className="flex items-center justify-between gap-2 flex-wrap text-[10px] text-muted-foreground">
        <div className="flex items-center gap-3 flex-wrap">
          <span>Durum:</span>
          {APPOINTMENT_STATUSES.slice(0, 5).map((s) => (
            <span key={s.value} className="flex items-center gap-1">
              <span className={cn('w-2.5 h-2.5 rounded-sm', s.bg)} />
              {s.label}
            </span>
          ))}
        </div>
        <span className="flex items-center gap-1.5">
          <Move className="w-3 h-3" /> Taşımak için sürükleyin
          <span className="mx-1">·</span>
          <span className="w-2.5 h-2.5 rounded-sm ring-2 ring-rose-400" /> çakışma
        </span>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailAppt} onOpenChange={(o) => !o && setDetailAppt(null)}>
        <DialogContent className="sm:max-w-md">
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
                        <div className="text-sm bg-muted/30 p-2 rounded whitespace-pre-line">{detailAppt.notes}</div>
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (detailAppt.customerId) {
                          setCustomerDetailId(detailAppt.customerId)
                        } else {
                          setHistoryTarget({ name: detailAppt.customerName, phone: detailAppt.customerPhone })
                        }
                        setDetailAppt(null)
                      }}
                    >
                      <History className="w-3.5 h-3.5 mr-1" />
                      Müşteri Kartı
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
                        onClick={() => { setRejectTarget(detailAppt); setDetailAppt(null) }}
                        className="text-red-600"
                      >
                        <Ban className="w-3.5 h-3.5 mr-2" /> Reddet (sebep bildir)
                      </DropdownMenuItem>
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editAppt ? 'Randevu Düzenle' : 'Yeni Randevu'}</DialogTitle>
            <DialogDescription>
              {editAppt
                ? 'Randevu bilgilerini güncelleyin.'
                : providerData?.autoApprove
                  ? 'Yeni randevu oluşturun — otomatik onay açık, anında onaylanır.'
                  : 'Yeni randevu oluşturun — otomatik onay kapalı, randevu "Beklemede" oluşur.'}
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
              <CustomerAutocomplete
                providerId={providerId}
                name={form.customerName}
                phone={form.customerPhone}
                onNameChange={(v) => setForm((f) => ({ ...f, customerName: v }))}
                onPhoneChange={(v) => setForm((f) => ({ ...f, customerPhone: v }))}
              />
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
            {formConflicts.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 p-2.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Çakışma uyarısı — bu saatte {formConflicts.length} randevu var:
                </div>
                <ul className="mt-1 space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                  {formConflicts.map((c) => {
                    const cs = new Date(c.date)
                    const ce = c.endTime ? new Date(c.endTime) : null
                    return (
                      <li key={c.id}>
                        • <strong>{c.customerName}</strong> {hhmm(cs)}{ce ? `–${hhmm(ce)}` : ''}
                        {c.service?.name ? ` (${c.service.name})` : ''}
                        {c.staff?.name ? ` · ${c.staff.name}` : ' · atanmamış'}
                      </li>
                    )
                  })}
                </ul>
                <div className="text-[10px] mt-1 text-amber-600 dark:text-amber-500">
                  Kaydet&apos;e basarsanız randevu üst üste kaydedilir.
                </div>
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
            <Button
              onClick={handleSave}
              disabled={saving}
              className={cn(
                formConflicts.length > 0
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700',
              )}
            >
              {saving
                ? 'Kaydediliyor...'
                : formConflicts.length > 0
                  ? 'Çakışmaya Rağmen Kaydet'
                  : editAppt ? 'Güncelle' : 'Oluştur'}
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
              (Randevu silinmez, durumu &quot;iptal&quot; olarak işaretlenir.)
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

      {/* Reddet diyaloğu */}
      {rejectTarget && (
        <RejectDialog
          target={rejectTarget}
          providerId={providerId}
          onOpenChange={(o) => !o && setRejectTarget(null)}
          onDone={() => qc.invalidateQueries({ queryKey: ['appointment-appointments', providerId] })}
        />
      )}

      {/* Müşteri geçmişi */}
      {historyTarget && (
        <CustomerHistoryDialog
          providerId={providerId}
          customerName={historyTarget.name}
          phone={historyTarget.phone}
          onOpenChange={(o) => !o && setHistoryTarget(null)}
        />
      )}

      {/* Müşteri kayıt kartı — kayıt defterinde kayıtlıysa */}
      {customerDetailId && (
        <CustomerDetailDialog
          providerId={providerId}
          customerId={customerDetailId}
          onOpenChange={(o) => !o && setCustomerDetailId(null)}
          onUpdated={() => qc.invalidateQueries({ queryKey: ['appointment-appointments', providerId] })}
        />
      )}
    </div>
  )
}

// ============================================================
// Slot row — bir zaman dilimi için tüm kolonları render eder
// (gün/hafta: kolon = gün · personel görünümü: kolon = personel)
// ============================================================

function SlotRow({
  slot,
  cells,
  nowMin,
  dragActive,
  dragOverKey,
  overlapIds,
  onSlotClick,
  onApptClick,
  onDragStartAppt,
  onDragEndAppt,
}: {
  slot: { min: number; label: string }
  cells: SlotCellSpec[]
  nowMin: number
  dragActive: boolean
  dragOverKey: string | null
  overlapIds: Set<string>
  onSlotClick: (cell: SlotCellSpec, hour: number, minute: number) => void
  onApptClick: (appt: Appointment) => void
  onDragStartAppt: (appt: Appointment) => void
  onDragEndAppt: () => void
}) {
  const isHourLine = slot.min % 60 === 0
  const hasNow = nowMin >= slot.min && nowMin < slot.min + 30
  return (
    <>
      <div
        className={cn(
          'border-r border-b bg-muted/20 p-1 text-[10px] text-muted-foreground text-right align-top',
          isHourLine ? 'border-b-border' : 'border-b-muted/40',
        )}
      >
        {isHourLine ? slot.label : ''}
        {hasNow && <span className="block text-rose-500 font-bold leading-none">●</span>}
      </div>
      {cells.map((cell) => {
        const showNow = cell.isToday && hasNow
        return (
          <div
            key={cell.key}
            data-appt-cell
            data-cell-key={cell.key}
            data-day-iso={cell.date.toISOString()}
            data-slot-min={slot.min}
            data-in-hours={cell.inHours ? '1' : '0'}
            data-staff-id={cell.staffId}
            className={cn(
              'border-r border-b relative h-7 group',
              isHourLine ? 'border-b-border' : 'border-b-muted/40',
              cell.inHours
                ? 'bg-card hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 cursor-pointer'
                : 'bg-muted/10',
              dragActive && cell.inHours && dragOverKey === cell.key &&
                'ring-2 ring-inset ring-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30',
            )}
            onClick={() => cell.inHours && onSlotClick(cell, Math.floor(slot.min / 60), slot.min % 60)}
          >
            {showNow && (
              <div
                className="absolute left-0 right-0 h-0.5 bg-rose-500/80 z-20 pointer-events-none"
                style={{ top: Math.min(26, ((nowMin - slot.min) / 30) * 28) }}
              />
            )}
            {cell.appts.map((appt) => {
              const meta = getStatusMeta(appt.status)
              const isCancelled = appt.status === 'iptal' || appt.status === 'reddedildi'
              const hasOverlap = overlapIds.has(appt.id)
              return (
                <button
                  key={appt.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    onDragStartAppt(appt)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', appt.id)
                  }}
                  onDragEnd={onDragEndAppt}
                  onClick={(e) => { e.stopPropagation(); onApptClick(appt) }}
                  className={cn(
                    'absolute inset-x-0.5 top-0.5 px-1.5 py-0.5 rounded text-[10px] text-left truncate transition-shadow hover:shadow-md z-10 cursor-grab active:cursor-grabbing',
                    meta.bg, meta.color,
                    isCancelled && 'opacity-50 line-through',
                    hasOverlap && 'ring-2 ring-rose-400 ring-inset',
                  )}
                  title={[
                    hasOverlap ? '⚠ Çakışma!' : null,
                    appt.customerName,
                    appt.service?.name ?? '',
                    appt.staff?.name ?? 'Herhangi biri',
                  ].filter(Boolean).join(' · ')}
                >
                  {hasOverlap && <span className="mr-0.5">⚠</span>}
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
