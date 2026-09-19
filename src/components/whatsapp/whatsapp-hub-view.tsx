'use client'

// ============================================================
// WhatsApp Merkezi — tüm giden WhatsApp mesajlarının merkezi
// - İstatistik kartları (toplam / kuyrukta / gönderildi / bugün)
// - Durum + tür filtreleri, arama
// - Kuyruktaki mesajları tek tıkla aç & gönderildi işaretle
// - Serbest mesaj bestecisi (müşteri seç → telefon → metin)
// ============================================================

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiDelete } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  MessageSquareText, Search, RefreshCw, Plus, ExternalLink, Copy,
  Ban, Trash2, ChevronDown, ChevronUp, Clock, CheckCircle2,
  Inbox, Loader2, User, Phone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelative, formatCurrency, formatPhone } from '@/lib/format'
import { waContextLabel, WA_CONTEXT_TYPES, openQueuedWhatsApp, sendWhatsAppTracked } from '@/lib/whatsapp-hub'
import type { LucideIcon } from 'lucide-react'

interface WaMessage {
  id: string
  customerId: string | null
  customerName: string | null
  phone: string
  title: string | null
  body: string
  contextType: string
  contextId: string | null
  contextNo: string | null
  amount: number | null
  currency: string | null
  status: string
  channel: string
  sentAt: string | null
  createdByName: string | null
  createdAt: string
}

interface WaListResponse {
  items: WaMessage[]
  stats: { total: number; kuyrukta: number; gonderildi: number; bugun: number }
}

interface CustomerOption {
  id: string
  name: string
  phone: string | null
}

const STATUS_META: Record<string, { label: string; cls: string; icon: LucideIcon }> = {
  kuyrukta: {
    label: 'Kuyrukta',
    cls: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
    icon: Clock,
  },
  gonderildi: {
    label: 'Gönderildi',
    cls: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  iptal: {
    label: 'İptal',
    cls: 'text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300',
    icon: Ban,
  },
}

const STATUS_FILTERS = [
  { value: '__all__', label: 'Tümü' },
  { value: 'kuyrukta', label: 'Kuyrukta' },
  { value: 'gonderildi', label: 'Gönderildi' },
  { value: 'iptal', label: 'İptal' },
]

export function WhatsAppHubView() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('__all__')
  const [typeFilter, setTypeFilter] = useState('__all__')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)

  const params = new URLSearchParams()
  if (statusFilter !== '__all__') params.set('status', statusFilter)
  if (typeFilter !== '__all__') params.set('contextType', typeFilter)
  if (search.trim()) params.set('q', search.trim())

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['whatsapp-messages', statusFilter, typeFilter, search.trim()],
    queryFn: () => apiGet<WaListResponse>(`/api/whatsapp/messages?${params.toString()}`),
    refetchInterval: 30_000,
  })

  const items = data?.items ?? []
  const stats = data?.stats ?? { total: 0, kuyrukta: 0, gonderildi: 0, bugun: 0 }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['whatsapp-messages'] })
  }

  const handleOpen = async (m: WaMessage) => {
    setBusyId(m.id)
    try {
      const opened = await openQueuedWhatsApp(m.phone, m.body, m.id)
      if (opened) {
        toast.success(`${m.contextNo ?? 'Mesaj'} gönderildi olarak işaretlendi`)
      } else {
        toast.error('WhatsApp penceresi açılamadı — popup engelini kontrol edin')
        return
      }
      invalidate()
    } finally {
      setBusyId(null)
    }
  }

  const handleCopy = async (m: WaMessage) => {
    try {
      await navigator.clipboard.writeText(m.body)
      toast.success('Mesaj metni kopyalandı')
    } catch {
      toast.error('Kopyalama başarısız')
    }
  }

  const handleCancel = async (m: WaMessage) => {
    setBusyId(m.id)
    try {
      await apiPatch(`/api/whatsapp/messages/${m.id}`, { status: 'iptal' })
      toast.success('Mesaj iptal edildi')
      invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusyId(null)
    }
  }

  const handleRequeue = async (m: WaMessage) => {
    setBusyId(m.id)
    try {
      await apiPatch(`/api/whatsapp/messages/${m.id}`, { status: 'kuyrukta' })
      toast.success('Mesaj kuyruğa alındı')
      invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (m: WaMessage) => {
    setBusyId(m.id)
    try {
      await apiDelete(`/api/whatsapp/messages/${m.id}`)
      toast.success('Mesaj kaydı silindi')
      invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusyId(null)
    }
  }

  const statCards = [
    { label: 'Toplam Mesaj', value: stats.total, icon: Inbox, color: 'bg-gradient-to-br from-slate-500 to-slate-600', sub: 'tüm kayıtlar' },
    { label: 'Kuyrukta', value: stats.kuyrukta, icon: Clock, color: 'bg-gradient-to-br from-amber-500 to-orange-500', sub: 'gönderilmeyi bekliyor' },
    { label: 'Gönderildi', value: stats.gonderildi, icon: CheckCircle2, color: 'bg-gradient-to-br from-emerald-500 to-teal-600', sub: 'wa.me ile açıldı' },
    { label: 'Bugün Gönderilen', value: stats.bugun, icon: MessageSquareText, color: 'bg-gradient-to-br from-teal-500 to-cyan-600', sub: 'bugün işaretlenen' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm shrink-0">
            <MessageSquareText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              WhatsApp Merkezi
              {stats.kuyrukta > 0 && (
                <Badge className="bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900 text-[10px] h-5">
                  {stats.kuyrukta} kuyrukta
                </Badge>
              )}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tüm giden WhatsApp mesajları — hatırlatma, teklif, proforma ve randevu bildirimleri
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('w-4 h-4 mr-1.5', isFetching && 'animate-spin')} />
            Yenile
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setComposerOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Yeni Mesaj
          </Button>
        </div>
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="relative overflow-hidden hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground truncate">{s.label}</div>
                  <div className="text-lg sm:text-xl font-bold tracking-tight mt-0.5 tabular-nums">{s.value}</div>
                  {s.sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.sub}</div>}
                </div>
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', s.color)}>
                  <s.icon className="w-4 h-4 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtre barı */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Müşteri, telefon, belge no veya mesaj metni ara..."
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="sm:w-56">
                <SelectValue placeholder="Mesaj türü" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tüm türler</SelectItem>
                {WA_CONTEXT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={statusFilter === f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                  statusFilter === f.value
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-background text-muted-foreground border-border hover:border-emerald-300 hover:text-emerald-700',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Mesaj listesi */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mx-auto mb-4">
                <MessageSquareText className="w-7 h-7 text-emerald-500" />
              </div>
              <h3 className="font-semibold mb-1">Henüz mesaj yok</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Fatura hatırlatması, teklif gönderimi veya randevu onayı gönderdiğinizde tüm WhatsApp mesajları
                burada toplanır. Sağ üstten serbest mesaj da gönderebilirsiniz.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[560px] overflow-y-auto custom-scroll">
              {items.map((m) => {
                const meta = STATUS_META[m.status] ?? STATUS_META.kuyrukta
                const StatusIcon = meta.icon
                const expanded = expandedId === m.id
                return (
                  <div key={m.id} className="p-4 hover:bg-muted/40 transition-colors">
                    <div className="flex items-start gap-3">
                      {/* Durum ikonu */}
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 border',
                        meta.cls,
                      )}>
                        <StatusIcon className="w-4 h-4" />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Üst satır: başlık + tür + durum */}
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm truncate max-w-[240px] sm:max-w-none">
                                {m.customerName ?? formatPhone(m.phone)}
                              </span>
                              <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                                {waContextLabel(m.contextType)}
                              </Badge>
                              {m.contextNo && (
                                <span className="text-[11px] font-mono text-muted-foreground">{m.contextNo}</span>
                              )}
                              {m.amount != null && m.currency && (
                                <span className="text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {formatCurrency(m.amount, m.currency)}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {formatPhone(m.phone)}
                              </span>
                              <span aria-hidden>·</span>
                              <span title={new Date(m.createdAt).toLocaleString('tr-TR')}>
                                {formatRelative(m.createdAt)}
                              </span>
                              {m.createdByName && (
                                <>
                                  <span aria-hidden>·</span>
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {m.createdByName}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <Badge variant="outline" className={cn('text-[10px] h-5 shrink-0', meta.cls)}>
                            {meta.label}
                            {m.status === 'gonderildi' && m.sentAt && (
                              <span className="ml-1 font-normal opacity-75">
                                {formatRelative(m.sentAt)}
                              </span>
                            )}
                          </Badge>
                        </div>

                        {/* Başlık + gövde önizleme */}
                        {m.title && (
                          <div className="text-xs font-semibold mt-2 text-foreground/90">{m.title}</div>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : m.id)}
                          className="text-left w-full group"
                          aria-expanded={expanded}
                        >
                          <div className={cn(
                            'text-xs text-muted-foreground mt-1 whitespace-pre-line leading-relaxed',
                            !expanded && 'line-clamp-2',
                          )}>
                            {m.body}
                          </div>
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {expanded ? (
                              <>
                                <ChevronUp className="w-3 h-3" /> Daralt
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3 h-3" /> Tamamını göster
                              </>
                            )}
                          </span>
                        </button>

                        {/* Aksiyonlar */}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {m.status === 'kuyrukta' && (
                            <Button
                              size="sm"
                              className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={busyId === m.id}
                              onClick={() => handleOpen(m)}
                            >
                              {busyId === m.id
                                ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                : <ExternalLink className="w-3 h-3 mr-1" />}
                              Aç &amp; Gönderildi İşaretle
                            </Button>
                          )}
                          {m.status === 'gonderildi' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px]"
                              disabled={busyId === m.id}
                              onClick={() => handleRequeue(m)}
                            >
                              <Clock className="w-3 h-3 mr-1" />
                              Kuyruğa Al
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => handleCopy(m)}
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Kopyala
                          </Button>
                          {m.status === 'kuyrukta' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] text-amber-700 hover:text-amber-800 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-900"
                              disabled={busyId === m.id}
                              onClick={() => handleCancel(m)}
                            >
                              <Ban className="w-3 h-3 mr-1" />
                              İptal
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900"
                            disabled={busyId === m.id}
                            onClick={() => handleDelete(m)}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Sil
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onSent={invalidate}
      />
    </div>
  )
}

// ============================================================
// Serbest mesaj bestecisi — müşteri seç, telefon doldur, yaz, gönder
// ============================================================
function ComposerDialog({ open, onOpenChange, onSent }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSent: () => void
}) {
  const [customerId, setCustomerId] = useState<string>('')
  const [phone, setPhone] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const { data: custData } = useQuery({
    queryKey: ['whatsapp-composer-customers'],
    queryFn: () => apiGet<{ items: CustomerOption[] }>('/api/customers?limit=300'),
    enabled: open,
  })
  const customers = custData?.items ?? []
  const selected = customers.find((c) => c.id === customerId)

  const handleCustomerChange = (id: string) => {
    setCustomerId(id)
    const c = customers.find((x) => x.id === id)
    if (c?.phone) setPhone(c.phone)
  }

  const canSend = !!phone.trim() && !!body.trim() && !sending

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    try {
      const result = await sendWhatsAppTracked({
        phone: phone.trim(),
        body: body.trim(),
        title: selected ? `Serbest Mesaj — ${selected.name}` : 'Serbest Mesaj',
        contextType: 'serbest',
        customerId: customerId || null,
        customerName: selected?.name ?? null,
      })
      toast.success(result.popupOpened
        ? 'WhatsApp penceresi açıldı — mesaj gönderildi olarak işaretlendi'
        : 'Mesaj kuyruğa alındı — WhatsApp penceresi açılamadı')
      setBody('')
      onOpenChange(false)
      onSent()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderim başarısız')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="w-5 h-5 text-emerald-600" />
            Yeni WhatsApp Mesajı
          </DialogTitle>
          <DialogDescription>
            Müşteri seçin, mesajı yazın. Gönderim wa.me ile açılır ve Merkeze kaydedilir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Müşteri</Label>
            <Select value={customerId} onValueChange={handleCustomerChange}>
              <SelectTrigger>
                <SelectValue placeholder="Müşteri seçin (opsiyonel)" />
              </SelectTrigger>
              <SelectContent className="max-h-60 custom-scroll">
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Telefon</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+90 5xx xxx xx xx"
              inputMode="tel"
            />
            {selected && !selected.phone && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400">
                Seçili müşterinin kayıtlı telefonu yok — numarayı elle girin.
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Mesaj</Label>
              <span className="text-[10px] text-muted-foreground">{body.length} karakter</span>
            </div>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Merhaba, ..." 
              className="min-h-32"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Vazgeç
          </Button>
          <Button
            onClick={handleSend}
            disabled={!canSend}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {sending
              ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              : <MessageSquareText className="w-4 h-4 mr-1.5" />}
            Gönder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
