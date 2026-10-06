'use client'

// ============================================================
// ADMIN — Platform Servisleri sekmesi (yalnızca program admini)
// Ana siteden: Müşteri Randevu Sitesi, KaloriAI, Fruit Storm vb.
// uygulama bağlantılarını yönetme + yerel port durumunu görme.
// BU PROJEDE yalnızca CRM (3000) + customer-page (3002) vardır;
// KaloriAI (3004) ve Fruit Storm (3003) sunucuda AYRI projelerdir.
// ============================================================

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  MapPin, Salad, Cherry, AppWindow, Gamepad2, Globe, ExternalLink,
  RefreshCw, Plus, Pencil, Trash2, Loader2, Info, MonitorSmartphone,
  Dumbbell, HeartPulse, Apple, Puzzle,
} from 'lucide-react'

// ─── Tipler ─────────────────────────────────────────────────────
interface PlatformServiceItem {
  id: string
  key: string
  name: string
  description: string
  url: string
  localPort: number | null
  icon: string
  color: string
  enabled: boolean
  sortOrder: number
  alive: boolean | null
}

interface ServicesResponse {
  items: PlatformServiceItem[]
  baseDomain: string
  scope: 'platform' | 'tenant'
}

// Lucide ikon adı → bileşen haritası (güvenli: bilinmeyen isim AppWindow'a düşer)
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'map-pin': MapPin,
  salad: Salad,
  cherry: Cherry,
  'app-window': AppWindow,
  'gamepad-2': Gamepad2,
  globe: Globe,
  dumbbell: Dumbbell,
  'heart-pulse': HeartPulse,
  apple: Apple,
  puzzle: Puzzle,
}
const IconByName = ({ name, className }: { name: string; className?: string }) => {
  const Cmp = ICONS[name] ?? AppWindow
  return <Cmp className={className} />
}

// ─── Ana bileşen ────────────────────────────────────────────────
export function ServicesTab() {
  const qc = useQueryClient()
  const [editItem, setEditItem] = useState<PlatformServiceItem | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<PlatformServiceItem | null>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<ServicesResponse>({
    queryKey: ['admin-services'],
    queryFn: () => apiGet<ServicesResponse>('/api/admin/services?check=1'),
    refetchInterval: 60_000,
  })

  const items = data?.items ?? []

  const toggleEnabled = async (item: PlatformServiceItem) => {
    try {
      await apiPatch(`/api/admin/services/${item.id}`, { enabled: !item.enabled })
      toast.success(item.enabled ? 'Servis gizlendi' : 'Servis görünür yapıldı')
      qc.invalidateQueries({ queryKey: ['admin-services'] })
      qc.invalidateQueries({ queryKey: ['platform-services-public'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    }
  }

  return (
    <div className="space-y-4">
      {/* Bilgi bandı — proje kapsamı */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30 p-3 flex gap-2.5">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="text-xs leading-relaxed text-emerald-900 dark:text-emerald-200">
          <span className="font-semibold">Bu proje yalnızca CRM ana site (3000) + Müşteri Randevu Sitesi (3002) içerir.</span>{' '}
          KaloriAI (3004) ve Fruit Storm (3003) bu projede <span className="font-semibold">değildir</span> —
          onları sanal sunucuna GitHub&apos;dan ayrı yüklersin; buradan yalnızca bağlantılarını yönetirsin.
          &quot;Önizle&quot; düğmeleri bu ortamdaki yerel portu, &quot;Sunucuda Aç&quot; ise alan adı bağlantısını açar.
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MonitorSmartphone className="w-4 h-4 text-emerald-600" />
            Platform Uygulamaları
            {data?.baseDomain ? (
              <Badge variant="outline" className="text-[10px] font-normal">
                *.{data.baseDomain}
              </Badge>
            ) : null}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ana siteden açılabilir uygulama bağlantıları — {items.length} kayıt
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Yenile
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Yeni Servis
          </Button>
        </div>
      </div>

      {/* Kart ızgarası */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Servisler yüklenemedi: {error instanceof Error ? error.message : 'bilinmeyen hata'}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Henüz servis yok. &quot;Yeni Servis&quot; ile bağlantı ekleyin.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              onEdit={() => setEditItem(s)}
              onDelete={() => setDeleteItem(s)}
              onToggle={() => toggleEnabled(s)}
            />
          ))}
        </div>
      )}

      {/* Düzenleme diyaloğu */}
      <ServiceFormDialog
        open={!!editItem}
        item={editItem}
        onClose={() => setEditItem(null)}
        onSaved={() => {
          setEditItem(null)
          qc.invalidateQueries({ queryKey: ['admin-services'] })
          qc.invalidateQueries({ queryKey: ['platform-services-public'] })
        }}
      />

      {/* Yeni servis diyaloğu */}
      <ServiceCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false)
          qc.invalidateQueries({ queryKey: ['admin-services'] })
          qc.invalidateQueries({ queryKey: ['platform-services-public'] })
        }}
      />

      {/* Silme onayı */}
      <AlertDialog open={!!deleteItem} onOpenChange={(v) => !v && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>&quot;{deleteItem?.name}&quot; silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu yalnızca bağlantı kaydını kaldırır; uygulamayı sunucudan silmez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={async () => {
                if (!deleteItem) return
                try {
                  await apiDelete(`/api/admin/services/${deleteItem.id}`)
                  toast.success('Servis silindi')
                  setDeleteItem(null)
                  qc.invalidateQueries({ queryKey: ['admin-services'] })
                  qc.invalidateQueries({ queryKey: ['platform-services-public'] })
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Silinemedi')
                }
              }}
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Tek servis kartı ───────────────────────────────────────────
function ServiceCard({
  service, onEdit, onDelete, onToggle,
}: {
  service: PlatformServiceItem
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const isProjectService = service.key === 'customer-page'
  const aliveColor =
    service.alive === true ? 'bg-emerald-500' : service.alive === false ? 'bg-rose-500' : 'bg-slate-400'
  const aliveText =
    service.alive === true ? 'çalışıyor' : service.alive === false ? 'kapalı' : 'bilinmiyor'

  return (
    <Card className={cn('flex flex-col', !service.enabled && 'opacity-60')}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${service.color}1a`, color: service.color }}
            >
              <IconByName name={service.icon} className="w-4.5 h-4.5 w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-sm truncate">{service.name}</CardTitle>
              <CardDescription className="text-[10px] font-mono truncate">
                {service.key}
                {service.localPort ? ` · :${service.localPort}` : ''}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {service.localPort ? (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground" title={`Yerel port ${service.localPort} ${aliveText}`}>
                <span className={cn('w-2 h-2 rounded-full', aliveColor)} />
                {aliveText}
              </span>
            ) : null}
            <Switch checked={service.enabled} onCheckedChange={onToggle} aria-label="Görünürlük" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1">
          {service.description || '—'}
        </p>
        <div className="text-[11px] font-mono truncate text-muted-foreground flex items-center gap-1">
          <Globe className="w-3 h-3 shrink-0" />
          {service.url || 'URL atanmadı'}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {service.url ? (
            <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => window.open(service.url, '_blank', 'noopener')}>
              <ExternalLink className="w-3 h-3" />
              Sunucuda Aç
            </Button>
          ) : null}
          {service.localPort ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => window.open(`/?XTransformPort=${service.localPort}`, '_blank', 'noopener')}
            >
              <MonitorSmartphone className="w-3 h-3" />
              Önizle
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onEdit}>
            <Pencil className="w-3 h-3" />
            Düzenle
          </Button>
          {isProjectService ? (
            <span className="text-[10px] self-center text-muted-foreground" title="Bu projenin parçası, silinemez">
              proje içi
            </span>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40" onClick={onDelete}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Düzenleme diyaloğu ─────────────────────────────────────────
function ServiceFormDialog({
  open, item, onClose, onSaved,
}: {
  open: boolean
  item: PlatformServiceItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(() => ({
    name: item?.name ?? '',
    description: item?.description ?? '',
    url: item?.url ?? '',
    localPort: item?.localPort != null ? String(item.localPort) : '',
    icon: item?.icon ?? 'app-window',
    color: item?.color ?? '#16a34a',
    sortOrder: String(item?.sortOrder ?? 0),
  }))
  // item değişince formu tazele
  const [seenItem, setSeenItem] = useState(item)
  if (item !== seenItem) {
    setSeenItem(item)
    setForm({
      name: item?.name ?? '',
      description: item?.description ?? '',
      url: item?.url ?? '',
      localPort: item?.localPort != null ? String(item.localPort) : '',
      icon: item?.icon ?? 'app-window',
      color: item?.color ?? '#16a34a',
      sortOrder: String(item?.sortOrder ?? 0),
    })
  }
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!item) return
    if (!form.name.trim()) { toast.error('Ad zorunlu'); return }
    setSaving(true)
    try {
      await apiPatch(`/api/admin/services/${item.id}`, {
        name: form.name,
        description: form.description,
        url: form.url,
        localPort: form.localPort.trim() === '' ? null : Number(form.localPort),
        icon: form.icon,
        color: form.color,
        sortOrder: Number(form.sortOrder) || 0,
      })
      toast.success('Servis güncellendi')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Servisi Düzenle</DialogTitle>
          <DialogDescription className="text-xs">
            Bağlantı, yerel port ve görünüm ayarları
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Ad</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Açıklama</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sunucu URL&apos;i</Label>
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://randevu.gncinc.online"
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Yerel Port</Label>
              <Input
                value={form.localPort}
                onChange={(e) => setForm({ ...form, localPort: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder="3002"
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sıra</Label>
              <Input
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value.replace(/[^0-9]/g, '') })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Renk</Label>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-8 w-full rounded-md border cursor-pointer bg-transparent"
                aria-label="Renk"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">İkon (lucide adı)</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(ICONS).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setForm({ ...form, icon: name })}
                  className={cn(
                    'h-8 w-8 rounded-md border flex items-center justify-center transition-colors',
                    form.icon === name
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                  title={name}
                >
                  <IconByName name={name} className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Vazgeç</Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Kaydet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Yeni servis diyaloğu ───────────────────────────────────────
function ServiceCreateDialog({
  open, onClose, onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    key: '', name: '', description: '', url: '', localPort: '', color: '#16a34a', icon: 'app-window',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.key.trim() || !form.name.trim()) { toast.error('Key ve ad zorunlu'); return }
    setSaving(true)
    try {
      await apiPost('/api/admin/services', {
        key: form.key,
        name: form.name,
        description: form.description,
        url: form.url,
        localPort: form.localPort.trim() === '' ? null : Number(form.localPort),
        color: form.color,
        icon: form.icon,
        sortOrder: 99,
      })
      toast.success('Servis eklendi')
      setForm({ key: '', name: '', description: '', url: '', localPort: '', color: '#16a34a', icon: 'app-window' })
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Yeni Platform Servisi</DialogTitle>
          <DialogDescription className="text-xs">
            Sunucuda ayrı çalışan bir uygulamanın bağlantısını ekle
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Key (benzersiz)</Label>
              <Input
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="ornek-uygulama"
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ad</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Örnek Uygulama"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Açıklama</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Sunucu URL</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://uygulama.gncinc.online"
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Yerel Port</Label>
              <Input
                value={form.localPort}
                onChange={(e) => setForm({ ...form, localPort: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder="3004"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">İkon &amp; Renk</Label>
            <div className="flex items-center gap-2">
              <div className="flex flex-wrap gap-1.5 flex-1">
                {Object.keys(ICONS).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setForm({ ...form, icon: name })}
                    className={cn(
                      'h-8 w-8 rounded-md border flex items-center justify-center transition-colors',
                      form.icon === name
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                    title={name}
                  >
                    <IconByName name={name} className="w-4 h-4" />
                  </button>
                ))}
              </div>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-8 w-10 rounded-md border cursor-pointer bg-transparent"
                aria-label="Renk"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Vazgeç</Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Ekle
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
