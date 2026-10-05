'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { formatCurrency, formatDate } from '@/lib/format'
import { Plus, Ticket, PackageX, MinusCircle, CalendarClock, Users, Wallet, Search, TicketCheck } from 'lucide-react'

interface MembershipPackage {
  id: string
  name: string
  description: string | null
  price: number
  currency: string
  sessionCount: number // 0 = sınırsız
  validityDays: number
  active: boolean
  _count?: { packages: number }
}

interface MemberSubscription {
  id: string
  packageId: string
  package: { id: string; name: string; sessionCount: number; price: number }
  customerName: string
  customerPhone: string | null
  startDate: string
  expiryDate: string
  sessionsTotal: number
  sessionsUsed: number
  pricePaid: number
  status: string
  notes: string | null
  usages?: { id: string; usedAt: string; note: string | null }[]
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  aktif: { label: 'Aktif', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  bitti: { label: 'Seanslar Bitti', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  suresi_doldu: { label: 'Süresi Doldu', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400' },
  iptal: { label: 'İptal', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400' },
}

function remainingLabel(s: MemberSubscription) {
  if (s.sessionsTotal === 0) return 'Sınırsız'
  const left = s.sessionsTotal - s.sessionsUsed
  return left <= 0 ? 'Kalmadı' : `${left} seans`
}

export function MembershipTab() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('subscriptions')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [pkgOpen, setPkgOpen] = useState(false)
  const [sellOpen, setSellOpen] = useState(false)
  const [sellFor, setSellFor] = useState<MembershipPackage | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Paket formu
  const [pkgForm, setPkgForm] = useState({ name: '', description: '', price: '', sessionCount: '4', validityDays: '30' })
  // Satış formu
  const [sellForm, setSellForm] = useState({ customerName: '', customerPhone: '', notes: '' })

  const { data: pkgData, isLoading: pkgLoading } = useQuery({
    queryKey: ['membership-packages'],
    queryFn: () => apiGet<{ items: MembershipPackage[] }>('/api/membership/packages'),
  })

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ['membership-subscriptions', statusFilter, search],
    queryFn: () =>
      apiGet<{ items: MemberSubscription[] }>(
        `/api/membership/subscriptions?status=${encodeURIComponent(statusFilter)}&q=${encodeURIComponent(search)}`,
      ),
  })

  const packages = pkgData?.items ?? []
  const subs = subData?.items ?? []
  const activeCount = subs.filter((s) => s.status === 'aktif').length
  const expiringSoon = subs.filter((s) => {
    if (s.status !== 'aktif') return false
    const days = (new Date(s.expiryDate).getTime() - Date.now()) / 86400000
    return days <= 7
  }).length
  const monthlyRevenue = subs
    .filter((s) => new Date(s.startDate).getTime() > Date.now() - 30 * 86400000)
    .reduce((sum, s) => sum + (s.pricePaid || 0), 0)

  async function createPackage() {
    if (!pkgForm.name.trim()) return toast.error('Paket adı gerekli')
    setBusy('pkg')
    try {
      await apiPost('/api/membership/packages', {
        name: pkgForm.name,
        description: pkgForm.description,
        price: parseFloat(pkgForm.price || '0'),
        sessionCount: parseInt(pkgForm.sessionCount || '0'), // 0 = sınırsız
        validityDays: parseInt(pkgForm.validityDays || '30'),
      })
      toast.success('Paket oluşturuldu')
      setPkgOpen(false)
      setPkgForm({ name: '', description: '', price: '', sessionCount: '4', validityDays: '30' })
      qc.invalidateQueries({ queryKey: ['membership-packages'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Paket oluşturulamadı')
    } finally {
      setBusy(null)
    }
  }

  async function sellPackage() {
    if (!sellFor) return
    if (!sellForm.customerName.trim()) return toast.error('Müşteri adı gerekli')
    setBusy('sell')
    try {
      const sub = await apiPost<MemberSubscription>('/api/membership/subscriptions', {
        packageId: sellFor.id,
        customerName: sellForm.customerName,
        customerPhone: sellForm.customerPhone,
        notes: sellForm.notes,
      })
      toast.success(`${sellFor.name} satıldı — ${sub.customerName}`)
      setSellOpen(false)
      setSellFor(null)
      setSellForm({ customerName: '', customerPhone: '', notes: '' })
      qc.invalidateQueries({ queryKey: ['membership-subscriptions'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Paket satılamadı')
    } finally {
      setBusy(null)
    }
  }

  async function consumeSession(sub: MemberSubscription) {
    setBusy(sub.id)
    try {
      await apiPatch(`/api/membership/subscriptions/${sub.id}`, { action: 'use-session' })
      toast.success(`${sub.customerName} için seans düşüldü`)
      qc.invalidateQueries({ queryKey: ['membership-subscriptions'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Seans düşülemedi')
    } finally {
      setBusy(null)
    }
  }

  async function cancelSubscription(sub: MemberSubscription) {
    setBusy(sub.id)
    try {
      await apiPatch(`/api/membership/subscriptions/${sub.id}`, { action: 'cancel' })
      toast.success('Abonelik iptal edildi')
      qc.invalidateQueries({ queryKey: ['membership-subscriptions'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İptal edilemedi')
    } finally {
      setBusy(null)
    }
  }

  async function extendSubscription(sub: MemberSubscription) {
    setBusy(sub.id)
    try {
      await apiPatch(`/api/membership/subscriptions/${sub.id}`, { action: 'extend', days: 30 })
      toast.success('30 gün uzatıldı')
      qc.invalidateQueries({ queryKey: ['membership-subscriptions'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Uzatılamadı')
    } finally {
      setBusy(null)
    }
  }

  async function togglePackage(pkg: MembershipPackage) {
    setBusy(pkg.id)
    try {
      await apiPatch(`/api/membership/packages/${pkg.id}`, { active: !pkg.active })
      qc.invalidateQueries({ queryKey: ['membership-packages'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusy(null)
    }
  }

  async function deletePackage(pkg: MembershipPackage) {
    if (!confirm(`"${pkg.name}" paketi silinsin mi?`)) return
    setBusy(pkg.id)
    try {
      const res = await apiDelete<{ deactivated?: boolean }>(`/api/membership/packages/${pkg.id}`)
      if (res?.deactivated) toast.info('Satış kaydı olduğu için paket pasifleştirildi')
      else toast.success('Paket silindi')
      qc.invalidateQueries({ queryKey: ['membership-packages'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Özet kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Users className="w-3.5 h-3.5" /> Aktif Abonelik
            </div>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CalendarClock className="w-3.5 h-3.5" /> 7 Gün İçinde Bitiyor
            </div>
            <div className={`text-2xl font-bold ${expiringSoon > 0 ? 'text-amber-600' : ''}`}>{expiringSoon}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Wallet className="w-3.5 h-3.5" /> 30 Günlük Paket Cirosu
            </div>
            <div className="text-2xl font-bold">{formatCurrency(monthlyRevenue)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Ticket className="w-3.5 h-3.5" /> Tanımlı Paket
            </div>
            <div className="text-2xl font-bold">{packages.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="subscriptions" className="text-xs">Satılan Abonelikler</TabsTrigger>
          <TabsTrigger value="packages" className="text-xs">Paket Tanımları</TabsTrigger>
        </TabsList>

        {/* ABONELİK LİSTESİ */}
        <TabsContent value="subscriptions" className="space-y-3 mt-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Müşteri adı / telefon ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="Durum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm durumlar</SelectItem>
                <SelectItem value="aktif">Aktif</SelectItem>
                <SelectItem value="bitti">Seanslar bitti</SelectItem>
                <SelectItem value="suresi_doldu">Süresi doldu</SelectItem>
                <SelectItem value="iptal">İptal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="shadow-soft">
            <CardContent className="p-0">
              {subLoading ? (
                <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : subs.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  <Ticket className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Henüz paket satışı yok. <b>Paket Tanımları</b> sekmesinden paket ekleyip satış yapabilirsiniz.
                </div>
              ) : (
                <div className="max-h-[480px] overflow-y-auto custom-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Müşteri</TableHead>
                        <TableHead>Paket</TableHead>
                        <TableHead className="hidden md:table-cell">Kalan Seans</TableHead>
                        <TableHead className="hidden md:table-cell">Bitiş</TableHead>
                        <TableHead>Durum</TableHead>
                        <TableHead className="text-right">İşlem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subs.map((s) => {
                        const meta = STATUS_META[s.status] ?? STATUS_META.iptal
                        const daysLeft = Math.ceil((new Date(s.expiryDate).getTime() - Date.now()) / 86400000)
                        const canUse = s.status === 'aktif' && (s.sessionsTotal === 0 || s.sessionsUsed < s.sessionsTotal)
                        return (
                          <TableRow key={s.id}>
                            <TableCell>
                              <div className="font-medium text-sm">{s.customerName}</div>
                              <div className="text-[11px] text-muted-foreground">{s.customerPhone || '—'}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{s.package.name}</div>
                              <div className="text-[11px] text-muted-foreground">{formatCurrency(s.pricePaid)}</div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className={`text-sm font-medium ${s.sessionsTotal > 0 && s.sessionsTotal - s.sessionsUsed <= 1 ? 'text-amber-600' : ''}`}>
                                {remainingLabel(s)}
                              </span>
                              {s.sessionsTotal > 0 && (
                                <div className="text-[10px] text-muted-foreground">{s.sessionsUsed}/{s.sessionsTotal} kullanıldı</div>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="text-sm">{formatDate(s.expiryDate)}</div>
                              {s.status === 'aktif' && (
                                <div className={`text-[10px] ${daysLeft <= 7 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                                  {daysLeft < 0 ? 'süresi geçti' : `${daysLeft} gün kaldı`}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] border-0 ${meta.cls}`}>{meta.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {canUse && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy === s.id} onClick={() => consumeSession(s)}>
                                    <MinusCircle className="w-3 h-3 mr-1" /> Seans Düş
                                  </Button>
                                )}
                                {s.status === 'aktif' && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy === s.id} onClick={() => extendSubscription(s)} title="30 gün uzat">
                                    <CalendarClock className="w-3 h-3" />
                                  </Button>
                                )}
                                {(s.status === 'aktif' || s.status === 'suresi_doldu') && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-rose-600" disabled={busy === s.id} onClick={() => cancelSubscription(s)} title="İptal">
                                    <PackageX className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
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

        {/* PAKET TANIMLARI */}
        <TabsContent value="packages" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setPkgOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Yeni Paket
            </Button>
          </div>
          {pkgLoading ? (
            <div className="grid md:grid-cols-3 gap-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
          ) : packages.length === 0 ? (
            <Card className="shadow-soft">
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                <TicketCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                Henüz paket tanımlanmamış. &quot;Yeni Paket&quot; ile ilk paketinizi oluşturun.
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {packages.map((p) => (
                <Card key={p.id} className={`shadow-soft ${!p.active ? 'opacity-60' : ''}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <Badge className={`text-[10px] border-0 ${p.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-slate-200 text-slate-600'}`}>
                        {p.active ? 'Satışta' : 'Pasif'}
                      </Badge>
                    </div>
                    {p.description && <CardDescription className="text-xs line-clamp-2">{p.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-xl font-bold text-emerald-600">{formatCurrency(p.price)}</div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{p.sessionCount === 0 ? '∞ sınırsız seans' : `${p.sessionCount} seans`}</span>
                      <span>{p.validityDays} gün geçerli</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{p._count?.packages ?? 0} satış</div>
                    <div className="flex gap-1 pt-1">
                      <Button size="sm" className="h-7 text-[11px] flex-1" disabled={!p.active} onClick={() => { setSellFor(p); setSellOpen(true) }}>
                        Satış Yap
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={busy === p.id} onClick={() => togglePackage(p)}>
                        {p.active ? 'Pasifleştir' : 'Aktifleştir'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] text-rose-600" disabled={busy === p.id} onClick={() => deletePackage(p)}>
                        <PackageX className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* YENİ PAKET DİALOGU */}
      <Dialog open={pkgOpen} onOpenChange={setPkgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Paket Tanımla</DialogTitle>
            <DialogDescription>Müşterilere satacağınız seans paketini tanımlayın.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Paket Adı *</Label>
              <Input value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} placeholder="Örn: 4 Seans Saç Bakımı" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Açıklama</Label>
              <Textarea rows={2} value={pkgForm.description} onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })} placeholder="Paket içeriği…" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Fiyat (₺) *</Label>
                <Input type="number" min="0" value={pkgForm.price} onChange={(e) => setPkgForm({ ...pkgForm, price: e.target.value })} placeholder="1500" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Seans *</Label>
                <Input type="number" min="0" value={pkgForm.sessionCount} onChange={(e) => setPkgForm({ ...pkgForm, sessionCount: e.target.value })} />
                <p className="text-[10px] text-muted-foreground">0 = sınırsız</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Geçerlilik (gün) *</Label>
                <Input type="number" min="1" value={pkgForm.validityDays} onChange={(e) => setPkgForm({ ...pkgForm, validityDays: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPkgOpen(false)}>Vazgeç</Button>
            <Button onClick={createPackage} disabled={busy === 'pkg'}>
              {busy === 'pkg' ? 'Kaydediliyor…' : 'Paket Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PAKET SATIŞ DİALOGU */}
      <Dialog open={sellOpen} onOpenChange={(v) => { setSellOpen(v); if (!v) setSellFor(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Paket Satışı</DialogTitle>
            <DialogDescription>
              {sellFor ? `${sellFor.name} — ${formatCurrency(sellFor.price)}, ${sellFor.sessionCount === 0 ? 'sınırsız' : sellFor.sessionCount + ' seans'}, ${sellFor.validityDays} gün` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Müşteri Adı *</Label>
              <Input value={sellForm.customerName} onChange={(e) => setSellForm({ ...sellForm, customerName: e.target.value })} placeholder="Ad Soyad" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefon</Label>
              <Input value={sellForm.customerPhone} onChange={(e) => setSellForm({ ...sellForm, customerPhone: e.target.value })} placeholder="05xx…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Not</Label>
              <Input value={sellForm.notes} onChange={(e) => setSellForm({ ...sellForm, notes: e.target.value })} placeholder="Opsiyonel not…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSellOpen(false); setSellFor(null) }}>Vazgeç</Button>
            <Button onClick={sellPackage} disabled={busy === 'sell'}>
              {busy === 'sell' ? 'Satılıyor…' : 'Satışı Tamamla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
