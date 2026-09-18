'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiDelete } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  getStatusMeta, APPOINTMENT_STATUSES, type AppointmentStatus,
} from '@/lib/appointment-utils'
import {
  formatCurrency, formatDateTime, whatsappLink, toCSV, downloadFile,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Search, Download, MoreVertical, CheckCircle2, XCircle,
  UserX, Check, Clock, Phone, MessageCircle,
} from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

interface Staff {
  id: string
  name: string
  title: string | null
}
interface Service {
  id: string
  name: string
  duration: number
  price: number
  currency: string
  category?: string | null
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
  reminderSent?: boolean
  staff?: Staff | null
  service?: Service | null
}
interface ApptsResponse { items: Appointment[] }
interface StaffResponse { items: Staff[] }

// ============================================================
// Appointment List
// ============================================================

export function AppointmentList({ providerId }: { providerId: string }) {
  const qc = useQueryClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekLater = new Date(today.getTime() + 7 * 86400000)

  const [filterStart, setFilterStart] = useState(today.toISOString().slice(0, 10))
  const [filterEnd, setFilterEnd] = useState(weekLater.toISOString().slice(0, 10))
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterStaff, setFilterStaff] = useState<string>('all')
  const [search, setSearch] = useState('')

  const { data: staffData } = useQuery({
    queryKey: ['appointment-staff', providerId],
    queryFn: () => apiGet<StaffResponse>(`/api/appointments/providers/${providerId}/staff`),
    enabled: !!providerId,
  })
  const staffList = staffData?.items ?? []

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (filterStart) p.set('startDate', new Date(filterStart + 'T00:00:00').toISOString())
    if (filterEnd) p.set('endDate', new Date(filterEnd + 'T23:59:59').toISOString())
    if (filterStaff !== 'all') p.set('staffId', filterStaff)
    if (filterStatus !== 'all') p.set('status', filterStatus)
    return p.toString()
  }, [filterStart, filterEnd, filterStaff, filterStatus])

  const { data, isLoading } = useQuery({
    queryKey: ['appointment-list', providerId, params],
    queryFn: () => apiGet<ApptsResponse>(`/api/appointments/providers/${providerId}/appointments?${params}`),
    enabled: !!providerId,
  })
  const appointments = data?.items ?? []

  const filtered = useMemo(() => {
    if (!search.trim()) return appointments
    const q = search.toLowerCase()
    return appointments.filter((a) =>
      a.customerName.toLowerCase().includes(q) ||
      a.customerPhone.includes(q) ||
      (a.customerEmail?.toLowerCase().includes(q) ?? false) ||
      (a.staff?.name.toLowerCase().includes(q) ?? false) ||
      (a.service?.name.toLowerCase().includes(q) ?? false),
    )
  }, [appointments, search])

  async function handleStatus(appt: Appointment, status: AppointmentStatus) {
    try {
      await apiPatch(
        `/api/appointments/providers/${providerId}/appointments/${appt.id}`,
        { status },
      )
      qc.invalidateQueries({ queryKey: ['appointment-list', providerId] })
      qc.invalidateQueries({ queryKey: ['appointment-appointments', providerId] })
      toast.success(`Durum: ${getStatusMeta(status).label}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    }
  }

  async function handleCancel(appt: Appointment) {
    try {
      await apiDelete(
        `/api/appointments/providers/${providerId}/appointments/${appt.id}`,
      )
      qc.invalidateQueries({ queryKey: ['appointment-list', providerId] })
      qc.invalidateQueries({ queryKey: ['appointment-appointments', providerId] })
      toast.success('Randevu iptal edildi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İptal edilemedi')
    }
  }

  // Onay sonrası WhatsApp bilgilendirme — işletme müşteriye onay mesajı gönderir
  function buildApprovalMessage(a: Appointment): string {
    const service = a.service?.name ? a.service.name : 'randevu'
    const staff = a.staff?.name ? ` (${a.staff.name})` : ''
    return (
      `Merhaba ${a.customerName}, 🎉\n\n` +
      `${formatDateTime(a.date)} tarihli ${service}${staff} randevunuz ONAYLANDI. ✅\n\n` +
      `⏰ Saat: ${new Date(a.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\n` +
      (a.service?.duration ? `⏳ Süre: ${a.service.duration} dakika\n` : '') +
      (a.price ? `💰 Ücret: ${formatCurrency(a.price)}\n` : '') +
      `\nGörüşmek üzere! 🙌`
    )
  }

  async function sendApprovalWhatsApp(appt: Appointment) {
    // WhatsApp onay mesajı — müşteriye bilgi gönder
    const link = whatsappLink(appt.customerPhone, buildApprovalMessage(appt))
    window.open(link, '_blank', 'noopener,noreferrer')
    // Bilgi gönderildi olarak işaretle
    try {
      await apiPatch(
        `/api/appointments/providers/${providerId}/appointments/${appt.id}`,
        { reminderSent: true },
      )
      qc.invalidateQueries({ queryKey: ['appointment-list', providerId] })
    } catch {
      // sessiz geç — WhatsApp açıldı
    }
    toast.success('WhatsApp onay mesajı hazırlandı')
  }

  function handleExportCSV() {
    if (filtered.length === 0) {
      toast.error('Dışa aktarılacak randevu yok')
      return
    }
    const rows = filtered.map((a) => ({
      Tarih: formatDateTime(a.date),
      'Müşteri': a.customerName,
      'Telefon': a.customerPhone,
      'E-posta': a.customerEmail ?? '',
      'Hizmet': a.service?.name ?? '',
      'Personel': a.staff?.name ?? '',
      'Süre(dk)': a.service?.duration ?? '',
      'Tutar': a.price,
      'Durum': getStatusMeta(a.status).label,
      'Kaynak': a.source,
      'Not': a.customerNote ?? '',
    }))
    const csv = toCSV(rows)
    downloadFile(csv, `randevular-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success(`${filtered.length} randevu dışa aktarıldı`)
  }

  function setQuickRange(days: number) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + days * 86400000)
    setFilterStart(start.toISOString().slice(0, 10))
    setFilterEnd(end.toISOString().slice(0, 10))
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
      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setQuickRange(0)} className="text-xs">
                Bugün
              </Button>
              <Button size="sm" variant="outline" onClick={() => setQuickRange(7)} className="text-xs">
                7 Gün
              </Button>
              <Button size="sm" variant="outline" onClick={() => setQuickRange(30)} className="text-xs">
                30 Gün
              </Button>
              <div className="flex items-center gap-1 ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportCSV}
                  className="text-xs"
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  CSV
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Başlangıç</Label>
                <Input
                  type="date"
                  value={filterStart}
                  onChange={(e) => setFilterStart(e.target.value)}
                  className="h-9 text-sm mt-0.5"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Bitiş</Label>
                <Input
                  type="date"
                  value={filterEnd}
                  onChange={(e) => setFilterEnd(e.target.value)}
                  className="h-9 text-sm mt-0.5"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Personel</Label>
                <Select value={filterStaff} onValueChange={setFilterStaff}>
                  <SelectTrigger className="h-9 text-sm mt-0.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tümü</SelectItem>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Durum</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9 text-sm mt-0.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tümü</SelectItem>
                    {APPOINTMENT_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Müşteri, telefon, hizmet ara..."
                className="h-9 text-sm pl-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {APPOINTMENT_STATUSES.slice(0, 5).map((s) => {
          const count = filtered.filter((a) => a.status === s.value).length
          return (
            <Card key={s.value} className="overflow-hidden">
              <CardContent className={cn('p-2.5', s.bg)}>
                <div className={cn('text-xs font-medium', s.color)}>{s.label}</div>
                <div className="text-xl font-bold mt-0.5">{count}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Tarih / Saat</TableHead>
                <TableHead className="min-w-[120px]">Müşteri</TableHead>
                <TableHead className="min-w-[120px]">Hizmet</TableHead>
                <TableHead className="min-w-[100px]">Personel</TableHead>
                <TableHead className="min-w-[80px]">Tutar</TableHead>
                <TableHead className="min-w-[100px]">Durum</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    Filtrelerle eşleşen randevu bulunamadı
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => {
                  const meta = getStatusMeta(a.status)
                  const d = new Date(a.date)
                  return (
                    <TableRow key={a.id} className="hover:bg-accent/30">
                      <TableCell>
                        <div className="font-medium text-sm">
                          {d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')}
                          {a.service && ` · ${a.service.duration}dk`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{a.customerName}</div>
                        <div className="text-xs text-muted-foreground">{a.customerPhone}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{a.service?.name ?? '—'}</div>
                        {a.service?.category && (
                          <Badge variant="outline" className="text-[9px] py-0 mt-0.5">
                            {a.service.category}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{a.staff?.name ?? 'Herhangi'}</TableCell>
                      <TableCell className="font-medium text-sm">
                        {formatCurrency(a.price)}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(meta.bg, meta.color, 'border-0')}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      {/* Onay + WhatsApp aksiyonları */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {a.status === 'beklemede' && (
                            <Button
                              size="sm"
                              className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => handleStatus(a, 'onaylandi')}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Onayla
                            </Button>
                          )}
                          {a.status === 'onaylandi' && (
                            <Button
                              size="sm"
                              variant={a.reminderSent ? 'outline' : 'default'}
                              className={cn(
                                'h-7 text-[11px]',
                                !a.reminderSent && 'bg-[#25D366] hover:bg-[#1fb857] text-white border-0',
                                a.reminderSent && 'text-[#25D366] border-[#25D366]/40',
                              )}
                              onClick={() => sendApprovalWhatsApp(a)}
                              title="Müşteriye WhatsApp ile onay bilgisi gönder"
                            >
                              <MessageCircle className="w-3 h-3 mr-1" />
                              {a.reminderSent ? 'Bilgi Gönderildi' : 'WhatsApp ile Bilgi Gönder'}
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7">
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>İşlemler</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <a href={`tel:${a.customerPhone}`}>
                                <Phone className="w-3.5 h-3.5 mr-2" /> Ara
                              </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a
                                href={whatsappLink(a.customerPhone, `Merhaba ${a.customerName}, ${formatDateTime(a.date)} tarihli randevunuz hakkında hatırlatma.`)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <MessageCircle className="w-3.5 h-3.5 mr-2" /> WhatsApp
                              </a>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>Durumu Değiştir</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleStatus(a, 'onaylandi')}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Onayla
                            </DropdownMenuItem>
                            {a.status === 'onaylandi' && (
                              <DropdownMenuItem onClick={() => sendApprovalWhatsApp(a)}>
                                <MessageCircle className="w-3.5 h-3.5 mr-2 text-[#25D366]" /> WhatsApp Onay Mesajı
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleStatus(a, 'tamamlandi')}>
                              <Check className="w-3.5 h-3.5 mr-2 text-teal-600" /> Tamamlandı
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatus(a, 'beklemede')}>
                              <Clock className="w-3.5 h-3.5 mr-2 text-amber-600" /> Beklemede
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatus(a, 'gelmedi')}>
                              <UserX className="w-3.5 h-3.5 mr-2 text-rose-600" /> Gelmedi
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleCancel(a)}
                              className="text-red-600"
                            >
                              <XCircle className="w-3.5 h-3.5 mr-2" /> İptal Et
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Toplam <strong className="text-foreground">{filtered.length}</strong> randevu
          {filtered.length > 0 && (
            <>
              {' · '}Toplam tutar:{' '}
              <strong className="text-foreground">
                {formatCurrency(filtered.reduce((sum, a) => sum + (a.price || 0), 0))}
              </strong>
            </>
          )}
        </span>
      </div>
    </div>
  )
}
