'use client'

// ============================================================
// ADMIN PANEL — İşletmeler sekmesi
// superadmin: tüm işletmeler · admin: kendi işletmesi
// İşletme seç → bilgi + kullanıcı/roller + randevu işletmeleri + ayarlar + denetim
// ============================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ROLE_LABELS, isSuperAdmin } from '@/lib/rbac'
import { SECTOR_META } from '@/lib/tenant-sector'
import { useAppStore } from '@/store/app-store'
import type { Role } from '@/types'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Building2, Search, RefreshCw, Users, Store, CalendarClock,
  Receipt, ListTree, ShoppingCart, Save, ShieldCheck, Globe, Clock, Loader2, Plus,
  ImagePlus,
} from 'lucide-react'
import { StorefrontDialog, type StorefrontProviderRef } from '@/components/admin/storefront-dialog'

interface TenantListItem {
  id: string
  name: string
  plan: string
  defaultCurrency: string
  country: string
  createdAt: string
  sector: keyof typeof SECTOR_META
  counts: {
    users: number; customers: number; providers: number; orders: number
    invoices: number; tasks: number; products: number; appointments: number
  }
}

interface TenantDetail {
  tenant: {
    id: string; name: string; plan: string; defaultCurrency: string
    country: string; createdAt: string; sector: keyof typeof SECTOR_META
  }
  roleGroups: Record<string, number>
  users: Array<{
    id: string; name: string; email: string; role: Role; status: string
    title?: string | null; phone?: string | null; createdAt: string
    _count: { ownedCustomers: number; assignedTasks: number }
  }>
  providers: Array<{
    id: string; name: string; slug?: string | null; type: string
    city?: string | null; district?: string | null; isActive: boolean
    lat?: number | null; lng?: number | null
    _count: { services: number; staff: number; appointments: number }
  }>
  settings: Array<{ key: string; value: unknown; updatedAt: string }>
  counts: Record<string, number>
  recentAudit: Array<{
    id: string; action: string; entity: string; createdAt: string
    actor?: { id: string; name: string } | null
  }>
}

const VALID_ROLES: Role[] = ['superadmin', 'admin', 'manager', 'rep', 'readonly', 'stock']

function StatMini({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>
  label: string; value: number | undefined; color: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card p-2.5">
      <div className={cn('flex h-8 w-8 items-center justify-center rounded-md', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold tabular-nums leading-none">{value ?? '—'}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{label}</div>
      </div>
    </div>
  )
}

export function TenantsTab() {
  const qc = useQueryClient()
  const { user: sessionUser } = useAppStore()
  const superAdmin = isSuperAdmin(sessionUser?.role ?? '')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const listQ = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => apiGet<{ items: TenantListItem[]; total: number; scope: string }>('/api/admin/tenants'),
  })

  const items = listQ.data?.items ?? []
  const filtered = items.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  )
  const activeId = selectedId && items.some((t) => t.id === selectedId)
    ? selectedId
    : (items[0]?.id ?? null)

  const detailQ = useQuery({
    queryKey: ['admin-tenant-detail', activeId],
    queryFn: () => apiGet<TenantDetail>(`/api/admin/tenants/${activeId}`),
    enabled: !!activeId,
  })

  // İşletme bilgi formu
  const [form, setForm] = useState<{ name: string; plan: string; defaultCurrency: string; country: string } | null>(null)
  const detail = detailQ.data
  const formKey = `${detail?.tenant.id}:${detail?.tenant.name}:${detail?.tenant.plan}:${detail?.tenant.defaultCurrency}:${detail?.tenant.country}`
  const [formKeyState, setFormKeyState] = useState('')
  if (detail && formKeyState !== formKey) {
    setFormKeyState(formKey)
    setForm({
      name: detail.tenant.name,
      plan: detail.tenant.plan,
      defaultCurrency: detail.tenant.defaultCurrency,
      country: detail.tenant.country,
    })
  }

  const saveTenant = useMutation({
    mutationFn: (patch: Record<string, string>) =>
      apiPatch<{ tenant: { name: string } }>(`/api/admin/tenants/${activeId}`, patch),
    onSuccess: (res) => {
      toast.success(`İşletme güncellendi: ${res.tenant.name}`)
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      qc.invalidateQueries({ queryKey: ['admin-tenant-detail', activeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const assignRole = useMutation({
    mutationFn: (p: { userId: string; role: Role }) =>
      apiPost('/api/admin/assign-role', p),
    onSuccess: () => {
      toast.success('Rol güncellendi')
      qc.invalidateQueries({ queryKey: ['admin-tenant-detail', activeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // --- Yeni İşletme sihirbazı (yalnız superadmin) ---
  const EMPTY_CREATE = {
    name: '', plan: 'business', defaultCurrency: 'TRY', country: 'TR',
    adminName: '', adminEmail: '', adminPassword: '',
  }
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE)
  const [createError, setCreateError] = useState('')

  // --- Vitrin yönetimi diyaloğu (kapak/portföy/ekip fotoğrafları) ---
  const [storefrontProvider, setStorefrontProvider] = useState<StorefrontProviderRef | null>(null)

  const createTenant = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPost<{ tenant: { id: string; name: string; sector: string }; admin: { email: string } | null }>(
        '/api/admin/tenants',
        payload,
      ),
    onSuccess: (res) => {
      toast.success(
        res.admin
          ? `İşletme oluşturuldu: ${res.tenant.name} · İlk admin: ${res.admin.email}`
          : `İşletme oluşturuldu: ${res.tenant.name}`,
      )
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setCreateOpen(false)
      setCreateForm(EMPTY_CREATE)
      setCreateError('')
    },
    onError: (e: Error) => setCreateError(e.message),
  })

  const submitCreate = () => {
    setCreateError('')
    const name = createForm.name.trim()
    if (!name) {
      setCreateError('İşletme adı gerekli')
      return
    }
    if (createForm.country && !/^[A-Z]{2}$/.test(createForm.country.trim().toUpperCase())) {
      setCreateError('Ülke kodu 2 harf olmalı (örn. TR)')
      return
    }
    const adminName = createForm.adminName.trim()
    const adminEmail = createForm.adminEmail.trim()
    const adminPassword = createForm.adminPassword
    const hasAdmin = Boolean(adminName || adminEmail || adminPassword)
    if (hasAdmin) {
      if (!adminName || !adminEmail || !adminPassword) {
        setCreateError('İlk admin için ad, e-posta ve şifre alanlarının tamamı gerekli (ya da üçünü de boş bırakın)')
        return
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
        setCreateError('Geçerli bir e-posta adresi girin')
        return
      }
      if (adminPassword.length < 8) {
        setCreateError('İlk admin şifresi en az 8 karakter olmalı')
        return
      }
    }
    createTenant.mutate({
      name,
      plan: createForm.plan,
      defaultCurrency: createForm.defaultCurrency,
      country: createForm.country.trim().toUpperCase(),
      ...(hasAdmin
        ? { adminUser: { name: adminName, email: adminEmail, password: adminPassword } }
        : {}),
    })
  }

  const sectorMeta = detail ? SECTOR_META[detail.tenant.sector] : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-600" />
            İşletmeler
            <Badge variant="outline" className="text-[11px]">
              {superAdmin ? 'Tüm platform' : 'Sadece kendi işletmeniz'}
            </Badge>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            İşletmeyi seçin; bilgilerini, rollerini ve modüllerini buradan yönetin
          </p>
        </div>
        <div className="flex items-center gap-2">
          {superAdmin && (
            <Button size="sm" onClick={() => { setCreateForm(EMPTY_CREATE); setCreateError(''); setCreateOpen(true) }}>
              <Plus className="h-4 w-4 mr-1.5" />
              Yeni İşletme
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => listQ.refetch()} disabled={listQ.isFetching}>
            <RefreshCw className={cn('h-4 w-4 mr-1.5', listQ.isFetching && 'animate-spin')} />
            Yenile
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Sol: işletme listesi */}
        <Card className="lg:col-span-4 xl:col-span-3 h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Store className="h-4 w-4 text-emerald-600" />
              İşletme Listesi
              <Badge variant="secondary" className="ml-auto text-[11px] tabular-nums">{items.length}</Badge>
            </CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="İşletme ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0 max-h-[520px] overflow-y-auto custom-scroll space-y-1.5">
            {listQ.isLoading ? (
              [...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">İşletme bulunamadı</p>
            ) : (
              filtered.map((t) => {
                const sm = SECTOR_META[t.sector]
                const selected = t.id === activeId
                return (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedId(t.id); setFormKeyState('') }}
                    className={cn(
                      'w-full text-left rounded-lg border p-2.5 transition-colors',
                      selected
                        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'
                        : 'hover:bg-muted/60',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">{sm?.emoji ?? '🏢'}</span>
                      <span className="text-sm font-medium truncate flex-1">{t.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">{t.plan}</Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className={cn('font-medium', sm?.accent)}>{sm?.shortLabel ?? t.sector}</span>
                      <span>·</span>
                      <span className="tabular-nums">{t.counts.users} kullanıcı</span>
                      <span>·</span>
                      <span className="tabular-nums">{t.counts.customers} müşteri</span>
                    </div>
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Sağ: detay */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          {!activeId ? (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                Detay için soldan bir işletme seçin
              </CardContent>
            </Card>
          ) : detailQ.isLoading || !detail || !form ? (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <>
              {/* Bilgi + düzenleme */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center flex-wrap gap-2">
                    <span className="text-xl">{sectorMeta?.emoji}</span>
                    {detail.tenant.name}
                    <Badge variant="outline" className={cn('text-[11px]', sectorMeta?.badge)}>
                      {sectorMeta?.label}
                    </Badge>
                    <Badge variant="secondary" className="text-[11px]">{detail.tenant.plan}</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Oluşturma: {new Date(detail.tenant.createdAt).toLocaleDateString('tr-TR')} ·
                    ID: <span className="font-mono text-[10px]">{detail.tenant.id}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">İşletme Adı</label>
                      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Plan {superAdmin ? '' : '(sadece program admini)'}</label>
                      <Select
                        value={form.plan}
                        onValueChange={(v) => setForm({ ...form, plan: v })}
                        disabled={!superAdmin}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">free</SelectItem>
                          <SelectItem value="business">business</SelectItem>
                          <SelectItem value="enterprise">enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Para Birimi</label>
                      <Select
                        value={form.defaultCurrency}
                        onValueChange={(v) => setForm({ ...form, defaultCurrency: v })}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TRY">TRY ₺</SelectItem>
                          <SelectItem value="USD">USD $</SelectItem>
                          <SelectItem value="EUR">EUR €</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Ülke</label>
                      <Input
                        value={form.country}
                        maxLength={2}
                        onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => saveTenant.mutate({
                        name: form.name,
                        plan: form.plan,
                        defaultCurrency: form.defaultCurrency,
                        country: form.country,
                      })}
                      disabled={saveTenant.isPending}
                    >
                      {saveTenant.isPending
                        ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        : <Save className="h-4 w-4 mr-1.5" />}
                      Kaydet
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Modül sayaçları */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                <StatMini icon={Users} label="Kullanıcı" value={detail.counts.users} color="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" />
                <StatMini icon={Store} label="Randevu İşletmesi" value={detail.counts.serviceProviders ?? detail.providers.length} color="bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300" />
                <StatMini icon={CalendarClock} label="Randevu" value={detail.providers.reduce((s, p) => s + p._count.appointments, 0)} color="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" />
                <StatMini icon={Users} label="Müşteri" value={detail.counts.customers} color="bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" />
                <StatMini icon={ShoppingCart} label="Sipariş" value={detail.counts.orders} color="bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" />
                <StatMini icon={Receipt} label="Fatura" value={detail.counts.invoices} color="bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300" />
                <StatMini icon={ListTree} label="Görev" value={detail.counts.tasks} color="bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" />
              </div>

              {/* Kullanıcılar & Roller */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Kullanıcılar &amp; Roller
                    <div className="ml-auto flex flex-wrap gap-1">
                      {Object.entries(detail.roleGroups).map(([role, n]) => (
                        <Badge key={role} variant="secondary" className="text-[10px]">
                          {ROLE_LABELS[role as Role] ?? role}: {n}
                        </Badge>
                      ))}
                    </div>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Rolü değiştirmek için satırdaki rol menüsünü kullanın (kendi rolünüzü değiştiremezsiniz)
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="rounded-lg border overflow-hidden">
                    <div className="max-h-72 overflow-y-auto custom-scroll">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead className="pl-3 text-xs">Kullanıcı</TableHead>
                            <TableHead className="text-xs">E-posta</TableHead>
                            <TableHead className="text-xs">Rol</TableHead>
                            <TableHead className="hidden md:table-cell text-xs">Durum</TableHead>
                            <TableHead className="hidden lg:table-cell text-xs">Müşteri/Görev</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.users.map((u) => (
                            <TableRow key={u.id}>
                              <TableCell className="pl-3">
                                <div className="text-sm font-medium">{u.name}</div>
                                {u.title && <div className="text-[11px] text-muted-foreground">{u.title}</div>}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                              <TableCell>
                                <Select
                                  value={u.role}
                                  onValueChange={(v) => assignRole.mutate({ userId: u.id, role: v as Role })}
                                  disabled={assignRole.isPending}
                                >
                                  <SelectTrigger className="h-8 w-[140px] text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {VALID_ROLES.map((r) => (
                                      <SelectItem key={r} value={r} className="text-xs">
                                        {ROLE_LABELS[r] ?? r}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    'text-[10px]',
                                    u.status === 'active' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
                                    u.status === 'passive' && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                                    u.status === 'invited' && 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
                                  )}
                                >
                                  {u.status === 'active' ? 'aktif' : u.status === 'passive' ? 'pasif' : 'davetli'}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-xs text-muted-foreground tabular-nums">
                                {u._count.ownedCustomers} / {u._count.assignedTasks}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Randevu işletmeleri */}
              {detail.providers.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Store className="h-4 w-4 text-pink-600" />
                      Randevu Şubeleri
                      <Badge variant="secondary" className="text-[10px]">{detail.providers.length}</Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Alt alan adı düzenlemeleri “Alan Adları” sekmesinde
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {detail.providers.map((p) => (
                        <div key={p.id} className="rounded-lg border p-3 flex items-center gap-3">
                          <div className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-md text-base',
                            p.isActive ? 'bg-pink-50 dark:bg-pink-950/40' : 'bg-slate-100 dark:bg-slate-800 opacity-60',
                          )}>
                            {p.type === 'berber' ? '💈' : p.type === 'kuafor' ? '✂️' : p.type === 'disci' ? '🦷' : p.type === 'guzellik' ? '💄' : p.type === 'spa' ? '🧖' : '🎨'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{p.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {p.city ?? '—'}{p.district ? ` / ${p.district}` : ''} · {p._count.services} hizmet · {p._count.appointments} randevu
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 shrink-0 p-0 text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                            aria-label={`${p.name} vitrin yönetimi`}
                            title="Vitrin yönetimi (kapak, portföy, ekip fotoğrafları)"
                            onClick={() => setStorefrontProvider({
                              id: p.id, name: p.name, slug: p.slug ?? null, type: p.type,
                            })}
                          >
                            <ImagePlus className="h-4 w-4" />
                          </Button>
                          <Badge variant={p.isActive ? 'secondary' : 'outline'} className="text-[10px] shrink-0">
                            {p.isActive ? 'aktif' : 'kapalı'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Ayarlar + son denetim */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Globe className="h-4 w-4 text-sky-600" />
                      İşletme Ayarları
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 max-h-52 overflow-y-auto custom-scroll">
                    {detail.settings.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">Kayıtlı ayar yok</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {detail.settings.map((s) => (
                          <li key={s.key} className="flex items-center justify-between gap-2 text-xs rounded-md border px-2.5 py-1.5">
                            <span className="font-mono text-[11px] text-muted-foreground truncate">{s.key}</span>
                            <span className="font-medium truncate max-w-[55%] text-right">
                              {typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-amber-600" />
                      Son Denetim Kayıtları
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 max-h-52 overflow-y-auto custom-scroll">
                    {detail.recentAudit.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">Kayıt yok</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {detail.recentAudit.map((a) => (
                          <li key={a.id} className="text-xs rounded-md border px-2.5 py-1.5 flex items-center gap-2">
                            <span className="font-medium truncate">{a.actor?.name ?? 'Sistem'}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">{a.action}</Badge>
                            <span className="text-muted-foreground ml-auto text-[10px] shrink-0">
                              {new Date(a.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- Yeni İşletme sihirbazı (yalnız superadmin) --- */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreateError('') }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto custom-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" />
              Yeni İşletme Aç
            </DialogTitle>
            <DialogDescription>
              Platforma yeni bir işletme (tenant) ekleyin. İlk şirket adminini şimdi
              oluşturabilir veya boş bırakıp sonra davet edebilirsiniz.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                İşletme Adı <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Örn. Yıldız Kırtasiye Ltd."
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Plan</label>
                <Select
                  value={createForm.plan}
                  onValueChange={(v) => setCreateForm({ ...createForm, plan: v })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">free</SelectItem>
                    <SelectItem value="business">business</SelectItem>
                    <SelectItem value="enterprise">enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Para Birimi</label>
                <Select
                  value={createForm.defaultCurrency}
                  onValueChange={(v) => setCreateForm({ ...createForm, defaultCurrency: v })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRY">TRY ₺</SelectItem>
                    <SelectItem value="USD">USD $</SelectItem>
                    <SelectItem value="EUR">EUR €</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ülke</label>
                <Input
                  value={createForm.country}
                  maxLength={2}
                  placeholder="TR"
                  onChange={(e) => setCreateForm({ ...createForm, country: e.target.value.toUpperCase() })}
                  className="h-9"
                />
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  İlk Admin Kullanıcısı <span className="font-normal text-muted-foreground">(opsiyonel)</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Girilirse rolü “Şirket Admini”, durumu “aktif” olur ve yetkileri işletme adından
                  otomatik belirlenir. Şifre en az 8 karakter.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Ad Soyad</label>
                  <Input
                    placeholder="Örn. Ayşe Yılmaz"
                    value={createForm.adminName}
                    onChange={(e) => setCreateForm({ ...createForm, adminName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">E-posta</label>
                  <Input
                    type="email"
                    placeholder="admin@sirket.com"
                    value={createForm.adminEmail}
                    onChange={(e) => setCreateForm({ ...createForm, adminEmail: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Şifre</label>
                <Input
                  type="password"
                  placeholder="En az 8 karakter"
                  value={createForm.adminPassword}
                  onChange={(e) => setCreateForm({ ...createForm, adminPassword: e.target.value })}
                />
              </div>
            </div>

            {createError && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-2.5 py-2">
                {createError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createTenant.isPending}>
              İptal
            </Button>
            <Button onClick={submitCreate} disabled={createTenant.isPending}>
              {createTenant.isPending
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <Plus className="h-4 w-4 mr-1.5" />}
              İşletmeyi Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Vitrin yönetimi (kapak + portföy + ekip fotoğrafları) --- */}
      <StorefrontDialog
        provider={storefrontProvider}
        onClose={() => setStorefrontProvider(null)}
        onSaved={() => { void detailQ.refetch() }}
      />
    </div>
  )
}
