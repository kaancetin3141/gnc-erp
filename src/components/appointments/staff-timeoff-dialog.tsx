'use client'

// ============================================================
// PERSONEL İZİN GÜNLERİ DİYALOĞU
// · Mevcut izin kayıtları (yakınlar vurgulu, geçmişler soluk)
// · Yeni izin: tam gün veya saat aralıklı + sebep
// · İzinli personel bu aralıkta randevu alamaz (API tarafında da engelli)
// ============================================================

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { describeTimeOff } from '@/lib/appointment-timeoff'
import { Palmtree, Plus, Trash2, CalendarOff, Clock } from 'lucide-react'

interface TimeOffEntry {
  id: string
  staffId: string
  date: string
  isFullDay: boolean
  startTime: string | null
  endTime: string | null
  reason: string | null
}

interface MovedAppointment {
  customerName: string
  to: string
  time: string
}

interface TimeOffPostResult extends TimeOffEntry {
  movedAppointments?: MovedAppointment[]
}

export function StaffTimeOffDialog({
  providerId,
  staff,
  open,
  onOpenChange,
}: {
  providerId: string
  staff: { id: string; name: string; title?: string | null }
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [date, setDate] = useState('')
  const [isFullDay, setIsFullDay] = useState(true)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('13:00')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [reassignOffer, setReassignOffer] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['appointment-timeoff', providerId, staff.id],
    queryFn: () => apiGet<TimeOffEntry[]>(
      `/api/appointments/providers/${providerId}/time-off?staffId=${staff.id}`,
    ),
    enabled: open && !!staff.id,
  })

  const entries = Array.isArray(data) ? data : []
  const todayKey = new Date().toDateString()
  const upcoming = entries.filter((t) => new Date(t.date).toDateString() >= todayKey)
  const past = entries.filter((t) => new Date(t.date).toDateString() < todayKey)

  async function handleAdd() {
    if (!date) {
      toast.error('Tarih seçin')
      return
    }
    setReassignOffer(false)
    setSaving(true)
    try {
      const res = await apiPost<TimeOffPostResult>(
        `/api/appointments/providers/${providerId}/time-off`, {
        staffId: staff.id,
        date,
        isFullDay,
        startTime: isFullDay ? undefined : startTime,
        endTime: isFullDay ? undefined : endTime,
        reason: reason || undefined,
      })
      const moved = res?.movedAppointments ?? []
      if (moved.length > 0) {
        toast.success(`İzin kaydı eklendi — ${moved.length} randevu otomatik dağıtıldı`, {
          description: moved.map((m) => `${m.customerName} (${m.time}) → ${m.to}`).join(' · '),
        })
      } else {
        toast.success('İzin kaydı eklendi', {
          description: `${staff.name} bu tarihte randevu alamaz.`,
        })
      }
      setDate('')
      setReason('')
      setIsFullDay(true)
      qc.invalidateQueries({ queryKey: ['appointment-timeoff', providerId] })
      qc.invalidateQueries({ queryKey: ['appointment-timeoff-range', providerId] })
      qc.invalidateQueries({ queryKey: ['appointment-appointments', providerId] })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'İzin kaydı eklenemedi'
      if (msg.includes('aktif randevu var')) setReassignOffer(true)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleAutoReassign() {
    setSaving(true)
    try {
      const res = await apiPost<TimeOffPostResult>(
        `/api/appointments/providers/${providerId}/time-off`, {
        staffId: staff.id,
        date,
        isFullDay,
        startTime: isFullDay ? undefined : startTime,
        endTime: isFullDay ? undefined : endTime,
        reason: reason || undefined,
        autoReassign: true,
      })
      const moved = res?.movedAppointments ?? []
      toast.success(`İzin eklendi — ${moved.length} randevu başka personele dağıtıldı`, {
        description: moved.map((m) => `${m.customerName} (${m.time}) → ${m.to}`).join(' · ') || undefined,
      })
      setDate('')
      setReason('')
      setIsFullDay(true)
      setReassignOffer(false)
      qc.invalidateQueries({ queryKey: ['appointment-timeoff', providerId] })
      qc.invalidateQueries({ queryKey: ['appointment-timeoff-range', providerId] })
      qc.invalidateQueries({ queryKey: ['appointment-appointments', providerId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Otomatik dağıtım başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await apiDelete(`/api/appointments/providers/${providerId}/time-off/${id}`)
      toast.success('İzin kaydı silindi')
      qc.invalidateQueries({ queryKey: ['appointment-timeoff', providerId] })
      qc.invalidateQueries({ queryKey: ['appointment-timeoff-range', providerId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi')
    } finally {
      setDeletingId(null)
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric', weekday: 'short',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="w-4 h-4 text-amber-600" />
            İzin Günleri — {staff.name}
          </DialogTitle>
          <DialogDescription>
            İzinli personel bu aralıklarda randevu alamaz (manuel ve online randevu dahil).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Yeni izin formu */}
          <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              Yeni İzin Ekle
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="to-date" className="text-xs">Tarih *</Label>
                <Input
                  id="to-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div className="flex items-end gap-2 pb-1.5">
                <Switch checked={isFullDay} onCheckedChange={setIsFullDay} id="to-fullday" />
                <Label htmlFor="to-fullday" className="text-xs cursor-pointer">
                  {isFullDay ? 'Tam gün' : 'Saat aralığı'}
                </Label>
              </div>
            </div>
            {!isFullDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="to-start" className="text-xs">Başlangıç</Label>
                  <Input
                    id="to-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="to-end" className="text-xs">Bitiş</Label>
                  <Input
                    id="to-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="to-reason" className="text-xs">Sebep (opsiyonel)</Label>
              <Input
                id="to-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Yıllık izin, hastalık, eğitim..."
                className="mt-1 h-9 text-sm"
              />
            </div>
            <Button
              onClick={handleAdd}
              disabled={saving || !date}
              className="w-full bg-amber-600 hover:bg-amber-700"
              size="sm"
            >
              {saving ? 'Ekleniyor...' : 'İzni Ekle'}
            </Button>
            {reassignOffer && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-900/60 p-2.5 space-y-1.5">
                <div className="text-[11px] text-sky-800 dark:text-sky-200 leading-relaxed">
                  İzin aralığındaki randevular, aynı hizmeti veren ve müsait olan başka
                  personele otomatik olarak dağıtılabilir.
                </div>
                <Button
                  size="sm"
                  className="w-full bg-sky-600 hover:bg-sky-700"
                  disabled={saving}
                  onClick={handleAutoReassign}
                >
                  {saving ? 'Dağıtılıyor...' : '🔀 Randevuları Otomatik Dağıt'}
                </Button>
              </div>
            )}
          </div>

          {/* Mevcut izinler */}
          <div>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Palmtree className="w-3.5 h-3.5 text-amber-600" />
              Yaklaşan İzinler ({upcoming.length})
            </div>
            {isLoading ? (
              <p className="text-xs text-muted-foreground py-2">Yükleniyor...</p>
            ) : upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 italic">
                Yaklaşan izin yok — personel tüm günler müsait.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {upcoming.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium">{formatDate(t.date)}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {describeTimeOff(t)}
                        {t.reason && <span>· {t.reason}</span>}
                      </div>
                    </div>
                    <Badge className="text-[9px] py-0 bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/50 dark:text-amber-200" variant="outline">
                      {t.isFullDay ? 'Tam gün' : 'Kısmi'}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-red-500 hover:text-red-700 shrink-0"
                      disabled={deletingId === t.id}
                      onClick={() => handleDelete(t.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {past.length > 0 && (
              <details className="mt-2">
                <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                  Geçmiş izinler ({past.length})
                </summary>
                <ul className="mt-1 space-y-1">
                  {past.map((t) => (
                    <li
                      key={t.id}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1 opacity-60',
                        'bg-muted/40',
                      )}
                    >
                      <span className="text-[10px] flex-1">
                        {formatDate(t.date)} — {describeTimeOff(t)}{t.reason ? ` · ${t.reason}` : ''}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 text-red-400 hover:text-red-600 shrink-0"
                        disabled={deletingId === t.id}
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
