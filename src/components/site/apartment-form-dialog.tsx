'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Home, RefreshCw, Building2, User, Phone, Mail, IdCard, StickyNote,
  UserCheck, CalendarDays, CalendarClock,
} from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

export interface ApartmentBlock {
  id: string
  name: string
}

export interface ApartmentResident {
  id: string
  name: string
  phone: string | null
  type: string
  isActive: boolean
}

export interface Apartment {
  id: string
  number: string
  floor: number | null
  type: string
  area: number | null
  blockId: string
  residentId: string | null
  block: ApartmentBlock
  resident: ApartmentResident | null
}

interface ApartmentForm {
  blockId: string
  number: string
  floor: string
  type: string
  area: string
}

interface OwnerForm {
  name: string
  phone: string
  email: string
  tcKimlikNo: string
  notes: string
}

interface TenantForm {
  name: string
  phone: string
  email: string
  moveInDate: string
  leaseEndDate: string
  notes: string
}

const EMPTY_FORM: ApartmentForm = {
  blockId: '',
  number: '',
  floor: '',
  type: 'daire',
  area: '',
}

const EMPTY_OWNER: OwnerForm = {
  name: '',
  phone: '',
  email: '',
  tcKimlikNo: '',
  notes: '',
}

const EMPTY_TENANT: TenantForm = {
  name: '',
  phone: '',
  email: '',
  moveInDate: '',
  leaseEndDate: '',
  notes: '',
}

const APARTMENT_TYPES = [
  { value: 'daire', label: 'Daire' },
  { value: 'dukkan', label: 'Dükkan' },
  { value: 'depo', label: 'Depo' },
] as const

// ============================================================
// Daire Ekleme/Düzenleme Dialog
// ============================================================

export function ApartmentFormDialog({
  open,
  onOpenChange,
  siteId,
  blockId,
  editApartment,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  siteId: string
  blockId?: string
  editApartment?: Apartment | null
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<ApartmentForm>(EMPTY_FORM)
  const [owner, setOwner] = useState<OwnerForm>(EMPTY_OWNER)
  const [hasTenant, setHasTenant] = useState(false)
  const [tenant, setTenant] = useState<TenantForm>(EMPTY_TENANT)
  const [submitting, setSubmitting] = useState(false)

  // Blok listesi
  const { data: blocksData, isLoading: blocksLoading } = useQuery({
    queryKey: ['blocks', siteId],
    queryFn: () => apiGet<{ items: { id: string; name: string; floors: number }[] }>(`/api/site/${siteId}/blocks`),
    enabled: !!siteId && open,
  })
  const blocks = blocksData?.items ?? []

  // Formu başlat — edit modu veya boş form
  useEffect(() => {
    if (!open) return
    if (editApartment) {
      setForm({
        blockId: editApartment.blockId || '',
        number: editApartment.number || '',
        floor: editApartment.floor != null ? String(editApartment.floor) : '',
        type: editApartment.type || 'daire',
        area: editApartment.area != null ? String(editApartment.area) : '',
      })
    } else {
      setForm({
        ...EMPTY_FORM,
        blockId: blockId || '',
        type: 'daire',
      })
    }
    // Sahibi + kiracı yalnızca "yeni daire" modunda temizlenir
    setOwner(EMPTY_OWNER)
    setHasTenant(false)
    setTenant(EMPTY_TENANT)
  }, [open, editApartment, blockId])

  const isEditMode = !!editApartment

  const handleSubmit = async () => {
    if (!form.blockId) {
      toast.error('Blok seçimi gerekli')
      return
    }
    if (!form.number.trim()) {
      toast.error('Daire numarası gerekli')
      return
    }
    // Yeni daire modunda mal sahibi adı opsiyonel ama girilmişse phone/email
    // format kontrolü için sunucu zaten benzersizlik yapıyor.
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        blockId: form.blockId,
        number: form.number.trim(),
        floor: form.floor !== '' ? parseInt(form.floor, 10) : null,
        type: form.type,
        area: form.area !== '' ? parseFloat(form.area) : null,
      }

      if (!isEditMode) {
        // Owner — sadece isim doluysa gönder
        if (owner.name.trim()) {
          payload.owner = {
            name: owner.name.trim(),
            phone: owner.phone.trim() || undefined,
            email: owner.email.trim() || undefined,
            tcKimlikNo: owner.tcKimlikNo.trim() || undefined,
            notes: owner.notes.trim() || undefined,
          }
        }
        // Kiracı — sadece "Kiracı var" + isim dolu
        if (hasTenant && tenant.name.trim()) {
          payload.tenant = {
            name: tenant.name.trim(),
            phone: tenant.phone.trim() || undefined,
            email: tenant.email.trim() || undefined,
            moveInDate: tenant.moveInDate || undefined,
            leaseEndDate: tenant.leaseEndDate || undefined,
            notes: tenant.notes.trim() || undefined,
          }
        }
      }

      if (isEditMode) {
        await apiPatch(`/api/site/${siteId}/apartments/${editApartment.id}`, payload)
        toast.success('Daire güncellendi')
      } else {
        await apiPost(`/api/site/${siteId}/apartments`, payload)
        toast.success('Daire eklendi')
      }
      qc.invalidateQueries({ queryKey: ['apartments', siteId] })
      qc.invalidateQueries({ queryKey: ['blocks', siteId] })
      qc.invalidateQueries({ queryKey: ['site', siteId] })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  const noBlocks = blocks.length === 0
  // Submit butonu için: edit modunda daire alanları yeterli; yeni modda daire alanları yeterli (sahibi opsiyonel)
  const canSubmit = !submitting && !noBlocks && !!form.blockId && !!form.number.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="w-5 h-5 text-emerald-600" />
            {isEditMode ? 'Daireyi Düzenle' : 'Yeni Daire'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Daire bilgilerini güncelleyin. Sakin yönetimi için sakinler sekmesini kullanın.'
              : 'Yeni daire ekleyin. Daire numarası, blok ve tip bilgilerini girin; isterseniz mal sahibi ve kiracı bilgilerini de ekleyebilirsiniz.'}
          </DialogDescription>
        </DialogHeader>

        {noBlocks && !blocksLoading ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="flex items-center gap-2 font-medium mb-1">
              <Building2 className="w-4 h-4" />
              Henüz blok yok
            </div>
            Daire eklemek için önce bir blok oluşturun. Blok ekledikten sonra bu formu tekrar açın.
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* === DAİRE BİLGİLERİ === */}
            <section className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5" />
                Daire Bilgileri
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Blok */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Blok *</Label>
                  <Select
                    value={form.blockId}
                    onValueChange={(v) => setForm({ ...form, blockId: v })}
                    disabled={blocksLoading}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={blocksLoading ? 'Yükleniyor...' : 'Blok seçin'} />
                    </SelectTrigger>
                    <SelectContent>
                      {blocks.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} ({b.floors} kat)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Daire No */}
                <div className="space-y-1.5">
                  <Label htmlFor="apt-number" className="text-xs">Daire Numarası *</Label>
                  <Input
                    id="apt-number"
                    value={form.number}
                    onChange={(e) => setForm({ ...form, number: e.target.value })}
                    placeholder="Örn. 1, 2A, 12"
                  />
                </div>

                {/* Kat */}
                <div className="space-y-1.5">
                  <Label htmlFor="apt-floor" className="text-xs">Kat</Label>
                  <Input
                    id="apt-floor"
                    type="number"
                    min="-2"
                    max="50"
                    step="1"
                    value={form.floor}
                    onChange={(e) => setForm({ ...form, floor: e.target.value })}
                    placeholder="Örn. 1, 2, 3 (boş bırakılabilir)"
                  />
                </div>

                {/* Tip */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Tip</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APARTMENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Alan (m²) */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="apt-area" className="text-xs">Alan (m²)</Label>
                  <Input
                    id="apt-area"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    placeholder="Örn. 85, 120.5 (boş bırakılabilir)"
                  />
                </div>
              </div>
            </section>

            {/* === MAL SAHİBİ (yalnızca yeni daire modu) === */}
            {!isEditMode && (
              <section className="space-y-3 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Daire Sahibi (Mal Sahibi) — opsiyonel
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Dairenin sahibinin iletişim bilgilerini ekleyebilirsiniz. Boş bırakılırsa daire boş olarak kaydedilir.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="owner-name" className="text-xs flex items-center gap-1">
                      <User className="w-3 h-3" /> Ad Soyad
                    </Label>
                    <Input
                      id="owner-name"
                      value={owner.name}
                      onChange={(e) => setOwner({ ...owner, name: e.target.value })}
                      placeholder="Örn. Ayşe Kaya"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="owner-phone" className="text-xs flex items-center gap-1">
                      <Phone className="w-3 h-3" /> Telefon
                    </Label>
                    <Input
                      id="owner-phone"
                      type="tel"
                      value={owner.phone}
                      onChange={(e) => setOwner({ ...owner, phone: e.target.value })}
                      placeholder="+90 5xx xxx xx xx"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="owner-email" className="text-xs flex items-center gap-1">
                      <Mail className="w-3 h-3" /> E-posta
                    </Label>
                    <Input
                      id="owner-email"
                      type="email"
                      value={owner.email}
                      onChange={(e) => setOwner({ ...owner, email: e.target.value })}
                      placeholder="orne@eposta.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="owner-tc" className="text-xs flex items-center gap-1">
                      <IdCard className="w-3 h-3" /> TC Kimlik No
                    </Label>
                    <Input
                      id="owner-tc"
                      value={owner.tcKimlikNo}
                      onChange={(e) => setOwner({ ...owner, tcKimlikNo: e.target.value })}
                      placeholder="11 hane"
                      maxLength={11}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="owner-notes" className="text-xs flex items-center gap-1">
                      <StickyNote className="w-3 h-3" /> Notlar
                    </Label>
                    <Textarea
                      id="owner-notes"
                      value={owner.notes}
                      onChange={(e) => setOwner({ ...owner, notes: e.target.value })}
                      placeholder="Mal sahibiyle ilgili notlar..."
                      className="min-h-16"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* === KİRACI (yalnızca yeni daire modu) === */}
            {!isEditMode && (
              <section className="space-y-3 rounded-lg border border-sky-200 dark:border-sky-900/50 bg-sky-50/40 dark:bg-sky-950/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    Kiracı Bilgileri
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={hasTenant}
                      onCheckedChange={(v) => {
                        setHasTenant(v === true)
                        if (v !== true) setTenant(EMPTY_TENANT)
                      }}
                    />
                    <span className="text-xs text-muted-foreground">Kiracı var</span>
                  </label>
                </div>

                {hasTenant && (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      Eğer dairede kiracı oturuyorsa, kiracı bilgilerini girin. Kiracı kaydı mal sahibinden ayrı tutulur;
                      daire öncelikle kiracıya bağlanır.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="tenant-name" className="text-xs flex items-center gap-1">
                          <User className="w-3 h-3" /> Ad Soyad *
                        </Label>
                        <Input
                          id="tenant-name"
                          value={tenant.name}
                          onChange={(e) => setTenant({ ...tenant, name: e.target.value })}
                          placeholder="Örn. Mustafa Demir"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="tenant-phone" className="text-xs flex items-center gap-1">
                          <Phone className="w-3 h-3" /> Telefon
                        </Label>
                        <Input
                          id="tenant-phone"
                          type="tel"
                          value={tenant.phone}
                          onChange={(e) => setTenant({ ...tenant, phone: e.target.value })}
                          placeholder="+90 5xx xxx xx xx"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="tenant-email" className="text-xs flex items-center gap-1">
                          <Mail className="w-3 h-3" /> E-posta
                        </Label>
                        <Input
                          id="tenant-email"
                          type="email"
                          value={tenant.email}
                          onChange={(e) => setTenant({ ...tenant, email: e.target.value })}
                          placeholder="kiraci@eposta.com"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="tenant-movein" className="text-xs flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" /> Taşınma Tarihi
                        </Label>
                        <Input
                          id="tenant-movein"
                          type="date"
                          value={tenant.moveInDate}
                          onChange={(e) => setTenant({ ...tenant, moveInDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="tenant-lease-end" className="text-xs flex items-center gap-1">
                          <CalendarClock className="w-3 h-3" /> Kira Bitiş Tarihi
                        </Label>
                        <Input
                          id="tenant-lease-end"
                          type="date"
                          value={tenant.leaseEndDate}
                          onChange={(e) => setTenant({ ...tenant, leaseEndDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="tenant-notes" className="text-xs flex items-center gap-1">
                          <StickyNote className="w-3 h-3" /> Notlar
                        </Label>
                        <Textarea
                          id="tenant-notes"
                          value={tenant.notes}
                          onChange={(e) => setTenant({ ...tenant, notes: e.target.value })}
                          placeholder="Kiracıyla ilgili notlar..."
                          className="min-h-16"
                        />
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            İptal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            {isEditMode ? 'Güncelle' : 'Daire Ekle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
