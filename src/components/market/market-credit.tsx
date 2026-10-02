'use client'

// ============================================================
// MARKET — VERESİYE DEFTERİ (cari hesap)
// — Müşteri listesi + bakiye + yaşlandırma (0-30/31-60/61-90/90+)
// — Cari hareket defteri (borç/ödeme) + POS entegrasyonu
// — WhatsApp hatırlatma + kredi limiti takibi
// ============================================================

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDateTime, whatsappLink } from '@/lib/format'
import {
  NotebookPen, Plus, Search, HandCoins, Receipt, Trash2, Phone,
  MessageCircle, AlertTriangle, ArrowDownCircle, ArrowUpCircle, UserRound, Wallet,
} from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

interface CreditCustomerRow {
  id: string
  name: string
  phone: string | null
  note: string | null
  creditLimit: number | null
  isActive: boolean
  createdAt: string
  entryCount: number
  balance: number
  lastEntryAt: string | null
  lastDebtAt: string | null
  overdueAmount: number
  oldestOpenDays: number | null
}

interface CreditResponse {
  items: CreditCustomerRow[]
  summary: {
    customerCount: number
    debtorCount: number
    totalReceivable: number
    totalOverdue: number
    aging: { d0_30: number; d31_60: number; d61_90: number; d90p: number }
  }
  topDebtors: CreditCustomerRow[]
}

interface CreditEntryRow {
  id: string
  type: 'borc' | 'odeme'
  amount: number
  method: string | null
  refSaleNumber: string | null
  dueDate: string | null
  note: string | null
  createdAt: string
}

interface CustomerDetail extends Record<string, unknown> {
  id: string
  name: string
  phone: string | null
  note: string | null
  creditLimit: number | null
  isActive: boolean
  balance: number
  entries: CreditEntryRow[]
}

const METHOD_LABELS: Record<string, string> = {
  nakit: 'Nakit', kart: 'Kart', havale: 'Havale/EFT',
}

function agingLabel(days: number | null): { text: string; cls: string } {
  if (days == null) return { text: 'Yok', cls: 'text-slate-500 bg-slate-100 dark:bg-slate-900/50' }
  if (days <= 30) return { text: `${days} gün`, cls: 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950/40' }
  if (days <= 60) return { text: `${days} gün`, cls: 'text-amber-700 bg-amber-100 dark:bg-amber-950/40' }
  if (days <= 90) return { text: `${days} gün`, cls: 'text-orange-700 bg-orange-100 dark:bg-orange-950/40' }
  return { text: `${days} gün`, cls: 'text-red-700 bg-red-100 dark:bg-red-950/40' }
}

// ============================================================
// Ana bileşen
// ============================================================

export function MarketCredit({ marketId }: { marketId: string }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; phone: string | null; note: string | null; creditLimit: number | null } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CreditCustomerRow | null>(null)

  const { data, isLoading } = useQuery<CreditResponse>({
    queryKey: ['market-credit', marketId],
    queryFn: () => apiGet(`/api/market/${marketId}/credit`),
  })

  const customers = data?.items ?? []
  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
  }, [customers, search])

  const summary = data?.summary

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await apiDelete(`/api/market/${marketId}/credit/${deleteTarget.id}`)
      toast.success('Veresiye müşterisi silindi')
      setDeleteTarget(null)
      void qc.invalidateQueries({ queryKey: ['market-credit'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi')
    }
  }

  return (
    <div className="space-y-4">
      {/* Özet kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <NotebookPen className="w-3.5 h-3.5 text-violet-600" /> Veresiye Müşterisi
            </div>
            <div className="text-2xl font-bold">{summary?.customerCount ?? '—'}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{summary?.debtorCount ?? 0} borçlu</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Wallet className="w-3.5 h-3.5 text-amber-600" /> Toplam Alacak
            </div>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
              {summary ? formatCurrency(summary.totalReceivable) : '—'}
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> Vadesi Geçen
            </div>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">
              {summary ? formatCurrency(summary.totalOverdue) : '—'}
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1.5">Yaşlandırma</div>
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              <span className="flex justify-between rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span>0-30</span><span className="font-semibold tabular-nums">{summary ? formatCurrency(summary.aging.d0_30) : '—'}</span>
              </span>
              <span className="flex justify-between rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <span>31-60</span><span className="font-semibold tabular-nums">{summary ? formatCurrency(summary.aging.d31_60) : '—'}</span>
              </span>
              <span className="flex justify-between rounded bg-orange-100 px-1.5 py-0.5 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
                <span>61-90</span><span className="font-semibold tabular-nums">{summary ? formatCurrency(summary.aging.d61_90) : '—'}</span>
              </span>
              <span className="flex justify-between rounded bg-red-100 px-1.5 py-0.5 text-red-800 dark:bg-red-950/40 dark:text-red-300">
                <span>90+</span><span className="font-semibold tabular-nums">{summary ? formatCurrency(summary.aging.d90p) : '—'}</span>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Arama + yeni */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="İsim veya telefon ara..." className="pl-9" aria-label="Müşteri ara" />
        </div>
        <div className="flex-1" />
        <Button size="sm" className="h-9 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => setFormOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Veresiye Müşterisi Ekle
        </Button>
      </div>

      {/* Müşteri listesi */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <NotebookPen className="w-12 h-12 mx-auto mb-3 text-muted-foreground/25" />
            <p className="font-medium text-sm">{search ? 'Aramaya uygun müşteri yok' : 'Veresiye müşterisi yok'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sık gelen müşterilerinize borç defteri tutmak için müşteri ekleyin; POS&apos;ta &quot;Veresiye&quot; ödemesiyle bağlanır
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((c) => {
            const age = agingLabel(c.oldestOpenDays)
            const overLimit = c.creditLimit != null && c.balance > c.creditLimit
            const nearLimit = c.creditLimit != null && c.balance > c.creditLimit * 0.8 && !overLimit
            return (
              <Card
                key={c.id}
                className={cn(
                  'border shadow-sm hover:shadow-md transition-all cursor-pointer',
                  c.balance > 0 ? 'border-amber-200/70 dark:border-amber-900/50' : c.balance < 0 ? 'border-emerald-200/70 dark:border-emerald-900/50' : '',
                  overLimit && 'border-red-400 dark:border-red-700',
                  !c.isActive && 'opacity-60',
                )}
                onClick={() => setDetailId(c.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') setDetailId(c.id) }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn('flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold shrink-0',
                        c.balance > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300')}>
                        {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm truncate">{c.name}</span>
                          {!c.isActive && <Badge variant="outline" className="text-[9px] px-1">Pasif</Badge>}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {c.entryCount} hareket{c.phone ? ` · ${c.phone}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn('text-lg font-bold tabular-nums leading-none',
                        c.balance > 0 ? 'text-amber-700 dark:text-amber-400' : c.balance < 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500')}>
                        {formatCurrency(c.balance)}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{c.balance > 0 ? 'borçlu' : c.balance < 0 ? 'alacaklı' : 'bakiye sıfır'}</div>
                    </div>
                  </div>
                  {c.balance > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', age.cls)}>en eski borç: {age.text}</span>
                      {c.overdueAmount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-red-100 text-red-700 dark:bg-red-950/40">
                          vadesi geçmiş: {formatCurrency(c.overdueAmount)}
                        </span>
                      )}
                      {c.creditLimit != null && (
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', overLimit ? 'bg-red-100 text-red-700 dark:bg-red-950/40' : nearLimit ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40' : 'bg-slate-100 text-slate-600 dark:bg-slate-900/50')}>
                          limit: {formatCurrency(c.creditLimit)}
                          {overLimit && ' ⚠ aşıldı'}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Yeni müşteri dialogu */}
      <CustomerFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditTarget(null) }}
        marketId={marketId}
        editCustomer={editTarget}
      />

      {/* Cari detay sheet */}
      {detailId && (
        <CustomerDetailSheet
          marketId={marketId}
          customerId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(info) => { setDetailId(null); setEditTarget(info); setFormOpen(true) }}
        />
      )}

      {/* Silme onayı */}
      <AlertDialog open={deleteTarget != null} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Veresiye Müşterisini Sil</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <><span className="font-medium">{deleteTarget.name}</span> silinecek. Bakiye sıfır değilse silme reddedilir.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmDelete() }} className="bg-red-600 hover:bg-red-700 text-white">
              <Trash2 className="w-4 h-4 mr-1.5" /> Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================
// Müşteri ekleme formu
// ============================================================

function CustomerFormDialog({ open, onOpenChange, marketId, editCustomer }: {
  open: boolean; onOpenChange: (v: boolean) => void; marketId: string
  editCustomer: { id: string; name: string; phone: string | null; note: string | null; creditLimit: number | null } | null
}) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', note: '', creditLimit: '' })
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  // Edit moduna geçildiğinde formu doldur
  if (open && editCustomer && initializedFor !== editCustomer.id) {
    setForm({
      name: editCustomer.name,
      phone: editCustomer.phone ?? '',
      note: editCustomer.note ?? '',
      creditLimit: editCustomer.creditLimit != null ? String(editCustomer.creditLimit) : '',
    })
    setInitializedFor(editCustomer.id)
  }
  if (!open && initializedFor) setInitializedFor(null)

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Müşteri adı gerekli'); return }
    setSaving(true)
    try {
      if (editCustomer) {
        await apiPatch(`/api/market/${marketId}/credit/${editCustomer.id}`, {
          name: form.name,
          phone: form.phone || null,
          note: form.note || null,
          creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
        })
        toast.success('Müşteri güncellendi')
      } else {
        await apiPost(`/api/market/${marketId}/credit`, {
          name: form.name,
          phone: form.phone || undefined,
          note: form.note || undefined,
          creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
        })
        toast.success('Veresiye müşterisi eklendi')
      }
      void qc.invalidateQueries({ queryKey: ['market-credit'] })
      void qc.invalidateQueries({ queryKey: ['market-credit-detail'] })
      onOpenChange(false)
      setForm({ name: '', phone: '', note: '', creditLimit: '' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editCustomer ? 'Müşteriyi Düzenle' : 'Veresiye Müşterisi Ekle'}</DialogTitle>
          <DialogDescription>{editCustomer ? 'Bilgileri güncelleyin' : 'Borç defterine yeni kişi kaydet — POS&apos;ta veresiye ödemesi bu kişiye bağlanır'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Ad Soyad / İşletme *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Örn: Kahveci Mehmet" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Telefon (hatırlatma için)</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0532..." className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Kredi Limiti (₺)</Label>
              <Input type="number" min={0} value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} placeholder="Boş = limitsiz" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Not</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Mahalle, iş yeri..." className="mt-1" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button className="bg-violet-600 hover:bg-violet-700 text-white" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Kaydediliyor...' : editCustomer ? 'Güncelle' : 'Ekle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Müşteri cari detay (sheet) — hareket defteri + borç/ödeme girişi
// ============================================================

function CustomerDetailSheet({ marketId, customerId, onClose, onEdit }: {
  marketId: string; customerId: string; onClose: () => void
  onEdit: (info: { id: string; name: string; phone: string | null; note: string | null; creditLimit: number | null }) => void
}) {
  const qc = useQueryClient()
  const [entryType, setEntryType] = useState<'odeme' | 'borc'>('odeme')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('nakit')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: detail, isLoading } = useQuery<CustomerDetail>({
    queryKey: ['market-credit-detail', marketId, customerId],
    queryFn: () => apiGet(`/api/market/${marketId}/credit/${customerId}`),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['market-credit-detail'] })
    void qc.invalidateQueries({ queryKey: ['market-credit'] })
  }

  const addEntry = async () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) { toast.error('Tutar girin'); return }
    if (entryType === 'borc' && dueDate && isNaN(new Date(dueDate).getTime())) { toast.error('Geçersiz vade tarihi'); return }
    setSaving(true)
    try {
      await apiPost(`/api/market/${marketId}/credit/${customerId}`, {
        type: entryType,
        amount: amt,
        method: entryType === 'odeme' ? method : undefined,
        dueDate: entryType === 'borc' && dueDate ? new Date(dueDate).toISOString() : undefined,
        note: note || undefined,
      })
      toast.success(entryType === 'odeme' ? 'Ödeme kaydedildi' : 'Borç kaydedildi')
      setAmount(''); setNote(''); setDueDate('')
      invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async () => {
    if (!detail) return
    try {
      await apiPatch(`/api/market/${marketId}/credit/${customerId}`, { isActive: !detail.isActive })
      toast.success(detail.isActive ? 'Müşteri pasifleştirildi' : 'Müşteri aktifleştirildi')
      invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    }
  }

  const detailCustomer = detail as (CustomerDetail & { name?: string; phone?: string | null; note?: string | null; creditLimit?: number | null; isActive?: boolean; balance?: number }) | undefined

  const reminderText = detailCustomer
    ? `Merhaba ${detailCustomer.name}, defterimize göre ${formatCurrency(detailCustomer.balance ?? 0)} borcunuz bulunmaktadır. Uygun olduğunda geçirebilirseniz memnun oluruz. Teşekkürler 🙏`
    : ''

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto custom-scroll p-0">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <UserRound className="w-5 h-5 text-violet-600" />
            {isLoading ? 'Yükleniyor...' : detailCustomer?.name}
          </SheetTitle>
          {detailCustomer && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
              <span className="font-semibold text-base text-foreground">
                Bakiye: <span className={cn((detailCustomer.balance ?? 0) > 0 ? 'text-amber-700 dark:text-amber-400' : (detailCustomer.balance ?? 0) < 0 ? 'text-emerald-700 dark:text-emerald-400' : '')}>
                  {formatCurrency(detailCustomer.balance ?? 0)}
                </span>
              </span>
              {detailCustomer.creditLimit != null && <span>· Limit {formatCurrency(detailCustomer.creditLimit)}</span>}
              {detailCustomer.phone && (
                <>
                  <span>· <a className="underline" href={`tel:${detailCustomer.phone}`}>{detailCustomer.phone}</a></span>
                  <a href={whatsappLink(detailCustomer.phone, reminderText)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp hatırlat
                  </a>
                </>
              )}
              <button className="underline hover:text-foreground" onClick={() => onEdit({ id: customerId, name: detailCustomer.name ?? '', phone: detailCustomer.phone ?? null, note: detailCustomer.note ?? null, creditLimit: detailCustomer.creditLimit ?? null })}>düzenle</button>
              <button className={cn('underline hover:text-foreground', detailCustomer.isActive && 'text-red-600')} onClick={() => void toggleActive()}>
                {detailCustomer.isActive ? 'pasifleştir' : 'aktifleştir'}
              </button>
            </div>
          )}
        </SheetHeader>

        <div className="px-4 space-y-4 pb-8">
          {/* Hızlı hareket girişi */}
          <Card className="border shadow-sm">
            <CardContent className="p-3 space-y-2.5">
              <div className="flex gap-1.5">
                <Button size="sm" variant={entryType === 'odeme' ? 'default' : 'outline'}
                  className={cn('flex-1 h-9', entryType === 'odeme' && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
                  onClick={() => setEntryType('odeme')}>
                  <ArrowDownCircle className="w-4 h-4 mr-1.5" /> Ödeme Aldı
                </Button>
                <Button size="sm" variant={entryType === 'borc' ? 'default' : 'outline'}
                  className={cn('flex-1 h-9', entryType === 'borc' && 'bg-amber-600 hover:bg-amber-700 text-white')}
                  onClick={() => setEntryType('borc')}>
                  <ArrowUpCircle className="w-4 h-4 mr-1.5" /> Borç Yaz
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Tutar (₺) *</Label>
                  <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" placeholder="0" />
                </div>
                {entryType === 'odeme' ? (
                  <div>
                    <Label className="text-xs">Yöntem</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nakit">Nakit</SelectItem>
                        <SelectItem value="kart">Kart</SelectItem>
                        <SelectItem value="havale">Havale/EFT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs">Vade (opsiyonel)</Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
                  </div>
                )}
              </div>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (opsiyonel)" className="h-9" />
              <Button className="w-full h-9 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => void addEntry()} disabled={saving || !amount}>
                {saving ? 'Kaydediliyor...' : entryType === 'odeme' ? 'Ödemeyi Kaydet' : 'Borcu Kaydet'}
              </Button>
            </CardContent>
          </Card>

          {/* Hareket defteri */}
          <div>
            <div className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-violet-600" /> Hareket Defteri
            </div>
            {isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
            ) : !detailCustomer?.entries?.length ? (
              <Card className="border-dashed"><CardContent className="py-6 text-center text-sm text-muted-foreground">Henüz hareket yok</CardContent></Card>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scroll pr-1">
                {detailCustomer.entries.map((e) => (
                  <div key={e.id} className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2',
                    e.type === 'borc' ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20' : 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20')}>
                    {e.type === 'borc'
                      ? <ArrowUpCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      : <ArrowDownCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        {e.type === 'borc' ? 'Borç' : `Ödeme${e.method ? ` · ${METHOD_LABELS[e.method] ?? e.method}` : ''}`}
                        {e.refSaleNumber && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">POS {e.refSaleNumber}</Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDateTime(e.createdAt)}
                        {e.dueDate && ` · vade ${formatDateTime(e.dueDate)}`}
                        {e.note && ` · ${e.note}`}
                      </div>
                    </div>
                    <span className={cn('text-sm font-bold tabular-nums shrink-0', e.type === 'borc' ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>
                      {e.type === 'borc' ? '+' : '−'}{formatCurrency(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* İpucu */}
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground">
            <HandCoins className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            POS&apos;ta ödeme adımında &quot;Veresiye&quot; seçilerek yapılan satışlar bu deftere otomatik borç olarak işlenir.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
