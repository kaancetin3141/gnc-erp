'use client'

// ============================================================
// İŞLETME TATİLİ / KAPANIŞ GÜNLERİ DİYALOĞU
// · Mevcut tatil kayıtları (yakınlar vurgulu, geçmişler soluk)
// · Yeni tatil: tam gün veya saat aralıklı + sebep
// · Çakışan aktif randevu varsa 409 → "Yine de kapat" seçeneği sunar
// · Tatilde tüm personel randevu alamaz (manuel + online + slot üretimi)
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
import { Building2, Plus, Trash2, CalendarOff, Clock, AlertTriangle } from 'lucide-react'

interface ClosureEntry {
  id: string
  date: string
  isFullDay: boolean
  startTime: string | null
  endTime: string | null
  reason: string | null
}

export function ProviderClosureDialog({
  providerId,
  open,
  onOpenChange,
}: {
  providerId: string
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
  const [forceMode, setForceMode] = useState(false)
  const [lastConflictMsg, setLastConflictMsg] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['appointment-closures', providerId] })
    qc.invalidateQueries({ queryKey: ['appointment-closure-range', providerId] })
    qc.invalidateQueries({ queryKey: ['appointment-appointments', providerId] })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['appointment-closures', providerId],
    queryFn: () => apiGet<ClosureEntry[]>(
      `/api/appointments/providers/${providerId}/closures`,
    ),
    enabled: open,
  })

  const entries = Array.isArray(data) ? data : []
  const todayKey = new Date().toDateString()
  const upcoming = entries.filter((t) => new Date(t.date).toDateString() >= todayKey)
  const past = entries.filter((t) => new Date(t.date).toDateString() < todayKey)

  async function submit(force: boolean) {
    setSaving(true)
    try {
      await apiPost(`/api/appointments/providers/${providerId}/closures`, {
        date,
        isFullDay,
        startTime: isFullDay ? undefined : startTime,
        endTime: isFullDay ? undefined : endTime,
        reason: reason || undefined,
        force: force || undefined,
      })
      toast.success('İşletme tatili eklendi', {
        description: 'Bu aralıkta yeni randevu alınamaz (manuel ve online dahil).',
      })
      setDate('')
      setReason('')
      setIsFullDay(true)
      setForceMode(false)
      setLastConflictMsg(null)
      invalidate()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Tatil kaydı eklenemedi'
      if (msg.includes('aktif randevu var')) {
        setLastConflictMsg(msg)
        setForceMode(true)
      }
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd() {
    if (!date) {
      toast.error('Tarih seçin')
      return
    }
    setForceMode(false)
    setLastConflictMsg(null)
    await submit(false)
  }

  async function handleForce() {
    await submit(true)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await apiDelete(`/api/appointments/providers/${providerId}/closures/${id}`)
      toast.success('Tatil kaydı silindi')
      invalidate()
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setForceMode(false); setLastConflictMsg(null) } onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-rose-600" />
            İşletme Tatili / Kapanış
          </DialogTitle>
          <DialogDescription>
            Bayram, resmi tatil, tadilat... Tatil aralığında tüm personel için randevu alınamaz.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Çakışma uyarısı + force */}
          {forceMode && lastConflictMsg && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-3.5 h-3.5" />
                Tatil aralığında aktif randevular var
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                Randevular korunur — sadece YENİ randevular engellenir. Mevcutları taşımak/iptal
                etmek için takvimden yönetin.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-200"
                disabled={saving}
                onClick={handleForce}
              >
                Yine de Kapat (randevular korunur)
              </Button>
            </div>
          )}

          {/* Yeni tatil formu */}
          <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-rose-600" />
              Yeni Tatil Ekle
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cl-date" className="text-xs">Tarih *</Label>
                <Input
                  id="cl-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div className="flex items-end gap-2 pb-1.5">
                <Switch checked={isFullDay} onCheckedChange={setIsFullDay} id="cl-fullday" />
                <Label htmlFor="cl-fullday" className="text-xs cursor-pointer">
                  {isFullDay ? 'Tam gün' : 'Saat aralığı'}
                </Label>
              </div>
            </div>
            {!isFullDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="cl-start" className="text-xs">Başlangıç</Label>
                  <Input
                    id="cl-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="cl-end" className="text-xs">Bitiş</Label>
                  <Input
                    id="cl-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="cl-reason" className="text-xs">Sebep (opsiyonel)</Label>
              <Input
                id="cl-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Bayram, resmi tatil, tadilat, düğün..."
                className="mt-1 h-9 text-sm"
              />
            </div>
            <Button
              onClick={handleAdd}
              disabled={saving || !date}
              className="w-full bg-rose-600 hover:bg-rose-700"
              size="sm"
            >
              {saving ? 'Ekleniyor...' : 'Tatili Ekle'}
            </Button>
          </div>

          {/* Mevcut tatiller */}
          <div>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <CalendarOff className="w-3.5 h-3.5 text-rose-600" />
              Yaklaşan Tatiller ({upcoming.length})
            </div>
            {isLoading ? (
              <p className="text-xs text-muted-foreground py-2">Yükleniyor...</p>
            ) : upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 italic">
                Yaklaşan tatil yok — işletme tüm günler açık.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {upcoming.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/60 px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium">{formatDate(t.date)}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {describeTimeOff(t)}
                        {t.reason && <span>· {t.reason}</span>}
                      </div>
                    </div>
                    <Badge className="text-[9px] py-0 bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-900/50 dark:text-rose-200" variant="outline">
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
                  Geçmiş tatiller ({past.length})
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
