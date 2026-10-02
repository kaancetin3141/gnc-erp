'use client'

// ============================================================
// KAFE REZERVASYON YÖNETİMİ
// — Günlük rezervasyon defteri + durum akışı (bekliyor→onaylandi→geldi/gelmedi)
// — Masa atama + çakışma koruması (API tarafında)
// — WhatsApp onay/hatırlatma linkleri
// ============================================================

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { whatsappLink } from '@/lib/format'
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight, Users, Clock, Phone,
  MessageCircle, Check, X, UserCheck, UserX, Trash2, Armchair, RefreshCw,
} from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

interface Reservation {
  id: string
  name: string
  phone: string | null
  partySize: number
  date: string
  durationMin: number
  status: 'bekliyor' | 'onaylandi' | 'geldi' | 'gelmedi' | 'iptal'
  source: string
  note: string | null
  table?: { id: string; number: string; capacity: number } | null
}

interface ReservationsResponse {
  items: Reservation[]
  summary: { total: number; active: number; totalGuests: number }
}

interface TableItem {
  id: string
  number: string
  capacity: number
  status: string
}

const STATUS_META: Record<Reservation['status'], { label: string; cls: string; dot: string }> = {
  bekliyor: { label: 'Bekliyor', cls: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800', dot: 'bg-amber-500' },
  onaylandi: { label: 'Onaylandı', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800', dot: 'bg-emerald-500' },
  geldi: { label: 'Geldi', cls: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800', dot: 'bg-teal-500' },
  gelmedi: { label: 'Gelmedi', cls: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800', dot: 'bg-rose-500' },
  iptal: { label: 'İptal', cls: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-900/60 dark:text-slate-400 dark:border-slate-700', dot: 'bg-slate-400' },
}

const SOURCE_LABELS: Record<string, string> = {
  yuzden: 'Yüz yüze',
  telefon: 'Telefon',
  whatsapp: 'WhatsApp',
  online: 'Online',
}

function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ============================================================
// Ana bileşen
// ============================================================

export function CafeReservations({ cafeId }: { cafeId: string }) {
  const qc = useQueryClient()
  const [dayOffset, setDayOffset] = useState(0)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)

  const selectedDay = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + dayOffset)
    d.setHours(0, 0, 0, 0)
    return d
  }, [dayOffset])

  const dateStr = useMemo(() => {
    return `${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.getDate()).padStart(2, '0')}`
  }, [selectedDay])

  const dayLabel = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diff = Math.round((selectedDay.getTime() - today.getTime()) / 86400000)
    if (diff === 0) return 'Bugün'
    if (diff === 1) return 'Yarın'
    if (diff === -1) return 'Dün'
    return selectedDay.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
  }, [selectedDay])

  const { data, isLoading, refetch, isRefetching } = useQuery<ReservationsResponse>({
    queryKey: ['cafe-reservations', cafeId, dateStr],
    queryFn: () => apiGet(`/api/cafe/${cafeId}/reservations?date=${dateStr}`),
  })

  // Masalar (form için)
  const { data: tablesData } = useQuery<{ items: TableItem[] }>({
    queryKey: ['cafe-tables-for-res', cafeId],
    queryFn: () => apiGet(`/api/cafe/${cafeId}/tables`),
    staleTime: 60_000,
  })
  const tables = tablesData?.items ?? []

  const reservations = data?.items ?? []
  const filtered = useMemo(() => {
    if (statusFilter === 'all') return reservations
    if (statusFilter === 'active') return reservations.filter((r) => r.status === 'bekliyor' || r.status === 'onaylandi')
    return reservations.filter((r) => r.status === statusFilter)
  }, [reservations, statusFilter])

  const summary = data?.summary ?? { total: 0, active: 0, totalGuests: 0 }

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['cafe-reservations'] })
  }

  const updateStatus = async (resId: string, status: Reservation['status']) => {
    try {
      await apiPatch(`/api/cafe/${cafeId}/reservations/${resId}`, { status })
      toast.success(
        status === 'onaylandi' ? 'Rezervasyon onaylandı' :
        status === 'geldi' ? 'Müşteri geldi olarak işaretlendi' :
        status === 'gelmedi' ? 'Gelmedi olarak işaretlendi' :
        'Rezervasyon iptal edildi',
      )
      invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    }
  }

  const deleteReservation = async (resId: string) => {
    try {
      await apiDelete(`/api/cafe/${cafeId}/reservations/${resId}`)
      toast.success('Rezervasyon silindi')
      invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi')
    }
  }

  const reminderText = (r: Reservation) =>
    `Merhaba ${r.name}, ${new Date(r.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} ${new Date(r.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} tarihli ${r.partySize} kişilik rezervasyonunuz onaylanmıştır. ${r.table ? `Masanız: ${r.table.number}. ` : ''}Bekliyoruz! 🙏`

  return (
    <div className="space-y-4">
      {/* Üst bar: gün gezinme + filtre + yeni */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDayOffset((v) => v - 1)} aria-label="Önceki gün">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-[110px] text-center">
            <div className="text-sm font-medium leading-tight">{dayLabel}</div>
            <div className="text-[10px] text-muted-foreground">
              {selectedDay.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDayOffset((v) => v + 1)} aria-label="Sonraki gün">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {dayOffset !== 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDayOffset(0)}>
            Bugün'e dön
          </Button>
        )}
        <div className="flex-1" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[150px]" aria-label="Durum filtresi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="active">Aktif (Bekleyen+Onaylı)</SelectItem>
            <SelectItem value="bekliyor">Bekliyor</SelectItem>
            <SelectItem value="onaylandi">Onaylandı</SelectItem>
            <SelectItem value="geldi">Geldi</SelectItem>
            <SelectItem value="gelmedi">Gelmedi</SelectItem>
            <SelectItem value="iptal">İptal</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => void refetch()} aria-label="Yenile">
          <RefreshCw className={cn('w-4 h-4', isRefetching && 'animate-spin')} />
        </Button>
        <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white h-9" onClick={() => setFormOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Rezervasyon Al
        </Button>
      </div>

      {/* Özet kartları */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CalendarDays className="w-3.5 h-3.5 text-amber-600" /> Rezervasyon
            </div>
            <div className="text-2xl font-bold">{summary.total}</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Users className="w-3.5 h-3.5 text-emerald-600" /> Beklenen Kişi
            </div>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{summary.totalGuests}</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="w-3.5 h-3.5 text-sky-600" /> Bekleyen Talep
            </div>
            <div className="text-2xl font-bold">
              {reservations.filter((r) => r.status === 'bekliyor').length}
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <UserCheck className="w-3.5 h-3.5 text-teal-600" /> Onaylı
            </div>
            <div className="text-2xl font-bold">
              {reservations.filter((r) => r.status === 'onaylandi').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <CalendarDays className="w-12 h-12 mx-auto mb-3 text-muted-foreground/25" />
            <p className="font-medium text-sm">Bu gün için rezervasyon yok</p>
            <p className="text-xs text-muted-foreground mt-1">Yeni rezervasyon almak için &quot;Rezervasyon Al&quot; butonunu kullanın</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const meta = STATUS_META[r.status]
            const time = new Date(r.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            const isPast = new Date(r.date).getTime() < Date.now()
            return (
              <Card key={r.id} className={cn('border shadow-sm transition-colors', r.status === 'bekliyor' && 'border-amber-300/60 dark:border-amber-800/50', r.status === 'gelmedi' && 'opacity-75')}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    {/* Saat bloğu */}
                    <div className={cn('flex flex-col items-center justify-center rounded-lg px-3 py-2 min-w-[64px]', isPast && r.status !== 'geldi' ? 'bg-muted/60' : 'bg-amber-50 dark:bg-amber-950/30')}>
                      <span className="text-lg font-bold tabular-nums leading-none">{time}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">{r.durationMin} dk</span>
                    </div>

                    {/* Bilgiler */}
                    <div className="flex-1 min-w-[180px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm">{r.name}</span>
                        <Badge variant="outline" className={cn('text-[10px]', meta.cls)}>
                          {meta.label}
                        </Badge>
                        {r.table && (
                          <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800">
                            <Armchair className="w-3 h-3 mr-1" />{r.table.number}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">{SOURCE_LABELS[r.source] ?? r.source}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{r.partySize} kişi</span>
                        {r.phone && (
                          <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{r.phone}</span>
                        )}
                        {r.note && <span className="italic">“{r.note}”</span>}
                      </div>
                    </div>

                    {/* Aksiyonlar */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.status === 'bekliyor' && (
                        <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => void updateStatus(r.id, 'onaylandi')}>
                          <Check className="w-3.5 h-3.5 mr-1" /> Onayla
                        </Button>
                      )}
                      {(r.status === 'onaylandi' || r.status === 'bekliyor') && (
                        <>
                          <Button size="sm" variant="outline" className="h-8 text-xs border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-300" onClick={() => void updateStatus(r.id, 'geldi')}>
                            <UserCheck className="w-3.5 h-3.5 mr-1" /> Geldi
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300" onClick={() => void updateStatus(r.id, 'gelmedi')}>
                            <UserX className="w-3.5 h-3.5 mr-1" /> Gelmedi
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void updateStatus(r.id, 'iptal')}>
                            <X className="w-3.5 h-3.5 mr-1" /> İptal
                          </Button>
                        </>
                      )}
                      {r.phone && r.status !== 'iptal' && (
                        <Button size="sm" variant="outline" className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300" asChild>
                          <a href={whatsappLink(r.phone, r.status === 'onaylandi' || r.status === 'geldi' ? reminderText(r) : `Merhaba ${r.name}, ${time} rezervasyonunuz hakkında bilgi için yazıyoruz.`)} target="_blank" rel="noopener noreferrer" aria-label={`${r.name} için WhatsApp`}>
                            <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp
                          </a>
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => void deleteReservation(r.id)} aria-label="Sil">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <ReservationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        cafeId={cafeId}
        tables={tables}
        defaultDate={toLocalInput(new Date(Date.now() + 60 * 60 * 1000))}
        onSaved={() => { invalidate() }}
      />
    </div>
  )
}

// ============================================================
// Yeni rezervasyon formu
// ============================================================

function ReservationFormDialog({
  open, onOpenChange, cafeId, tables, defaultDate, onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  cafeId: string
  tables: TableItem[]
  defaultDate: string
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', phone: '', partySize: '2', date: defaultDate,
    durationMin: '90', tableId: 'none', source: 'telefon', note: '',
  })

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Müşteri adı gerekli')
      return
    }
    setSaving(true)
    try {
      await apiPost(`/api/cafe/${cafeId}/reservations`, {
        name: form.name,
        phone: form.phone || undefined,
        partySize: Number(form.partySize),
        date: new Date(form.date).toISOString(),
        durationMin: Number(form.durationMin),
        tableId: form.tableId === 'none' ? undefined : form.tableId,
        source: form.source,
        note: form.note || undefined,
      })
      toast.success('Rezervasyon kaydedildi')
      void qc.invalidateQueries({ queryKey: ['cafe-reservations'] })
      onSaved()
      onOpenChange(false)
      setForm({ name: '', phone: '', partySize: '2', date: toLocalInput(new Date(Date.now() + 60 * 60 * 1000)), durationMin: '90', tableId: 'none', source: 'telefon', note: '' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Yeni Rezervasyon</DialogTitle>
          <DialogDescription>Müşteri bilgilerini ve masa tercihini girin</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Müşteri Adı *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Örn: Ayşe Yılmaz" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Telefon (WhatsApp)</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0532..." className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Kişi Sayısı</Label>
              <Input type="number" min={1} max={100} value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Tarih & Saat</Label>
              <Input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Süre (dk)</Label>
              <Select value={form.durationMin} onValueChange={(v) => setForm({ ...form, durationMin: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['60', '90', '120', '150', '180'].map((d) => (
                    <SelectItem key={d} value={d}>{d} dk</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Masa</Label>
              <Select value={form.tableId} onValueChange={(v) => setForm({ ...form, tableId: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Atanmadı (girişte karar)</SelectItem>
                  {tables.map((t) => (
                    <SelectItem key={t.id} value={t.id} disabled={t.status === 'dolu'}>
                      {t.number} · {t.capacity} kişi{t.status === 'dolu' ? ' (dolu)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Kaynak</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telefon">Telefon</SelectItem>
                  <SelectItem value="yuzden">Yüz yüze</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Not (doğum günü, pencere kenarı vb.)</Label>
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className="mt-1" placeholder="Örn: Doğum günü kutlaması, tatlı sürprizi..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Kaydediliyor...' : 'Rezervasyonu Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
