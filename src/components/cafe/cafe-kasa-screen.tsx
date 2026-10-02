'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tabs, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDateTime } from '@/lib/format'
import {
  Receipt, CreditCard, Banknote, Smartphone, CheckCircle2,
  Clock, Bell, X, Table2, User, Coffee, Cookie, GlassWater,
  AlertCircle, Wallet,
} from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

interface OrderItem {
  id: string
  orderId: string
  menuItemId: string | null
  name: string
  qty: number
  unitPrice: number
  status: string
  notes: string | null
  station: string
  menuItem?: { id: string; name: string; photo: string | null; station: string; recipe: string | null } | null
}

interface Payment {
  id: string
  orderId: string
  amount: number
  method: string
  status: string
  createdAt: string
}

interface CafeOrder {
  id: string
  cafeId: string
  tableId: string | null
  table?: { id: string; number: string; status: string } | null
  number: string
  status: string
  type: string
  customerName: string | null
  subtotal: number
  total: number
  createdAt: string
  items?: OrderItem[]
  payments?: Payment[]
}

interface OrdersResponse { items: CafeOrder[] }

const STATION_ICON: Record<string, typeof Coffee> = {
  bar: GlassWater,
  kitchen: Coffee,
  dessert: Cookie,
}

const ITEM_STATUS_LABEL: Record<string, string> = {
  bekliyor: 'Bekliyor',
  hazirlaniyor: 'Hazırlanıyor',
  hazir: 'Hazır',
  servis_edildi: 'Servis Edildi',
}

const METHOD_META: Record<string, { label: string; icon: typeof Banknote; color: string }> = {
  cash: { label: 'Nakit', icon: Banknote, color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30' },
  card: { label: 'Kart', icon: CreditCard, color: 'text-sky-700 bg-sky-50 dark:bg-sky-950/30' },
  online: { label: 'Online', icon: Smartphone, color: 'text-violet-700 bg-violet-50 dark:bg-violet-950/30' },
}

// ============================================================
// Kasa Screen — kasiyer görünümü
// ============================================================

export function CafeKasaScreen({ cafeId }: { cafeId: string }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'open' | 'today'>('open')
  const [payDialog, setPayDialog] = useState<CafeOrder | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'online'>('cash')
  const [paying, setPaying] = useState(false)

  const { data: openData, isLoading: openLoading } = useQuery({
    queryKey: ['cafe-kasa-open', cafeId],
    queryFn: () => apiGet<OrdersResponse>(`/api/cafe/${cafeId}/orders`),
    refetchInterval: 8_000,
  })

  const { data: todayData, isLoading: todayLoading } = useQuery({
    queryKey: ['cafe-kasa-today', cafeId],
    queryFn: () => apiGet<OrdersResponse>(`/api/cafe/${cafeId}/orders?today=1`),
    refetchInterval: 15_000,
  })

  const openOrders = useMemo(() => {
    const all = openData?.items ?? []
    return all.filter((o) => o.status === 'acik' || o.status === 'hazirlaniyor' || o.status === 'hazir')
  }, [openData])

  const todayOrders = useMemo(() => (todayData?.items ?? []), [todayData])

  const summary = useMemo(() => {
    const odendi = todayOrders.filter((o) => o.status === 'odendi')
    const total = odendi.reduce((s, o) => s + o.total, 0)
    let cash = 0, card = 0, online = 0
    for (const o of odendi) {
      for (const p of o.payments ?? []) {
        if (p.status !== 'tamamlandi') continue
        if (p.method === 'cash') cash += p.amount
        else if (p.method === 'card') card += p.amount
        else if (p.method === 'online') online += p.amount
      }
    }
    return {
      count: odendi.length,
      total, cash, card, online,
      openCount: openOrders.length,
    }
  }, [todayOrders, openOrders])

  function openPayDialog(o: CafeOrder) {
    setPayDialog(o)
    const paid = (o.payments ?? []).filter((p) => p.status === 'tamamlandi').reduce((s, p) => s + p.amount, 0)
    const remaining = o.total - paid
    setPayAmount(remaining.toFixed(2))
    setPayMethod('cash')
  }

  async function handlePay() {
    if (!payDialog) return
    const paid = (payDialog.payments ?? []).filter((p) => p.status === 'tamamlandi').reduce((s, p) => s + p.amount, 0)
    const remaining = payDialog.total - paid
    const amount = Number(payAmount)
    if (!amount || amount <= 0) {
      toast.error('Geçerli tutar girin')
      return
    }
    if (amount > remaining + 0.01) {
      toast.error(`Maksimum ${remaining.toFixed(2)} ödeme alınabilir`)
      return
    }
    setPaying(true)
    try {
      const res = await apiPost<{ paidOff: boolean; totalPaid: number; total: number; remaining: number }>(
        `/api/cafe/${payDialog.cafeId}/orders/${payDialog.id}/payments`,
        { amount, method: payMethod },
      )
      qc.invalidateQueries({ queryKey: ['cafe-kasa-open', cafeId] })
      qc.invalidateQueries({ queryKey: ['cafe-kasa-today', cafeId] })
      qc.invalidateQueries({ queryKey: ['cafe-orders', cafeId] })
      qc.invalidateQueries({ queryKey: ['cafe-tables', cafeId] })
      if (res.paidOff) {
        toast.success('Ödeme tamamlandı · Sipariş kapatıldı')
      } else {
        toast.success(`Ödeme alındı · Kalan: ${formatCurrency(res.remaining)}`)
      }
      setPayDialog(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ödeme alınamadı')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Daily summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryCard
          icon={Wallet}
          label="Bugünkü Ciro"
          value={formatCurrency(summary.total)}
          color="emerald"
        />
        <SummaryCard
          icon={Banknote}
          label="Nakit"
          value={formatCurrency(summary.cash)}
          color="emerald"
        />
        <SummaryCard
          icon={CreditCard}
          label="Kart"
          value={formatCurrency(summary.card)}
          color="sky"
        />
        <SummaryCard
          icon={Receipt}
          label="Açık Sipariş"
          value={String(summary.openCount)}
          color="amber"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'open' | 'today')}>
        <TabsList>
          <TabsTrigger value="open" className="text-xs sm:text-sm">
            <Receipt className="w-3.5 h-3.5 mr-1" />
            Açık Siparişler
            {openOrders.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                {openOrders.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="today" className="text-xs sm:text-sm">
            <Clock className="w-3.5 h-3.5 mr-1" />
            Bugün ({summary.count})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Open orders */}
      {tab === 'open' && (
        <>
          {openLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44" />)}
            </div>
          ) : openOrders.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Receipt className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <h3 className="font-semibold mb-1">Açık sipariş yok</h3>
                <p className="text-sm text-muted-foreground">
                  Tüm siparişler ödendi veya iptal edildi.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {openOrders.map((o) => {
                const paid = (o.payments ?? []).filter((p) => p.status === 'tamamlandi').reduce((s, p) => s + p.amount, 0)
                const remaining = o.total - paid
                const readyItems = (o.items ?? []).filter((i) => i.status === 'hazir').length
                const totalItems = (o.items ?? []).length
                const allReady = readyItems === totalItems && totalItems > 0
                return (
                  <Card
                    key={o.id}
                    className={cn(
                      'border-2',
                      allReady ? 'border-emerald-400 dark:border-emerald-700' : 'border-border',
                    )}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-bold text-sm flex items-center gap-1.5">
                            #{o.number}
                            {allReady && (
                              <Badge className="text-[9px] h-4 px-1 bg-emerald-600 text-white border-0">
                                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                HAZIR
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatDateTime(o.createdAt)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(remaining)}
                          </div>
                          {paid > 0 && (
                            <div className="text-[10px] text-muted-foreground line-through">
                              {formatCurrency(o.total)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
                        {o.type === 'dine_in' ? (
                          <>
                            <Table2 className="w-3.5 h-3.5" />
                            Masa {o.table?.number ?? '—'}
                          </>
                        ) : o.type === 'takeaway' ? (
                          <>
                            <Receipt className="w-3.5 h-3.5" />
                            Paket {o.customerName ? `· ${o.customerName}` : ''}
                          </>
                        ) : (
                          <>
                            <User className="w-3.5 h-3.5" />
                            {o.customerName ?? 'Gel-Al'}
                          </>
                        )}
                        <span className="ml-auto">
                          {readyItems}/{totalItems} hazır
                        </span>
                      </div>

                      {/* Items quick list */}
                      <div className="space-y-1 mb-2 max-h-24 overflow-y-auto custom-scroll">
                        {(o.items ?? []).map((it) => {
                          const Icon = STATION_ICON[it.station] ?? Coffee
                          const isReady = it.status === 'hazir' || it.status === 'servis_edildi'
                          return (
                            <div key={it.id} className="flex items-center gap-1.5 text-[11px]">
                              <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className={cn('flex-1 truncate', isReady && 'text-emerald-700 dark:text-emerald-400')}>
                                {it.qty}× {it.name}
                              </span>
                              {isReady ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              ) : it.status === 'hazirlaniyor' ? (
                                <Clock className="w-3 h-3 text-sky-500" />
                              ) : (
                                <Clock className="w-3 h-3 text-amber-500" />
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <Button
                        size="sm"
                        className="w-full bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => openPayDialog(o)}
                      >
                        <Wallet className="w-3.5 h-3.5 mr-1.5" />
                        Ödeme Al
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Today orders */}
      {tab === 'today' && (
        <>
          {todayLoading ? (
            <Card>
              <CardContent className="p-4 space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </CardContent>
            </Card>
          ) : todayOrders.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Clock className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <h3 className="font-semibold mb-1">Bugün sipariş yok</h3>
                <p className="text-sm text-muted-foreground">
                  Bugün oluşturulan sipariş bulunmuyor.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {todayOrders.map((o) => {
                    const paid = (o.payments ?? []).filter((p) => p.status === 'tamamlandi').reduce((s, p) => s + p.amount, 0)
                    const methodColors = (o.payments ?? []).map((p) => METHOD_META[p.method])
                    return (
                      <div key={o.id} className="flex items-center gap-3 p-3 hover:bg-muted/30">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">#{o.number}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[9px] h-4',
                                o.status === 'odendi'
                                  ? 'text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                                  : o.status === 'iptal'
                                    ? 'text-red-700 dark:text-red-400 border-red-300 dark:border-red-800'
                                    : 'text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800',
                              )}
                            >
                              {o.status === 'odendi' ? 'ÖDENDİ' : o.status === 'iptal' ? 'İPTAL' : 'AÇIK'}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {formatDateTime(o.createdAt)} ·{' '}
                            {o.type === 'dine_in' ? `Masa ${o.table?.number ?? '—'}` : o.type === 'takeaway' ? 'Paket' : 'Gel-Al'}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {methodColors.length > 0 && methodColors.map((m, i) => (
                            <m.icon key={i} className={cn('w-3.5 h-3.5', m.color.split(' ')[0])} />
                          ))}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">{formatCurrency(o.total)}</div>
                          {paid > 0 && paid < o.total && (
                            <div className="text-[10px] text-amber-600">
                              Kalan: {formatCurrency(o.total - paid)}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Payment dialog */}
      <Dialog open={!!payDialog} onOpenChange={(o) => { if (!o) setPayDialog(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ödeme Al</DialogTitle>
            <DialogDescription>
              {payDialog && `Sipariş #${payDialog.number}`}
            </DialogDescription>
          </DialogHeader>
          {payDialog && (() => {
            const paid = (payDialog.payments ?? []).filter((p) => p.status === 'tamamlandi').reduce((s, p) => s + p.amount, 0)
            const remaining = payDialog.total - paid
            return (
              <div className="space-y-3">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <div className="text-[10px] uppercase text-muted-foreground">Toplam</div>
                    <div className="text-sm font-bold">{formatCurrency(payDialog.total)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                    <div className="text-[10px] uppercase text-emerald-700 dark:text-emerald-400">Ödenen</div>
                    <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(paid)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                    <div className="text-[10px] uppercase text-amber-700 dark:text-amber-400">Kalan</div>
                    <div className="text-sm font-bold text-amber-700 dark:text-amber-400">{formatCurrency(remaining)}</div>
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-1 max-h-32 overflow-y-auto custom-scroll">
                  {(payDialog.items ?? []).map((it) => (
                    <div key={it.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">{it.qty}× {it.name}</span>
                      <span className="text-muted-foreground ml-2">{formatCurrency(it.unitPrice * it.qty)}</span>
                    </div>
                  ))}
                </div>

                {/* Amount */}
                <div>
                  <Label htmlFor="pay-amount">Ödeme Tutarı (₺)</Label>
                  <Input
                    id="pay-amount"
                    type="number"
                    step="0.5"
                    min={0}
                    max={remaining}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="mt-1"
                    autoFocus
                  />
                  <div className="flex gap-1 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                      onClick={() => setPayAmount(remaining.toFixed(2))}
                    >
                      Tamamı
                    </Button>
                    {[50, 100, 200].map((q) => (
                      <Button
                        key={q}
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => setPayAmount(String(q))}
                      >
                        {q}₺
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Method */}
                <div>
                  <Label>Ödeme Yöntemi</Label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {([
                      { v: 'cash', label: 'Nakit', icon: Banknote },
                      { v: 'card', label: 'Kart', icon: CreditCard },
                      { v: 'online', label: 'Online', icon: Smartphone },
                    ] as const).map((m) => (
                      <button
                        key={m.v}
                        onClick={() => setPayMethod(m.v)}
                        className={cn(
                          'flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all',
                          payMethod === m.v
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                            : 'border-border hover:border-emerald-300',
                        )}
                      >
                        <m.icon className="w-4 h-4" />
                        <span className="text-xs">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)} disabled={paying}>İptal</Button>
            <Button
              onClick={handlePay}
              disabled={paying}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {paying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                  Alınıyor...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Ödemeyi Al
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// Summary card
// ============================================================

const SUMMARY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50', text: 'text-emerald-700 dark:text-emerald-400', icon: 'text-emerald-600' },
  sky: { bg: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50', text: 'text-sky-700 dark:text-sky-400', icon: 'text-sky-600' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-600' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900/50', text: 'text-violet-700 dark:text-violet-400', icon: 'text-violet-600' },
}

function SummaryCard({
  icon: Icon, label, value, color,
}: {
  icon: typeof Wallet
  label: string
  value: string
  color: string
}) {
  const c = SUMMARY_COLORS[color] ?? SUMMARY_COLORS.emerald
  return (
    <Card className={cn('border', c.bg)}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4 shrink-0', c.icon)} />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</span>
        </div>
        <div className={cn('text-lg font-bold mt-1', c.text)}>{value}</div>
      </CardContent>
    </Card>
  )
}
