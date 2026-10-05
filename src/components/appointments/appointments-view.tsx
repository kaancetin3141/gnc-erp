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
import { Calendar, CalendarDays, Plus, Scissors, Users, Clock, CheckCircle2, XCircle, Phone, MessageCircle, Store, User, Settings2, Zap, ShieldCheck, CheckCheck, AlertCircle, Wallet, Ban, UserCheck, UserX, RotateCcw, UserPlus, Ticket } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { ProviderSettings } from './provider-settings'
import { StaffManager } from './staff-manager'
import { ServiceManager } from './service-manager'
import { AppointmentCalendar } from './appointment-calendar'
import { RejectDialog } from './reject-dialog'
import { CustomerHistoryDialog } from './customer-history-dialog'
import { MembershipTab } from '@/components/membership/membership-tab'
import { CustomerManager, CustomerDetailDialog, type RegistryCustomer } from './customer-manager'
import { CustomerAutocomplete } from './customer-autocomplete'
import { formatDateTime } from '@/lib/format'

interface Provider {
  id: string; name: string; type: string; address: string | null; city: string | null
  phone: string | null; email: string | null; photo: string | null
  workingHoursParsed: Record<string, unknown>
  autoApprove?: boolean
  staff: Staff[]; services: Service[]
  _count?: { appointments: number }
}
interface Staff { id: string; name: string; title: string | null; photo: string | null; phone: string | null }
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
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [tab, setTab] = useState('appointments')
  const [bookOpen, setBookOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [statusFilter, setStatusFilter] = useState('all')
  const [rejectTarget, setRejectTarget] = useState<Appointment | null>(null)
  const [historyTarget, setHistoryTarget] = useState<{ name: string; phone: string } | null>(null)
  const [customerDetailId, setCustomerDetailId] = useState<string | null>(null)
  const [bookInitial, setBookInitial] = useState<{ name?: string; phone?: string; serviceId?: string; staffId?: string } | undefined>(undefined)

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
          {/* Otomatik onay anahtarı — Randevu Ekle'nin yanı sıra */}
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
          <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-40" />
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setBookOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Randevu Ekle
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => {
        setTab(v)
        // Personel/hizmet değişiklikleri Müşteri Görünümü'ne ve listeye yansısın
        if (v === 'booking' || v === 'appointments') qc.invalidateQueries({ queryKey: ['provider', providerId] })
      }}>
        <TabsList>
          <TabsTrigger value="appointments" className="text-xs"><Calendar className="w-3.5 h-3.5 mr-1" /> Randevular</TabsTrigger>
          <TabsTrigger value="calendar" className="text-xs"><CalendarDays className="w-3.5 h-3.5 mr-1" /> Takvim</TabsTrigger>
          <TabsTrigger value="customers" className="text-xs"><Users className="w-3.5 h-3.5 mr-1" /> Müşteriler</TabsTrigger>
          <TabsTrigger value="staff" className="text-xs"><Users className="w-3.5 h-3.5 mr-1" /> Personel</TabsTrigger>
          <TabsTrigger value="services" className="text-xs"><Scissors className="w-3.5 h-3.5 mr-1" /> Hizmetler</TabsTrigger>
          <TabsTrigger value="membership" className="text-xs"><Ticket className="w-3.5 h-3.5 mr-1" /> Üyelikler</TabsTrigger>
          <TabsTrigger value="booking" className="text-xs"><Store className="w-3.5 h-3.5 mr-1" /> Müşteri Görünümü</TabsTrigger>
          <TabsTrigger value="settings" className="text-xs"><Settings2 className="w-3.5 h-3.5 mr-1" /> İşletme Ayarları</TabsTrigger>
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

        {/* Takvim tab — gün/hafta görünümü */}
        <TabsContent value="calendar" className="mt-4">
          {providerId && <AppointmentCalendar providerId={providerId} />}
        </TabsContent>

        {/* Müşteriler tab — kalıcı müşteri kayıt defteri */}
        <TabsContent value="customers" className="mt-4">
          {providerId && (
            <CustomerManager
              providerId={providerId}
              onNewAppointment={(c) => {
                setBookInitial({ name: c.name, phone: c.phone })
                setBookOpen(true)
              }}
            />
          )}
        </TabsContent>

        {/* Personel tab — ekleme/düzenleme/silme yetenekli yönetici */}
        <TabsContent value="staff" className="mt-4">
          {providerId && <StaffManager providerId={providerId} />}
        </TabsContent>

        {/* Hizmetler tab — ekleme/düzenleme/silme yetenekli yönetici */}
        <TabsContent value="services" className="mt-4">
          {providerId && <ServiceManager providerId={providerId} />}
        </TabsContent>

        {/* Müşteri Görünümü — Public Booking */}
        <TabsContent value="booking" className="mt-4">
          {provider && <PublicBooking provider={provider} onBooked={() => qc.invalidateQueries({ queryKey: ['appointments'] })} />}
        </TabsContent>

        {/* İşletme Ayarları — otomatik onay anahtarı, çalışma saatleri */}
        <TabsContent value="settings" className="mt-4">
          {providerId && <ProviderSettings providerId={providerId} />}
        </TabsContent>

        {/* Üyelik & Paket Yönetimi */}
        <TabsContent value="membership" className="mt-4">
          <MembershipTab />
        </TabsContent>
      </Tabs>

      {/* Manual booking dialog */}
      {bookOpen && provider && (
        <ManualBookingDialog
          provider={provider}
          open={bookOpen}
          initial={bookInitial}
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

// Müşteri görünümü — public booking widget
function PublicBooking({ provider, onBooked }: { provider: Provider; onBooked: () => void }) {
  const [step, setStep] = useState(1)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedTime, setSelectedTime] = useState('')
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', note: '' })
  const [booking, setBooking] = useState(false)
  const [bookedStatus, setBookedStatus] = useState<string>('onaylandi')

  // Basit slot üretimi (09:00-18:00, 30dk aralık)
  const slots = useMemo(() => {
    const result: string[] = []
    for (let h = 9; h < 18; h++) {
      result.push(`${String(h).padStart(2, '0')}:00`)
      result.push(`${String(h).padStart(2, '0')}:30`)
    }
    return result
  }, [])

  const handleBook = async () => {
    setBooking(true)
    try {
      const dateTime = new Date(`${selectedDate}T${selectedTime}:00`)
      const created = await apiPost<{ status?: string }>(`/api/appointments/providers/${provider.id}/appointments`, {
        serviceId: selectedService?.id,
        staffId: selectedStaff || undefined,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email || undefined,
        customerNote: customer.note || undefined,
        date: dateTime.toISOString(),
        source: 'web',
      })
      setBookedStatus(created?.status ?? 'onaylandi')
      toast.success(
        created?.status === 'beklemede' ? 'Randevu talebiniz alındı — onay bekliyor' : 'Randevu oluşturuldu!',
        { description: `${formatDate(selectedDate)} ${selectedTime}` },
      )
      setStep(5) // success
      onBooked()
    } catch (e) {
      toast.error('Randevu oluşturulamadı', { description: e instanceof Error ? e.message : '' })
    } finally {
      setBooking(false)
    }
  }

  return (
    <Card className="shadow-soft max-w-2xl mx-auto">
      <CardContent className="p-6">
        {/* Progress */}
        <div className="flex items-center justify-between mb-6">
          {['Hizmet', 'Personel', 'Tarih', 'Bilgiler', 'Tamam'].map((label, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                step > i + 1 ? 'bg-emerald-500 text-white' : step === i + 1 ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground')}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              {i < 4 && <div className={cn('flex-1 h-0.5 mx-1', step > i + 1 ? 'bg-emerald-500' : 'bg-muted')} />}
            </div>
          ))}
        </div>

        {/* Step 1: Service */}
        {step === 1 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Hizmet Seçin</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {provider.services.map((s) => (
                <button key={s.id} onClick={() => { setSelectedService(s); setStep(2) }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors text-left">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                    <Scissors className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.duration}dk · {formatCurrency(s.price)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Staff */}
        {step === 2 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Personel Seçin</h3>
            <button onClick={() => { setSelectedStaff(''); setStep(3) }}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 transition-colors text-left">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"><User className="w-5 h-5" /></div>
              <span className="font-medium text-sm">Herhangi biri</span>
            </button>
            {provider.staff.map((s) => (
              <button key={s.id} onClick={() => { setSelectedStaff(s.id); setStep(3) }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors text-left">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">{s.name.charAt(0)}</div>
                <div><div className="font-medium text-sm">{s.name}</div><div className="text-xs text-muted-foreground">{s.title}</div></div>
              </button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>← Geri</Button>
          </div>
        )}

        {/* Step 3: Date & Time */}
        {step === 3 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Tarih ve Saat Seçin</h3>
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
            <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
              {slots.map((time) => (
                <button key={time} onClick={() => { setSelectedTime(time); setStep(4) }}
                  className="px-2 py-2 text-sm rounded-lg border border-border hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors tabular-nums">
                  {time}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep(2)}>← Geri</Button>
          </div>
        )}

        {/* Step 4: Customer info */}
        {step === 4 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Bilgilerinizi Girin</h3>
            <div className="space-y-2">
              <div><Label className="text-xs">Ad Soyad *</Label><Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Adınız Soyadınız" /></div>
              <div><Label className="text-xs">Telefon *</Label><Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="+90 5xx xxx xx xx" /></div>
              <div><Label className="text-xs">E-posta (opsiyonel)</Label><Input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder="email@ornek.com" /></div>
              <div><Label className="text-xs">Not (opsiyonel)</Label><Textarea value={customer.note} onChange={(e) => setCustomer({ ...customer, note: e.target.value })} placeholder="Eklemek istedikleriniz" className="h-16" /></div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-sm">
              <div className="font-medium">Özet</div>
              <div className="text-xs text-muted-foreground mt-1">
                {selectedService?.name} · {selectedStaff ? provider.staff.find((s) => s.id === selectedStaff)?.name : 'Herhangi'} · {formatDate(selectedDate)} {selectedTime} · {formatCurrency(selectedService?.price ?? 0)}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(3)}>← Geri</Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleBook} disabled={booking || !customer.name || !customer.phone}>
                {booking ? 'Oluşturuluyor...' : 'Randevuyu Onayla'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Success — durum bazlı (onaylandı / onay bekliyor) */}
        {step === 5 && (
          <div className="text-center py-8">
            {bookedStatus === 'beklemede' ? (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-amber-600" />
                </div>
                <h3 className="font-semibold text-lg mb-1">Randevu Talebiniz Alındı!</h3>
                <p className="text-sm text-muted-foreground mb-1">
                  {selectedService?.name} · {formatDate(selectedDate)} {selectedTime}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg px-3 py-2 inline-block mb-4">
                  ⏳ İşletme onayladığında randevunuz kesinleşecek
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-lg mb-1">Randevunuz Oluşturuldu!</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {selectedService?.name} · {formatDate(selectedDate)} {selectedTime}
                </p>
              </>
            )}
            <a href={whatsappLink(customer.phone, bookedStatus === 'beklemede'
              ? `Randevu talebiniz alındı: ${selectedService?.name}, ${formatDate(selectedDate)} ${selectedTime}. Onay sonrası bilgi verilecek.`
              : `Randevunuz onaylandı: ${selectedService?.name}, ${formatDate(selectedDate)} ${selectedTime}`)} target="_blank" rel="noopener">
              <Button variant="outline" size="sm"><MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp Hatırlatma</Button>
            </a>
            <div className="mt-4">
              <Button variant="ghost" size="sm" onClick={() => { setStep(1); setSelectedService(null); setSelectedStaff(''); setSelectedTime(''); setCustomer({ name: '', phone: '', email: '', note: '' }) }}>
                Yeni Randevu
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Manual booking dialog (admin) — kayıt defteri otomatik tamamlamalı
function ManualBookingDialog({ provider, open, onOpenChange, onSuccess, initial }: {
  provider: Provider; open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void
  initial?: { name?: string; phone?: string; serviceId?: string; staffId?: string }
}) {
  const [form, setForm] = useState({
    serviceId: initial?.serviceId ?? '', staffId: initial?.staffId ?? '',
    date: new Date().toISOString().slice(0, 10),
    time: '10:00', name: initial?.name ?? '', phone: initial?.phone ?? '', email: '', note: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const dateTime = new Date(`${form.date}T${form.time}:00`)
      await apiPost(`/api/appointments/providers/${provider.id}/appointments`, {
        serviceId: form.serviceId || undefined,
        staffId: form.staffId || undefined,
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
                {provider.services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.duration}dk)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Personel</Label>
            <Select value={form.staffId || '__none__'} onValueChange={(v) => setForm({ ...form, staffId: v === '__none__' ? '' : v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Herhangi" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Herhangi biri</SelectItem>
                {provider.staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
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
