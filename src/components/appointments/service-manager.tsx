'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { PhotoUpload } from '@/components/ui/photo-upload'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/format'
import { Plus, Pencil, Trash2, Clock, Tag, Scissors } from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

interface Service {
  id: string
  name: string
  description: string | null
  duration: number
  price: number
  currency: string
  category: string | null
  photo: string | null
  isActive: boolean
  sortOrder: number
  _count?: { appointments: number; staffServices: number }
}

interface ServiceResponse { items: Service[] }

// ============================================================
// Service Manager
// ============================================================

export function ServiceManager({ providerId }: { providerId: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['appointment-services', providerId],
    queryFn: () => apiGet<ServiceResponse>(`/api/appointments/providers/${providerId}/services`),
    enabled: !!providerId,
  })

  const services = data?.items ?? []
  const categories = useMemo(() => {
    const set = new Set<string>()
    services.forEach((s) => s.category && set.add(s.category))
    return Array.from(set)
  }, [services])

  const [filterCat, setFilterCat] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editService, setEditService] = useState<Service | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    duration: 30,
    price: 0,
    category: '',
    photo: '' as string | null,
    isActive: true,
  })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null)

  const filteredServices = useMemo(() => {
    if (filterCat === 'all') return services
    return services.filter((s) => s.category === filterCat)
  }, [services, filterCat])

  function openCreate() {
    setEditService(null)
    setForm({
      name: '', description: '', duration: 30, price: 0,
      category: filterCat !== 'all' ? filterCat : '', photo: null, isActive: true,
    })
    setDialogOpen(true)
  }

  function openEdit(s: Service) {
    setEditService(s)
    setForm({
      name: s.name,
      description: s.description ?? '',
      duration: s.duration,
      price: s.price,
      category: s.category ?? '',
      photo: s.photo,
      isActive: s.isActive,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Hizmet adı gerekli')
      return
    }
    if (form.duration <= 0) {
      toast.error('Süre 0 dakikadan büyük olmalı')
      return
    }
    if (form.price < 0) {
      toast.error('Fiyat 0 veya daha büyük olmalı')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        duration: form.duration,
        price: form.price,
        category: form.category || undefined,
        photo: form.photo || undefined,
        isActive: form.isActive,
      }
      if (editService) {
        await apiPatch(
          `/api/appointments/providers/${providerId}/services/${editService.id}`,
          payload,
        )
        toast.success('Hizmet güncellendi')
      } else {
        await apiPost(
          `/api/appointments/providers/${providerId}/services`,
          payload,
        )
        toast.success('Hizmet eklendi')
      }
      qc.invalidateQueries({ queryKey: ['appointment-services', providerId] })
      setDialogOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(s: Service) {
    try {
      await apiPatch(
        `/api/appointments/providers/${providerId}/services/${s.id}`,
        { isActive: !s.isActive },
      )
      qc.invalidateQueries({ queryKey: ['appointment-services', providerId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await apiDelete(`/api/appointments/providers/${providerId}/services/${deleteTarget.id}`)
      qc.invalidateQueries({ queryKey: ['appointment-services', providerId] })
      toast.success('Hizmet silindi')
      setDeleteTarget(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-semibold text-base">Hizmetler ({services.length})</h3>
          <p className="text-xs text-muted-foreground">Saç, sakal, cilt, diş, vb.</p>
        </div>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1.5" />
          Yeni Hizmet
        </Button>
      </div>

      {/* Kategori filtre */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant={filterCat === 'all' ? 'default' : 'outline'}
            onClick={() => setFilterCat('all')}
            className={filterCat === 'all' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
          >
            Tümü ({services.length})
          </Button>
          {categories.map((cat) => {
            const count = services.filter((s) => s.category === cat).length
            return (
              <Button
                key={cat}
                size="sm"
                variant={filterCat === cat ? 'default' : 'outline'}
                onClick={() => setFilterCat(cat)}
                className={filterCat === cat ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              >
                {cat} ({count})
              </Button>
            )
          })}
        </div>
      )}

      {services.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-3">
            <Scissors className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Henüz hizmet yok. Randevu alabilmek için hizmet ekleyin.
          </p>
          <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-1.5" />
            İlk Hizmeti Ekle
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredServices.map((s) => (
            <Card key={s.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {s.photo ? (
                    <img
                      src={s.photo}
                      alt={s.name}
                      className="w-14 h-14 rounded-xl object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 text-white flex items-center justify-center shrink-0">
                      <Scissors className="w-6 h-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{s.name}</div>
                        {s.category && (
                          <Badge variant="secondary" className="text-[9px] py-0 mt-0.5">
                            {s.category}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-600 hover:text-red-700"
                          onClick={() => setDeleteTarget(s)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {s.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-medium">
                      <Clock className="w-3 h-3" />
                      {s.duration} dk
                    </span>
                    <span className="font-semibold text-base">{formatCurrency(s.price, s.currency)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {s._count?.appointments ?? 0} randevu
                    </span>
                    <Switch
                      checked={s.isActive}
                      onCheckedChange={() => handleToggleActive(s)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editService ? 'Hizmet Düzenle' : 'Yeni Hizmet'}</DialogTitle>
            <DialogDescription>
              Hizmet adı, süre, fiyat ve kategori girin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <PhotoUpload
                value={form.photo}
                onChange={(v) => setForm((f) => ({ ...f, photo: v }))}
                label="Görsel"
                size="md"
                variant="logo"
                placeholderIcon="package"
              />
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <div className="sm:col-span-2">
                  <Label htmlFor="sv-name">Hizmet Adı *</Label>
                  <Input
                    id="sv-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Örn: Saç Kesimi"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="sv-duration">Süre (dk) *</Label>
                  <Input
                    id="sv-duration"
                    type="number"
                    min={1}
                    step={5}
                    value={form.duration}
                    onChange={(e) => setForm((f) => ({ ...f, duration: parseInt(e.target.value) || 0 }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="sv-price">Fiyat (₺) *</Label>
                  <Input
                    id="sv-price"
                    type="number"
                    min={0}
                    step={10}
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="sv-category" className="flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Kategori
                  </Label>
                  <Input
                    id="sv-category"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="Saç, Sakal, Cilt, Diş..."
                    className="mt-1"
                    list="service-categories"
                  />
                  <datalist id="service-categories">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="sv-desc">Açıklama</Label>
                  <Textarea
                    id="sv-desc"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Hizmet detayları..."
                    className="mt-1 resize-none"
                    rows={2}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
              <Label className="cursor-pointer text-sm">Aktif (randevu alınabilir)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              İptal
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? 'Kaydediliyor...' : editService ? 'Güncelle' : 'Ekle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hizmeti sil</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> hizmetini silmek istediğinize emin misiniz?
              Geçmiş randevular korunur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
