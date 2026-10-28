'use client'

// ============================================================
// ADMIN — VİTRİN YÖNETİMİ diyaloğu (İşletmeler sekmesinden açılır)
// Berber/kuaför vb. hizmet sağlayıcının müşteri vitrin sitesi
// (3002 /isletme/[slug]) içeriğini yönetir:
//   A. Üst bilgi — ad + tip + "Sitede Gör" + foto sayısı
//   B. Kapak & Tanıtım — photo (16:9) + about (600 krk)
//   C. Portföy Galerisi — ProviderPhoto CRUD + sıralama + kategori
//   D. Ekip — staff photo (thumb 640px)
// Tüm yüklemede istemcide canvas ile küçültme yapılır (image-resize).
// ============================================================

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api-client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fileToResizedDataUrl, fileToThumbDataUrl } from '@/lib/image-resize'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Store, Users, Loader2, Upload, Save, Trash2, ExternalLink,
  ImagePlus, Images, Image as ImageIcon, ArrowUp, ArrowDown, EyeOff, Camera,
} from 'lucide-react'

// ------------------------------------------------------------
// Tipler
// ------------------------------------------------------------

export interface StorefrontProviderRef {
  id: string
  name: string
  slug?: string | null
  type: string
}

interface StorefrontDialogProps {
  provider: StorefrontProviderRef | null
  onClose: () => void
  onSaved?: () => void
}

interface ProviderPhotoItem {
  id: string
  url: string
  title: string | null
  caption: string | null
  category: string | null
  width: number | null
  height: number | null
  sortOrder: number
  isActive: boolean
  createdAt: string
}

interface StaffItem {
  id: string
  name: string
  title: string | null
  photo: string | null
  isActive: boolean
  sortOrder: number
}

interface ProviderDetail {
  id: string
  name: string
  slug: string | null
  type: string
  photo: string | null
  about: string | null
  staff: StaffItem[]
}

// ------------------------------------------------------------
// Sabitler
// ------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  berber: 'Berber',
  kuafor: 'Kuaför',
  disci: 'Diş Hekimi',
  guzellik: 'Güzellik',
  spa: 'Spa',
  dovme: 'Dövme',
}

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'kesim', label: 'Kesim' },
  { value: 'sac-boyama', label: 'Saç Boyama' },
  { value: 'sakal', label: 'Sakal' },
  { value: 'stil', label: 'Stil' },
  { value: 'salon', label: 'Salon' },
  { value: 'ekip', label: 'Ekip' },
  { value: 'diger', label: 'Diğer' },
]

// Radix Select boş string değer kabul etmez — "kategori yok" için sentinel
const NO_CATEGORY = '__yok'

const MAX_PHOTOS = 24

// ------------------------------------------------------------
// Ana diyalog
// ------------------------------------------------------------

export function StorefrontDialog({ provider, onClose, onSaved }: StorefrontDialogProps) {
  const qc = useQueryClient()
  const providerId = provider?.id ?? null

  // Provider detayı — photo/about/staff/slug bu uçtan gelir
  const detailQ = useQuery({
    queryKey: ['storefront-provider', providerId],
    queryFn: () => apiGet<ProviderDetail>(`/api/appointments/providers/${providerId}`),
    enabled: !!providerId,
  })

  const photosQ = useQuery({
    queryKey: ['provider-photos', providerId],
    queryFn: () => apiGet<{ photos: ProviderPhotoItem[] }>(
      `/api/admin/provider-photos?providerId=${providerId}`,
    ),
    enabled: !!providerId,
  })

  const detail = detailQ.data
  const photos = photosQ.data?.photos ?? []
  const staff = detail?.staff ?? []
  const slug = detail?.slug ?? provider?.slug ?? null

  // --- B: Tanıtım metni taslağı (dirty state ile) ---
  const [aboutDraft, setAboutDraft] = useState('')
  const [aboutSyncKey, setAboutSyncKey] = useState('')
  const aboutCurrent = detail?.about ?? ''
  const aboutKey = `${providerId}:${aboutCurrent}`
  if (providerId && aboutSyncKey !== aboutKey) {
    setAboutSyncKey(aboutKey)
    setAboutDraft(aboutCurrent)
  }
  const aboutDirty = aboutDraft !== aboutCurrent

  // --- B: Kapak yükleme/kaldırma ---
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [coverBusy, setCoverBusy] = useState(false)
  const [confirmRemoveCover, setConfirmRemoveCover] = useState(false)

  const handleCoverFile = async (file: File) => {
    if (!providerId) return
    setCoverBusy(true)
    try {
      const img = await fileToResizedDataUrl(file, 1600, 0.85)
      await apiPatch(`/api/appointments/providers/${providerId}`, { photo: img.dataUrl })
      toast.success('Kapak fotoğrafı güncellendi')
      await detailQ.refetch()
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kapak yüklenemedi')
    } finally {
      setCoverBusy(false)
    }
  }

  const removeCover = async () => {
    if (!providerId) return
    setCoverBusy(true)
    try {
      await apiPatch(`/api/appointments/providers/${providerId}`, { photo: null })
      toast.success('Kapak fotoğrafı kaldırıldı')
      setConfirmRemoveCover(false)
      await detailQ.refetch()
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kapak kaldırılamadı')
    } finally {
      setCoverBusy(false)
    }
  }

  const [aboutSaving, setAboutSaving] = useState(false)
  const saveAbout = async () => {
    if (!providerId || !aboutDirty) return
    setAboutSaving(true)
    try {
      await apiPatch(`/api/appointments/providers/${providerId}`, { about: aboutDraft })
      toast.success('Tanıtım metni kaydedildi')
      await detailQ.refetch()
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Metin kaydedilemedi')
    } finally {
      setAboutSaving(false)
    }
  }

  // --- C: Portföy yükleme (tek tek, ilerleme göstergeli) ---
  const portfolioInputRef = useRef<HTMLInputElement>(null)
  const [uploadCategory, setUploadCategory] = useState(NO_CATEGORY)
  const [uploadState, setUploadState] = useState<{ total: number; done: number; current: string } | null>(null)

  const handlePortfolioFiles = async (files: FileList | null) => {
    if (!providerId || !files || files.length === 0) return
    const list = Array.from(files)
    let okCount = 0
    const failed: string[] = []
    for (let i = 0; i < list.length; i++) {
      setUploadState({ total: list.length, done: i, current: list[i].name })
      try {
        const img = await fileToResizedDataUrl(list[i])
        await apiPost('/api/admin/provider-photos', {
          providerId,
          url: img.dataUrl,
          width: img.width,
          height: img.height,
          ...(uploadCategory !== NO_CATEGORY ? { category: uploadCategory } : {}),
        })
        okCount++
      } catch {
        failed.push(list[i].name)
      }
    }
    setUploadState(null)
    qc.invalidateQueries({ queryKey: ['provider-photos', providerId] })
    onSaved?.()
    if (okCount > 0 && failed.length === 0) {
      toast.success(`${okCount} fotoğraf portföye eklendi`)
    } else if (okCount > 0) {
      toast.warning(`${okCount} yüklendi, ${failed.length} başarısız: ${failed.slice(0, 3).join(', ')}`)
    } else {
      toast.error(`Yükleme başarısız: ${failed.slice(0, 3).join(', ')}`)
    }
  }

  // --- C: Fotoğraf meta güncelleme (başlık/kategori/yayın) ---
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null)

  const patchPhoto = async (
    photo: ProviderPhotoItem,
    patch: Record<string, unknown>,
    successMsg?: string,
  ) => {
    setBusyPhotoId(photo.id)
    try {
      await apiPatch(`/api/admin/provider-photos/${photo.id}`, patch)
      if (successMsg) toast.success(successMsg)
      await photosQ.refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fotoğraf güncellenemedi')
      await photosQ.refetch() // başarısızsa taslağı sunucu değerine döndür
    } finally {
      setBusyPhotoId(null)
    }
  }

  const movePhoto = async (index: number, dir: -1 | 1) => {
    if (!providerId) return
    const target = index + dir
    if (target < 0 || target >= photos.length) return
    const next = [...photos]
    ;[next[index], next[target]] = [next[target], next[index]]
    setBusyPhotoId(photos[index].id)
    try {
      await apiPost('/api/admin/provider-photos/reorder', {
        providerId,
        ids: next.map((p) => p.id),
      })
      await photosQ.refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sıra değiştirilemedi')
    } finally {
      setBusyPhotoId(null)
    }
  }

  const [deletingPhoto, setDeletingPhoto] = useState<ProviderPhotoItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const deletePhoto = async () => {
    if (!deletingPhoto || !providerId) return
    setDeleteBusy(true)
    try {
      await apiDelete(`/api/admin/provider-photos/${deletingPhoto.id}`)
      toast.success('Fotoğraf silindi')
      setDeletingPhoto(null)
      await photosQ.refetch()
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fotoğraf silinemedi')
    } finally {
      setDeleteBusy(false)
    }
  }

  // --- D: Ekip fotoğrafı (thumb 640px) ---
  const [busyStaffId, setBusyStaffId] = useState<string | null>(null)
  const handleStaffPhoto = async (staffId: string, file: File) => {
    if (!providerId) return
    setBusyStaffId(staffId)
    try {
      const img = await fileToThumbDataUrl(file)
      await apiPatch(`/api/appointments/providers/${providerId}/staff/${staffId}`, {
        photo: img.dataUrl,
      })
      toast.success('Personel fotoğrafı güncellendi')
      await detailQ.refetch()
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fotoğraf yüklenemedi')
    } finally {
      setBusyStaffId(null)
    }
  }

  if (!provider) return null

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto custom-scroll p-4 sm:p-6">
        {/* ---------- A. Üst bilgi çubuğu ---------- */}
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-7 text-base">
            <Store className="h-5 w-5 shrink-0 text-emerald-600" />
            <span className="truncate">{provider.name}</span>
            <Badge variant="outline" className="shrink-0 text-[11px]">
              {TYPE_LABELS[provider.type] ?? provider.type}
            </Badge>
            <Badge variant="secondary" className="shrink-0 text-[11px] tabular-nums">
              {photos.length}/{MAX_PHOTOS} foto
            </Badge>
            {slug && (
              <a
                href={`/isletme/${slug}?XTransformPort=3002`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                title={`/isletme/${slug}`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Sitede Gör
              </a>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Kapak, tanıtım metni, portföy galerisi ve ekip fotoğrafları müşteri vitrin
            sayfasında yayınlanır{slug ? <> — <span className="font-mono">/isletme/{slug}</span></> : null}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ---------- B. Kapak & Tanıtım ---------- */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <ImageIcon className="h-4 w-4 text-emerald-600" />
                Kapak Fotoğrafı ve Tanıtım
              </CardTitle>
              <CardDescription className="text-xs">
                Kapak vitrin sayfanızın en üstünde görünür; tanıtım metni işletmenizi anlatır.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detailQ.isLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[240px_1fr]">
                  <Skeleton className="aspect-video w-full" />
                  <Skeleton className="h-36 w-full" />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[240px_1fr]">
                  {/* Kapak önizleme + yükle/kaldır */}
                  <div className="space-y-2">
                    <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted/40">
                      {detail?.photo ? (
                        <img
                          src={detail.photo}
                          alt={`${provider.name} kapak fotoğrafı`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground/60">
                          <Store className="h-8 w-8" />
                          <span className="text-[11px]">Kapak fotoğrafı yok</span>
                        </div>
                      )}
                      {coverBusy && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline" size="sm" className="flex-1"
                        disabled={coverBusy}
                        onClick={() => coverInputRef.current?.click()}
                      >
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                        {detail?.photo ? 'Değiştir' : 'Kapak Yükle'}
                      </Button>
                      {detail?.photo && (
                        <Button
                          variant="outline" size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={coverBusy}
                          onClick={() => setConfirmRemoveCover(true)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          Kaldır
                        </Button>
                      )}
                    </div>
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void handleCoverFile(f)
                        e.target.value = ''
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Yatay (16:9) en iyi görünür · otomatik 1600px&apos;e küçültülür
                    </p>
                  </div>

                  {/* Tanıtım metni */}
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor={`about-${provider.id}`} className="text-xs font-medium text-muted-foreground">
                        Tanıtım Metni (Hakkımızda)
                      </label>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {aboutDraft.length}/600
                      </span>
                    </div>
                    <Textarea
                      id={`about-${provider.id}`}
                      value={aboutDraft}
                      onChange={(e) => setAboutDraft(e.target.value)}
                      maxLength={600}
                      rows={7}
                      placeholder="Örn. 1998&apos;den beri Kadıköy&apos;de klasik ve modern kesimler yapıyoruz. Deneyimli ekibimizle beklemeden hizmet veriyoruz…"
                    />
                    <div className="mt-auto flex items-center justify-end gap-2">
                      {!aboutDirty && <span className="text-[11px] text-muted-foreground">Değişiklik yok</span>}
                      <Button size="sm" disabled={!aboutDirty || aboutSaving} onClick={() => void saveAbout()}>
                        {aboutSaving
                          ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          : <Save className="h-4 w-4 mr-1.5" />}
                        Kaydet
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---------- C. Portföy Galerisi ---------- */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Images className="h-4 w-4 text-emerald-600" />
                Portföy Galerisi
                <Badge variant="secondary" className="text-[10px] tabular-nums">
                  {photos.length}/{MAX_PHOTOS}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Yüklediğiniz fotoğraflar vitrin sitenizde galeri bölümü olarak görünür.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Yükleme alanı */}
              <div className="space-y-3 rounded-lg border border-dashed p-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    size="sm"
                    disabled={!!uploadState || photos.length >= MAX_PHOTOS}
                    onClick={() => portfolioInputRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4 mr-1.5" />
                    Fotoğraf Seç (çoklu)
                  </Button>
                  <div className="w-full sm:w-56">
                    <Select
                      value={uploadCategory}
                      onValueChange={setUploadCategory}
                      disabled={!!uploadState}
                    >
                      <SelectTrigger className="h-9" aria-label="Ortak kategori">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CATEGORY}>Kategori seçilmedi</SelectItem>
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <input
                  ref={portfolioInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handlePortfolioFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                {uploadState && (
                  <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-600" />
                    <span className="shrink-0 tabular-nums">
                      {Math.min(uploadState.done + 1, uploadState.total)}/{uploadState.total} yükleniyor…
                    </span>
                    <span className="truncate">{uploadState.current}</span>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Otomatik 1280px WebP&apos;ye küçültülür · işletme başına en fazla {MAX_PHOTOS} fotoğraf
                </p>
              </div>

              {/* Fotoğraf grid'i */}
              {photosQ.isLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="aspect-square w-full" />)}
                </div>
              ) : photosQ.isError ? (
                <p className="py-4 text-center text-xs text-destructive">
                  Portföy yüklenemedi — {(photosQ.error as Error)?.message ?? 'bilinmeyen hata'}
                </p>
              ) : photos.length === 0 ? (
                <div className="py-8 text-center">
                  <Images className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm font-medium">Henüz portföy fotoğrafı yok</p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                    Berber çalışmalarınızı yükleyin — kesimler, saç boyamaları, sakal tasarımları…
                    Bunlar vitrin sitenizde galeri olarak görünür.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {photos.map((photo, i) => (
                    <PhotoCard
                      key={photo.id}
                      photo={photo}
                      index={i}
                      total={photos.length}
                      busy={busyPhotoId === photo.id}
                      onPatch={(p, patch, msg) => void patchPhoto(p, patch, msg)}
                      onMove={(idx, dir) => void movePhoto(idx, dir)}
                      onDelete={() => setDeletingPhoto(photo)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---------- D. Ekip ---------- */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Users className="h-4 w-4 text-emerald-600" />
                Ekip
                <Badge variant="secondary" className="text-[10px] tabular-nums">{staff.length}</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Personel fotoğrafları vitrin sayfasındaki ekip bölümünde görünür (640px&apos;e küçültülür).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detailQ.isLoading ? (
                <div className="space-y-2">
                  {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-[68px] w-full" />)}
                </div>
              ) : staff.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Bu işletmenin personeli yok — Personel sekmesinden ekleyin.
                </p>
              ) : (
                <ul className="space-y-2">
                  {staff.map((s) => (
                    <li
                      key={s.id}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-2.5',
                        !s.isActive && 'opacity-60',
                      )}
                    >
                      {s.photo ? (
                        <img
                          src={s.photo}
                          alt={`${s.name} personel fotoğrafı`}
                          className="h-12 w-12 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {s.name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?'}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{s.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {s.title ?? 'Personel'}{!s.isActive && ' · pasif'}
                        </div>
                      </div>
                      <label
                        className={cn(
                          'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted',
                          busyStaffId === s.id && 'pointer-events-none opacity-60',
                        )}
                      >
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void handleStaffPhoto(s.id, f)
                            e.target.value = ''
                          }}
                        />
                        {busyStaffId === s.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Camera className="h-3.5 w-3.5" />}
                        Foto Yükle
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Kapak kaldırma onayı */}
        <AlertDialog open={confirmRemoveCover} onOpenChange={setConfirmRemoveCover}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kapak fotoğrafı kaldırılsın mı?</AlertDialogTitle>
              <AlertDialogDescription>
                Vitrin sayfası kapaksız (simge yer tutucusuyla) görünür. Fotoğrafı istediğiniz
                zaman tekrar yükleyebilirsiniz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void removeCover()}
              >
                {coverBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kaldır'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Portföy fotoğrafı silme onayı */}
        <AlertDialog open={!!deletingPhoto} onOpenChange={(v) => !v && setDeletingPhoto(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fotoğraf silinsin mi?</AlertDialogTitle>
              <AlertDialogDescription>
                {deletingPhoto?.title
                  ? <>&quot;{deletingPhoto.title}&quot; portföy galerisinden kalıcı olarak silinir. Bu işlem geri alınamaz.</>
                  : 'Bu fotoğraf portföy galerisinden kalıcı olarak silinir. Bu işlem geri alınamaz.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deletingPhoto && (
              <img
                src={deletingPhoto.url}
                alt={deletingPhoto.title ?? 'Silinecek fotoğraf'}
                className="h-28 w-28 rounded-lg border object-cover"
              />
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteBusy}
                onClick={() => void deletePhoto()}
              >
                {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sil'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------
// Tek portföy fotoğrafı kartı — başlık/kategori/yayın/sıra/sil
// ------------------------------------------------------------

function PhotoCard({
  photo, index, total, busy, onPatch, onMove, onDelete,
}: {
  photo: ProviderPhotoItem
  index: number
  total: number
  busy: boolean
  onPatch: (photo: ProviderPhotoItem, patch: Record<string, unknown>, successMsg?: string) => void
  onMove: (index: number, dir: -1 | 1) => void
  onDelete: () => void
}) {
  const [titleDraft, setTitleDraft] = useState(photo.title ?? '')

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-lg border', !photo.isActive && 'opacity-60')}>
      <div className="relative aspect-square bg-muted/40">
        <img
          src={photo.url}
          alt={photo.title || `Portföy fotoğrafı ${index + 1}`}
          className="h-full w-full object-cover"
        />
        <span className="absolute left-1.5 top-1.5 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm">
          {index + 1}
        </span>
        {!photo.isActive && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-stone-800/90 px-1.5 py-0.5 text-[10px] font-medium text-stone-50">
            <EyeOff className="h-3 w-3" />
            Gizli
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col space-y-2 p-2">
        <Input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            if (titleDraft !== (photo.title ?? '')) {
              onPatch(photo, { title: titleDraft }, 'Başlık kaydedildi')
            }
          }}
          placeholder="Başlık…"
          maxLength={80}
          className="h-8 text-xs"
          disabled={busy}
          aria-label={`Fotoğraf ${index + 1} başlığı`}
        />
        <Select
          value={photo.category ?? NO_CATEGORY}
          onValueChange={(v) => onPatch(photo, { category: v === NO_CATEGORY ? null : v })}
          disabled={busy}
        >
          <SelectTrigger className="h-8 text-xs" aria-label={`Fotoğraf ${index + 1} kategorisi`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CATEGORY} className="text-xs">Kategori yok</SelectItem>
            {CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-auto flex items-center justify-between gap-1 pt-0.5">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <Switch
              checked={photo.isActive}
              disabled={busy}
              onCheckedChange={(v) =>
                onPatch(photo, { isActive: v }, v ? 'Fotoğraf yayına alındı' : 'Fotoğraf gizlendi')}
              aria-label={`Fotoğraf ${index + 1} yayın durumu`}
            />
            Yayın
          </label>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost" size="sm"
              className="h-7 w-7 p-0"
              disabled={busy || index === 0}
              aria-label={`${index + 1}. fotoğrafı yukarı taşı`}
              onClick={() => onMove(index, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-7 w-7 p-0"
              disabled={busy || index === total - 1}
              aria-label={`${index + 1}. fotoğrafı aşağı taşı`}
              onClick={() => onMove(index, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              disabled={busy}
              aria-label={`${index + 1}. fotoğrafı sil`}
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
