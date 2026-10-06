'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/format'
import { Plus, Landmark, Wallet, ArrowDownCircle, ArrowUpCircle, Trash2, Scale, Lock, ArrowLeftRight } from 'lucide-react'

interface CashAccount {
  id: string
  name: string
  type: string // kasa | banka
  currency: string
  initialBalance: number
  income: number
  outcome: number
  balance: number
  txCount: number
}

interface CashTransaction {
  id: string
  accountId: string
  account: { id: string; name: string; type: string }
  type: string // gelir | gider
  category: string | null
  amount: number
  description: string
  date: string
  refType: string | null
}

const INCOME_CATEGORIES = ['satış', 'tahsilat', 'aidat', 'kira geliri', 'diğer']
const OUTCOME_CATEGORIES = ['gider', 'personel', 'kira', 'fatura', 'malzeme', 'vergi', 'diğer']

export function CashTab() {
  const qc = useQueryClient()
  const [txTypeFilter, setTxTypeFilter] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [txOpen, setTxOpen] = useState(false)
  const [accOpen, setAccOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const [accForm, setAccForm] = useState({ name: '', type: 'kasa', initialBalance: '' })
  const [txForm, setTxForm] = useState({ accountId: '', type: 'gelir', category: 'tahsilat', amount: '', description: '', date: '' })
  const [trOpen, setTrOpen] = useState(false)
  const [trForm, setTrForm] = useState({ fromAccountId: '', toAccountId: '', amount: '', description: '', date: '' })

  const { data: accData, isLoading: accLoading } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: () => apiGet<{ items: CashAccount[]; totalBalance: number }>('/api/cash/accounts'),
  })

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['cash-transactions', txTypeFilter, accountFilter],
    queryFn: () =>
      apiGet<{ items: CashTransaction[]; summary: { income: number; outcome: number; net: number } }>(
        `/api/cash/transactions?type=${txTypeFilter}&accountId=${accountFilter === 'all' ? '' : accountFilter}`,
      ),
  })

  const accounts = accData?.items ?? []
  const txs = txData?.items ?? []

  async function createAccount() {
    if (!accForm.name.trim()) return toast.error('Hesap adı gerekli')
    setBusy('acc')
    try {
      await apiPost('/api/cash/accounts', {
        name: accForm.name,
        type: accForm.type,
        initialBalance: parseFloat(accForm.initialBalance || '0'),
      })
      toast.success('Hesap açıldı')
      setAccOpen(false)
      setAccForm({ name: '', type: 'kasa', initialBalance: '' })
      qc.invalidateQueries({ queryKey: ['cash-accounts'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hesap açılamadı')
    } finally {
      setBusy(null)
    }
  }

  async function createTransaction() {
    if (!txForm.accountId) return toast.error('Hesap seçin')
    if (!txForm.description.trim()) return toast.error('Açıklama gerekli')
    const amount = parseFloat(txForm.amount)
    if (isNaN(amount) || amount <= 0) return toast.error('Geçerli tutar girin')
    setBusy('tx')
    try {
      await apiPost('/api/cash/transactions', {
        accountId: txForm.accountId,
        type: txForm.type,
        category: txForm.category,
        amount,
        description: txForm.description,
        date: txForm.date || undefined,
      })
      toast.success(txForm.type === 'gelir' ? 'Gelir kaydedildi' : 'Gider kaydedildi')
      setTxOpen(false)
      setTxForm({ accountId: '', type: 'gelir', category: 'tahsilat', amount: '', description: '', date: '' })
      qc.invalidateQueries({ queryKey: ['cash-transactions'] })
      qc.invalidateQueries({ queryKey: ['cash-accounts'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setBusy(null)
    }
  }

  async function createTransfer() {
    if (!trForm.fromAccountId || !trForm.toAccountId) return toast.error('Kaynak ve hedef hesap seçin')
    if (trForm.fromAccountId === trForm.toAccountId) return toast.error('Aynı hesap seçilemez')
    if (!trForm.description.trim()) return toast.error('Açıklama gerekli')
    const amount = parseFloat(trForm.amount)
    if (isNaN(amount) || amount <= 0) return toast.error('Geçerli tutar girin')
    setBusy('tr')
    try {
      await apiPost('/api/cash/transfer', {
        fromAccountId: trForm.fromAccountId,
        toAccountId: trForm.toAccountId,
        amount,
        description: trForm.description,
        date: trForm.date || undefined,
      })
      toast.success('Transfer tamamlandı')
      setTrOpen(false)
      setTrForm({ fromAccountId: '', toAccountId: '', amount: '', description: '', date: '' })
      qc.invalidateQueries({ queryKey: ['cash-transactions'] })
      qc.invalidateQueries({ queryKey: ['cash-accounts'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transfer başarısız')
    } finally {
      setBusy(null)
    }
  }

  async function deleteTransaction(tx: CashTransaction) {
    if (!confirm('Hareket silinsin mi?')) return
    setBusy(tx.id)
    try {
      await apiDelete(`/api/cash/transactions/${tx.id}`)
      toast.success('Hareket silindi')
      qc.invalidateQueries({ queryKey: ['cash-transactions'] })
      qc.invalidateQueries({ queryKey: ['cash-accounts'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi')
    } finally {
      setBusy(null)
    }
  }

  function openTx(type: 'gelir' | 'gider') {
    setTxForm((f) => ({ ...f, type, category: type === 'gelir' ? 'tahsilat' : 'gider' }))
    setTxOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Özet */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="shadow-soft bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-100 dark:border-emerald-900/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Scale className="w-3.5 h-3.5" /> Toplam Bakiye
            </div>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {accLoading ? '…' : formatCurrency(accData?.totalBalance ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-600" /> Dönem Geliri
            </div>
            <div className="text-2xl font-bold text-emerald-600">{txLoading ? '…' : formatCurrency(txData?.summary.income ?? 0)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ArrowUpCircle className="w-3.5 h-3.5 text-rose-600" /> Dönem Gideri
            </div>
            <div className="text-2xl font-bold text-rose-600">{txLoading ? '…' : formatCurrency(txData?.summary.outcome ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Hesap kartları */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Hesaplar</h3>
          <Button size="sm" variant="outline" onClick={() => setAccOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Yeni Hesap
          </Button>
        </div>
        {accLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : accounts.length === 0 ? (
          <Card className="shadow-soft">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Henüz hesap yok. Ödenmiş gider kaydedildiğinde &quot;Ana Kasa&quot; otomatik açılır ya da şimdi elle açabilirsiniz.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {accounts.map((a) => (
              <Card key={a.id} className="shadow-soft">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    {a.type === 'banka' ? <Landmark className="w-3.5 h-3.5" /> : <Wallet className="w-3.5 h-3.5" />}
                    <span className="truncate font-medium">{a.name}</span>
                  </div>
                  <div className="text-lg font-bold">{formatCurrency(a.balance)}</div>
                  <div className="flex gap-2 text-[10px] text-muted-foreground mt-1">
                    <span className="text-emerald-600">+{formatCurrency(a.income)}</span>
                    <span className="text-rose-600">-{formatCurrency(a.outcome)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Hareketler */}
      <Card className="shadow-soft">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-3 border-b border-border">
            <div className="flex gap-2">
              <Select value={txTypeFilter} onValueChange={setTxTypeFilter}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="gelir">Gelir</SelectItem>
                  <SelectItem value="gider">Gider</SelectItem>
                </SelectContent>
              </Select>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm hesaplar</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setTrOpen(true)} disabled={accounts.length < 2} title={accounts.length < 2 ? 'Transfer için en az 2 hesap gerekli' : 'Hesaplar arası transfer'}>
                <ArrowLeftRight className="w-3.5 h-3.5 mr-1" /> Transfer
              </Button>
              <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => openTx('gelir')}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Gelir
              </Button>
              <Button size="sm" className="h-8 text-xs bg-rose-600 hover:bg-rose-700" onClick={() => openTx('gider')}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Gider
              </Button>
            </div>
          </div>

          {txLoading ? (
            <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : txs.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
              Henüz kasa hareketi yok.
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto custom-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Açıklama</TableHead>
                    <TableHead className="hidden md:table-cell">Hesap</TableHead>
                    <TableHead className="hidden md:table-cell">Tarih</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txs.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {t.refType === 'transfer' ? (
                            <ArrowLeftRight className="w-4 h-4 text-sky-600 shrink-0" />
                          ) : t.type === 'gelir' ? (
                            <ArrowDownCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <ArrowUpCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{t.description}</div>
                            {t.category && <div className="text-[10px] text-muted-foreground">{t.category}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="text-[10px]">{t.account.name}</Badge>
                        {t.refType && t.refType !== 'manual' && (
                          <Badge variant="outline" className="text-[9px] ml-1 gap-0.5" title="Otomatik oluşturuldu">
                            <Lock className="w-2 h-2" /> oto
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{formatDate(t.date)}</TableCell>
                      <TableCell className={cn('text-right font-medium text-sm', t.refType === 'transfer' ? 'text-sky-600' : t.type === 'gelir' ? 'text-emerald-600' : 'text-rose-600')}>
                        {t.type === 'gelir' ? '+' : '-'}{formatCurrency(t.amount)}
                      </TableCell>
                      <TableCell>
                        {(!t.refType || t.refType === 'manual' || t.refType === 'transfer') && (
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-500" disabled={busy === t.id} onClick={() => deleteTransaction(t)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* YENİ HESAP */}
      <Dialog open={accOpen} onOpenChange={setAccOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Yeni Hesap Aç</DialogTitle>
            <DialogDescription>Kasa veya banka hesabı tanımlayın.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Hesap Adı *</Label>
              <Input value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} placeholder="Örn: Ana Kasa / Ziraat Bankası" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Tip</Label>
                <Select value={accForm.type} onValueChange={(v) => setAccForm({ ...accForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kasa">Kasa</SelectItem>
                    <SelectItem value="banka">Banka</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Açılış Bakiyesi</Label>
                <Input type="number" min="0" value={accForm.initialBalance} onChange={(e) => setAccForm({ ...accForm, initialBalance: e.target.value })} placeholder="0" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccOpen(false)}>Vazgeç</Button>
            <Button onClick={createAccount} disabled={busy === 'acc'}>{busy === 'acc' ? 'Açılıyor…' : 'Hesap Aç'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TRANSFER */}
      <Dialog open={trOpen} onOpenChange={setTrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hesaplar Arası Transfer</DialogTitle>
            <DialogDescription>Kaynak hesaptan hedef hesaba para aktarın. İki hareket de kayıt altına alınır.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Kaynak Hesap (çıkış) *</Label>
              <Select value={trForm.fromAccountId || undefined} onValueChange={(v) => setTrForm({ ...trForm, fromAccountId: v, toAccountId: trForm.toAccountId === v ? '' : trForm.toAccountId })}>
                <SelectTrigger><SelectValue placeholder="Hesap seçin" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} — {formatCurrency(a.balance)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-sky-50 dark:bg-sky-950/30 flex items-center justify-center">
                <ArrowLeftRight className="w-4 h-4 text-sky-600" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hedef Hesap (giriş) *</Label>
              <Select value={trForm.toAccountId || undefined} onValueChange={(v) => setTrForm({ ...trForm, toAccountId: v })}>
                <SelectTrigger><SelectValue placeholder="Hesap seçin" /></SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => a.id !== trForm.fromAccountId).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} — {formatCurrency(a.balance)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Tutar (₺) *</Label>
                <Input type="number" min="0" step="0.01" value={trForm.amount} onChange={(e) => setTrForm({ ...trForm, amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tarih</Label>
                <Input type="date" value={trForm.date} onChange={(e) => setTrForm({ ...trForm, date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Açıklama *</Label>
              <Input value={trForm.description} onChange={(e) => setTrForm({ ...trForm, description: e.target.value })} placeholder="Örn: Kasa teslim / banka yatırma" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrOpen(false)}>Vazgeç</Button>
            <Button className="bg-sky-600 hover:bg-sky-700" onClick={createTransfer} disabled={busy === 'tr'}>
              {busy === 'tr' ? 'Aktarılıyor…' : 'Transfer Et'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* YENİ HAREKET */}
      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{txForm.type === 'gelir' ? 'Gelir Kaydı' : 'Gider Kaydı'}</DialogTitle>
            <DialogDescription>Manuel kasa hareketi ekleyin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Hesap *</Label>
              <Select value={txForm.accountId || undefined} onValueChange={(v) => setTxForm({ ...txForm, accountId: v })}>
                <SelectTrigger><SelectValue placeholder="Hesap seçin" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.type === 'banka' ? 'Banka' : 'Kasa'})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accounts.length === 0 && (
                <p className="text-[11px] text-amber-600">Önce &quot;Yeni Hesap&quot; ile bir hesap açın.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori</Label>
                <Select value={txForm.category} onValueChange={(v) => setTxForm({ ...txForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(txForm.type === 'gelir' ? INCOME_CATEGORIES : OUTCOME_CATEGORIES).map((c) => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toLocaleUpperCase('tr') + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tutar (₺) *</Label>
                <Input type="number" min="0" step="0.01" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Açıklama *</Label>
              <Input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} placeholder="Açıklama…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tarih</Label>
              <Input type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxOpen(false)}>Vazgeç</Button>
            <Button onClick={createTransaction} disabled={busy === 'tx'}>
              {busy === 'tx' ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
