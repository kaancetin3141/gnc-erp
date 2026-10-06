'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format'
import {
  Plus, LifeBuoy, AlarmClock, CheckCheck, Search, Send, Ticket as TicketIcon, Lock,
} from 'lucide-react'

interface TicketItem {
  id: string
  code: string
  subject: string
  description: string | null
  category: string | null
  priority: string
  status: string
  customer: { id: string; name: true } | { id: string; name: string } | null
  assignee: { id: string; name: string } | null
  updatedAt: string
  _count?: { comments: number }
}

interface TicketDetail extends TicketItem {
  comments: { id: string; authorName: string; body: string; internal: boolean; createdAt: string }[]
}

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  low: { label: 'Düşük', cls: 'bg-slate-200 text-slate-600' },
  normal: { label: 'Normal', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400' },
  high: { label: 'Yüksek', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  urgent: { label: 'Acil', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400' },
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  open: { label: 'Açık', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400' },
  in_progress: { label: 'İşleniyor', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400' },
  waiting: { label: 'Beklemede', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  resolved: { label: 'Çözüldü', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  closed: { label: 'Kapandı', cls: 'bg-slate-200 text-slate-600' },
}

const CATEGORIES = ['teknik', 'fatura', 'satis', 'diger']

export function SupportTicketsView() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailFor, setDetailFor] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [form, setForm] = useState({ subject: '', description: '', category: 'teknik', priority: 'normal', customerId: '' })
  const [comment, setComment] = useState('')
  const [internal, setInternal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', search, statusFilter, mineOnly],
    queryFn: () =>
      apiGet<{
        items: TicketItem[]
        summary: { openCount: number; urgentCount: number; resolvedThisWeek: number }
      }>(`/api/tickets?q=${encodeURIComponent(search)}&status=${statusFilter}&mine=${mineOnly ? '1' : ''}`),
  })

  const { data: detail } = useQuery({
    queryKey: ['ticket-detail', detailFor],
    queryFn: () => apiGet<TicketDetail>(`/api/tickets/${detailFor}`),
    enabled: !!detailFor,
  })

  const tickets = data?.items ?? []
  const summary = data?.summary

  async function createTicket() {
    if (!form.subject.trim()) return toast.error('Konu zorunludur')
    setBusy('create')
    try {
      await apiPost('/api/tickets', { ...form, customerId: form.customerId || null })
      toast.success('Talep oluşturuldu')
      setCreateOpen(false)
      setForm({ subject: '', description: '', category: 'teknik', priority: 'normal', customerId: '' })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oluşturulamadı')
    } finally {
      setBusy(null)
    }
  }

  async function setStatus(t: TicketItem, status: string) {
    setBusy(t.id)
    try {
      await apiPatch(`/api/tickets/${t.id}`, { status })
      toast.success('Durum güncellendi')
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['ticket-detail'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    } finally {
      setBusy(null)
    }
  }

  async function setPriority(t: TicketItem, priority: string) {
    setBusy(t.id)
    try {
      await apiPatch(`/api/tickets/${t.id}`, { priority })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    } finally {
      setBusy(null)
    }
  }

  async function addComment() {
    if (!detailFor || !comment.trim()) return
    setBusy('comment')
    try {
      await apiPost(`/api/tickets/${detailFor}/comments`, { body: comment, internal })
      setComment('')
      setInternal(false)
      qc.invalidateQueries({ queryKey: ['ticket-detail'] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yorum eklenemedi')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Özet */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <LifeBuoy className="w-3.5 h-3.5" /> Açık Talep
            </div>
            <div className="text-2xl font-bold">{summary?.openCount ?? '…'}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlarmClock className="w-3.5 h-3.5" /> Acil
            </div>
            <div className={`text-2xl font-bold ${(summary?.urgentCount ?? 0) > 0 ? 'text-rose-600' : ''}`}>
              {summary?.urgentCount ?? '…'}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCheck className="w-3.5 h-3.5" /> Bu Hafta Çözülen
            </div>
            <div className="text-2xl font-bold text-emerald-600">{summary?.resolvedThisWeek ?? '…'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtre + yeni */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Talep ara (konu / TRK kodu)…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm durumlar</SelectItem>
            {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant={mineOnly ? 'default' : 'outline'} className="text-xs" onClick={() => setMineOnly((v) => !v)}>
          Bana atananlar
        </Button>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Talep Aç
        </Button>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : tickets.length === 0 ? (
        <Card className="shadow-soft">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <TicketIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
            Henüz destek talebi yok. &quot;Talep Aç&quot; ile ilk kaydı oluşturun.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto custom-scroll pr-1">
          {tickets.map((t) => {
            const p = PRIORITY_META[t.priority] ?? PRIORITY_META.normal
            const s = STATUS_META[t.status] ?? STATUS_META.open
            return (
              <Card key={t.id} className="shadow-soft hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setDetailFor(t.id)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground">{t.code}</span>
                        <Badge className={`text-[9px] border-0 ${s.cls}`}>{s.label}</Badge>
                        <Badge className={`text-[9px] border-0 ${p.cls}`}>{p.label}</Badge>
                        {t.customer && 'name' in t.customer && t.customer.name && (
                          <Badge variant="outline" className="text-[9px]">{t.customer.name}</Badge>
                        )}
                      </div>
                      <div className="font-medium text-sm mt-1 truncate">{t.subject}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {t.assignee ? `Atanan: ${t.assignee.name} · ` : ''}
                        {t._count?.comments ?? 0} yorum · güncelleme {formatDateTime(t.updatedAt)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Select value={t.status} onValueChange={(v) => setStatus(t, v)}>
                        <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={t.priority} onValueChange={(v) => setPriority(t, v)}>
                        <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(PRIORITY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* YENİ TALEP */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Destek Talebi</DialogTitle>
            <DialogDescription>Müşteri veya iç destek talebi kaydedin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Konu *</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Kısa özet…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Açıklama</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detaylar…" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.charAt(0).toLocaleUpperCase('tr') + c.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Öncelik</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Vazgeç</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={createTicket} disabled={busy === 'create'}>
              {busy === 'create' ? 'Oluşturuluyor…' : 'Talep Aç'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TALEP DETAYI */}
      <Dialog open={!!detailFor} onOpenChange={(v) => { if (!v) setDetailFor(null) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{detail?.code}</span>
              {detail?.subject}
            </DialogTitle>
            <DialogDescription>
              {detail?.description || 'Açıklama yok'}
            </DialogDescription>
          </DialogHeader>

          {/* Yorumlar */}
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scroll">
            {(detail?.comments ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Henüz yorum yok.</p>
            ) : (
              detail?.comments.map((c) => (
                <div key={c.id} className={cn('p-2.5 rounded-lg border text-sm', c.internal ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20' : 'border-border bg-muted/30')}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium">{c.authorName}</span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      {c.internal && <Lock className="w-2.5 h-2.5 text-amber-600" />}
                      {formatDateTime(c.createdAt)}
                    </span>
                  </div>
                  <p className="text-[13px] whitespace-pre-wrap">{c.body}</p>
                </div>
              ))
            )}
          </div>

          {/* Yorum yaz */}
          <div className="space-y-2">
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Yorum yaz…" />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-amber-600" />
                Dahili not (müşteriye gitmez)
              </label>
              <Button size="sm" className="h-8 text-xs" onClick={addComment} disabled={busy === 'comment' || !comment.trim()}>
                <Send className="w-3.5 h-3.5 mr-1" /> Gönder
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
