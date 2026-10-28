'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { Scissors, Clock, ShieldCheck, Info } from 'lucide-react'

// ============================================================
// HİZMETLERİM — usta/çırak öz-yönetim ekranı
//
// Personel, işletmedeki MEVCUT hizmetler arasından hangilerini
// verebileceğini KENDİSİ seçer. Yeni hizmet ekleme/düzenleme
// yalnızca işletme sahibi (şirket admini) yetkisindedir —
// API katmanında zorlanır (POST /services → 403).
// ============================================================

interface ServiceItem {
  id: string
  name: string
  description: string | null
  duration: number
  price: number
  category: string | null
  isActive: boolean
}

// Staff GET — usta için yalnız kendi kaydını döndürür; services alanı
// düzleştirilmiş atanan hizmet listesidir.
interface MyStaffItem {
  id: string
  name: string
  title: string | null
  services: { id: string; name: string; category: string | null }[]
}

// Helper — session ID'yi localStorage'tan al (staff-manager deseni)
function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = localStorage.getItem('gnc-crm-store')
    if (raw) {
      const parsed = JSON.parse(raw)
      return parsed?.state?.sessionId ?? ''
    }
  } catch {
    // sessiz geç
  }
  return ''
}

export function MyServicesManager({ providerId, myStaffId, myStaffName }: {
  providerId: string
  myStaffId: string
  myStaffName: string
}) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)

  const { data: services = [], isLoading: loadingServices } = useQuery({
    queryKey: ['appointment-services', providerId],
    queryFn: () => apiGet<ServiceItem[]>(`/api/appointments/providers/${providerId}/services`),
  })

  const { data: myStaff, isLoading: loadingStaff } = useQuery({
    queryKey: ['appointment-staff', providerId],
    queryFn: () => apiGet<MyStaffItem[]>(`/api/appointments/providers/${providerId}/staff`),
  })

  const assignedIds = useMemo(
    () => new Set((myStaff?.[0]?.services ?? []).map((s) => s.id)),
    [myStaff],
  )

  const activeServices = services.filter((s) => s.isActive)

  const handleToggle = async (service: ServiceItem, checked: boolean) => {
    setBusy(service.id)
    try {
      if (checked) {
        await apiPost(`/api/appointments/providers/${providerId}/staff-services`, {
          staffId: myStaffId, // sunucu usta için kendi kaydına sabitler + doğrular
          serviceId: service.id,
        })
        toast.success(`"${service.name}" hizmeti size atandı`, {
          description: 'Müşteriler bu hizmet için sizden randevu alabilir',
        })
      } else {
        // apiDelete body desteklemediği için raw fetch kullan
        const res = await fetch(`/api/appointments/providers/${providerId}/staff-services`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'x-gnc-session': getSessionId() },
          body: JSON.stringify({ staffId: myStaffId, serviceId: service.id }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Hizmet kaldırılamadı')
        }
        toast.success(`"${service.name}" hizmeti kaldırıldı`)
      }
      qc.invalidateQueries({ queryKey: ['appointment-staff', providerId] })
      qc.invalidateQueries({ queryKey: ['provider', providerId] })
      qc.invalidateQueries({ queryKey: ['staff-services', providerId] })
    } catch (e) {
      toast.error('Hizmet ataması değiştirilemedi', {
        description: e instanceof Error ? e.message : '',
      })
    } finally {
      setBusy(null)
    }
  }

  const assignedCount = activeServices.filter((s) => assignedIds.has(s.id)).length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Başlık kartı */}
      <Card className="border-emerald-200/60 dark:border-emerald-900/50">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center shrink-0">
              <Scissors className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-base leading-tight">Hizmetlerim</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {myStaffName} — hangi hizmetleri vereceğinizi kendiniz seçin.
                Seçtiğiniz hizmetler müşteri randevu sayfanızda görünür.
              </p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  {assignedCount} hizmet veriyorsunuz
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {activeServices.length} hizmet mevcut
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bilgi notu */}
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/20 px-3 py-2">
        <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
          Yeni hizmet ekleme, fiyat veya süre değiştirme <strong>yalnızca işletme sahibine</strong> aittir.
          Yeni bir hizmet talebiniz varsa işletme sahibinize bildirin.
        </p>
      </div>

      {/* Hizmet listesi */}
      {loadingServices || loadingStaff ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-[72px]" />)}</div>
      ) : activeServices.length === 0 ? (
        <Card><CardContent className="py-10 text-center">
          <Scissors className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">İşletmede tanımlı aktif hizmet yok</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {activeServices.map((s) => {
            const assigned = assignedIds.has(s.id)
            return (
              <Card
                key={s.id}
                className={cn(
                  'shadow-soft transition-colors',
                  assigned
                    ? 'border-emerald-300/70 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'hover:border-border',
                )}
              >
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{s.name}</span>
                      {s.category && (
                        <Badge variant="outline" className="text-[9px]">{s.category}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {s.duration} dk
                      </span>
                      <span className="opacity-60">·</span>
                      <span className="tabular-nums">{formatCurrency(s.price)}</span>
                    </div>
                    {s.description && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{s.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                    <Switch
                      checked={assigned}
                      disabled={busy === s.id}
                      onCheckedChange={(v) => handleToggle(s, v)}
                      aria-label={`${s.name} hizmetini ${assigned ? 'kaldır' : 'ver'}`}
                    />
                    <span className={cn(
                      'text-[9px] font-medium whitespace-nowrap',
                      assigned ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                    )}>
                      {assigned ? 'Veriyorum' : 'Vermiyorum'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
