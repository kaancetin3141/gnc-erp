'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate, toCSV, downloadFile } from '@/lib/format'
import { Plus, Pencil, Trash2, Download, TrendingDown, Receipt, Building2, Zap, Users, Megaphone, Shield, FileText, Package, Wallet } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CashTab } from '@/components/cash/cash-tab'

interface Expense {
  id: string
  category: string
  description: string
  amount: number
  currency: string
  date: string
  recurring: string | null
  vendor: string | null
  invoiceNo: string | null
  status: string
  createdAt: string
}

const CATEGORIES = [
  { value: 'kira', label: 'Kira', icon: Building2, color: 'text-violet-600 bg-violet-50' },
  { value: 'personel', label: 'Personel', icon: Users, color: 'text-emerald-600 bg-emerald-50' },
  { value: 'fatura', label: 'Fatura', icon: Zap, color: 'text-amber-600 bg-amber-50' },
  { value: 'malzeme', label: 'Malzeme', icon: Package, color: 'text-sky-600 bg-sky-50' },
  { value: 'pazarlama', label: 'Pazarlama', icon: Megaphone, color: 'text-rose-600 bg-rose-50' },
  { value: 'sigorta', label: 'Sigorta', icon: Shield, color: 'text-teal-600 bg-teal-50' },
  { value: 'vergi', label: 'Vergi', icon: FileText, color: 'text-slate-600 bg-slate-50' },
  { value: 'diger', label: 'Diğer', icon: Receipt, color: 'text-indigo-600 bg-indigo-50' },
] as const

const STATUSES = [
  { value: 'odendi', label: 'Ödendi', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'beklemedi', label: 'Beklemede', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'odeme_yapilmedi', label: 'Ödenmedi', color: 'text-red-600 bg-red-50 border-red-200' },
] as const

export function ExpensesView() {
  const qc = useQueryClient()
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<Expense | null>(null)
  const [topTab, setTopTab] = useState('expenses')

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', filterCategory, filterStatus],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filterCategory) params.set('category', filterCategory)
      if (filterStatus) params.set('status', filterStatus)
      return apiGet<{ items: Expense[]; total: number; totalAmount: number; byCategory: Record<string, number> }>(`/api/expenses?${params}`)
    },
  })

  const expenses = data?.items ?? []
  const totalAmount = data?.totalAmount ?? 0
  const byCategory = data?.byCategory ?? {}

  const handleExport = () => {
    const rows = expenses.map((e) => ({
      'Tarih': formatDate(e.date),
      'Kategori': CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category,
      'Açıklama': e.description,
      'Tutar': e.amount,
      'Para Birimi': e.currency,
      'Tedarikçi': e.vendor ?? '',
      'Fatura No': e.invoiceNo ?? '',
      'Durum': STATUSES.find((s) => s.value === e.status)?.label ?? e.status,
      'Tekrarlayan': e.recurring ?? '',
    }))
    downloadFile(toCSV(rows), 'giderler.csv')
    toast.success('Giderler dışa aktarıldı')
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gider Yönetimi</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Şirket giderlerini takip edin ve raporlayın</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={expenses.length === 0}>
            <Download className="w-4 h-4 mr-1.5" /> Dışa Aktar
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditItem(null); setAddOpen(true) }}>
            <Plus className="w-4 h-4 mr-1.5" /> Gider Ekle
          </Button>
        </div>
      </div>

      <Tabs value={topTab} onValueChange={setTopTab}>
        <TabsList className="max-w-md">
          <TabsTrigger value="expenses" className="text-xs"><Receipt className="w-3.5 h-3.5 mr-1" /> Giderler</TabsTrigger>
          <TabsTrigger value="cash" className="text-xs"><Wallet className="w-3.5 h-3.5 mr-1" /> Kasa & Banka</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-5 mt-3">

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Toplam Gider</span>
            </div>
            <div className="text-xl font-bold tabular-nums text-red-600">{formatCurrency(totalAmount)}</div>
          </CardContent>
        </Card>
        {CATEGORIES.slice(0, 3).map((cat) => (
          <Card key={cat.value} className="shadow-soft">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className={cn('w-6 h-6 rounded-md flex items-center justify-center', cat.color)}>
                  <cat.icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs text-muted-foreground">{cat.label}</span>
              </div>
              <div className="text-xl font-bold tabular-nums">{formatCurrency(byCategory[cat.value] ?? 0)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterCategory || '__none__'} onValueChange={(v) => setFilterCategory(v === '__none__' ? '' : v)}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Kategori" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Tüm Kategoriler</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus || '__none__'} onValueChange={(v) => setFilterStatus(v === '__none__' ? '' : v)}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Durum" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Tüm Durumlar</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="shadow-soft">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : expenses.length === 0 ? (
            <div className="py-12 text-center">
              <Receipt className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Henüz gider kaydı yok</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60 border-b-2">
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Tarih</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Kategori</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Açıklama</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Tedarikçi</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right">Tutar</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Durum</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => {
                    const cat = CATEGORIES.find((c) => c.value === e.category)
                    const st = STATUSES.find((s) => s.value === e.status)
                    return (
                      <TableRow key={e.id} className="text-sm table-row-hover even:bg-muted/20">
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(e.date)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px]', cat?.color ?? '')}>
                            {cat?.label ?? e.category}
                          </Badge>
                          {e.recurring && <span className="ml-1 text-[10px] text-muted-foreground">↻ {e.recurring}</span>}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{e.description}</TableCell>
                        <TableCell className="text-muted-foreground">{e.vendor ?? '—'}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-red-600">{formatCurrency(e.amount, e.currency)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px]', st?.color ?? '')}>
                            {st?.label ?? e.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditItem(e); setAddOpen(true) }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 hover:text-red-600"
                            onClick={async () => {
                              try {
                                await apiDelete(`/api/expenses/${e.id}`)
                                toast.success('Gider silindi')
                                qc.invalidateQueries({ queryKey: ['expenses'] })
                              } catch { toast.error('Silme başarısız') }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
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

        </TabsContent>

        {/* Kasa & Banka */}
        <TabsContent value="cash" className="mt-3">
          <CashTab />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      {addOpen && (
        <ExpenseDialog
          item={editItem}
          open={addOpen}
          onOpenChange={(v) => { setAddOpen(v); if (!v) setEditItem(null) }}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['expenses'] })}
        />
      )}
    </div>
  )
}

function ExpenseDialog({ item, open, onOpenChange, onSuccess }: {
  item: Expense | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    category: item?.category || 'diger',
    description: item?.description || '',
    amount: item?.amount?.toString() || '',
    currency: item?.currency || 'TRY',
    date: item?.date ? new Date(item.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    recurring: item?.recurring || '',
    vendor: item?.vendor || '',
    invoiceNo: item?.invoiceNo || '',
    status: item?.status || 'odendi',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.description || !form.amount) { toast.error('Açıklama ve tutar gerekli'); return }
    setSaving(true)
    try {
      const body = { ...form, amount: parseFloat(form.amount), recurring: form.recurring || null }
      if (item) {
        await apiPatch(`/api/expenses/${item.id}`, body)
        toast.success('Gider güncellendi')
      } else {
        await apiPost('/api/expenses', body)
        toast.success('Gider eklendi')
      }
      onSuccess()
      onOpenChange(false)
    } catch (e) {
      toast.error('Kaydetme başarısız', { description: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? 'Gider Düzenle' : 'Yeni Gider'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Kategori</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Durum</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Açıklama</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Gider açıklaması" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tutar</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="tabular-nums" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Para Birimi</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRY">₺ TRY</SelectItem>
                  <SelectItem value="USD">$ USD</SelectItem>
                  <SelectItem value="EUR">€ EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tarih</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tedarikçi</Label>
              <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Firma adı" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fatura No</Label>
              <Input value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} placeholder="Fatura/irsaliye no" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tekrarlayan Gider</Label>
            <Select value={form.recurring || '__none__'} onValueChange={(v) => setForm({ ...form, recurring: v === '__none__' ? '' : v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Tekrarlamıyor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Tekrarlamıyor</SelectItem>
                <SelectItem value="weekly">Haftalık</SelectItem>
                <SelectItem value="monthly">Aylık</SelectItem>
                <SelectItem value="yearly">Yıllık</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
