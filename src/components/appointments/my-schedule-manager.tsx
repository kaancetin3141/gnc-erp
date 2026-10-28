'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import {
  CalendarClock, Plus, Trash2, Clock, CalendarOff, Info, Loader2,
} from 'lucide-react'

// ============================================================
// ÇALIŞMA SAATLERİM — usta/çırak öz-yönetim ekranı
//
// Personel (usta/çırak) kendi izin/gelmediği saatlerini KENDİSİ
// ayarlar — şirket adminine gerek yok. İzinli olduğu aralıklarda
// müşteri randevusu alınamaz (public booking dahil).
//
// Yetki: API katmanı staffId'yi oturum sahibine sabitler; başka
// personelin iznine müdahale imkânsızdır.
// ============================================================

interface TimeOffEntry {
  id: string
  staffId: string
  date: string
  isFullDay: boolean
  startTime: string | null
  endTime: string | null
  reason: string | null
  staff?: { id: string; name: string; title: string | null }
}

export function MyScheduleManager({ providerId, myStaffName }: {
  providerId: string
  myStaffId: string
  myStaffName: string
}) {
  const qc = useQueryClient()

  // İzin aralığı: geçen hafta → 6 ay sonrası
  const rangeStart = new Date()
  rangeStart.setDate(rangeStart.getDate() - 7)
  const rangeEnd = new Date()
  rangeEnd.setDate(rangeEnd.getDate() + 180)

  const { data: timeOffs = [], isLoading } = useQuery({
    queryKey: ['my-timeoff', providerId, rangeStart.toISOString().slice(0, 10), rangeEnd.toISOString().slice(0, 10)],
    queryFn: () => apiGet<TimeOffEntry[]>(
      `/api/appointments/providers/${providerId}/time-off?staffId=&startDate=${rangeStart.toISOString()}&endDate=${rangeEnd.toISOString()}`,
    ),
  })

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const upcoming = timeOffs
    .filter((t) => new Date(t.date) >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const past = timeOffs
    .filter((t) => new Date(t.date) < now)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  // --- Form ---
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    isFullDay: true,
    startTime: '09:00',
    endTime: '13:00',
    reason: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPost(`/api/appointments/providers/${providerId}/time-off`, {
        date: form.date,
        isFullDay: form.isFullDay,
        startTime: form.isFullDay ? undefined : form.startTime,
        endTime: form.isFullDay ? undefined : form.endTime,
        reason: form.reason || undefined,
      })
      qc.invalidateQueries({ queryKey: ['my-timeoff'] })
      qc.invalidateQueries({ queryKey: ['appointment-timeoff-range'] })
      qc.invalidateQueries({ queryKey: ['appointment-timeoff'] })
      toast.success('İzin kaydedildi', {
        description: 'Bu aralıkta size randevu verilemeyecek',
      })
      setOpen(false)
      setForm((f) => ({ ...f, reason: '' }))
    } catch (e) {
      toast.error('İzin kaydedilemedi', {
        description: e instanceof Error ? e.message : '',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (t: TimeOffEntry) => {
    try {
      await apiDelete(`/api/appointments/providers/${providerId}/time-off/${t.id}`)
      qc.invalidateQueries({ queryKey: ['my-timeoff'] })
      qc.invalidateQueries({ queryKey: ['appointment-timeoff-range'] })
      qc.invalidateQueries({ queryKey: ['appointment-timeoff'] })
      toast.success('İzin kaldırıldı')
    } catch (e) {
      toast.error('İzin kaldırılamadı', { description: e instanceof Error ? e.message : '' })
    }
  }

  const izinLabel = (t: TimeOffEntry) =>
    t.isFullDay ? 'Tüm gün' : `${t.startTime} – ${t.endTime}`

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Başlık kartı */}
      <Card className="border-emerald-200/60 dark:border-emerald-900/50">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center shrink-0">
                <CalendarClock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-base leading-tight">Çalışma Saatlerim</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {myStaffName} — izinli olduğunuz gün/saatlerde size randevu verilemez.
                  Kendi takviminizi kendiniz yönetin, işletme sahibine gerek yok.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <CalendarOff className="w-4 h-4 mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
              {open ? 'Vazgeç' : 'İzin / Saat Ekle'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Yeni izin formu */}
      {open && (
        <Card className="border-emerald-200 dark:border-emerald-900/60 shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4 text-emerald-600" />
              Yeni İzin Kaydı
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tarih *</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div className="flex items-end gap-3 pb-1">
                <Switch
                  id="izn-fullday"
                  checked={form.isFullDay}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isFullDay: v }))}
                />
                <Label htmlFor="izn-fullday" className="text-sm cursor-pointer">
                  Tüm gün izinliyim
                  <span className="block text-xs text-muted-foreground font-normal">
                    kapalıysa yalnızca belirli saat aralığı
                  </span>
                </Label>
              </div>
              {!form.isFullDay && (
                <>
                  <div>
                    <Label className="text-xs">Başlangıç *</Label>
                    <Input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Bitiş *</Label>
                    <Input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </>
              )}
              <div className={cn('sm:col-span-2')}>
                <Label className="text-xs">Sebep</Label>
                <Input
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Örn: Yıllık izin, hasta, özel iş…"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/20 px-3 py-2">
              <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
              <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
                İzin aralığında <strong>aktif randevunuz</strong> varsa sistem izin oluşturmanıza izin vermez —
                önce randevuyu iptal edin veya saat aralığını randevuların dışında seçin.
              </p>
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSave}
              disabled={saving || !form.date}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {saving ? 'Kaydediliyor…' : 'İzni Kaydet'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Yaklaşan izinler */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <>
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="w-4 h-4 text-emerald-600" />
                Yaklaşan İzinlerim
                <Badge variant="outline" className="text-[10px] ml-1">{upcoming.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <div className="py-8 text-center">
                  <CalendarClock className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    Yaklaşan izniniz yok — takviminiz açık
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {upcoming.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
                    >
                      <div className="text-center shrink-0 w-20">
                        <div className="text-sm font-semibold">{formatDate(t.date).split(' ')[0]}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(t.date).toLocaleDateString('tr-TR', { month: 'short', weekday: 'short' })}
                        </div>
                      </div>
                      <div className="h-8 w-px bg-border shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              t.isFullDay
                                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
                            )}
                          >
                            {izinLabel(t)}
                          </Badge>
                          {t.reason && (
                            <span className="text-xs text-muted-foreground truncate">{t.reason}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 shrink-0"
                        title="İzni kaldır"
                        onClick={() => handleDelete(t)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {past.length > 0 && (
            <Card className="shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium">
                  Geçmiş izinler (son 5)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {past.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-24 shrink-0">{formatDate(t.date)}</span>
                    <span className="opacity-60">·</span>
                    <span>{izinLabel(t)}</span>
                    {t.reason && <span className="opacity-60">· {t.reason}</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
