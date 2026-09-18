'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { PhotoUpload } from '@/components/ui/photo-upload'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  PROVIDER_TYPES,
  DAY_KEYS,
  DAY_LABELS,
  DEFAULT_WORKING_HOURS,
  type WorkingHours,
  type DaySchedule,
  type ProviderType,
} from '@/lib/appointment-utils'
import { Save, Building2, Clock, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================
// Tipler
// ============================================================

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
  autoApprove: boolean
  isActive: boolean
}

// ============================================================
// Provider Settings
// ============================================================

export function ProviderSettings({ providerId }: { providerId: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['appointment-provider', providerId],
    queryFn: () => apiGet<Provider>(`/api/appointments/providers/${providerId}`),
    enabled: !!providerId,
  })

  const [form, setForm] = useState({
    name: '',
    type: 'berber' as ProviderType,
    address: '',
    city: '',
    district: '',
    phone: '',
    email: '',
    photo: '' as string | null,
    autoApprove: true,
    isActive: true,
  })
  const [wh, setWh] = useState<WorkingHours>(DEFAULT_WORKING_HOURS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name,
        type: (data.type as ProviderType) || 'berber',
        address: data.address ?? '',
        city: data.city ?? '',
        district: data.district ?? '',
        phone: data.phone ?? '',
        email: data.email ?? '',
        photo: data.photo,
        autoApprove: data.autoApprove ?? true,
        isActive: data.isActive,
      })
      try {
        const parsed = JSON.parse(data.workingHours) as WorkingHours
        setWh({ ...DEFAULT_WORKING_HOURS, ...parsed })
      } catch {
        setWh(DEFAULT_WORKING_HOURS)
      }
    }
  }, [data])

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('İşletme adı gerekli')
      return
    }
    setSaving(true)
    try {
      await apiPatch(`/api/appointments/providers/${providerId}`, {
        name: form.name,
        type: form.type,
        address: form.address || null,
        city: form.city || null,
        district: form.district || null,
        phone: form.phone || null,
        email: form.email || null,
        photo: form.photo,
        autoApprove: form.autoApprove,
        isActive: form.isActive,
        workingHours: wh,
      })
      qc.invalidateQueries({ queryKey: ['appointment-provider', providerId] })
      qc.invalidateQueries({ queryKey: ['appointment-providers'] })
      toast.success('İşletme bilgileri kaydedildi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  function updateDay(day: string, patch: Partial<DaySchedule>) {
    setWh((prev) => ({
      ...prev,
      [day]: { ...prev[day], ...patch },
    }))
  }

  function toggleDayClosed(day: string, closed: boolean) {
    setWh((prev) => {
      const next = { ...prev }
      if (closed) {
        next[day] = { closed: true }
      } else {
        next[day] = { start: '09:00', end: '18:00' }
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* İşletme Bilgileri */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4 text-emerald-600" />
            İşletme Bilgileri
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-4">
            <PhotoUpload
              value={form.photo}
              onChange={(v) => setForm((f) => ({ ...f, photo: v }))}
              label="Logo"
              size="md"
              variant="logo"
              placeholderIcon="building"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              <div className="sm:col-span-2">
                <Label htmlFor="p-name">İşletme Adı *</Label>
                <Input
                  id="p-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Örn: Şık Kuaför Salonu"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="p-type">İşletme Türü</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as ProviderType }))}
                >
                  <SelectTrigger id="p-type" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.emoji} {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="p-phone">Telefon</Label>
                <Input
                  id="p-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+90 216 ..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="p-email">E-posta</Label>
                <Input
                  id="p-email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="info@..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="p-city">İl</Label>
                <Input
                  id="p-city"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="İstanbul"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="p-district">İlçe</Label>
                <Input
                  id="p-district"
                  value={form.district}
                  onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                  placeholder="Kadıköy"
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="p-address">Adres</Label>
                <Textarea
                  id="p-address"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Tam adres"
                  className="mt-1 resize-none"
                  rows={2}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            />
            <Label className="cursor-pointer text-sm">
              İşletme aktif (müşteriler randevu alabilir)
            </Label>
          </div>

          {/* OTOMATİK ONAY ANAHTARI */}
          <div className={cn(
            'flex items-start gap-3 p-3 rounded-lg border transition-colors',
            form.autoApprove
              ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20'
              : 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20',
          )}>
            <Switch
              checked={form.autoApprove}
              onCheckedChange={(v) => setForm((f) => ({ ...f, autoApprove: v }))}
            />
            <div className="min-w-0">
              <Label className="cursor-pointer text-sm font-medium flex items-center gap-1.5">
                {form.autoApprove ? (
                  <><Zap className="w-3.5 h-3.5 text-emerald-600" /> Randevuları otomatik onayla</>
                ) : (
                  <><Clock className="w-3.5 h-3.5 text-amber-600" /> Randevular otomatik onaylanmasın</>
                )}
              </Label>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {form.autoApprove
                  ? 'Açık: Çalışma saatleri içinde alınan randevular anında onaylanır.'
                  : 'Kapalı: Randevular "Beklemede" oluşur, işletme onaylar. Onaylandıktan sonra WhatsApp ile müşteriye bilgi gönderilir.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Çalışma Saatleri */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4 text-emerald-600" />
            Çalışma Saatleri
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
            Her gün için çalışma saatlerini ayarlayın. Kapalı günlerde müşteriler randevu alamaz.
          </p>
          {DAY_KEYS.map((day) => {
            const sched = wh[day] ?? { closed: true }
            const isClosed = sched.closed || (!sched.start && !sched.end)
            return (
              <div
                key={day}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2.5 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
              >
                <div className="w-32 shrink-0">
                  <span className="text-sm font-medium">{DAY_LABELS[day]}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={!isClosed}
                    onCheckedChange={(v) => toggleDayClosed(day, !v)}
                  />
                  <span className="text-xs text-muted-foreground w-12">
                    {isClosed ? 'Kapalı' : 'Açık'}
                  </span>
                </div>
                {!isClosed && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Input
                      type="time"
                      value={sched.start ?? '09:00'}
                      onChange={(e) => updateDay(day, { start: e.target.value })}
                      className="w-28 h-9 text-sm"
                    />
                    <span className="text-muted-foreground text-xs">→</span>
                    <Input
                      type="time"
                      value={sched.end ?? '18:00'}
                      onChange={(e) => updateDay(day, { end: e.target.value })}
                      className="w-28 h-9 text-sm"
                    />
                  </div>
                )}
              </div>
            )
          })}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWh(DEFAULT_WORKING_HOURS)}
              className="text-xs"
            >
              Varsayılana Dön (Pzt-Cmt 09-19, Pazar Kapalı)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Kaydet */}
      <div className="sticky bottom-0 bg-background/80 backdrop-blur-sm border-t pt-3 -mx-1 px-1">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </Button>
      </div>
    </div>
  )
}
