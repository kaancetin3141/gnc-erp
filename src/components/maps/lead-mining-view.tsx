'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  MapPin, Search, Download, Plus, Star, Phone, Globe, Check, X,
  Loader2, Users, Eye, UserPlus, Layers, History,
  Clock, ChevronRight, Building2, Filter, FileSpreadsheet, AlertCircle,
  CheckCircle2, UserCircle, Sparkles, MessageCircle,
  Stethoscope, Scissors, UtensilsCrossed, Pill, Wrench, Dumbbell,
  Scale, Calculator, ShoppingCart, BedDouble, PawPrint, GraduationCap, Home,
  ShieldCheck, CloudOff, Coffee,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { apiGet, apiPost, apiPatch, qk } from '@/lib/api-client'
import { CITIES, MAPS_CATEGORIES, LEAD_STATUSES, getLabel, getColor } from '@/lib/constants'
import {
  formatPhone, formatDate, formatRelative, telLink, toCSV, downloadFile, whatsappLink,
} from '@/lib/format'
import { hasPermission } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import type { MapsResult, Lead, MapsSearch, UserListItem } from '@/types'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { CustomerPoint } from '@/components/maps/osm-map'

// GERÇEK harita — Leaflet + OpenStreetMap (API anahtarsız). Yalnızca tarayıcıda yüklenir.
const OsmMap = dynamic(
  () => import('@/components/maps/osm-map').then((m) => m.OsmMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[420px] sm:h-[480px] lg:h-[560px] rounded-xl border border-border bg-muted/40 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Harita yükleniyor…</span>
        </div>
      </div>
    ),
  },
)

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

// Yarıçap önayarları (metre) — Overpass POI taraması için 0.5–10 km (yurt dışı için geniş)
const RADII_M = [500, 1000, 2000, 3000, 5000, 10000] as const
const DEFAULT_RADIUS_M = 2000
const DAILY_LIMIT = 50

// Kategori chip ikonları — MAPS_CATEGORIES.query sırasına göre
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'diş kliniği': Stethoscope,
  'kuaför': Scissors,
  'restoran': UtensilsCrossed,
  'eczane': Pill,
  'otomotiv': Wrench,
  'gym fitness': Dumbbell,
  'avukat': Scale,
  'muhasebe': Calculator,
  'cafe': Coffee,
  'market': ShoppingCart,
  'otel': BedDouble,
  'veteriner': PawPrint,
  'eğitim': GraduationCap,
  'emlak': Home,
}

// ----------------------------------------------------------------------------
// API response shapes
// ----------------------------------------------------------------------------

interface SearchResponse {
  results: MapsResult[]
  searchId: string
  search: MapsSearch
  provider?: 'osm' | 'fallback' | 'google'
  geocoded?: { lat: number; lng: number; displayName: string } | null
  notice?: string
}

// Google Maps derin bağlantısı — API anahtarsız resmî URL (pin = koordinat)
function googleMapsHref(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

interface ImportResponse {
  created: Lead[]
  skipped: number
  searchId: string
}
interface UsersResponse {
  items: UserListItem[]
}
interface LeadsResponse {
  items: Lead[]
  total: number
}
interface MapsSearchesResponse {
  items: MapsSearch[]
}
interface CustomerPointsResponse {
  items: CustomerPoint[]
}

// ----------------------------------------------------------------------------
// Small UI helpers
// ----------------------------------------------------------------------------

function StarRating({
  rating,
  reviewCount,
  className,
}: {
  rating: number | null
  reviewCount?: number | null
  className?: string
}) {
  if (rating === null || rating === undefined) {
    return <span className={cn('text-xs text-muted-foreground', className)}>—</span>
  }
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
      <span className="text-xs font-medium tabular-nums">{rating.toFixed(1)}</span>
      {reviewCount !== null && reviewCount !== undefined && reviewCount > 0 && (
        <span className="text-[10px] text-muted-foreground">({reviewCount})</span>
      )}
    </div>
  )
}

function webHref(web: string | null): string | null {
  if (!web) return null
  if (/^https?:\/\//i.test(web)) return web
  return `https://${web}`
}

// Import dialog
// ----------------------------------------------------------------------------

interface ImportDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  selectedResults: MapsResult[]
  searchId: string | null
  onImported: () => void
}

function ImportDialog({
  open, onOpenChange, selectedResults, searchId, onImported,
}: ImportDialogProps) {
  const { user } = useAppStore()
  const qc = useQueryClient()
  // Initialize owner to the current user from the store (sync, persisted).
  // No effect needed — the store is hydrated synchronously via zustand/persist
  // and this component only mounts after login.
  const [ownerId, setOwnerId] = useState<string>(
    () => useAppStore.getState().user?.id ?? '',
  )

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: qk.users,
    queryFn: () => apiGet<UsersResponse>('/api/users'),
    enabled: open,
  })

  const importMutation = useMutation({
    mutationFn: () =>
      apiPost<ImportResponse>('/api/maps/import', {
        searchId,
        items: selectedResults,
        ownerId,
      }),
    onSuccess: (data) => {
      const createdCount = data.created.length
      const skippedCount = data.skipped
      if (createdCount > 0) {
        toast.success(`${createdCount} lead içe aktarıldı`, {
          description: skippedCount > 0 ? `${skippedCount} kayıt zaten mevcut, atlandı.` : undefined,
        })
      } else {
        toast.info('İçe aktarılacak yeni kayıt yok', {
          description: `${skippedCount} kayıt zaten CRM'de mevcut.`,
        })
      }
      qc.invalidateQueries({ queryKey: qk.leads({ source: 'google_maps' }) })
      qc.invalidateQueries({ queryKey: qk.mapsSearches })
      onImported()
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error('İçe aktarma başarısız', { description: e.message }),
  })

  const users = usersData?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lead Olarak Aktar</DialogTitle>
          <DialogDescription>
            {selectedResults.length} kayıt seçili. Bir sahibi atayın ve içe aktarın.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Seçili kayıt</span>
              <span className="font-semibold">{selectedResults.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">CRM'de var (atlanacak)</span>
              <span className="font-semibold text-amber-600">
                {selectedResults.filter((r) => r.existsInCrm).length}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Yeni eklenecek</span>
              <span className="font-semibold text-emerald-600">
                {selectedResults.filter((r) => !r.existsInCrm).length}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Sahip</label>
            <Select value={ownerId} onValueChange={setOwnerId} disabled={usersLoading}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Kullanıcı seçin" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <span className="flex items-center gap-2">
                      <UserCircle className="w-3.5 h-3.5 text-muted-foreground" />
                      {u.name}
                      {u.id === user?.id && (
                        <span className="text-[10px] text-muted-foreground">(sen)</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Leadler bu kullanıcıya atanacak. İstediğin zaman lead detayından değiştirebilirsin.
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">İptal</Button>
          </DialogClose>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending || !ownerId || selectedResults.length === 0}
          >
            {importMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-1.5" />
            )}
            İçe Aktar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ----------------------------------------------------------------------------
// Lead detail dialog (view action)
// ----------------------------------------------------------------------------

function LeadDetailDialog({
  lead, open, onOpenChange,
}: {
  lead: Lead | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)

  // Dialog her açıldığında not input'unu sıfırla
  useEffect(() => {
    if (open) setNoteText('')
  }, [open, lead?.id])

  if (!lead) return null

  // Durum değiştir — 'donustu' dönüşümü tablodaki Dönüştür butonuyla yapılır
  const changeStatus = async (status: string) => {
    if (status === lead.status) return
    setStatusChanging(true)
    try {
      await apiPatch<Lead>(`/api/leads/${lead.id}`, { status })
      toast.success(`Durum güncellendi: ${getLabel(LEAD_STATUSES, status)}`)
      qc.invalidateQueries({ queryKey: ['leads'] })
      onOpenChange(false)
    } catch (e) {
      toast.error('Durum güncellenemedi', { description: e instanceof Error ? e.message : '' })
    } finally {
      setStatusChanging(false)
    }
  }

  const addNote = async () => {
    const text = noteText.trim()
    if (!text) return
    setNoteSaving(true)
    try {
      const newNotes = [...(Array.isArray(lead.notes) ? lead.notes : []), text]
      await apiPatch<Lead>(`/api/leads/${lead.id}`, { notes: newNotes })
      toast.success('Not eklendi')
      setNoteText('')
      qc.invalidateQueries({ queryKey: ['leads'] })
      onOpenChange(false)
    } catch (e) {
      toast.error('Not eklenemedi', { description: e instanceof Error ? e.message : '' })
    } finally {
      setNoteSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            {lead.name}
          </DialogTitle>
          <DialogDescription>
            {lead.category || 'Kategori belirtilmedi'} · {lead.city || 'Şehir belirtilmedi'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Sahip</div>
            <div>{lead.owner?.name ?? '—'}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Puan</div>
            <StarRating rating={lead.rating} reviewCount={lead.reviewCount} />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Telefon</div>
            {lead.phone ? (
              <a href={telLink(lead.phone)} className="text-emerald-600 hover:underline flex items-center gap-1">
                <Phone className="w-3 h-3" /> {formatPhone(lead.phone)}
              </a>
            ) : <span>—</span>}
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Web</div>
            {lead.web ? (
              <a href={webHref(lead.web) || '#'} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline flex items-center gap-1 truncate">
                <Globe className="w-3 h-3 shrink-0" /> <span className="truncate">{lead.web}</span>
              </a>
            ) : <span>—</span>}
          </div>
          <div className="col-span-2 space-y-1">
            <div className="text-xs text-muted-foreground">Adres</div>
            <div className="text-sm">{lead.address || '—'}</div>
          </div>
        </div>

        {/* Hızlı iletişim */}
        {lead.phone && (
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="flex-1 h-8 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50">
              <a href={telLink(lead.phone)}><Phone className="w-3.5 h-3.5 mr-1" /> Ara</a>
            </Button>
            <Button asChild size="sm" variant="outline" className="flex-1 h-8 text-xs text-[#25D366] border-[#25D366]/40 hover:bg-[#25D366]/10">
              <a href={whatsappLink(lead.phone, `Merhaba, ${lead.name} işletmenizle iletişime geçmek istiyoruz.`)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp
              </a>
            </Button>
          </div>
        )}

        {/* Durum değiştirme — gerçek çalışan workflow */}
        {lead.status !== 'donustu' && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Durumu Değiştir</div>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_STATUSES.filter((s) => s.value !== 'donustu').map((s) => (
                <button
                  key={s.value}
                  disabled={statusChanging}
                  onClick={() => changeStatus(s.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium border transition-all disabled:opacity-50',
                    s.value === lead.status
                      ? cn(s.color, 'ring-2 ring-offset-1 ring-current/30')
                      : 'text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground',
                  )}
                >
                  {statusChanging && <Loader2 className="w-3 h-3 mr-1 inline animate-spin" />}
                  {s.label}
                </button>
              ))}
              <button
                disabled
                title="Dönüştürmek için tablodaki kişiler ekle butonunu kullanın"
                className="px-2.5 py-1 rounded-md text-xs font-medium border border-emerald-200 bg-emerald-50 text-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-400/50 dark:border-emerald-900/50 cursor-not-allowed"
              >
                Dönüştü ←
              </button>
            </div>
          </div>
        )}

        {/* Notlar — ekle + listele */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Notlar ({Array.isArray(lead.notes) ? lead.notes.length : 0})</div>
          {Array.isArray(lead.notes) && lead.notes.length > 0 && (
            <div className="max-h-24 overflow-y-auto custom-scroll space-y-1.5">
              {lead.notes.map((n, i) => (
                <div key={i} className="text-xs p-2 rounded-md bg-muted/60 border border-border/50">
                  {n}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Not ekle — örn. 'Aradım, fiyat bilgisi istedi'..."
              className="h-8 text-xs"
              onKeyDown={(e) => { if (e.key === 'Enter') addNote() }}
            />
            <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={addNote} disabled={noteSaving || !noteText.trim()}>
              {noteSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {lead.convertedCustomer && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Müşteriye dönüştürüldü
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{lead.convertedCustomer.name}</div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Kapat</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------

export function LeadMiningView() {
  const { user, openCustomer } = useAppStore()
  const qc = useQueryClient()

  // search form state
  const [query, setQuery] = useState('')
  const [city, setCity] = useState<string>('İstanbul')
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS_M) // metre
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // results state
  const [results, setResults] = useState<MapsResult[]>([])
  const [searchId, setSearchId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hasSearched, setHasSearched] = useState(false)
  const [provider, setProvider] = useState<'osm' | 'fallback' | 'google' | null>(null)
  const [geocoded, setGeocoded] = useState<{ lat: number; lng: number; displayName: string } | null>(null)

  // harita senkron durumu
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [showCustomers, setShowCustomers] = useState(false)

  // dialog state
  const [importOpen, setImportOpen] = useState(false)
  const [detailLead, setDetailLead] = useState<Lead | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // leads filter
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('')

  const canImport = hasPermission(user, 'leads.import')
  const canSearch = hasPermission(user, 'maps.search')

  // ---- recent searches (for history + daily limit) ----
  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: qk.mapsSearches,
    queryFn: () => apiGet<MapsSearchesResponse>('/api/maps/search?limit=20'),
  })
  const recentSearches = recentData?.items ?? []

  const todayCount = useMemo(() => {
    const today = new Date()
    return recentSearches.filter((s) => {
      const d = new Date(s.createdAt)
      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      )
    }).length
  }, [recentSearches])

  const limitReached = todayCount >= DAILY_LIMIT

  // ---- müşteri katmanı (konumlu CRM müşterileri) ----
  const customersQuery = useQuery({
    queryKey: ['maps-customer-points'],
    queryFn: () => apiGet<CustomerPointsResponse>('/api/maps/customers-points'),
    enabled: showCustomers,
    staleTime: 60_000,
  })
  const customerPoints = useMemo(() => customersQuery.data?.items ?? [], [customersQuery.data])

  // ---- search mutation ----
  const searchMutation = useMutation({
    mutationFn: (vars: { query: string; city: string; radius: number; category?: string | null }) =>
      apiPost<SearchResponse>('/api/maps/search', {
        query: vars.query,
        city: vars.city,
        radius: vars.radius, // metre
        category: vars.category || undefined,
      }),
    onSuccess: (data) => {
      setResults(data.results)
      setSearchId(data.searchId)
      setSelectedIds(new Set())
      setHasSearched(true)
      setProvider(data.provider ?? null)
      setGeocoded(data.geocoded ?? null)
      qc.invalidateQueries({ queryKey: qk.mapsSearches })

      if (data.provider === 'fallback') {
        toast.warning('Harita servisine ulaşılamadı — örnek veri gösteriliyor', {
          description: 'Gerçek veri için bağlantı sağlandığında tekrar deneyin.',
        })
      }
      if (data.results.length === 0) {
        toast.info(`Bu bölgede "${query || selectedCategory || 'aramanız'}" için kayıt bulunamadı`, {
          description: 'Yarıçapı büyütebilir veya farklı bir sorgu deneyebilirsiniz.',
        })
      } else {
        toast.success(`${data.results.length} işletme bulundu`, {
          description:
            data.geocoded?.displayName
              ? `${data.geocoded.displayName} çevresinde · ${data.provider === 'google' ? 'Google Maps' : 'OpenStreetMap'}`
              : `${data.results.filter((r) => r.existsInCrm).length} tanesi zaten CRM'de.`,
        })
      }
    },
    onError: (e: Error) => toast.error('Arama başarısız', { description: e.message }),
  })

  const handleSearch = useCallback(() => {
    if (!query.trim()) {
      toast.error('Arama sorgusu gerekli')
      return
    }
    if (!city) {
      toast.error('Şehir seçin')
      return
    }
    if (limitReached) {
      toast.error('Günlük arama limitine ulaşıldı', {
        description: `Limit: ${DAILY_LIMIT} arama/gün. Yarın tekrar deneyin.`,
      })
      return
    }
    searchMutation.mutate({ query: query.trim(), city, radius, category: selectedCategory })
  }, [query, city, radius, selectedCategory, limitReached, searchMutation])

  const rerunSearch = useCallback((s: MapsSearch) => {
    setQuery(s.query)
    setCity(s.city || 'İstanbul')
    // eski kayıtlar km cinsindendi — metreye çevir ve 0.5-10 km aralığına kırp
    const r = Math.min(10000, Math.max(500, s.radius ?? DEFAULT_RADIUS_M))
    setRadius(r)
    setSelectedCategory(null)
    if (limitReached) {
      toast.error('Günlük arama limitine ulaşıldı')
      return
    }
    searchMutation.mutate({
      query: s.query,
      city: s.city || 'İstanbul',
      radius: r,
    })
  }, [limitReached, searchMutation])

  // ---- selection ----
  const toggleSelect = useCallback((placeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(placeId)) next.delete(placeId)
      else next.add(placeId)
      return next
    })
  }, [])

  const selectAllNew = useCallback(() => {
    setSelectedIds(new Set(results.filter((r) => !r.existsInCrm).map((r) => r.placeId)))
  }, [results])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const selectedResults = useMemo(
    () => results.filter((r) => selectedIds.has(r.placeId)),
    [results, selectedIds],
  )

  // ---- CSV export ----
  const handleExportCsv = useCallback(() => {
    if (results.length === 0) {
      toast.error('Dışa aktarılacak sonuç yok')
      return
    }
    const rows = results.map((r) => ({
      Ad: r.name,
      Kategori: r.category,
      Adres: r.address,
      Sehir: r.city,
      Telefon: r.phone || '',
      Web: r.web || '',
      Puan: r.rating ?? '',
      YorumSayisi: r.reviewCount ?? '',
      CRMdeVar: r.existsInCrm ? 'evet' : 'hayir',
      Enlem: r.lat,
      Boylam: r.lng,
    }))
    const csv = toCSV(rows)
    const dateStr = new Date().toISOString().slice(0, 10)
    downloadFile(csv, `maps-arama-${dateStr}.csv`)
    toast.success('CSV indirildi', { description: `${results.length} kayıt` })
  }, [results])

  // ---- leads from maps ----
  const leadsQuery = useQuery({
    queryKey: qk.leads({ source: 'google_maps', status: leadStatusFilter }),
    queryFn: () => {
      const params = new URLSearchParams({ source: 'google_maps', limit: '100' })
      if (leadStatusFilter) params.set('status', leadStatusFilter)
      return apiGet<LeadsResponse>(`/api/leads?${params.toString()}`)
    },
  })
  const leads = leadsQuery.data?.items ?? []

  // Durum sayıları — filtre çiplerinde rozet olarak gösterilir
  const allLeadsQuery = useQuery({
    queryKey: qk.leads({ source: 'google_maps', status: 'all-count' }),
    queryFn: () => apiGet<LeadsResponse>('/api/leads?source=google_maps&limit=500'),
    staleTime: 30_000,
  })
  const leadStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const l of (allLeadsQuery.data?.items ?? [])) {
      counts[l.status] = (counts[l.status] ?? 0) + 1
    }
    return counts
  }, [allLeadsQuery.data])
  const leadTotal = allLeadsQuery.data?.total ?? (allLeadsQuery.data?.items?.length ?? 0)

  const convertMutation = useMutation({
    mutationFn: (id: string) =>
      apiPatch<Lead>(`/api/leads/${id}`, { status: 'donustu' }),
    onSuccess: (lead) => {
      toast.success('Müşteriye dönüştürüldü', {
        description: lead.convertedCustomer
          ? `"${lead.name}" → ${lead.convertedCustomer.name} olarak oluşturuldu`
          : `"${lead.name}" müşteri olarak işaretlendi`,
        action: lead.convertedCustomer ? {
          label: 'Görüntüle',
          onClick: () => openCustomer(lead.convertedCustomer!.id),
        } : undefined,
      })
      qc.invalidateQueries({ queryKey: qk.leads({ source: 'google_maps' }) })
    },
    onError: (e: Error) => toast.error('Dönüştürme başarısız', { description: e.message }),
  })

  const openDetail = (lead: Lead) => {
    setDetailLead(lead)
    setDetailOpen(true)
  }

  // ---- daily limit display ----
  const limitPct = Math.min(100, (todayCount / DAILY_LIMIT) * 100)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="w-6 h-6 text-emerald-600" />
            Potansiyel Müşteri Madenciliği
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Yurt içi ve yurt dışı işletmeleri ara (kafe, klinik, market…), seç ve CRM'ne lead olarak aktar —
            <span className="inline-flex items-center gap-1 ml-1 text-emerald-600 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" /> API anahtarsız, ücretsiz
            </span>
          </p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="grid lg:grid-cols-5 gap-4">
        {/* ---------- LEFT PANEL ---------- */}
        <div className="lg:col-span-3 space-y-4">
          {/* Search form card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  Arama
                </CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border',
                      limitReached
                        ? 'border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900/50'
                        : limitPct > 70
                          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/50'
                          : 'border-border bg-muted/40 text-muted-foreground',
                    )}>
                      <AlertCircle className="w-3 h-3" />
                      <span className="font-medium">Günlük arama limiti: {todayCount}/{DAILY_LIMIT}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Servis kullanım politikası koruması için günlük {DAILY_LIMIT} arama ile sınırlıdır.
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* category quick-select chips — ikonlu */}
              <div className="flex flex-wrap gap-1.5">
                {MAPS_CATEGORIES.map((c) => {
                  const Icon = CATEGORY_ICONS[c.query]
                  const active = query === c.query && selectedCategory === c.category
                  return (
                    <button
                      key={c.query}
                      type="button"
                      onClick={() => {
                        setQuery(c.query)
                        setSelectedCategory(c.category)
                      }}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1',
                        'hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700',
                        'dark:hover:bg-emerald-950/30 dark:hover:border-emerald-800',
                        active
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800'
                          : 'bg-muted/40 border-border text-muted-foreground',
                      )}
                    >
                      {Icon && <Icon className="w-3 h-3" />}
                      {c.category}
                    </button>
                  )
                })}
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                <div className="sm:col-span-1">
                  <Input
                    placeholder="Arama sorgusu (örn: diş kliniği)"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setSelectedCategory(null) // serbest metin → sunucu kategoriyi tahmin eder
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                    disabled={!canSearch || limitReached || searchMutation.isPending}
                  />
                </div>
                <div className="sm:col-span-1">
                  <Input
                    list="gnc-city-options"
                    placeholder="Şehir / bölge (örn: Berlin)"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={!canSearch || searchMutation.isPending}
                    aria-label="Şehir veya bölge"
                  />
                  {/* Hızlı seçim: TR şehirleri — serbest metin olduğundan dünya genelinde yazılabilir */}
                  <datalist id="gnc-city-options">
                    {CITIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div className="flex items-center gap-3 px-3 rounded-md border border-input bg-transparent h-9">
                  <span className="text-xs text-muted-foreground shrink-0">Yarıçap</span>
                  <Slider
                    value={[RADII_M.indexOf(radius as (typeof RADII_M)[number]) >= 0 ? RADII_M.indexOf(radius as (typeof RADII_M)[number]) : 2]}
                    min={0}
                    max={RADII_M.length - 1}
                    step={1}
                    onValueChange={(v) => setRadius(RADII_M[v[0]])}
                    disabled={!canSearch || searchMutation.isPending}
                    aria-label="Arama yarıçapı"
                    className="flex-1"
                  />
                  <span className="text-xs font-semibold tabular-nums shrink-0 w-12 text-right">
                    {radius >= 1000 ? `${(radius / 1000).toLocaleString('tr-TR')} km` : `${radius} m`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleSearch}
                  disabled={!canSearch || limitReached || searchMutation.isPending}
                >
                  {searchMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 mr-1.5" />
                  )}
                  Ara
                </Button>
                {hasSearched && results.length > 0 && (
                  <Button variant="outline" onClick={handleExportCsv}>
                    <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                    CSV Dışa Aktar
                  </Button>
                )}
                {!canSearch && (
                  <span className="text-xs text-muted-foreground">
                    Harita araması yapma yetkiniz yok.
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results card */}
          {searchMutation.isPending && !hasSearched ? (
            <Card>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ) : hasSearched ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    Sonuçlar
                    <Badge variant="secondary" className="ml-1">{results.length}</Badge>
                    {selectedIds.size > 0 && (
                      <Badge className="ml-1 bg-sky-100 text-sky-700 border-sky-200">
                        {selectedIds.size} seçili
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={selectAllNew}
                      disabled={results.length === 0}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Tümünü Seç
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={clearSelection}
                      disabled={selectedIds.size === 0}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Seçimi Temizle
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {results.length === 0 ? (
                  <div className="p-8 text-center">
                    <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Sonuç bulunamadı.</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Farklı bir sorgu veya şehir deneyin.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-[420px] overflow-y-auto custom-scroll border-t">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="w-10 pl-4">
                            <Checkbox
                              checked={results.length > 0 && results.every((r) => r.existsInCrm || selectedIds.has(r.placeId))}
                              onCheckedChange={(v) => {
                                if (v) selectAllNew()
                                else clearSelection()
                              }}
                              aria-label="Tümünü seç"
                            />
                          </TableHead>
                          <TableHead>İşletme</TableHead>
                          <TableHead className="hidden md:table-cell">Adres</TableHead>
                          <TableHead className="hidden lg:table-cell">İletişim</TableHead>
                          <TableHead className="text-right">Puan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r) => {
                          const selected = selectedIds.has(r.placeId)
                          return (
                            <TableRow
                              key={r.placeId}
                              data-state={selected ? 'selected' : undefined}
                              className={cn('cursor-pointer', hoveredId === r.placeId && 'bg-muted/60')}
                              onClick={() => toggleSelect(r.placeId)}
                              onMouseEnter={() => setHoveredId(r.placeId)}
                              onMouseLeave={() => setHoveredId((cur) => (cur === r.placeId ? null : cur))}
                            >
                              <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selected}
                                  onCheckedChange={() => toggleSelect(r.placeId)}
                                  disabled={r.existsInCrm}
                                  aria-label={r.name}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="min-w-0">
                                    <div className="font-medium text-sm truncate flex items-center gap-1.5">
                                      {r.name}
                                      {r.existsInCrm && (
                                        <Badge className="text-[10px] h-4 px-1 bg-emerald-100 text-emerald-700 border-emerald-200">
                                          <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> CRM'de
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">{r.category}</div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell max-w-[220px]">
                                <span className="text-xs text-muted-foreground truncate block">
                                  {r.address}
                                </span>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <div className="flex items-center gap-1.5">
                                  {r.phone && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <a
                                          href={telLink(r.phone)}
                                          onClick={(e) => e.stopPropagation()}
                                          target="_blank" rel="noreferrer"
                                          className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600"
                                        >
                                          <Phone className="w-3.5 h-3.5" />
                                        </a>
                                      </TooltipTrigger>
                                      <TooltipContent>{formatPhone(r.phone)}</TooltipContent>
                                    </Tooltip>
                                  )}
                                  {r.web && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <a
                                          href={webHref(r.web) || '#'}
                                          onClick={(e) => e.stopPropagation()}
                                          target="_blank" rel="noreferrer"
                                          className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-sky-50 hover:border-sky-200 hover:text-sky-600"
                                        >
                                          <Globe className="w-3.5 h-3.5" />
                                        </a>
                                      </TooltipTrigger>
                                      <TooltipContent>{r.web}</TooltipContent>
                                    </Tooltip>
                                  )}
                                  {!r.phone && !r.web && (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <a
                                        href={googleMapsHref(r.lat, r.lng)}
                                        onClick={(e) => e.stopPropagation()}
                                        target="_blank" rel="noreferrer"
                                        className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:hover:bg-red-950/40"
                                      >
                                        <MapPin className="w-3.5 h-3.5" />
                                      </a>
                                    </TooltipTrigger>
                                    <TooltipContent>Google Maps'te aç</TooltipContent>
                                  </Tooltip>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <StarRating rating={r.rating} reviewCount={r.reviewCount} className="justify-end" />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
              {results.length > 0 && selectedIds.size > 0 && (
                <div className="border-t bg-muted/30 p-3 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size} kayıt lead olarak aktarılacak
                  </span>
                  <Button
                    size="sm"
                    onClick={() => setImportOpen(true)}
                    disabled={!canImport}
                  >
                    <UserPlus className="w-4 h-4 mr-1.5" />
                    Seçilenleri Lead Olarak Aktar
                  </Button>
                </div>
              )}
            </Card>
          ) : null}

          {/* Recent searches */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5">
                <History className="w-4 h-4 text-muted-foreground" />
                Son Aramalar
              </CardTitle>
              <CardDescription className="text-xs">
                Tekrar çalıştırmak için bir aramaya tıklayın.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {recentLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : recentSearches.length === 0 ? (
                <div className="p-6 text-center">
                  <Clock className="w-7 h-7 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Henüz arama geçmişi yok.</p>
                </div>
              ) : (
                <ScrollArea className="max-h-72">
                  <div className="divide-y">
                    {recentSearches.slice(0, 10).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => rerunSearch(s)}
                        className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                          <Search className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{s.query}</span>
                            <Badge variant="outline" className="text-[10px] h-4 px-1">
                              {s.city || '—'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span>{s.resultCount} sonuç</span>
                            {s.importedCount > 0 && (
                              <>
                                <span>·</span>
                                <span className="text-emerald-600">{s.importedCount} aktarıldı</span>
                              </>
                            )}
                            <span>·</span>
                            <span>{formatRelative(s.createdAt)}</span>
                            {s.user && s.user.id !== user?.id && (
                              <>
                                <span>·</span>
                                <span>{s.user.name}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---------- RIGHT PANEL: MAP ---------- */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-4 space-y-3">
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    Harita Görünümü
                  </CardTitle>
                  {/* Veri kaynağı rozeti — Gerçek OSM / Çevrimdışı örnek */}
                  {provider === 'osm' && (
                    <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                      <ShieldCheck className="w-3 h-3" /> Gerçek OSM
                    </Badge>
                  )}
                  {provider === 'fallback' && (
                    <Badge className="text-[10px] h-5 bg-amber-100 text-amber-700 border-amber-200 gap-1">
                      <CloudOff className="w-3 h-3" /> Çevrimdışı örnek
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs">
                  {hasSearched
                    ? `${results.length} işletme haritada gösteriliyor`
                    : 'Arama sonuçları gerçek OSM haritasında görünecek'}
                </CardDescription>
                {/* Müşteri Katmanı aç/kapa */}
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 mt-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium leading-tight">Müşteri Katmanı</div>
                      <div className="text-[10px] text-muted-foreground leading-tight truncate">
                        {showCustomers
                          ? customerPoints.length > 0
                            ? `${customerPoints.length} CRM müşterisi haritada`
                            : customersQuery.isLoading
                              ? 'Yükleniyor…'
                              : 'Konumlu müşteri yok'
                          : 'CRM müşterilerini haritada göster'}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={showCustomers}
                    onCheckedChange={setShowCustomers}
                    aria-label="Müşteri katmanını aç/kapat"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <OsmMap
                  results={results}
                  selectedIds={selectedIds}
                  hoveredId={hoveredId}
                  onToggleSelect={toggleSelect}
                  focus={geocoded}
                  customers={customerPoints}
                  showCustomers={showCustomers}
                  city={city}
                  resultCount={results.length}
                  hasSearched={hasSearched}
                  searching={searchMutation.isPending}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ---------- LEADS FROM MAPS ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-violet-600" />
                Maps Leadleri
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                OpenStreetMap'ten içe aktarılan potansiyel müşteriler
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setLeadStatusFilter('')}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                    leadStatusFilter === ''
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  Tümü <span className="ml-1 tabular-nums opacity-60">{leadTotal}</span>
                </button>
                {LEAD_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setLeadStatusFilter(s.value)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full border transition-colors',
                      leadStatusFilter === s.value
                        ? cn(s.color, 'font-medium')
                        : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {s.label} <span className="ml-1 tabular-nums opacity-60">{leadStatusCounts[s.value] ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {leadsQuery.isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : leads.length === 0 ? (
            <div className="p-10 text-center">
              <UserPlus className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {leadStatusFilter
                  ? 'Bu durumda Maps leadi yok.'
                  : 'Henüz Maps leadi yok.'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Yukarıdan arama yapıp seçili işletmeleri lead olarak aktarın.
              </p>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto custom-scroll border-t">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="pl-4">İşletme</TableHead>
                    <TableHead className="hidden md:table-cell">Şehir</TableHead>
                    <TableHead className="hidden lg:table-cell">İletişim</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Puan</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="hidden md:table-cell">Sahip</TableHead>
                    <TableHead className="hidden lg:table-cell">Tarih</TableHead>
                    <TableHead className="text-right pr-4">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => {
                    const statusColor = getColor(LEAD_STATUSES, lead.status)
                    return (
                      <TableRow key={lead.id}>
                        <TableCell className="pl-4">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{lead.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {lead.category || '—'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {lead.city || '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {lead.phone ? (
                            <a
                              href={telLink(lead.phone)}
                              className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3" />
                              {formatPhone(lead.phone)}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-right">
                          <StarRating rating={lead.rating} reviewCount={lead.reviewCount} className="justify-end" />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px]', statusColor)}>
                            {getLabel(LEAD_STATUSES, lead.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {lead.owner?.name ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(lead.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => openDetail(lead)}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Görüntüle</TooltipContent>
                            </Tooltip>
                            {lead.status !== 'donustu' ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon" variant="ghost" className="h-7 w-7 hover:bg-emerald-50 hover:text-emerald-600"
                                    onClick={() => convertMutation.mutate(lead.id)}
                                    disabled={convertMutation.isPending}
                                  >
                                    <UserPlus className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Müşteriye Dönüştür</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 text-emerald-700 border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 mr-0.5" /> Dönüştü
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        selectedResults={selectedResults}
        searchId={searchId}
        onImported={() => {
          // drop CRM-existing from selection after import
          setSelectedIds(new Set())
        }}
      />
      <LeadDetailDialog lead={detailLead} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  )
}
