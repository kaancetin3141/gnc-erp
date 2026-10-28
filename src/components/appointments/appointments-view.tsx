'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate, formatTime, whatsappLink } from '@/lib/format'
import { Calendar, CalendarDays, Plus, Scissors, Users, Clock, CheckCircle2, XCircle, Phone, MessageCircle, Store, Settings2, Zap, ShieldCheck, CheckCheck, AlertCircle, Wallet, Ban, UserCheck, UserX, RotateCcw, UserPlus, Ticket, CalendarClock } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { ProviderSettings } from './provider-settings'
import { StaffManager } from './staff-manager'
import { ServiceManager } from './service-manager'
import { AppointmentCalendar } from './appointment-calendar'
import { RejectDialog } from './reject-dialog'
import { CustomerHistoryDialog } from './customer-history-dialog'
import { MembershipTab } from '@/components/membership/membership-tab'
import { CustomerDetailDialog } from './customer-manager'
import { CustomerAutocomplete } from './customer-autocomplete'
import { formatDateTime } from '@/lib/format'
import { useAppStore } from '@/store/app-store'
import { MyScheduleManager } from './my-schedule-manager'
import { MyServicesManager } from './my-services-manager'
import { StorefrontDialog, type StorefrontProviderRef } from '@/components/admin/storefront-dialog'
import { UserCircle2 } from 'lucide-react'

interface Provider {
  id: string; name: string; type: string; address: string | null; city: string | null
  phone: string | null; email: string | null; photo: string | null
  workingHoursParsed: Record<string, unknown>
  autoApprove?: boolean
  staff: Staff[]; services: Service[]
  _count?: { appointments: number }
}
interface Staff { id: string; name: string; title: string | null; photo: string | null; phone: string | null; userId?: string | null }
interface Service { id: string; name: string; description: string | null; duration: number; price: number; category: string | null; photo: string | null }
interface Appointment {
  id: string; customerId?: string | null; customer?: { id: string; isBlocked: boolean } | null
  customerName: string; customerPhone: string; customerEmail: string | null
  customerNote: string | null; date: string; endTime: string | null; status: string
  price: number; source: string; notes: string | null; reminderSent?: boolean
  staff: { id: string; name: string } | null
  service: { id: string; name: string; duration: number; price: number } | null
}

const PROVIDER_TYPES = [
  { value: 'berber', label: 'Berber', icon: '💈' },
  { value: 'kuafor', label: 'Kuaför', icon: '💇' },
  { value: 'disci', label: 'Dişçi', icon: '🦷' },
  { value: 'guzellik', label: 'Güzellik Merkezi', icon: '💅' },
  { value: 'spa', label: 'SPA', icon: '🧖' },
  { value: 'dovme', label: 'Dövmeci', icon: '🎨' },
] as const

const APPT_STATUS = [
  { value: 'beklemede', label: 'Beklemede', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'onaylandi', label: 'Onaylandı', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'tamamlandi', label: 'Tamamlandı', color: 'text-teal-600 bg-teal-50 border-teal-200' },
  { value: 'reddedildi', label: 'Reddedildi', color: 'text-slate-600 bg-slate-100 border-slate-200' },
  { value: 'iptal', label: 'İptal', color: 'text-red-600 bg-red-50 border-red-200' },
  { value: 'gelmedi', label: 'Gelmedi', color: 'text-rose-600 bg-rose-50 border-rose-200' },
] as const

export function AppointmentsView() {
  const qc = useQueryClient()
  const user = useAppStore((s) => s.user)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [tab, setTab] = useState('appointments')
  const [bookOpen, setBookOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [statusFilter, setStatusFilter] = useState('all')
  const [rejectTarget, setRejectTarget] = useState<Appointment | null>(null)
  const [historyTarget, setHistoryTarget] = useState<{ name: string; phone: string } | null>(null)
  const [customerDetailId, setCustomerDetailId] = useState<string | null>(null)
  const [bookInitial, setBookInitial] = useState<{ name?: string; phone?: string; serviceId?: string; staffId?: string } | undefined>(undefined)
  // Vitrin & Portföy diyaloğu (işletme sahibi — İşletme Ayarları'ndan açılır)
  const [storefrontOpen, setStorefrontOpen] = useState(false)

  // Provider list
  const { data: providersData } = useQuery({
    queryKey: ['providers'],
    queryFn: () => apiGet<{ items: Provider[] }>('/api/appointments/providers'),
  })
  const providers = providersData?.items ?? []
  const currentProvider = providers[0] // first provider for now
  const providerId = selectedProviderId || currentProvider?.id

  // Provider detail (staff + services)
  const { data: provider } = useQuery({
    queryKey: ['provider', providerId],
    queryFn: () => apiGet<Provider>(`/api/appointments/providers/${providerId}`),
    enabled: !!providerId,
  })

  // ---- ROL PROFİLİ ----
  // Şirket admini (firma sahibi): her şeyi görür/yönetir.
  // Usta/çırak: personel kaydıyla eşleşir; yalnız KENDİ randevu/izin/hizmetlerini yönetir,
  // takvimde sadece kendini görür. Personel/hizmet ekleme ve işletme ayarları adminde kalır.
  const isProviderAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const myStaff = !isProviderAdmin && provider ? provider.staff.find((s) => s.userId === user?.id) : undefined
  const myStaffId = myStaff?.id ?? null

  // Usta/çırak: kendi hizmet atamaları — manuel randevu dialoğunda hizmet
  // listesi buna göre filtrelenir (usta yalnız verdiği hizmeti satar)
  const { data: myStaffList } = useQuery({
    queryKey: ['appointment-staff', providerId],
    queryFn: () => apiGet<(Staff & { services: { id: string; name: string; category: string | null }[] })[]>(
      `/api/appointments/providers/${providerId}/staff`,
    ),
    enabled: !!providerId && !isProviderAdmin,
  })
  const myServiceIds = !isProviderAdmin
    ? new Set((myStaffList?.[0]?.services ?? []).map((s) => s.id))
    : null

  // Appointments for selected date
  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments', providerId, selectedDate],
    queryFn: () => apiGet<Appointment[]>(`/api/appointments/providers/${providerId}/appointments?date=${selectedDate}`),
    enabled: !!providerId,
  })

  // Gün özeti + durum filtresi (program geliştirmesi)
  const dayStats = useMemo(() => {
    const pending = appointments.filter((a) => a.status === 'beklemede')
    const approved = appointments.filter((a) => a.status === 'onaylandi')
    const done = appointments.filter((a) => a.status === 'tamamlandi')
    const cancelled = appointments.filter((a) => a.status === 'iptal' || a.status === 'gelmedi' || a.status === 'reddedildi')
    const expectedRevenue = [...pending, ...approved].reduce((sum, a) => sum + (a.price || 0), 0)
    return {
      total: appointments.length,
      pendingCount: pending.length,
      approvedCount: approved.length,
      doneCount: done.length,
      cancelledCount: cancelled.length,
      expectedRevenue,
    }
  }, [appointments])

  const filteredAppointments = useMemo(() => {
    if (statusFilter === 'all') return appointments
    if (statusFilter === 'iptal') return appointments.filter((a) => a.status === 'iptal' || a.status === 'gelmedi' || a.status === 'reddedildi')
    return appointments.filter((a) => a.status === statusFilter)
  }, [appointments, statusFilter])

  const approveAllPending = async () => {
    const pending = appointments.filter((a) => a.status === 'beklemede')
    if (pending.length === 0 || !providerId) return
    try {
      await Promise.all(pending.map((a) =>
        apiPatch(`/api/appointments/providers/${providerId}/appointments/${a.id}`, { status: 'onaylandi' }),
      ))
      qc.invalidateQueries({ queryKey: ['appointments'] })
      toast.success(`${pending.length} randevu onaylandı`, { description: 'Müşterilere WhatsApp ile bilgi gönderebilirsiniz' })
    } catch (e) {
      toast.error('Toplu onay başarısız', { description: e instanceof Error ? e.message : '' })
    }
  }

  // Müşteri adına tıklanınca: kayıt defterinde kayıtlıysa tam kart, değilse telefonla geçmiş
  const openCustomerInfo = (apt: Appointment) => {
    if (apt.customerId) setCustomerDetailId(apt.customerId)
    else setHistoryTarget({ name: apt.customerName, phone: apt.customerPhone })
  }

  // Tekrar planla — tamamlanan randevuyu aynı müşteri/hizmetle yeniden oluştur
  const rebookAppointment = (apt: Appointment) => {
    const next = new Date()
    next.setDate(next.getDate() + 7)
    setBookInitial({
      name: apt.customerName,
      phone: apt.customerPhone,
      serviceId: apt.service?.id,
      staffId: apt.staff?.id,
    })
    setSelectedDate(next.toISOString().slice(0, 10))
    setBookOpen(true)
  }

  // Otomatik onay — başlıkta hızlı anahtar (ayrıca İşletme Ayarları'nda da var)
  const autoApprove = provider?.autoApprove ?? true
  const [autoApproveSaving, setAutoApproveSaving] = useState(false)
  const toggleAutoApprove = async (checked: boolean) => {
    if (!providerId) return
    setAutoApproveSaving(true)
    try {
      await apiPatch(`/api/appointments/providers/${providerId}`, { autoApprove: checked })
      qc.invalidateQueries({ queryKey: ['provider', providerId] })
      qc.invalidateQueries({ queryKey: ['appointment-provider', providerId] })
      qc.invalidateQueries({ queryKey: ['providers'] })
      qc.invalidateQueries({ queryKey: ['appointment-providers'] })
      toast.success(
        checked
          ? 'Otomatik onay açıldı — yeni randevular onaysız kabul edilir'
          : 'Otomatik onay kapatıldı — yeni randevular onay bekler',
        { icon: checked ? '⚡' : '⏳' },
      )
    } catch (e) {
      toast.error('Ayar değiştirilemedi', { description: e instanceof Error ? e.message : '' })
    } finally {
      setAutoApproveSaving(false)
    }
  }

  if (!providersData) {
    return <div className="p-8"><Skeleton className="h-32" /></div>
  }

  if (providers.length === 0) {
    return (
      <div className="space-y-5 animate-fade-in">
        <h2 className="text-2xl font-bold">Randevu Sistemi</h2>
        <Card><CardContent className="p-8 text-center">
          <Store className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-4">Henüz işletme kaydı yok. İlk işletmenizi oluşturun.</p>
          <ProviderCreateDialog tenantId="" onCreated={() => qc.invalidateQueries({ queryKey: ['providers'] })} />
        </CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Randevu Sistemi</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {provider?.name} · {PROVIDER_TYPES.find((t) => t.value === provider?.type)?.label}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {/* Usta/çırak profil bandı — kendi adına yönetir */}
          {!isProviderAdmin && myStaff && (
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg border bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/60">
              <UserCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                {myStaff.name}{myStaff.title ? ` · ${myStaff.title}` : ''}
              </span>
            </div>
          )}
          {/* Otomatik onay anahtarı — yalnız işletme sahibi (usta işletme ayarını değiştiremez) */}
          {isProviderAdmin && (
            <div
              className={cn(
                'flex items-center gap-2 h-9 px-3 rounded-lg border transition-colors',
                autoApprove
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/60'
                  : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/60',
              )}
            >
              {autoApprove
                ? <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                : <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />}
              <span className={cn('text-xs font-medium whitespace-nowrap', autoApprove ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')}>
                {autoApprove ? 'Otomatik onay' : 'Onay gerekli'}
              </span>
              <Switch
                checked={autoApprove}
                onCheckedChange={toggleAutoApprove}
                disabled={autoApproveSaving}
                aria-label="Randevuları otomatik onayla"
              />
            </div>
          )}
          <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-40" />
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setBookOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Randevu Ekle
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => {
        setTab(v)
        // Personel/hizmet değişiklikleri listeye yansısın
        if (v === 'appointments') qc.invalidateQueries({ queryKey: ['provider', providerId] })
      }}>
        <TabsList>
          <TabsTrigger value="appointments" className="text-xs"><Calendar className="w-3.5 h-3.5 mr-1" /> Randevular</TabsTrigger>
          <TabsTrigger value="calendar" className="text-xs"><CalendarDays className="w-3.5 h-3.5 mr-1" /> Takvim</TabsTrigger>
          {/* Personel: yönetici için tam yönetim; usta için kendi izin/çalışma saatleri */}
          <TabsTrigger value="staff" className="text-xs">
            {isProviderAdmin
              ? <><Users className="w-3.5 h-3.5 mr-1" /> Personel</>
              : <><CalendarClock className="w-3.5 h-3.5 mr-1" /> Saatlerim</>}
          </TabsTrigger>
          {/* Hizmetler: yönetici için tam yönetim; usta için kendi hizmet seçimi */}
          <TabsTrigger value="services" className="text-xs">
            {isProviderAdmin
              ? <><Scissors className="w-3.5 h-3.5 mr-1" /> Hizmetler</>
              : <><Scissors className="w-3.5 h-3.5 mr-1" /> Hizmetlerim</>}
          </TabsTrigger>
          {/* Üyelik & İşletme Ayarları: yalnız işletme sahibi */}
          {isProviderAdmin && (
            <TabsTrigger value="membership" className="text-xs"><Ticket className="w-3.5 h-3.5 mr-1" /> Üyelikler</TabsTrigger>
          )}
          {isProviderAdmin && (
            <TabsTrigger value="settings" className="text-xs"><Settings2 className="w-3.5 h-3.5 mr-1" /> İşletme Ayarları</TabsTrigger>
          )}
        </TabsList>

        {/* Randevular tab */}
        <TabsContent value="appointments" className="mt-4 space-y-3">
          {/* Gün özeti kartları */}
          {!isLoading && appointments.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Card className="shadow-soft"><CardContent className="p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Calendar className="w-3.5 h-3.5" /> Bugün</div>
                <div className="text-xl font-bold mt-0.5 tabular-nums">{dayStats.total}</div>
                <div className="text-[10px] text-muted-foreground">randevu</div>
              </CardContent></Card>
              <Card className="shadow-soft"><CardContent className="p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock className="w-3.5 h-3.5 text-amber-500" /> Bekleyen</div>
                <div className="text-xl font-bold mt-0.5 tabular-nums text-amber-600">{dayStats.pendingCount}</div>
                <div className="text-[10px] text-muted-foreground">onay bekliyor</div>
              </CardContent></Card>
              <Card className="shadow-soft"><CardContent className="p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Onaylı</div>
                <div className="text-xl font-bold mt-0.5 tabular-nums text-emerald-600">{dayStats.approvedCount}</div>
                <div className="text-[10px] text-muted-foreground">{dayStats.doneCount} tamamlandı</div>
              </CardContent></Card>
              <Card className="shadow-soft"><CardContent className="p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Wallet className="w-3.5 h-3.5 text-teal-500" /> Beklenen</div>
                <div className="text-xl font-bold mt-0.5 tabular-nums text-teal-600">{formatCurrency(dayStats.expectedRevenue)}</div>
                <div className="text-[10px] text-muted-foreground">ciro potansiyeli</div>
              </CardContent></Card>
            </div>
          )}

          {/* Onay bekleyen uyarı bandı — otomatik onay kapalıyken */}
          {!isLoading && !autoApprove && dayStats.pendingCount > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm text-amber-800 dark:text-amber-300">
                  <strong>{dayStats.pendingCount} randevu</strong> onayınızı bekliyor — otomatik onay kapalı
                </span>
              </div>
              <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={approveAllPending}>
                <CheckCheck className="w-3.5 h-3.5 mr-1.5" /> Tümünü Onayla
              </Button>
            </div>
          )}

          {/* Durum filtre çipleri */}
          {!isLoading && appointments.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { key: 'all', label: 'Tümü', count: dayStats.total, cls: 'bg-primary text-primary-foreground border-transparent' },
                { key: 'beklemede', label: 'Beklemede', count: dayStats.pendingCount, cls: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900' },
                { key: 'onaylandi', label: 'Onaylı', count: dayStats.approvedCount, cls: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900' },
                { key: 'tamamlandi', label: 'Tamamlanan', count: dayStats.doneCount, cls: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900' },
                { key: 'iptal', label: 'İptal/Gelmedi', count: dayStats.cancelledCount, cls: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900' },
              ] as const).map((c) => (
                <button
                  key={c.key}
                  onClick={() => setStatusFilter(c.key)}
                  className={cn(
                    'h-7 px-2.5 rounded-full border text-[11px] font-medium transition-colors',
                    statusFilter === c.key ? c.cls : 'bg-background text-muted-foreground border-border hover:bg-accent',
                  )}
                >
                  {c.label} · {c.count}
                </button>
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : filteredAppointments.length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <Calendar className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {appointments.length === 0
                  ? `${formatDate(selectedDate)} tarihinde randevu yok`
                  : 'Bu filtreye uyan randevu yok'}
              </p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {filteredAppointments.map((apt) => {
                const st = APPT_STATUS.find((s) => s.value === apt.status)
                return (
                  <Card key={apt.id} className="shadow-soft">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="text-center shrink-0 w-16">
                        <div className="text-lg font-bold tabular-nums">{formatTime(apt.date)}</div>
                        <div className="text-[10px] text-muted-foreground">{apt.endTime ? formatTime(apt.endTime) : ''}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openCustomerInfo(apt)}
                            className="font-medium text-sm hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline text-left"
                            title={apt.customerId ? 'Müşteri kartını aç (kayıt defteri)' : 'Müşteri geçmişini gör'}
                          >
                            {apt.customerName}
                          </button>
                          {apt.customerId && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 rounded px-1 py-px shrink-0"
                              title="Kayıt defterinde kayıtlı müşteri"
                            >
                              <UserCheck className="w-2.5 h-2.5" /> kayıtlı
                            </span>
                          )}
                          <Badge variant="outline" className={cn('text-[10px]', st?.color ?? '')}>{st?.label}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {apt.service?.name ?? '—'} · {apt.staff?.name ?? 'Herhangi'} · {formatCurrency(apt.price)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                        {/* Beklemede → hızlı onay */}
                        {apt.status === 'beklemede' && (
                          <Button size="sm" className="h-8 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={async () => { await apiPatch(`/api/appointments/providers/${providerId}/appointments/${apt.id}`, { status: 'onaylandi' }); qc.invalidateQueries({ queryKey: ['appointments'] }); toast.success('Randevu onaylandı — WhatsApp ile bilgi gönderebilirsiniz') }}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Onayla
                          </Button>
                        )}
                        {/* Beklemede → sebep ile reddet */}
                        {apt.status === 'beklemede' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" title="Reddet (sebep bildir)"
                            onClick={() => setRejectTarget(apt)}>
                            <Ban className="w-4 h-4" />
                          </Button>
                        )}
                        {/* Onaylandı → WhatsApp ile bilgi gönder */}
                        {apt.status === 'onaylandi' && (
                          <Button
                            size="sm"
                            variant={apt.reminderSent ? 'outline' : 'default'}
                            className={cn(
                              'h-8 text-[11px]',
                              !apt.reminderSent && 'bg-[#25D366] hover:bg-[#1fb857] text-white border-0',
                              apt.reminderSent && 'text-[#25D366] border-[#25D366]/40',
                            )}
                            title="Müşteriye WhatsApp ile onay bilgisi gönder"
                            onClick={async () => {
                              const svc = apt.service?.name ? apt.service.name : 'randevu'
                              const stf = apt.staff?.name ? ` (${apt.staff.name})` : ''
                              const msg = `Merhaba ${apt.customerName}, 🎉\n\n${formatDateTime(apt.date)} tarihli ${svc}${stf} randevunuz ONAYLANDI. ✅\n\nGörüşmek üzere! 🙌`
                              window.open(whatsappLink(apt.customerPhone, msg), '_blank', 'noopener,noreferrer')
                              try {
                                await apiPatch(`/api/appointments/providers/${providerId}/appointments/${apt.id}`, { reminderSent: true })
                                qc.invalidateQueries({ queryKey: ['appointments'] })
                              } catch { /* sessiz */ }
                              toast.success('WhatsApp onay mesajı hazırlandı')
                            }}
                          >
                            <MessageCircle className="w-3.5 h-3.5 mr-1" />
                            {apt.reminderSent ? 'Bilgi Gönderildi' : 'WhatsApp ile Bilgi Gönder'}
                          </Button>
                        )}
                        {/* Onaylandı → Gelmedi (no-show) hızlı aksiyon */}
                        {apt.status === 'onaylandi' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" title="Gelmedi olarak işaretle"
                            onClick={async () => { await apiPatch(`/api/appointments/providers/${providerId}/appointments/${apt.id}`, { status: 'gelmedi' }); qc.invalidateQueries({ queryKey: ['appointments'] }); toast.success('"Gelmedi" olarak işaretlendi') }}>
                            <UserX className="w-4 h-4" />
                          </Button>
                        )}
                        {/* Tamamlandı → Tekrar Planla (aynı müşteri+hizmet) */}
                        {apt.status === 'tamamlandi' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" title="Tekrar planla — aynı müşteri ve hizmetle yeni randevu"
                            onClick={() => rebookAppointment(apt)}>
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        )}
                        <a href={whatsappLink(apt.customerPhone, `Merhaba ${apt.customerName}, ${formatDate(apt.date)} ${formatTime(apt.date)} randevunuz hatırlatmasıdır.`)} target="_blank" rel="noopener">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600"><MessageCircle className="w-4 h-4" /></Button>
                        </a>
                        <a href={`tel:${apt.customerPhone}`}><Button variant="ghost" size="icon" className="h-8 w-8"><Phone className="w-4 h-4" /></Button></a>
                        {apt.status === 'onaylandi' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" title="Tamamlandı"
                            onClick={async () => { await apiPatch(`/api/appointments/providers/${providerId}/appointments/${apt.id}`, { status: 'tamamlandi' }); qc.invalidateQueries({ queryKey: ['appointments'] }); toast.success('Randevu tamamlandı') }}>
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        )}
                        {apt.status !== 'iptal' && apt.status !== 'tamamlandi' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" title="İptal"
                            onClick={async () => { await apiPatch(`/api/appointments/providers/${providerId}/appointments/${apt.id}`, { status: 'iptal' }); qc.invalidateQueries({ queryKey: ['appointments'] }); toast.success('Randevu iptal edildi') }}>
                            <XCircle className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Takvim tab — gün/hafta görünümü. Usta yalnız kendi kolonunu görür. */}
        <TabsContent value="calendar" className="mt-4">
          {providerId && <AppointmentCalendar providerId={providerId} myStaffId={myStaffId} />}
        </TabsContent>

        {/* Personel tab — yönetici: ekleme/düzenleme/silme; usta: kendi izin/çalışma saatleri */}
        <TabsContent value="staff" className="mt-4">
          {providerId && isProviderAdmin && <StaffManager providerId={providerId} />}
          {providerId && !isProviderAdmin && myStaffId && (
            <MyScheduleManager providerId={providerId} myStaffId={myStaffId} myStaffName={myStaff?.name ?? ''} />
          )}
        </TabsContent>

        {/* Hizmetler tab — yönetici: tam yönetim; usta: kendi hizmet seçimi */}
        <TabsContent value="services" className="mt-4">
          {providerId && isProviderAdmin && <ServiceManager providerId={providerId} />}
          {providerId && !isProviderAdmin && myStaffId && (
            <MyServicesManager providerId={providerId} myStaffId={myStaffId} myStaffName={myStaff?.name ?? ''} />
          )}
        </TabsContent>

        {/* İşletme Ayarları — yalnız işletme sahibi: otomatik onay, çalışma saatleri, VİTRİN & PORTFÖY */}
        <TabsContent value="settings" className="mt-4">
          {providerId && isProviderAdmin && (
            <div className="space-y-5">
              {/* Vitrin & Portföy — firma sahibi portföy yazılarını/fotoğraflarını buradan yazar */}
              <Card className="border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 dark:border-emerald-900/50 dark:from-emerald-950/20 dark:to-teal-950/10">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center shrink-0">
                        <Store className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-base leading-tight">Vitrin & Portföy</h3>
                        <p className="text-sm text-muted-foreground mt-0.5 max-w-lg">
                          Müşteri vitrininizdeki kapak fotoğrafı, tanıtım metnini ve portföy galerisini
                          (kesim/sakal/stil fotoğrafları + yazıları) buradan yönetin.
                        </p>
                      </div>
                    </div>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setStorefrontOpen(true)}
                    >
                      <Store className="w-4 h-4 mr-2" />
                      Vitrini Düzenle
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <ProviderSettings providerId={providerId} />
            </div>
          )}
        </TabsContent>

        {/* Üyelik & Paket Yönetimi — yalnız işletme sahibi */}
        <TabsContent value="membership" className="mt-4">
          {isProviderAdmin && <MembershipTab />}
        </TabsContent>
      </Tabs>

      {/* Vitrin & Portföy diyaloğu — İşletme Ayarları'ndan açılır (firma sahibi) */}
      {storefrontOpen && provider && (
        <StorefrontDialog
          provider={{ id: provider.id, name: provider.name, slug: (provider as unknown as { slug?: string | null }).slug, type: provider.type }}
          onClose={() => setStorefrontOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['provider', providerId] })
            qc.invalidateQueries({ queryKey: ['providers'] })
          }}
        />
      )}

      {/* Manual booking dialog — usta için personel kilidi: kendi adına */}
      {bookOpen && provider && (
        <ManualBookingDialog
          provider={provider}
          open={bookOpen}
          initial={bookInitial}
          lockStaffId={myStaffId ?? undefined}
          serviceFilter={myServiceIds}
          onOpenChange={(v) => { setBookOpen(v); if (!v) setBookInitial(undefined) }}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['appointments'] })}
        />
      )}

      {/* Reddet diyaloğu — sebep + WhatsApp bildirimi */}
      {rejectTarget && providerId && (
        <RejectDialog
          target={rejectTarget}
          providerId={providerId}
          onOpenChange={(o) => !o && setRejectTarget(null)}
          onDone={() => qc.invalidateQueries({ queryKey: ['appointments'] })}
        />
      )}

      {/* Müşteri randevu geçmişi */}
      {historyTarget && providerId && (
        <CustomerHistoryDialog
          providerId={providerId}
          customerName={historyTarget.name}
          phone={historyTarget.phone}
          onOpenChange={(o) => !o && setHistoryTarget(null)}
        />
      )}

      {/* Müşteri kayıt kartı — kayıt defterinde kayıtlıysa */}
      {customerDetailId && providerId && (
        <CustomerDetailDialog
          providerId={providerId}
          customerId={customerDetailId}
          onOpenChange={(o) => !o && setCustomerDetailId(null)}
          onUpdated={() => qc.invalidateQueries({ queryKey: ['appointments'] })}
        />
      )}
    </div>
  )
}

// Manual booking dialog — usta/çırak için personel seçimi kilitli (kendi adına)
function ManualBookingDialog({ provider, open, onOpenChange, onSuccess, initial, lockStaffId, serviceFilter }: {
  provider: Provider; open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void
  initial?: { name?: string; phone?: string; serviceId?: string; staffId?: string }
  lockStaffId?: string
  serviceFilter?: Set<string> | null
}) {
  const [form, setForm] = useState({
    serviceId: initial?.serviceId ?? '', staffId: initial?.staffId ?? '',
    date: new Date().toISOString().slice(0, 10),
    time: '10:00', name: initial?.name ?? '', phone: initial?.phone ?? '', email: '', note: '',
  })
  // Usta kilidi: staffId her zaman kendi personel kaydına sabitlenir
  const effStaffId = lockStaffId ?? form.staffId
  const bookableServices = serviceFilter
    ? provider.services.filter((s) => serviceFilter.has(s.id))
    : provider.services
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const dateTime = new Date(`${form.date}T${form.time}:00`)
      await apiPost(`/api/appointments/providers/${provider.id}/appointments`, {
        serviceId: form.serviceId || undefined,
        staffId: effStaffId || undefined,
        customerName: form.name,
        customerPhone: form.phone,
        customerEmail: form.email || undefined,
        customerNote: form.note || undefined,
        date: dateTime.toISOString(),
        source: 'phone',
      })
      toast.success('Randevu oluşturuldu')
      onSuccess()
      onOpenChange(false)
    } catch (e) {
      toast.error('Randevu oluşturulamadı', { description: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Manuel Randevu</DialogTitle></DialogHeader>
        {provider.autoApprove === false && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 px-3 py-2 -mt-1">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Otomatik onay <strong>kapalı</strong> — randevu <strong>&quot;Beklemede&quot;</strong> oluşur, onayladıktan sonra kesinleşir.
            </p>
          </div>
        )}
        <div className="space-y-3">
          <div><Label className="text-xs">Hizmet</Label>
            <Select value={form.serviceId || '__none__'} onValueChange={(v) => setForm({ ...form, serviceId: v === '__none__' ? '' : v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Hizmet seç" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Hizmet seçilmedi</SelectItem>
                {bookableServices.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.duration}dk)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Personel</Label>
            {lockStaffId ? (
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm">
                {provider.staff.find((s) => s.id === lockStaffId)?.name ?? 'Siz'}
                <span className="ml-2 text-[10px] text-muted-foreground">(kendi adınıza)</span>
              </div>
            ) : (
              <Select value={form.staffId || '__none__'} onValueChange={(v) => setForm({ ...form, staffId: v === '__none__' ? '' : v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Herhangi" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Herhangi biri</SelectItem>
                  {provider.staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Tarih</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div><Label className="text-xs">Saat</Label><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
          </div>
          <CustomerAutocomplete
            providerId={provider.id}
            name={form.name}
            phone={form.phone}
            onNameChange={(v) => setForm({ ...form, name: v })}
            onPhoneChange={(v) => setForm({ ...form, phone: v })}
          />
          <div><Label className="text-xs">Not</Label><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="h-16" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={saving || !form.name || !form.phone}>{saving ? 'Kaydediliyor...' : 'Randevu Oluştur'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Provider create dialog
function ProviderCreateDialog({ tenantId, onCreated }: { tenantId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'kuafor', city: '', phone: '' })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPost('/api/appointments/providers', form)
      toast.success('İşletme oluşturuldu')
      onCreated()
      setOpen(false)
    } catch { toast.error('Oluşturulamadı') } finally { setSaving(false) }
  }

  return (
    <>
      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-1.5" /> İşletme Ekle
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Yeni İşletme</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">İşletme Adı *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label className="text-xs">Tür</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{PROVIDER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Şehir</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div><Label className="text-xs">Telefon</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={saving || !form.name}>{saving ? 'Kaydediliyor...' : 'Oluştur'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
