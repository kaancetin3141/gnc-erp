'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { formatDate } from '@/lib/format'
import { Star, Search, Coins, Gift, Plus, ArrowDown, ArrowUp, Pencil } from 'lucide-react'

interface LoyaltyAccount {
  id: string
  name: string
  phone: string | null
  points: number
  _count?: { transactions: number }
}

interface LoyaltyTransaction {
  id: string
  type: string // kazanma | harcama | duzeltme
  points: number
  note: string | null
  createdAt: string
}

const TYPE_META: Record<string, { label: string; cls: string }> = {
  kazanma: { label: 'Kazanma', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  harcama: { label: 'Harcama', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400' },
  duzeltme: { label: 'Düzeltme', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
}

export function LoyaltyTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailFor, setDetailFor] = useState<LoyaltyAccount | null>(null)
  const [redeemFor, setRedeemFor] = useState<LoyaltyAccount | null>(null)
  const [adjustFor, setAdjustFor] = useState<LoyaltyAccount | null>(null)

  const [createForm, setCreateForm] = useState({ name: '', phone: '' })
  const [redeemPoints, setRedeemPoints] = useState('')
  const [adjustPoints, setAdjustPoints] = useState('')
  const [adjustNote, setAdjustNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['loyalty-accounts', search],
    queryFn: () => apiGet<{ items: LoyaltyAccount[]; totalPoints: number }>(`/api/loyalty/accounts?q=${encodeURIComponent(search)}`),
  })

  const { data: detail } = useQuery({
    queryKey: ['loyalty-detail', detailFor?.id],
    queryFn: () => apiGet<LoyaltyAccount & { transactions: LoyaltyTransaction[] }>(`/api/loyalty/accounts/${detailFor!.id}`),
    enabled: !!detailFor,
  })

  const accounts = data?.items ?? []

  async function createAccount() {
    if (!createForm.name.trim()) return toast.error('Müşteri adı gerekli')
    setBusy('create')
    try {
      await apiPost('/api/loyalty/accounts', createForm)
      toast.success('Sadakat hesabı açıldı')
      setCreateOpen(false)
      setCreateForm({ name: '', phone: '' })
      qc.invalidateQueries({ queryKey: ['loyalty-accounts'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Açılamadı')
    } finally {
      setBusy(null)
    }
  }

  async function redeem() {
    if (!redeemFor) return
    const pts = parseInt(redeemPoints)
    if (isNaN(pts) || pts <= 0) return toast.error('Geçerli puan girin')
    setBusy('redeem')
    try {
      await apiPatch(`/api/loyalty/accounts/${redeemFor.id}`, { action: 'redeem', points: pts })
      toast.success(`${pts} puan harcandı`)
      setRedeemFor(null)
      setRedeemPoints('')
      qc.invalidateQueries({ queryKey: ['loyalty-accounts'] })
      qc.invalidateQueries({ queryKey: ['loyalty-detail'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Puan harcanamadı')
    } finally {
      setBusy(null)
    }
  }

  async function adjust() {
    if (!adjustFor) return
    const pts = parseInt(adjustPoints)
    if (isNaN(pts) || pts === 0) return toast.error('Geçerli puan girin (+/-)')
    setBusy('adjust')
    try {
      await apiPatch(`/api/loyalty/accounts/${adjustFor.id}`, { action: 'adjust', points: pts, note: adjustNote })
      toast.success('Puan güncellendi')
      setAdjustFor(null)
      setAdjustPoints('')
      setAdjustNote('')
      qc.invalidateQueries({ queryKey: ['loyalty-accounts'] })
      qc.invalidateQueries({ queryKey: ['loyalty-detail'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Özet */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="shadow-soft bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-100 dark:border-amber-900/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Coins className="w-3.5 h-3.5" /> Dağıtılmış Toplam Puan
            </div>
            <div className="text-2xl font-bold text-amber-600">{isLoading ? '…' : (data?.totalPoints ?? 0).toLocaleString('tr-TR')}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Star className="w-3.5 h-3.5" /> Sadakat Hesabı
            </div>
            <div className="text-2xl font-bold">{isLoading ? '…' : accounts.length}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 mb-1 font-medium text-foreground">
              <Gift className="w-3.5 h-3.5 text-emerald-600" /> Nasıl çalışır?
            </div>
            Kasada müşteri adı girilen her <b>100 TL&apos;lik satış</b> otomatik <b>1 puan</b> kazandırır. Puanlar buradan harcanır.
          </CardContent>
        </Card>
      </div>

      {/* Arama + ekleme */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Müşteri ara…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Manuel Hesap
        </Button>
      </div>

      {/* Hesap listesi */}
      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : accounts.length === 0 ? (
        <Card className="shadow-soft">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
            Henüz sadakat hesabı yok. Kasada müşteri adıyla satış yapıldığında hesap otomatik oluşur.
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((a) => (
            <Card key={a.id} className="shadow-soft">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground">{a.phone || 'telefon yok'}</div>
                  </div>
                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-0 gap-1 shrink-0">
                    <Star className="w-3 h-3" /> {a.points.toLocaleString('tr-TR')} puan
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" className="h-7 text-[11px] flex-1" disabled={a.points <= 0} onClick={() => setRedeemFor(a)}>
                    <ArrowDown className="w-3 h-3 mr-1" /> Puan Harca
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDetailFor(a)}>
                    Geçmiş
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setAdjustFor(a)} title="Manuel düzeltme">
                    <Pencil className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* MANUEL HESAP */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Manuel Sadakat Hesabı</DialogTitle>
            <DialogDescription>POS dışında da hesap açabilirsiniz.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Müşteri Adı *</Label>
              <Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefon</Label>
              <Input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Vazgeç</Button>
            <Button onClick={createAccount} disabled={busy === 'create'}>{busy === 'create' ? 'Açılıyor…' : 'Hesap Aç'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PUAN HARCA */}
      <Dialog open={!!redeemFor} onOpenChange={(v) => { if (!v) setRedeemFor(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Puan Harca</DialogTitle>
            <DialogDescription>{redeemFor?.name} — mevcut: {redeemFor?.points.toLocaleString('tr-TR')} puan</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Harcanacak Puan *</Label>
            <Input type="number" min="1" max={redeemFor?.points} value={redeemPoints} onChange={(e) => setRedeemPoints(e.target.value)} />
            <div className="flex gap-1 pt-1">
              {[50, 100, 250].filter((p) => p <= (redeemFor?.points ?? 0)).map((p) => (
                <Button key={p} size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setRedeemPoints(String(p))}>{p}</Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemFor(null)}>Vazgeç</Button>
            <Button onClick={redeem} disabled={busy === 'redeem'}>{busy === 'redeem' ? 'Harceniyor…' : 'Puanı Harca'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MANUEL DÜZELTME */}
      <Dialog open={!!adjustFor} onOpenChange={(v) => { if (!v) setAdjustFor(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Puan Düzeltme</DialogTitle>
            <DialogDescription>{adjustFor?.name} — mevcut: {adjustFor?.points.toLocaleString('tr-TR')} puan. Pozitif ekle, negatif düş.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Puan (+/-) *</Label>
              <Input type="number" value={adjustPoints} onChange={(e) => setAdjustPoints(e.target.value)} placeholder="+100 veya -50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Not</Label>
              <Input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Sebep…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustFor(null)}>Vazgeç</Button>
            <Button onClick={adjust} disabled={busy === 'adjust'}>{busy === 'adjust' ? 'Güncelleniyor…' : 'Uygula'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GEÇMİŞ */}
      <Dialog open={!!detailFor} onOpenChange={(v) => { if (!v) setDetailFor(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{detailFor?.name} — Puan Geçmişi</DialogTitle>
            <DialogDescription>Mevcut bakiye: {(detail?.points ?? detailFor?.points ?? 0).toLocaleString('tr-TR')} puan</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto custom-scroll space-y-1.5">
            {(detail?.transactions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Hareket yok.</p>
            ) : (
              detail?.transactions.map((t) => {
                const meta = TYPE_META[t.type] ?? TYPE_META.duzeltme
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge className={`text-[9px] border-0 ${meta.cls}`}>{meta.label}</Badge>
                        <span className="text-[10px] text-muted-foreground">{formatDate(t.createdAt)}</span>
                      </div>
                      {t.note && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{t.note}</div>}
                    </div>
                    <div className={`flex items-center gap-0.5 text-sm font-bold shrink-0 ${t.points > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {t.points > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {Math.abs(t.points)}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
