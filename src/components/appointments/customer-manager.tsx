'use client'

// ============================================================
// MÜŞTERİ KAYIT DEFTERİ
// · Müşteriler sekmesi — arama, istatistik kartları, müşteri kartları
// · CustomerDetailDialog — profil + geçmiş randevu özeti + düzenle
// · CustomerCreateDialog — yeni müşteri kaydı
// ============================================================

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate, formatDateTime, formatPhone, whatsappLink } from '@/lib/format'
import { getStatusMeta } from '@/lib/appointment-utils'
import { avatarColor } from './customer-autocomplete'
import {
  Users, UserPlus, Search, Phone, MessageCircle, Wallet, CalendarCheck,
  CheckCircle2, XCircle, CalendarClock, History, Pencil, Ban, Star, Cake,
  MapPin, Mail, StickyNote, CalendarPlus, TrendingUp, Loader2,
} from 'lucide-react'

// ---------- Tipler ----------

export interface RegistryStats {
  total: number; completed: number; cancelled: number; spent: number
  lastVisit: string | null; nextVisit: string | null
}

export interface RegistryCustomer {
  id: string; name: string; phone: string; email: string | null; address: string | null
  notes: string | null; tags: string | null; birthday: string | null; isBlocked: boolean
  createdAt: string; updatedAt: string
  stats?: RegistryStats
}

interface HistoryAppt {
  id: string; date: string; status: string; price: number; notes: string | null
  staff: { id: string; name: string } | null
  service: { id: string; name: string; duration: number; price: number } | null
}

function parseTags(t: string | null): string[] {
  if (!t) return []
  try { const a = JSON.parse(t); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [] } catch { return [] }
}

function loyaltyMeta(c: RegistryCustomer) {
  const s = c.stats
  if (!s || s.total === 0) return null
  if (s.total >= 10) return { label: 'VIP Müşteri', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900', icon: Star }
  if (s.total >= 5) return { label: 'Sabit Müşteri', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-900', icon: TrendingUp }
  return null
}

// ============================================================
// Müşteriler sekmesi
// ============================================================

export function CustomerManager({
  providerId,
  onNewAppointment,
}: {
  providerId: string
  onNewAppointment?: (c: RegistryCustomer) => void
}) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'recent' | 'visits' | 'spent' | 'name'>('recent')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['appointment-customers', providerId, q],
    queryFn: () => apiGet<{ items: RegistryCustomer[]; summary: { total: number; withVisits: number; newThisMonth: number; blocked: number } }>(
      `/api/appointments/providers/${providerId}/customers?q=${encodeURIComponent(q)}`,
    ),
    enabled: !!providerId,
    staleTime: 10_000,
  })

  const items = useMemo(() => {
    const arr = [...(data?.items ?? [])]
    switch (sortBy) {
      case 'visits': arr.sort((a, b) => (b.stats?.total ?? 0) - (a.stats?.total ?? 0)); break
      case 'spent': arr.sort((a, b) => (b.stats?.spent ?? 0) - (a.stats?.spent ?? 0)); break
      case 'name': arr.sort((a, b) => a.name.localeCompare(b.name, 'tr')); break
      default: arr.sort((a, b) => (b.stats?.lastVisit ?? b.updatedAt).localeCompare(a.stats?.lastVisit ?? a.updatedAt))
    }
    return arr
  }, [data, sortBy])

  const summary = data?.summary
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['appointment-customers'] })
    qc.invalidateQueries({ queryKey: ['customer-lookup'] })
  }

  return (
    <div className="space-y-3">
      {/* Özet kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="shadow-soft"><CardContent className="p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Users className="w-3.5 h-3.5" /> Toplam Müşteri</div>
          <div className="text-xl font-bold mt-0.5 tabular-nums">{summary?.total ?? '—'}</div>
          <div className="text-[10px] text-muted-foreground">kayıt defterinde</div>
        </CardContent></Card>
        <Card className="shadow-soft"><CardContent className="p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><CalendarCheck className="w-3.5 h-3.5 text-emerald-500" /> Randevu Yapan</div>
          <div className="text-xl font-bold mt-0.5 tabular-nums text-emerald-600">{summary?.withVisits ?? '—'}</div>
          <div className="text-[10px] text-muted-foreground">en az 1 randevu</div>
        </CardContent></Card>
        <Card className="shadow-soft"><CardContent className="p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><UserPlus className="w-3.5 h-3.5 text-teal-500" /> Bu Ay Yeni</div>
          <div className="text-xl font-bold mt-0.5 tabular-nums text-teal-600">{summary?.newThisMonth ?? '—'}</div>
          <div className="text-[10px] text-muted-foreground">bu ay katıldı</div>
        </CardContent></Card>
        <Card className="shadow-soft"><CardContent className="p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Ban className="w-3.5 h-3.5 text-rose-500" /> Engelli</div>
          <div className="text-xl font-bold mt-0.5 tabular-nums text-rose-600">{summary?.blocked ?? '—'}</div>
          <div className="text-[10px] text-muted-foreground">randevu alamaz</div>
        </CardContent></Card>
      </div>

      {/* Arama + sıralama + yeni */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="İsim, telefon veya e-posta ile ara..." className="h-9 pl-8" />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          aria-label="Sıralama"
        >
          <option value="recent">Son ziyaret</option>
          <option value="visits">Çok randevulu</option>
          <option value="spent">En çok harcayan</option>
          <option value="name">İsim (A-Z)</option>
        </select>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-9" onClick={() => setCreateOpen(true)}>
          <UserPlus className="w-4 h-4 mr-1.5" /> Yeni Müşteri
        </Button>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Users className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {q ? 'Aramaya uyan müşteri yok' : 'Henüz müşteri kaydı yok — randevular otomatik kayıt oluşturur'}
          </p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[62vh] overflow-y-auto pr-1 custom-scroll">
          {items.map((c) => {
            const loyal = loyaltyMeta(c)
            const s = c.stats
            return (
              <Card key={c.id} className={cn('shadow-soft cursor-pointer transition-shadow hover:shadow-md', c.isBlocked && 'opacity-70 border-rose-200 dark:border-rose-900/60')}
                onClick={() => setDetailId(c.id)}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center font-semibold shrink-0', avatarColor(c.name))}>
                      {c.name.charAt(0).toLocaleUpperCase('tr-TR')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm truncate">{c.name}</span>
                        {c.isBlocked && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900">
                            <Ban className="w-2.5 h-2.5 mr-0.5" /> Engelli
                          </Badge>
                        )}
                        {loyal && <Badge variant="outline" className={cn('text-[9px] px-1 py-0 gap-0.5', loyal.cls)}><loyal.icon className="w-2.5 h-2.5" /> {loyal.label}</Badge>}
                      </div>
                      <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{formatPhone(c.phone)}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onNewAppointment?.(c) }}
                      className="shrink-0 h-7 px-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium inline-flex items-center gap-1"
                      title="Bu müşteriye randevu ver"
                    >
                      <CalendarPlus className="w-3 h-3" /> Randevu
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-md bg-muted/50 py-1">
                      <div className="text-sm font-bold tabular-nums">{s?.total ?? 0}</div>
                      <div className="text-[9px] text-muted-foreground">randevu</div>
                    </div>
                    <div className="rounded-md bg-muted/50 py-1">
                      <div className="text-sm font-bold tabular-nums text-teal-600">{s?.completed ?? 0}</div>
                      <div className="text-[9px] text-muted-foreground">tamamlanan</div>
                    </div>
                    <div className="rounded-md bg-muted/50 py-1">
                      <div className="text-sm font-bold tabular-nums text-emerald-600">{formatCurrency(s?.spent ?? 0)}</div>
                      <div className="text-[9px] text-muted-foreground">harcama</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{s?.lastVisit ? <>Son: <strong>{formatDate(s.lastVisit)}</strong></> : 'Henüz randevu yok'}</span>
                    {s?.nextVisit && (
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        Sıradaki: {formatDate(s.nextVisit)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Detay diyaloğu */}
      {detailId && <CustomerDetailDialog providerId={providerId} customerId={detailId} onOpenChange={(o) => !o && setDetailId(null)} onUpdated={invalidate} />}

      {/* Yeni müşteri diyaloğu */}
      <CustomerCreateDialog
        providerId={providerId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { invalidate(); toast.success('Müşteri kaydı oluşturuldu') }}
      />
    </div>
  )
}

// ============================================================
// Müşteri Detay — profil + geçmiş randevu özeti
// ============================================================

export function CustomerDetailDialog({
  providerId,
  customerId,
  onOpenChange,
  onUpdated,
}: {
  providerId: string
  customerId: string
  onOpenChange: (open: boolean) => void
  onUpdated?: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['appointment-customer', providerId, customerId],
    queryFn: () => apiGet<{ customer: RegistryCustomer; history: HistoryAppt[] }>(
      `/api/appointments/providers/${providerId}/customers/${customerId}`,
    ),
    staleTime: 0,
  })

  const customer = data?.customer
  const history = useMemo(() => data?.history ?? [], [data])
  const stats = useMemo<RegistryStats>(() => {
    const now = new Date()
    const s: RegistryStats = { total: history.length, completed: 0, cancelled: 0, spent: 0, lastVisit: null, nextVisit: null }
    for (const a of history) {
      if (a.status === 'tamamlandi') { s.completed++; s.spent += a.price || 0 }
      if (a.status === 'iptal' || a.status === 'gelmedi') s.cancelled++
      const d = new Date(a.date)
      if (d < now) { if (!s.lastVisit || d > new Date(s.lastVisit)) s.lastVisit = d.toISOString() }
      else if (['beklemede', 'onaylandi'].includes(a.status)) { if (!s.nextVisit || d < new Date(s.nextVisit)) s.nextVisit = d.toISOString() }
    }
    return s
  }, [history])

  // Son 6 ayın randevu adedi — mini çubuk grafik
  const monthlyCounts = useMemo(() => {
    const months: { label: string; count: number; year: number; month: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        label: d.toLocaleDateString('tr-TR', { month: 'short' }),
        count: 0,
        year: d.getFullYear(),
        month: d.getMonth(),
      })
    }
    for (const a of history) {
      const d = new Date(a.date)
      const m = months.find((x) => x.year === d.getFullYear() && x.month === d.getMonth())
      if (m) m.count++
    }
    return months
  }, [history])

  const tags = customer ? parseTags(customer.tags) : []

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto custom-scroll">
        {isLoading || !customer ? (
          <div className="space-y-3 py-4">
            <DialogHeader>
              <DialogTitle className="sr-only">Müşteri kartı</DialogTitle>
              <DialogDescription className="sr-only">Yükleniyor</DialogDescription>
            </DialogHeader>
            <Skeleton className="h-14" />
            <div className="grid grid-cols-3 gap-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
            <Skeleton className="h-40" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <div className={cn('w-9 h-9 rounded-full flex items-center justify-center font-semibold', avatarColor(customer.name))}>
                  {customer.name.charAt(0).toLocaleUpperCase('tr-TR')}
                </div>
                <span className="truncate">{customer.name}</span>
                {customer.isBlocked && (
                  <Badge variant="outline" className="text-[10px] text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900">
                    <Ban className="w-3 h-3 mr-0.5" /> Engelli
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="sr-only">Müşteri profili ve randevu geçmişi</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 -mt-1">
              {/* İletişim satırı */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <a href={`tel:${customer.phone}`}>
                  <Button variant="outline" size="sm" className="h-8 text-xs"><Phone className="w-3.5 h-3.5 mr-1" /> {formatPhone(customer.phone)}</Button>
                </a>
                <a href={whatsappLink(customer.phone, `Merhaba ${customer.name},`)} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="h-8 text-xs text-[#25D366] border-[#25D366]/40">
                    <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp
                  </Button>
                </a>
                <Button variant="outline" size="sm" className="h-8 text-xs ml-auto" onClick={() => setEditOpen(true)}>
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Düzenle
                </Button>
              </div>

              {/* Profil bilgileri */}
              {(customer.email || customer.address || customer.birthday || tags.length > 0 || customer.notes) && (
                <div className="rounded-lg border p-2.5 space-y-1.5 text-xs">
                  {tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    </div>
                  )}
                  {customer.email && <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="w-3 h-3 shrink-0" /> {customer.email}</div>}
                  {customer.address && <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="w-3 h-3 shrink-0" /> {customer.address}</div>}
                  {customer.birthday && <div className="flex items-center gap-1.5 text-muted-foreground"><Cake className="w-3 h-3 shrink-0" /> Doğum günü: {customer.birthday}</div>}
                  {customer.notes && (
                    <div className="flex items-start gap-1.5 text-muted-foreground">
                      <StickyNote className="w-3 h-3 shrink-0 mt-0.5" />
                      <span className="whitespace-pre-wrap">{customer.notes}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Geçmiş randevu özeti — 6 kart */}
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-lg border p-2 text-center">
                  <CalendarCheck className="w-3.5 h-3.5 mx-auto text-muted-foreground" />
                  <div className="text-lg font-bold tabular-nums">{stats.total}</div>
                  <div className="text-[9px] text-muted-foreground">Toplam</div>
                </div>
                <div className="rounded-lg border p-2 text-center">
                  <CheckCircle2 className="w-3.5 h-3.5 mx-auto text-teal-600" />
                  <div className="text-lg font-bold tabular-nums text-teal-600">{stats.completed}</div>
                  <div className="text-[9px] text-muted-foreground">Tamamlanan</div>
                </div>
                <div className="rounded-lg border p-2 text-center">
                  <XCircle className="w-3.5 h-3.5 mx-auto text-rose-600" />
                  <div className="text-lg font-bold tabular-nums text-rose-600">{stats.cancelled}</div>
                  <div className="text-[9px] text-muted-foreground">İptal/Gelmedi</div>
                </div>
                <div className="rounded-lg border p-2 text-center">
                  <Wallet className="w-3.5 h-3.5 mx-auto text-emerald-600" />
                  <div className="text-sm font-bold tabular-nums text-emerald-600 mt-1">{formatCurrency(stats.spent)}</div>
                  <div className="text-[9px] text-muted-foreground">Toplam Harcama</div>
                </div>
                <div className="rounded-lg border p-2 text-center">
                  <History className="w-3.5 h-3.5 mx-auto text-muted-foreground mt-0.5" />
                  <div className="text-[11px] font-semibold mt-0.5">{stats.lastVisit ? formatDate(stats.lastVisit) : '—'}</div>
                  <div className="text-[9px] text-muted-foreground">Son Ziyaret</div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/60 p-2 text-center">
                  <CalendarClock className="w-3.5 h-3.5 mx-auto text-emerald-600 mt-0.5" />
                  <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">{stats.nextVisit ? formatDate(stats.nextVisit) : '—'}</div>
                  <div className="text-[9px] text-muted-foreground">Sıradaki Randevu</div>
                </div>
              </div>

              {/* Son 6 ay — mini çubuk grafik */}
              <div className="rounded-lg border p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Son 6 Ay Randevu Trendi
                  </div>
                  <div className="text-[10px] tabular-nums text-muted-foreground">
                    toplam {monthlyCounts.reduce((s, m) => s + m.count, 0)}
                  </div>
                </div>
                <div className="flex items-end gap-1.5 h-14">
                  {monthlyCounts.map((m, i) => {
                    const max = Math.max(...monthlyCounts.map((x) => x.count), 1)
                    const h = m.count === 0 ? 3 : Math.max(10, Math.round((m.count / max) * 100))
                    const isCurrent = i === monthlyCounts.length - 1
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                        <span className={cn('text-[9px] font-semibold tabular-nums', m.count > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground/50')}>
                          {m.count > 0 ? m.count : ''}
                        </span>
                        <div
                          className={cn(
                            'w-full rounded-t-sm transition-all',
                            m.count > 0
                              ? isCurrent
                                ? 'bg-emerald-500'
                                : 'bg-emerald-300 dark:bg-emerald-700'
                              : 'bg-muted',
                          )}
                          style={{ height: `${h}%` }}
                          title={`${m.label}: ${m.count} randevu`}
                        />
                        <span className={cn('text-[8px]', isCurrent ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
                          {m.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Geçmiş listesi */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Randevu Geçmişi ({history.length})</div>
                {history.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg">Bu müşterinin randevu kaydı yok</div>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-lg border divide-y custom-scroll">
                    {history.map((a) => {
                      const meta = getStatusMeta(a.status)
                      const past = new Date(a.date) < new Date()
                      return (
                        <div key={a.id} className={cn('flex items-center gap-2 p-2.5', !past && 'bg-emerald-50/40 dark:bg-emerald-950/10')}>
                          <div className="text-[11px] tabular-nums shrink-0 w-28">
                            <div className="font-medium">{formatDateTime(a.date)}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{a.service?.name ?? '—'}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{a.staff?.name ?? 'Herhangi biri'}</div>
                          </div>
                          <div className="text-xs tabular-nums shrink-0">{formatCurrency(a.price)}</div>
                          <Badge variant="outline" className={cn('text-[9px] shrink-0', meta.color, meta.bg, 'border-0')}>{meta.label}</Badge>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>

      {customer && (
        <CustomerEditDialog
          providerId={providerId}
          customer={customer}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={() => { onUpdated?.(); toast.success('Müşteri bilgileri güncellendi') }}
        />
      )}
    </Dialog>
  )
}

// ============================================================
// Müşteri oluştur / düzenle formları
// ============================================================

interface CustomerFormState {
  name: string; phone: string; email: string; address: string
  notes: string; tags: string; birthday: string; isBlocked: boolean
}

const EMPTY_FORM: CustomerFormState = { name: '', phone: '', email: '', address: '', notes: '', tags: '', birthday: '', isBlocked: false }

function CustomerFields({ form, setForm }: { form: CustomerFormState; setForm: (f: CustomerFormState) => void }) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Ad Soyad *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Müşteri adı" /></div>
        <div><Label className="text-xs">Telefon *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+90 5xx xxx xx xx" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">E-posta</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@ornek.com" /></div>
        <div><Label className="text-xs">Doğum günü (MM-DD)</Label><Input value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} placeholder="05-23" /></div>
      </div>
      <div><Label className="text-xs">Adres</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Mahalle, sokak, ilçe" /></div>
      <div><Label className="text-xs">Etiketler (virgülle ayır)</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="VIP, Sabit müşteri, Saç boyası" /></div>
      <div><Label className="text-xs">Kalıcı Not</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Tercihler, alerji, özel istekler..." className="h-16" /></div>
      <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/60 px-3 py-2">
        <div>
          <div className="text-xs font-medium flex items-center gap-1"><Ban className="w-3 h-3 text-rose-600" /> Engelli Müşteri</div>
          <div className="text-[10px] text-muted-foreground">Engelliyken randevu oluşturulamaz</div>
        </div>
        <Switch checked={form.isBlocked} onCheckedChange={(v) => setForm({ ...form, isBlocked: v })} aria-label="Müşteriyi engelle" />
      </div>
    </div>
  )
}

function formFromCustomer(c: RegistryCustomer): CustomerFormState {
  return {
    name: c.name, phone: c.phone, email: c.email ?? '', address: c.address ?? '',
    notes: c.notes ?? '', tags: parseTags(c.tags).join(', '), birthday: c.birthday ?? '', isBlocked: c.isBlocked,
  }
}

export function CustomerCreateDialog({
  providerId, open, onOpenChange, onCreated,
}: {
  providerId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void
}) {
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPost(`/api/appointments/providers/${providerId}/customers`, {
        ...form,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      onCreated()
      onOpenChange(false)
      setForm(EMPTY_FORM)
    } catch (e) {
      toast.error('Müşteri kaydedilemedi', { description: e instanceof Error ? e.message : '' })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yeni Müşteri Kaydı</DialogTitle>
          <DialogDescription>Müşteri kayıt defterine ekle</DialogDescription>
        </DialogHeader>
        <CustomerFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={saving || !form.name.trim() || !form.phone.trim()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CustomerEditDialog({
  providerId, customer, open, onOpenChange, onSaved,
}: {
  providerId: string; customer: RegistryCustomer; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void
}) {
  const [form, setForm] = useState<CustomerFormState>(formFromCustomer(customer))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPatch(`/api/appointments/providers/${providerId}/customers/${customer.id}`, {
        ...form,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error('Güncellenemedi', { description: e instanceof Error ? e.message : '' })
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!confirm(`${customer.name} kaydı silinecek. Randevuları kalır ama müşteri profili kaldırılır. Onaylıyor musunuz?`)) return
    setSaving(true)
    try {
      await apiDelete(`/api/appointments/providers/${providerId}/customers/${customer.id}`)
      onSaved()
      onOpenChange(false)
      toast.success('Müşteri kaydı silindi')
    } catch (e) {
      toast.error('Silinemedi', { description: e instanceof Error ? e.message : '' })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Müşteriyi Düzenle</DialogTitle>
          <DialogDescription>{customer.name} — profil bilgileri</DialogDescription>
        </DialogHeader>
        <CustomerFields form={form} setForm={setForm} />
        <DialogFooter className="flex gap-2 justify-between">
          <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleDelete} disabled={saving}>Kaydı Sil</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={saving || !form.name.trim() || !form.phone.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kaydet'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
