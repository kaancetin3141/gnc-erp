'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, qk } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { toast } from 'sonner'

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'

import {
  Phone, MessageCircle, Mail, FileText, UserPlus, CheckSquare,
  Trophy, Clock, Download, Calendar, AlertCircle, ChevronRight,
  PhoneCall, XCircle, ListTodo, Building2,
} from 'lucide-react'

import {
  formatCurrency, formatTime, toCSV, downloadFile,
} from '@/lib/format'
import { cn } from '@/lib/utils'

// ------------------------------------------------------------
// Tipler
// ------------------------------------------------------------
interface DailyReportData {
  date: string
  targetUser: {
    id: string
    name: string
    role: string
    title: string | null
  }
  scope: {
    isAll: boolean
    userIds: string[] | null
    viewerRole: string
  }
  summary: {
    calls: { total: number; successful: number; failed: number; uniqueCustomersCalled: number }
    messages: { whatsapp: number; email: number; uniqueCustomersMessaged: number }
    quotes: { created: number; totalValue: number; sent: number }
    deals: { created: number; createdValue: number; won: number; wonValue: number; lost: number; lostValue: number }
    tasks: { completed: number; created: number; overdue: number }
    customers: { newCustomers: number; contacted: number }
    totalDuration: number
  }
  timeline: Array<{
    id: string
    type: string
    subject: string
    detail: string | null
    outcome: string | null
    durationMin: number
    date: string
    customerId: string | null
    customerName: string | null
    userId: string | null
    userName: string | null
  }>
  topCustomers: Array<{
    id: string
    name: string
    segment: string
    contactCount: number
    types: string[]
    lastContactAt: string
  }>
  newCustomers: Array<{
    id: string
    name: string
    segment: string
    ownerName: string
  }>
  typeStats: Record<string, number>
  outcomeStats: Record<string, number>
  dealsWon: Array<{ id: string; value: number; customerName: string }>
  dealsLost: Array<{ id: string; value: number; lossReason: string | null; customerName: string }>
  quotesCreated: Array<{
    id: string
    number: string
    status: string
    total: number
    currency: string
    isProforma: boolean
    customerName: string
  }>
}

interface UserListItem {
  id: string
  name: string
  role: string
  title: string | null
}

// ------------------------------------------------------------
// Aktivite tip → renk + ikon
// ------------------------------------------------------------
const TYPE_META: Record<string, { label: string; color: string; icon: typeof Phone }> = {
  arama: { label: 'Arama', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50', icon: PhoneCall },
  whatsapp: { label: 'WhatsApp', color: 'text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900/50', icon: MessageCircle },
  email: { label: 'E-posta', color: 'text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/50', icon: Mail },
  toplanti: { label: 'Toplantı', color: 'text-violet-700 bg-violet-50 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/50', icon: Building2 },
  ziyaret: { label: 'Ziyaret', color: 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50', icon: Building2 },
  not: { label: 'Not', color: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50', icon: FileText },
  gorev: { label: 'Görev', color: 'text-slate-700 bg-slate-100 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700', icon: CheckSquare },
}

const OUTCOME_META: Record<string, { label: string; color: string }> = {
  basarili: { label: 'Başarılı', color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300' },
  basarisiz: { label: 'Başarısız', color: 'text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300' },
  ertelendi: { label: 'Ertelendi', color: 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300' },
  callback: { label: 'Geri Aranacak', color: 'text-sky-700 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-300' },
}

// Bugünün YYYY-MM-DD değeri (local)
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ============================================================
// Özet kartı
// ============================================================
function SummaryCard({
  label, value, sub, icon: Icon, tone,
}: {
  label: string
  value: string | number
  sub?: string
  icon: typeof Phone
  tone: 'emerald' | 'teal' | 'sky' | 'amber' | 'violet' | 'slate' | 'rose'
}) {
  const tones: Record<string, { bg: string; text: string }> = {
    emerald: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-600 dark:text-emerald-400' },
    teal: { bg: 'bg-teal-100 dark:bg-teal-950/40', text: 'text-teal-600 dark:text-teal-400' },
    sky: { bg: 'bg-sky-100 dark:bg-sky-950/40', text: 'text-sky-600 dark:text-sky-400' },
    amber: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-600 dark:text-amber-400' },
    violet: { bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-600 dark:text-violet-400' },
    slate: { bg: 'bg-slate-100 dark:bg-slate-800/60', text: 'text-slate-600 dark:text-slate-300' },
    rose: { bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-600 dark:text-rose-400' },
  }
  const t = tones[tone] ?? tones.slate
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
              {label}
            </div>
            <div className="text-xl font-bold mt-1 tabular-nums">{value}</div>
            {sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
          </div>
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', t.bg)}>
            <Icon className={cn('w-4 h-4', t.text)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Aktivity timeline öğesi
// ============================================================
function TimelineItem({
  item, onOpenCustomer,
}: {
  item: DailyReportData['timeline'][number]
  onOpenCustomer: (id: string) => void
}) {
  const meta = TYPE_META[item.type] ?? TYPE_META.gorev
  const out = item.outcome ? OUTCOME_META[item.outcome] : null
  const Icon = meta.icon
  return (
    <div className="flex gap-3 group">
      {/* Dikey çizgi + ikon */}
      <div className="flex flex-col items-center">
        <div className={cn('w-7 h-7 rounded-full border flex items-center justify-center shrink-0', meta.color)}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="w-px flex-1 bg-border/60 group-last:bg-transparent" />
      </div>
      {/* İçerik */}
      <div className="flex-1 min-w-0 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span className="tabular-nums">{formatTime(item.date)}</span>
            {item.durationMin > 0 && (
              <span className="text-muted-foreground/70">· {item.durationMin}dk</span>
            )}
          </div>
          {out && (
            <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-4', out.color)}>
              {out.label}
            </Badge>
          )}
        </div>
        <div className="text-sm font-medium mt-0.5 truncate">{item.subject}</div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-4', meta.color)}>
            {meta.label}
          </Badge>
          {item.customerId && item.customerName ? (
            <button
              type="button"
              onClick={() => onOpenCustomer(item.customerId!)}
              className="text-[11px] text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400 transition-colors truncate"
            >
              {item.customerName}
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground/70">Müşteri yok</span>
          )}
        </div>
        {item.detail && (
          <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-2">{item.detail}</p>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Günlük rapor görünümü
// ============================================================
export function DailyReportView({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAppStore((s) => s.user)
  const openCustomer = useAppStore((s) => s.openCustomer)

  const [date, setDate] = useState<string>(todayStr())
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  // Kullanıcı listesi (admin için tüm tenant)
  const { data: usersData } = useQuery({
    queryKey: qk.users,
    queryFn: () => apiGet<{ items: UserListItem[]; total: number }>('/api/users'),
    enabled: open && isAdmin,
    staleTime: 60_000,
  })
  const users = usersData?.items ?? []

  const effectiveUserId = isAdmin ? (selectedUserId || user?.id || '') : (user?.id || '')

  const { data, isLoading, isError, refetch } = useQuery<DailyReportData>({
    queryKey: ['daily-report', date, effectiveUserId],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('date', date)
      if (effectiveUserId) params.set('userId', effectiveUserId)
      return apiGet<DailyReportData>(`/api/reports/daily?${params.toString()}`)
    },
    enabled: open,
    staleTime: 30_000,
  })

  const handleExportCSV = () => {
    if (!data) return
    const rows: Record<string, unknown>[] = data.timeline.map((a) => ({
      'Tarih': data.date,
      'Saat': formatTime(a.date),
      'Tip': TYPE_META[a.type]?.label ?? a.type,
      'Konu': a.subject,
      'Müşteri': a.customerName ?? '',
      'Sonuç': a.outcome ? (OUTCOME_META[a.outcome]?.label ?? a.outcome) : '',
      'Süre (dk)': a.durationMin,
      'Kullanıcı': a.userName ?? '',
      'Detay': a.detail ?? '',
    }))
    if (rows.length === 0) {
      toast.error('Dışa aktarılacak veri yok', { description: 'Bu tarihte aktivite kaydı yok.' })
      return
    }
    const csv = toCSV(rows)
    downloadFile(csv, `gun-sonu-raporu-${data.date}.csv`, 'text/csv;charset=utf-8')
    toast.success('CSV dışa aktarıldı', { description: `gun-sonu-raporu-${data.date}.csv indirildi.` })
  }

  const isEmpty = useMemo(() => {
    if (!data) return true
    return (
      data.summary.calls.total === 0 &&
      data.summary.messages.whatsapp === 0 &&
      data.summary.messages.email === 0 &&
      data.summary.quotes.created === 0 &&
      data.summary.deals.created === 0 &&
      data.summary.deals.won === 0 &&
      data.summary.tasks.completed === 0 &&
      data.summary.customers.newCustomers === 0 &&
      data.timeline.length === 0
    )
  }, [data])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Calendar className="w-5 h-5 text-violet-600" />
            Gün Sonu Raporu
          </DialogTitle>
          <DialogDescription className="text-xs">
            Bir satış temsilcisinin günlük iletişim, arama, teklif ve görev özeti.
          </DialogDescription>
        </DialogHeader>

        {/* Filtreler */}
        <div className="px-6 py-3 border-b bg-muted/30 flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label htmlFor="daily-date" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Tarih
            </Label>
            <Input
              id="daily-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayStr())}
              className="h-9 w-[170px]"
              max={todayStr()}
            />
          </div>

          {isAdmin && (
            <div className="space-y-1 flex-1 min-w-[220px]">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Temsilci
              </Label>
              <Select value={effectiveUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Temsilci seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={user?.id ?? ''}>Kendim ({user?.name})</SelectItem>
                  {users.filter((u) => u.id !== user?.id).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} · {u.title ?? u.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="ml-auto flex items-end gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <Clock className="w-3.5 h-3.5 mr-1.5" /> Yenile
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={!data || isEmpty}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
            </Button>
          </div>
        </div>

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto custom-scroll px-6 py-4">
          {isLoading && <DailyReportSkeleton />}

          {isError && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-full bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center mb-3">
                <AlertCircle className="w-7 h-7 text-rose-500" />
              </div>
              <h4 className="font-semibold mb-1">Rapor yüklenemedi</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Veriler alınırken bir hata oluştu.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Yeniden dene
              </Button>
            </div>
          )}

          {!isLoading && !isError && data && isEmpty && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
                <AlertCircle className="w-7 h-7 text-muted-foreground/50" />
              </div>
              <h4 className="font-semibold mb-1">Bu tarihte aktivite kaydı yok</h4>
              <p className="text-sm text-muted-foreground max-w-md">
                <strong>{data.targetUser.name}</strong> için <strong>{data.date}</strong> tarihinde
                hiçbir aktivite, görev, teklif veya müşteri kaydı bulunamadı.
              </p>
            </div>
          )}

          {!isLoading && !isError && data && !isEmpty && (
            <div className="space-y-5">
              {/* Hedef kullanıcı bilgisi */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{data.targetUser.name}</span>
                <span>·</span>
                <span>{data.targetUser.title ?? data.targetUser.role}</span>
                <span>·</span>
                <span>{data.date}</span>
                {data.scope.isAll && (
                  <Badge variant="outline" className="text-[9px] ml-1">Tüm Tenant</Badge>
                )}
              </div>

              {/* Özet kartları */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SummaryCard
                  label="Arama"
                  value={data.summary.calls.total}
                  sub={`${data.summary.calls.successful} başarılı · ${data.summary.calls.failed} başarısız`}
                  icon={Phone}
                  tone="emerald"
                />
                <SummaryCard
                  label="WhatsApp"
                  value={data.summary.messages.whatsapp}
                  sub={`${data.summary.messages.uniqueCustomersMessaged} müşteri`}
                  icon={MessageCircle}
                  tone="teal"
                />
                <SummaryCard
                  label="E-posta"
                  value={data.summary.messages.email}
                  sub="Gönderilen mail"
                  icon={Mail}
                  tone="sky"
                />
                <SummaryCard
                  label="Teklif"
                  value={data.summary.quotes.created}
                  sub={formatCurrency(data.summary.quotes.totalValue)}
                  icon={FileText}
                  tone="amber"
                />
                <SummaryCard
                  label="Yeni Müşteri"
                  value={data.summary.customers.newCustomers}
                  sub={`${data.summary.customers.contacted} iletişim`}
                  icon={UserPlus}
                  tone="violet"
                />
                <SummaryCard
                  label="Tamamlanan Görev"
                  value={data.summary.tasks.completed}
                  sub={`${data.summary.tasks.created} yeni · ${data.summary.tasks.overdue} gecikmiş`}
                  icon={CheckSquare}
                  tone="slate"
                />
                <SummaryCard
                  label="Kazanılan Fırsat"
                  value={data.summary.deals.won}
                  sub={formatCurrency(data.summary.deals.wonValue)}
                  icon={Trophy}
                  tone="emerald"
                />
                <SummaryCard
                  label="Toplam Süre"
                  value={`${data.summary.totalDuration}dk`}
                  sub="Aktivite süresi"
                  icon={Clock}
                  tone="slate"
                />
              </div>

              {/* İki kolonlu içerik */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Timeline */}
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <ListTodo className="w-4 h-4 text-violet-600" />
                      Aktivite Zaman Çizelgesi
                      <Badge variant="outline" className="text-[10px] ml-1">
                        {data.timeline.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="max-h-[28rem] overflow-y-auto custom-scroll pr-1">
                      {data.timeline.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-8">
                          Bu tarihte aktivite kaydı yok.
                        </div>
                      ) : (
                        <div>
                          {data.timeline.map((item) => (
                            <TimelineItem
                              key={item.id}
                              item={item}
                              onOpenCustomer={openCustomer}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Sağ panel: top customers + outcomes */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-violet-600" />
                        İletişim Kurulan Müşteriler
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scroll pr-1">
                        {data.topCustomers.length === 0 ? (
                          <div className="text-xs text-muted-foreground text-center py-6">
                            Müşteri kaydı yok.
                          </div>
                        ) : (
                          data.topCustomers.map((c, i) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => openCustomer(c.id)}
                              className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted/60 text-left transition-colors"
                            >
                              <span className="text-[10px] font-bold text-muted-foreground w-4 tabular-nums">{i + 1}.</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate">{c.name}</div>
                                <div className="flex items-center gap-1 mt-0.5">
                                  {c.types.slice(0, 3).map((t) => {
                                    const m = TYPE_META[t]
                                    return m ? (
                                      <span key={t} className={cn('text-[9px] px-1 py-0 rounded border', m.color)}>
                                        {m.label}
                                      </span>
                                    ) : null
                                  })}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs font-semibold tabular-nums">{c.contactCount}x</div>
                                <div className="text-[9px] text-muted-foreground">{formatTime(c.lastContactAt)}</div>
                              </div>
                              <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                            </button>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sonuç özeti */}
                  {Object.keys(data.outcomeStats).length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-1.5">
                          <PhoneCall className="w-4 h-4 text-violet-600" />
                          Arama Sonuçları
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-2 space-y-1.5">
                        {Object.entries(data.outcomeStats).map(([k, v]) => {
                          const m = OUTCOME_META[k]
                          return (
                            <div key={k} className="flex items-center justify-between text-xs">
                              <span className={cn('px-1.5 py-0.5 rounded text-[10px]', m?.color ?? 'bg-muted')}>
                                {m?.label ?? k}
                              </span>
                              <span className="font-semibold tabular-nums">{v}</span>
                            </div>
                          )
                        })}
                      </CardContent>
                    </Card>
                  )}

                  {/* Yeni müşteriler */}
                  {data.newCustomers.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-1.5">
                          <UserPlus className="w-4 h-4 text-violet-600" />
                          Yeni Müşteriler
                          <Badge variant="outline" className="text-[10px] ml-1">
                            {data.newCustomers.length}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-2">
                        <div className="space-y-1 max-h-48 overflow-y-auto custom-scroll pr-1">
                          {data.newCustomers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => openCustomer(c.id)}
                              className="w-full flex items-center justify-between gap-2 p-1.5 rounded-md hover:bg-muted/60 text-left transition-colors"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-medium truncate">{c.name}</div>
                                <div className="text-[10px] text-muted-foreground truncate">{c.ownerName}</div>
                              </div>
                              <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>

              {/* Kazanılan ve kaybedilen fırsatlar */}
              {(data.dealsWon.length > 0 || data.dealsLost.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.dealsWon.length > 0 && (
                    <Card className="border-emerald-200/70 dark:border-emerald-900/40">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                          <Trophy className="w-4 h-4" />
                          Kazanılan Fırsatlar
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-2 space-y-1.5">
                        {data.dealsWon.map((d) => (
                          <div key={d.id} className="flex items-center justify-between text-xs">
                            <span className="truncate">{d.customerName}</span>
                            <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(d.value)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-emerald-200/50 dark:border-emerald-900/30 text-xs">
                          <span className="font-medium">Toplam</span>
                          <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(data.summary.deals.wonValue)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {data.dealsLost.length > 0 && (
                    <Card className="border-rose-200/70 dark:border-rose-900/40">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                          <XCircle className="w-4 h-4" />
                          Kaybedilen Fırsatlar
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-2 space-y-1.5">
                        {data.dealsLost.map((d) => (
                          <div key={d.id} className="flex items-center justify-between text-xs gap-2">
                            <div className="min-w-0">
                              <div className="truncate">{d.customerName}</div>
                              {d.lossReason && (
                                <div className="text-[10px] text-muted-foreground truncate">{d.lossReason}</div>
                              )}
                            </div>
                            <span className="font-semibold tabular-nums text-rose-700 dark:text-rose-400 shrink-0">
                              {formatCurrency(d.value)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-rose-200/50 dark:border-rose-900/30 text-xs">
                          <span className="font-medium">Toplam</span>
                          <span className="font-bold tabular-nums text-rose-700 dark:text-rose-400">
                            {formatCurrency(data.summary.deals.lostValue)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Teklifler */}
              {data.quotesCreated.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-amber-600" />
                      Bugün Oluşturulan Teklifler
                      <Badge variant="outline" className="text-[10px] ml-1">
                        {data.quotesCreated.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {data.quotesCreated.map((q) => (
                        <div key={q.id} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border/60">
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">
                              {q.number}
                              {q.isProforma && (
                                <Badge variant="outline" className="text-[9px] ml-1.5 py-0">Proforma</Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">{q.customerName}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-semibold tabular-nums">
                              {formatCurrency(q.total, q.currency)}
                            </div>
                            <Badge variant="outline" className="text-[9px] mt-0.5 py-0">
                              {q.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Skeleton
// ============================================================
function DailyReportSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      <Skeleton className="h-4 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="lg:col-span-2 h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  )
}
