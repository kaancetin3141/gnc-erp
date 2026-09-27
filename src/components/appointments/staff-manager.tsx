'use client'

import { useState } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
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
import { initials } from '@/lib/format'
import { Plus, Pencil, Trash2, Phone, User, Scissors } from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

interface Service {
  id: string
  name: string
  category: string | null
}

interface Staff {
  id: string
  name: string
  title: string | null
  photo: string | null
  phone: string | null
  bio: string | null
  isActive: boolean
  sortOrder: number
  services?: Service[]
  _count?: { appointments: number }
}

type StaffResponse = Staff[]
type ServiceResponse = Service[]

// ============================================================
// Staff Manager
// ============================================================

export function StaffManager({ providerId }: { providerId: string }) {
  const qc = useQueryClient()
  const { data: staffData, isLoading } = useQuery({
    queryKey: ['appointment-staff', providerId],
    queryFn: () => apiGet<StaffResponse>(`/api/appointments/providers/${providerId}/staff`),
    enabled: !!providerId,
  })
  const { data: serviceData } = useQuery({
    queryKey: ['appointment-services', providerId],
    queryFn: () => apiGet<ServiceResponse>(`/api/appointments/providers/${providerId}/services`),
    enabled: !!providerId,
  })

  const staffList = Array.isArray(staffData) ? staffData : (staffData as unknown as { items?: Staff[] })?.items ?? []
  const services = Array.isArray(serviceData) ? serviceData : (serviceData as unknown as { items?: Service[] })?.items ?? []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editStaff, setEditStaff] = useState<Staff | null>(null)
  const [form, setForm] = useState({
    name: '',
    title: '',
    photo: '' as string | null,
    phone: '',
    bio: '',
    isActive: true,
  })
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Staff | null>(null)

  function openCreate() {
    setEditStaff(null)
    setForm({ name: '', title: '', photo: null, phone: '', bio: '', isActive: true })
    setSelectedServiceIds([])
    setDialogOpen(true)
  }

  function openEdit(s: Staff) {
    setEditStaff(s)
    setForm({
      name: s.name,
      title: s.title ?? '',
      photo: s.photo,
      phone: s.phone ?? '',
      bio: s.bio ?? '',
      isActive: s.isActive,
    })
    setSelectedServiceIds(s.services?.map((sv) => sv.id) ?? [])
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Personel adı gerekli')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        title: form.title || undefined,
        photo: form.photo || undefined,
        phone: form.phone || undefined,
        bio: form.bio || undefined,
        isActive: form.isActive,
      }
      let staffId: string
      if (editStaff) {
        const updated = await apiPatch<Staff>(
          `/api/appointments/providers/${providerId}/staff/${editStaff.id}`,
          payload,
        )
        staffId = updated.id
        toast.success('Personel güncellendi')
      } else {
        const created = await apiPost<Staff>(
          `/api/appointments/providers/${providerId}/staff`,
          payload,
        )
        staffId = created.id
        toast.success('Personel eklendi')
      }

      // Hizmet bağlantılarını senkronize et
      const currentIds = new Set(editStaff?.services?.map((sv) => sv.id) ?? [])
      const newIds = new Set(selectedServiceIds)
      const toAdd = [...newIds].filter((id) => !currentIds.has(id))
      const toRemove = [...currentIds].filter((id) => !newIds.has(id))
      for (const sid of toAdd) {
        await apiPost(`/api/appointments/providers/${providerId}/staff-services`, {
          staffId,
          serviceId: sid,
        })
      }
      for (const sid of toRemove) {
        // apiDelete body desteklemediği için raw fetch kullan
        await fetch(`/api/appointments/providers/${providerId}/staff-services`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'x-gnc-session': getSessionId() },
          body: JSON.stringify({ staffId, serviceId: sid }),
        })
      }

      qc.invalidateQueries({ queryKey: ['appointment-staff', providerId] })
      setDialogOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(s: Staff) {
    try {
      await apiPatch(`/api/appointments/providers/${providerId}/staff/${s.id}`, {
        isActive: !s.isActive,
      })
      qc.invalidateQueries({ queryKey: ['appointment-staff', providerId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await apiDelete(`/api/appointments/providers/${providerId}/staff/${deleteTarget.id}`)
      qc.invalidateQueries({ queryKey: ['appointment-staff', providerId] })
      toast.success('Personel silindi')
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
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">Personel ({staffList.length})</h3>
          <p className="text-xs text-muted-foreground">Berber, kuaför, uzmanlar</p>
        </div>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1.5" />
          Yeni Personel
        </Button>
      </div>

      {staffList.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-3">
            <Scissors className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Henüz personel yok. Randevu alabilmek için en az bir personel ekleyin.
          </p>
          <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-1.5" />
            İlk Personeli Ekle
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {staffList.map((s) => (
            <Card key={s.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {s.photo ? (
                    <img
                      src={s.photo}
                      alt={s.name}
                      className="w-14 h-14 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white flex items-center justify-center font-bold shrink-0">
                      {initials(s.name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{s.title || 'Personel'}</div>
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
                    {s.phone && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        <span className="truncate">{s.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
                {s.bio && (
                  <p className="text-xs text-muted-foreground mt-2.5 line-clamp-2">{s.bio}</p>
                )}
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Verdiği Hizmetler</div>
                  {s.services && s.services.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {s.services.map((sv) => (
                        <Badge key={sv.id} variant="secondary" className="text-[10px] py-0">
                          {sv.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Henüz atanmış hizmet yok</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <span className="text-[10px] text-muted-foreground">
                    {s._count?.appointments ?? 0} randevu
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{s.isActive ? 'Aktif' : 'Pasif'}</span>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editStaff ? 'Personel Düzenle' : 'Yeni Personel'}</DialogTitle>
            <DialogDescription>
              Personel bilgilerini girin ve verdiği hizmetleri seçin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <PhotoUpload
                value={form.photo}
                onChange={(v) => setForm((f) => ({ ...f, photo: v }))}
                label="Foto"
                size="md"
                variant="avatar"
                placeholderIcon="user"
              />
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <div className="sm:col-span-2">
                  <Label htmlFor="s-name">Ad Soyad *</Label>
                  <Input
                    id="s-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Örn: Ahmet Usta"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="s-title">Ünvan</Label>
                  <Input
                    id="s-title"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Usta Berber"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="s-phone">Telefon</Label>
                  <Input
                    id="s-phone"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+90 5xx..."
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="s-bio">Hakkında</Label>
                  <Textarea
                    id="s-bio"
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    placeholder="Kısa biyografi (uzmanlık alanları, deneyim...)"
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
              <Label className="cursor-pointer text-sm">Aktif (randevu alabilir)</Label>
            </div>
            {/* Hizmet seçimi */}
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-emerald-600" />
                <Label className="text-sm font-medium">Verdiği Hizmetler</Label>
              </div>
              {services.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Önce Hizmetler sekmesinden hizmet ekleyin.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-1">
                  {services.map((sv) => (
                    <label
                      key={sv.id}
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={selectedServiceIds.includes(sv.id)}
                        onCheckedChange={(checked) => {
                          setSelectedServiceIds((prev) =>
                            checked
                              ? [...prev, sv.id]
                              : prev.filter((id) => id !== sv.id),
                          )
                        }}
                      />
                      <span className="truncate">{sv.name}</span>
                      {sv.category && (
                        <Badge variant="outline" className="text-[9px] py-0 ml-auto shrink-0">
                          {sv.category}
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
              )}
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
              {saving ? 'Kaydediliyor...' : editStaff ? 'Güncelle' : 'Ekle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Personeli sil</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> adlı personeli silmek istediğinize emin misiniz?
              Bu personelin geçmiş randevuları korunur (staffId null olur).
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

// Helper — session ID'yi localStorage'tan al
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
