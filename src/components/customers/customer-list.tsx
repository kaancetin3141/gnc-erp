'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, qk } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import type { Customer, SessionUser, UserListItem } from '@/types'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { PhotoUpload } from '@/components/ui/photo-upload'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { toast } from 'sonner'
import {
  Users, Plus, Download, Upload, Search, Filter, Building2, MapPin,
  Phone, MessageCircle, Eye, ChevronDown, AlertTriangle,
  Crown, CheckCircle2, UserCheck, Layers, X, RefreshCw,
  ListFilter, User as UserIcon,
} from 'lucide-react'
import {
  SECTORS, CITIES, COUNTRIES, SEGMENTS, CUSTOMER_STATUS, CUSTOMER_SOURCES,
  TAG_COLOR_CLASSES, getLabel, getColor,
} from '@/lib/constants'
import {
  formatPhone, whatsappLink, telLink, formatRelative, daysSince,
  toCSV, downloadFile, initials, getActivityStatusColor,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  CUSTOMER_TYPES, CustomerTypeBadge, type CustomerTypeKey,
} from '@/components/admin/customer-type-badge'
import { BulkImportDialog } from '@/components/customers/bulk-import-dialog'

// ---- Tip: API cevabı ----
interface CustomerListResponse {
  items: Customer[]
  total: number
  limit: number
  offset: number
}
interface UsersResponse {
  items: UserListItem[]
  total: number
}

// ---- Form state ----
interface CustomerForm {
  name: string
  sector: string
  segment: string
  city: string
  phone: string
  email: string
  web: string
  taxNumber: string
  source: string
  status: string
  kvkkConsent: boolean
  tags: string
  logo: string | null
  customerType: CustomerTypeKey
}

const EMPTY_FORM: CustomerForm = {
  name: '', sector: 'Diğer', segment: 'standart', city: '',
  phone: '', email: '', web: '', taxNumber: '',
  source: 'manuel', status: 'aktif', kvkkConsent: false, tags: '',
  logo: null,
  customerType: 'musteri',
}

// ---- Aktivite renk noktası ----
function activityDot(lastActivityAt: string | null) {
  const d = daysSince(lastActivityAt)
  if (d === null) return { color: 'bg-gray-400', label: 'İletişim yok' }
  if (d <= 7) return { color: 'bg-emerald-500', label: `${d} gün önce` }
  if (d <= 30) return { color: 'bg-amber-500', label: `${d} gün önce` }
  return { color: 'bg-red-500', label: `${d} gün önce` }
}

// ---- Stats mini kart ----
function StatCard({
  label, value, icon: Icon, color, sub,
}: {
  label: string
  value: number | string
  icon: typeof Users
  color: string
  sub?: string
}) {
  return (
    <Card className="relative overflow-hidden hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground truncate">{label}</div>
            <div className="text-xl font-bold tracking-tight mt-0.5">{value}</div>
            {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
          </div>
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', color)}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---- Müşteri Ekleme/Düzenleme Dialog ----
function CustomerFormDialog({
  open, onOpenChange, editCustomer,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editCustomer?: Customer | null
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  // Dialog açıldığında formu doldur
  useEffect(() => {
    if (open) {
      if (editCustomer) {
        const tType = CUSTOMER_TYPES.find((t) => t.value === editCustomer.customerType)?.value ?? 'musteri'
        setForm({
          name: editCustomer.name || '',
          sector: editCustomer.sector || 'Diğer',
          segment: editCustomer.segment || 'standart',
          city: editCustomer.city || '',
          phone: editCustomer.phone || '',
          email: editCustomer.email || '',
          web: editCustomer.web || '',
          taxNumber: editCustomer.taxNumber || '',
          source: editCustomer.source || 'manuel',
          status: editCustomer.status || 'aktif',
          kvkkConsent: editCustomer.kvkkConsent || false,
          tags: Array.isArray(editCustomer.tags) ? editCustomer.tags.join(', ') : '',
          logo: editCustomer.logo ?? null,
          customerType: tType,
        })
      } else {
        setForm(EMPTY_FORM)
      }
    }
  }, [open, editCustomer])

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Müşteri adı gerekli')
      return
    }
    setSubmitting(true)
    try {
      const tags = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const payload = {
        name: form.name.trim(),
        sector: form.sector,
        segment: form.segment,
        city: form.city || null,
        phone: form.phone || null,
        email: form.email || null,
        web: form.web || null,
        taxNumber: form.taxNumber || null,
        source: form.source,
        status: form.status,
        kvkkConsent: form.kvkkConsent,
        tags,
        logo: form.logo,
        customerType: form.customerType,
      }
      if (editCustomer) {
        await apiPatch(`/api/customers/${editCustomer.id}`, payload)
        toast.success('Müşteri güncellendi')
        qc.invalidateQueries({ queryKey: qk.customer(editCustomer.id) })
      } else {
        await apiPost('/api/customers', payload)
        toast.success('Müşteri eklendi')
      }
      qc.invalidateQueries({ queryKey: ['customers'] })
      onOpenChange(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'İşlem başarısız'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle>{editCustomer ? 'Müşteri Düzenle' : 'Yeni Müşteri Ekle'}</DialogTitle>
          <DialogDescription>
            {editCustomer
              ? 'Müşteri bilgilerini güncelleyin'
              : 'Portföyünüze yeni bir müşteri ekleyin'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          {/* Logo */}
          <div className="sm:col-span-2 flex justify-center py-1">
            <PhotoUpload
              value={form.logo}
              onChange={(v) => setForm((f) => ({ ...f, logo: v }))}
              label="Firma Logosu"
              size="md"
              variant="logo"
              placeholderIcon="building"
            />
          </div>

          {/* Ad */}
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="name">Müşteri Adı *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Örn. Acıbadem Sağlık A.Ş."
            />
          </div>

          {/* Sektör */}
          <div className="space-y-1.5">
            <Label>Sektör</Label>
            <Select
              value={form.sector}
              onValueChange={(v) => setForm((f) => ({ ...f, sector: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sektör seçin" />
              </SelectTrigger>
              <SelectContent>
                {SECTORS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Segment */}
          <div className="space-y-1.5">
            <Label>Segment</Label>
            <Select
              value={form.segment}
              onValueChange={(v) => setForm((f) => ({ ...f, segment: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Segment" />
              </SelectTrigger>
              <SelectContent>
                {SEGMENTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Müşteri Türü */}
          <div className="space-y-1.5">
            <Label>Müşteri Türü</Label>
            <Select
              value={form.customerType}
              onValueChange={(v) => setForm((f) => ({ ...f, customerType: v as CustomerTypeKey }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tür seçin" />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_TYPES.map((t) => {
                  const Icon = t.icon
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5" />
                        {t.emoji} {t.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Şehir */}
          <div className="space-y-1.5">
            <Label>Şehir</Label>
            <Select
              value={form.city || '__none__'}
              onValueChange={(v) => setForm((f) => ({ ...f, city: v === '__none__' ? '' : v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Şehir seçin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Seçilmedi —</SelectItem>
                {CITIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Kaynak */}
          <div className="space-y-1.5">
            <Label>Kaynak</Label>
            <Select
              value={form.source}
              onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Kaynak" />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Telefon */}
          <div className="space-y-1.5">
            <Label>Telefon</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+90 532 123 45 67"
            />
          </div>

          {/* E-posta */}
          <div className="space-y-1.5">
            <Label>E-posta</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="info@firma.com"
            />
          </div>

          {/* Web */}
          <div className="space-y-1.5">
            <Label>Web Sitesi</Label>
            <Input
              value={form.web}
              onChange={(e) => setForm((f) => ({ ...f, web: e.target.value }))}
              placeholder="www.firma.com"
            />
          </div>

          {/* Vergi No */}
          <div className="space-y-1.5">
            <Label>Vergi / TC No</Label>
            <Input
              value={form.taxNumber}
              onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
              placeholder="1234567890"
            />
          </div>

          {/* Durum */}
          <div className="space-y-1.5">
            <Label>Durum</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Durum" />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_STATUS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Etiketler */}
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Etiketler</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="önemli, kobi, ana müşteri (virgülle ayırın)"
            />
            <p className="text-xs text-muted-foreground">
              Etiketleri virgülle ayırarak yazın
            </p>
          </div>

          {/* KVKK */}
          <div className="sm:col-span-2 flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
            <Checkbox
              id="kvkk"
              checked={form.kvkkConsent}
              onCheckedChange={(v) => setForm((f) => ({ ...f, kvkkConsent: !!v }))}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="kvkk" className="cursor-pointer font-medium">
                KVKK Aydınlatma Onayı
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Müşteri, kişisel verilerin işlenmesine açık rıza gösterdi
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            İptal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !form.name.trim()}>
            {submitting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            {editCustomer ? 'Güncelle' : 'Müşteri Ekle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Ana liste bileşeni ----
export function CustomerList() {
  const { user, openCustomer } = useAppStore()
  const qc = useQueryClient()

  // Filtre state
  const [search, setSearch] = useState('')
  const [sector, setSector] = useState('')
  const [city, setCity] = useState('')
  const [district, setDistrict] = useState('')
  const [country, setCountry] = useState('')
  const [segment, setSegment] = useState('')
  const [status, setStatus] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [customerType, setCustomerType] = useState<CustomerTypeKey | ''>('')
  const [staleOnly, setStaleOnly] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URL(window.location.href).searchParams.get('stale') === 'true'
  })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // Query parametreleri
  const params = useMemo(() => {
    const p: Record<string, string> = {}
    if (search) p.search = search
    if (sector) p.sector = sector
    if (city) p.city = city
    if (district) p.district = district
    if (country) p.country = country
    if (segment) p.segment = segment
    if (status) p.status = status
    if (ownerId) p.ownerId = ownerId
    if (customerType) p.customerType = customerType
    if (staleOnly) p.stale = 'true'
    p.limit = '100'
    return p
  }, [search, sector, city, district, country, segment, status, ownerId, customerType, staleOnly])

  // Müşteri listesi
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: qk.customers(params),
    queryFn: () => {
      const qs = new URLSearchParams(params).toString()
      return apiGet<CustomerListResponse>(`/api/customers?${qs}`)
    },
  })

  // Kullanıcı listesi (sorumlu select'i için)
  const { data: usersData } = useQuery({
    queryKey: qk.users,
    queryFn: () => apiGet<UsersResponse>('/api/users'),
  })

  const customers = data?.items ?? []
  const total = data?.total ?? 0

  // İstatistikler (mevcut listeye göre değil de global; yine de liste üzerinden hesaplayalım)
  const stats = useMemo(() => {
    const active = customers.filter((c) => c.status === 'aktif').length
    const stale = customers.filter((c) => {
      const d = daysSince(c.lastActivityAt)
      return d === null || d > 30
    }).length
    const vip = customers.filter((c) => c.segment === 'vip').length
    return { total, active, stale, vip }
  }, [customers, total])

  const canEdit = hasPermission(user as SessionUser | null, 'customers.edit')
  const canExport = hasPermission(user as SessionUser | null, 'export.data')

  // CSV dışa aktarma
  const handleExport = () => {
    if (!customers.length) {
      toast.error('Dışa aktarılacak müşteri yok')
      return
    }
    const rows = customers.map((c) => ({
      Ad: c.name,
      Sektör: c.sector,
      Şehir: c.city || '',
      Segment: getLabel(SEGMENTS, c.segment),
      Telefon: formatPhone(c.phone),
      'E-posta': c.email || '',
      Durum: getLabel(CUSTOMER_STATUS, c.status),
      Sorumlu: c.owner?.name || '',
      'Son İletişim': c.lastActivityAt ? formatRelative(c.lastActivityAt) : '',
    }))
    const csv = toCSV(rows)
    downloadFile(csv, `musteriler-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success(`${customers.length} müşteri dışa aktarıldı`)
  }

  const handleClearFilters = () => {
    setSearch(''); setSector(''); setCity(''); setDistrict(''); setCountry(''); setSegment(''); setStatus(''); setOwnerId(''); setCustomerType(''); setStaleOnly(false)
  }

  const activeFilterCount = [search, sector, city, district, country, segment, status, ownerId, customerType].filter(Boolean).length + (staleOnly ? 1 : 0)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            Müşteri Portföyü
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toplam <span className="font-semibold text-foreground">{total}</span> müşteri
            {staleOnly && (
              <span className="ml-2 text-amber-600 font-medium">· İletişimsiz filtresi aktif</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={staleOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStaleOnly((v) => !v)}
            className={staleOnly ? 'bg-amber-600 hover:bg-amber-700' : ''}
          >
            <AlertTriangle className="w-4 h-4 mr-1.5" />
            İletişimsizler
            {stats.stale > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                {stats.stale}
              </Badge>
            )}
          </Button>
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1.5" />
              Dışa Aktar
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-1.5" />
              Toplu İçe Aktar
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Müşteri Ekle
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Toplam Müşteri"
          value={stats.total}
          icon={Users}
          color="bg-gradient-to-br from-slate-500 to-slate-600"
          sub="Tüm portföy"
        />
        <StatCard
          label="Aktif"
          value={stats.active}
          icon={CheckCircle2}
          color="bg-gradient-to-br from-emerald-500 to-teal-600"
          sub="Durum: Aktif"
        />
        <StatCard
          label="İletişimsiz"
          value={stats.stale}
          icon={AlertTriangle}
          color="bg-gradient-to-br from-amber-500 to-orange-600"
          sub="30+ gün"
        />
        <StatCard
          label="VIP"
          value={stats.vip}
          icon={Crown}
          color="bg-gradient-to-br from-violet-500 to-fuchsia-600"
          sub="VIP segment"
        />
      </div>

      {/* Filtre barı */}
      <Card>
        <CardContent className="p-4">
          {/* Müşteri türü chip filtresi */}
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mr-1">
              Tür:
            </span>
            <button
              onClick={() => setCustomerType('')}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                customerType === ''
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted',
              )}
            >
              <UserIcon className="w-3 h-3" />
              Tümü
            </button>
            {CUSTOMER_TYPES.map((t) => {
              const Icon = t.icon
              const active = customerType === t.value
              return (
                <button
                  key={t.value}
                  onClick={() => setCustomerType(active ? '' : t.value)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    active
                      ? `${t.color} border-current`
                      : 'bg-background text-muted-foreground border-border hover:bg-muted',
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {t.emoji} {t.label}
                </button>
              )
            })}
          </div>

          {/* Search + toggle */}
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="İsim, telefon, e-posta veya vergi no ara..."
                className="pl-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Yenile"
            >
              <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
            </Button>
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  <ListFilter className="w-4 h-4 mr-1.5" />
                  Filtreler
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                      {activeFilterCount}
                    </Badge>
                  )}
                  <ChevronDown className={cn('w-3.5 h-3.5 ml-1 transition-transform', filtersOpen && 'rotate-180')} />
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                <X className="w-3.5 h-3.5 mr-1" />
                Temizle
              </Button>
            )}
          </div>

          {/* Detaylı filtreler */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleContent>
              <Separator className="my-3" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Sektör</Label>
                  <Select value={sector || '__none__'} onValueChange={(v) => setSector(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="w-full h-9"><SelectValue placeholder="Tümü" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Tümü</SelectItem>
                      {SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Şehir</Label>
                  <Select value={city || '__none__'} onValueChange={(v) => { setCity(v === '__none__' ? '' : v); setDistrict('') }}>
                    <SelectTrigger className="w-full h-9"><SelectValue placeholder="Tümü" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Tümü</SelectItem>
                      {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">İlçe</Label>
                  <Input
                    placeholder="İlçe adı ara..."
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ülke</Label>
                  <Select value={country || '__none__'} onValueChange={(v) => setCountry(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="w-full h-9"><SelectValue placeholder="Tümü" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Tümü</SelectItem>
                      {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Segment</Label>
                  <Select value={segment || '__none__'} onValueChange={(v) => setSegment(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="w-full h-9"><SelectValue placeholder="Tümü" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Tümü</SelectItem>
                      {SEGMENTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Durum</Label>
                  <Select value={status || '__none__'} onValueChange={(v) => setStatus(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="w-full h-9"><SelectValue placeholder="Tümü" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Tümü</SelectItem>
                      {CUSTOMER_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Sorumlu</Label>
                  <Select value={ownerId || '__none__'} onValueChange={(v) => setOwnerId(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="w-full h-9"><SelectValue placeholder="Tümü" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Tümü</SelectItem>
                      {(usersData?.items ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Müşteri tablosu */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <h3 className="font-semibold text-lg">Müşteri bulunamadı</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                {activeFilterCount > 0
                  ? 'Seçtiğiniz filtrelere uyan müşteri yok. Filtreleri temizlemeyi deneyin.'
                  : 'Henüz hiç müşteri eklenmemiş. İlk müşterinizi ekleyerek başlayın.'}
              </p>
              {activeFilterCount > 0 ? (
                <Button variant="outline" size="sm" className="mt-4" onClick={handleClearFilters}>
                  Filtreleri Temizle
                </Button>
              ) : canEdit ? (
                <Button size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  İlk Müşteriyi Ekle
                </Button>
              ) : null}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60 border-b-2 hover:bg-muted/60">
                  <TableHead className="pl-4 min-w-[200px] font-semibold text-xs uppercase tracking-wider text-muted-foreground">Müşteri</TableHead>
                  <TableHead className="hidden md:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Sektör</TableHead>
                  <TableHead className="hidden lg:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Şehir</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Segment</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Tür</TableHead>
                  <TableHead className="hidden lg:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Sorumlu</TableHead>
                  <TableHead className="hidden md:table-cell min-w-[140px] font-semibold text-xs uppercase tracking-wider text-muted-foreground">Son İletişim</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Durum</TableHead>
                  <TableHead className="text-right pr-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => {
                  const dot = activityDot(c.lastActivityAt)
                  const segColor = getColor(SEGMENTS, c.segment)
                  const stColor = getColor(CUSTOMER_STATUS, c.status)
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer group table-row-hover even:bg-muted/20"
                      onClick={() => openCustomer(c.id)}
                    >
                      <TableCell className="pl-4">
                        <div className="flex items-start gap-3">
                          {c.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.logo}
                              alt={c.name}
                              className="w-9 h-9 rounded-lg object-cover shrink-0 border border-border"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center shrink-0 group-hover:from-emerald-100 group-hover:to-emerald-200 dark:group-hover:from-emerald-900/40 dark:group-hover:to-emerald-800/40 transition-colors">
                              <Building2 className="w-4 h-4 text-slate-600 dark:text-slate-300 group-hover:text-emerald-600" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate max-w-[220px]">{c.name}</div>
                            {Array.isArray(c.tags) && c.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {c.tags.slice(0, 3).map((t, i) => (
                                  <span
                                    key={t + i}
                                    className={cn(
                                      'inline-flex items-center px-1.5 py-0 rounded text-[10px] border',
                                      TAG_COLOR_CLASSES[(i % 9 === 0 ? 'emerald' : i % 9 === 1 ? 'amber' : 'violet')] || TAG_COLOR_CLASSES.gray,
                                    )}
                                  >
                                    {t}
                                  </span>
                                ))}
                                {c.tags.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">+{c.tags.length - 3}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{c.sector}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {c.city ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{c.city}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px] px-1.5', segColor)}>
                          {getLabel(SEGMENTS, c.segment)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <CustomerTypeBadge type={c.customerType} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {c.owner ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarFallback className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                {initials(c.owner.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs truncate max-w-[100px]">{c.owner.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 text-xs">
                              <span className={cn('w-2 h-2 rounded-full shrink-0', dot.color)} />
                              <span className="text-muted-foreground">
                                {c.lastActivityAt ? formatRelative(c.lastActivityAt) : 'İletişim yok'}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>{dot.label}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px] px-1.5', stColor)}>
                          {getLabel(CUSTOMER_STATUS, c.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => openCustomer(c.id)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Görüntüle</TooltipContent>
                          </Tooltip>
                          {c.phone && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" asChild>
                                    <a href={telLink(c.phone)}>
                                      <Phone className="w-4 h-4" />
                                    </a>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{formatPhone(c.phone)}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30" asChild>
                                    <a href={whatsappLink(c.phone, `Merhaba ${c.name},`)} target="_blank" rel="noreferrer">
                                      <MessageCircle className="w-4 h-4" />
                                    </a>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>WhatsApp</TooltipContent>
                              </Tooltip>
                            </>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <ChevronDown className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openCustomer(c.id)}>
                                <Eye className="w-4 h-4 mr-2" /> Detay
                              </DropdownMenuItem>
                              {c.phone && (
                                <DropdownMenuItem asChild>
                                  <a href={telLink(c.phone)}>
                                    <Phone className="w-4 h-4 mr-2" /> Ara
                                  </a>
                                </DropdownMenuItem>
                              )}
                              {c.phone && (
                                <DropdownMenuItem asChild>
                                  <a href={whatsappLink(c.phone)} target="_blank" rel="noreferrer">
                                    <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                                  </a>
                                </DropdownMenuItem>
                              )}
                              {c.email && (
                                <DropdownMenuItem asChild>
                                  <a href={`mailto:${c.email}`}>
                                    <MessageCircle className="w-4 h-4 mr-2" /> E-posta
                                  </a>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  navigator.clip?.writeText(c.id)
                                  toast.success('ID kopyalandı')
                                }}
                              >
                                <Layers className="w-4 h-4 mr-2" /> ID Kopyala
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Footer info */}
      {!isLoading && customers.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <UserCheck className="w-3.5 h-3.5" />
            <span>{customers.length} / {total} müşteri gösteriliyor</span>
          </div>
          {isFetching && (
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Güncelleniyor...
            </span>
          )}
        </div>
      )}

      {/* Add dialog */}
      <CustomerFormDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Bulk import dialog */}
      <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
