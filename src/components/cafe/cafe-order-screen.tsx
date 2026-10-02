'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDateTime } from '@/lib/format'
import type { CafeTable } from './cafe-table-layout'
import {
  Plus, Minus, ShoppingCart, Trash2, Utensils, Coffee, Cookie,
  GlassWater, X, Send, Receipt, Bell, CheckCircle2, Clock,
  Table2, User, ChevronRight, AlertCircle,
} from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

interface MenuItem {
  id: string
  categoryId: string
  name: string
  description: string | null
  price: number
  currency: string
  photo: string | null
  isAvailable: boolean
  prepTime: number
  station: string
  recipe: string | null
  sortOrder: number
  category?: { id: string; name: string }
}

interface MenuCategory {
  id: string
  cafeId: string
  name: string
  icon: string | null
  sortOrder: number
  isActive: boolean
  items: MenuItem[]
}

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
  taxTotal: number
  total: number
  notes: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
  items?: OrderItem[]
  payments?: { id: string; amount: number; method: string; status: string }[]
}

interface CartItem {
  menuItem: MenuItem
  qty: number
  notes: string
}

const ORDER_STATUS_META: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  acik: { label: 'Açık', color: 'text-slate-700 bg-slate-50 border-slate-200 dark:text-slate-300 dark:bg-slate-900/40 dark:border-slate-800', icon: Clock },
  hazirlaniyor: { label: 'Hazırlanıyor', color: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900/50', icon: Clock },
  hazir: { label: 'Hazır', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-900/50', icon: CheckCircle2 },
  odendi: { label: 'Ödendi', color: 'text-teal-700 bg-teal-50 border-teal-200 dark:text-teal-400 dark:bg-teal-950/40 dark:border-teal-900/50', icon: Receipt },
  iptal: { label: 'İptal', color: 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-900/50', icon: X },
}

const STATION_ICON: Record<string, typeof Coffee> = {
  bar: GlassWater,
  kitchen: Utensils,
  dessert: Cookie,
}

// ============================================================
// Main
// ============================================================

export function CafeOrderScreen({ cafeId }: { cafeId: string }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'new' | 'active'>('new')
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in')
  const [customerName, setCustomerName] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [activeOrder, setActiveOrder] = useState<CafeOrder | null>(null)
  const [activeOrderDialog, setActiveOrderDialog] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<CafeOrder | null>(null)

  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ['cafe-tables', cafeId],
    queryFn: () => apiGet<{ items: CafeTable[] }>(`/api/cafe/${cafeId}/tables`),
  })
  const { data: menuData, isLoading: menuLoading } = useQuery({
    queryKey: ['cafe-menu', cafeId],
    queryFn: () => apiGet<{ items: MenuCategory[] }>(`/api/cafe/${cafeId}/menu`),
  })
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['cafe-orders', cafeId, 'active'],
    queryFn: () => apiGet<{ items: CafeOrder[] }>(`/api/cafe/${cafeId}/orders?status=acik&status=hazirlaniyor&status=hazir`),
    refetchInterval: 10_000,
  })

  const tables = tablesData?.items ?? []
  const categories = menuData?.items ?? []
  const orders = ordersData?.items ?? []

  // Flat item list with category info
  const allItems = useMemo(() => {
    const list: (MenuItem & { categoryName: string })[] = []
    for (const cat of categories) {
      for (const it of cat.items) {
        list.push({ ...it, categoryName: cat.name })
      }
    }
    return list.filter((i) => i.isAvailable)
  }, [categories])

  const cartTotal = useMemo(() => cart.reduce((s, c) => s + c.menuItem.price * c.qty, 0), [cart])

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const ex = prev.find((c) => c.menuItem.id === item.id && c.notes === '')
      if (ex) {
        return prev.map((c) =>
          c.menuItem.id === item.id && c.notes === '' ? { ...c, qty: c.qty + 1 } : c,
        )
      }
      return [...prev, { menuItem: item, qty: 1, notes: '' }]
    })
  }

  function updateQty(idx: number, delta: number) {
    setCart((prev) => {
      const next = [...prev]
      const newQty = next[idx].qty + delta
      if (newQty <= 0) {
        next.splice(idx, 1)
      } else {
        next[idx] = { ...next[idx], qty: newQty }
      }
      return next
    })
  }

  function updateNotes(idx: number, notes: string) {
    setCart((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], notes }
      return next
    })
  }

  function removeFromCart(idx: number) {
    setCart((prev) => {
      const next = [...prev]
      next.splice(idx, 1)
      return next
    })
  }

  function clearCart() {
    setCart([])
    setOrderNotes('')
    setCustomerName('')
  }

  async function handleSendOrder() {
    if (cart.length === 0) {
      toast.error('Sepet boş')
      return
    }
    if (orderType === 'dine_in' && !selectedTableId) {
      toast.error('Masa seçimi gerekli')
      return
    }
    setSending(true)
    try {
      await apiPost(`/api/cafe/${cafeId}/orders`, {
        tableId: orderType === 'dine_in' ? selectedTableId : null,
        type: orderType,
        customerName: customerName || undefined,
        notes: orderNotes || undefined,
        items: cart.map((c) => ({
          menuItemId: c.menuItem.id,
          qty: c.qty,
          notes: c.notes || undefined,
        })),
      })
      qc.invalidateQueries({ queryKey: ['cafe-orders', cafeId] })
      qc.invalidateQueries({ queryKey: ['cafe-tables', cafeId] })
      toast.success('Sipariş gönderildi')
      clearCart()
      setSelectedTableId(null)
      setTab('active')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sipariş gönderilemedi')
    } finally {
      setSending(false)
    }
  }

  async function openOrderDetail(o: CafeOrder) {
    try {
      const detail = await apiGet<CafeOrder>(`/api/cafe/${cafeId}/orders/${o.id}`)
      setActiveOrder(detail)
      setActiveOrderDialog(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sipariş yüklenemedi')
    }
  }

  async function handleCancelOrder() {
    if (!cancelTarget) return
    try {
      await apiDelete(`/api/cafe/${cafeId}/orders/${cancelTarget.id}`)
      qc.invalidateQueries({ queryKey: ['cafe-orders', cafeId] })
      qc.invalidateQueries({ queryKey: ['cafe-tables', cafeId] })
      toast.success('Sipariş iptal edildi')
      setCancelTarget(null)
      if (activeOrder?.id === cancelTarget.id) setActiveOrderDialog(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İptal başarısız')
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'new' | 'active')}>
        <TabsList>
          <TabsTrigger value="new" className="text-xs sm:text-sm">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Yeni Sipariş
          </TabsTrigger>
          <TabsTrigger value="active" className="text-xs sm:text-sm">
            <Receipt className="w-3.5 h-3.5 mr-1" />
            Aktif Siparişler
            {orders.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                {orders.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* New order tab */}
      {tab === 'new' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: menu */}
          <div className="lg:col-span-2 space-y-3">
            {/* Order type selector */}
            <Card>
              <CardContent className="p-3">
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: 'dine_in', label: 'Masa', icon: Table2 },
                      { v: 'takeaway', label: 'Paket', icon: Receipt },
                      { v: 'delivery', label: 'Gel-Al', icon: User },
                    ].map((t) => (
                      <button
                        key={t.v}
                        onClick={() => setOrderType(t.v as 'dine_in' | 'takeaway' | 'delivery')}
                        className={cn(
                          'flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all',
                          orderType === t.v
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                            : 'border-border hover:border-emerald-300',
                        )}
                      >
                        <t.icon className="w-4 h-4" />
                        <span className="text-xs">{t.label}</span>
                      </button>
                    ))}
                  </div>

                  {orderType === 'dine_in' && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Masa</Label>
                      {tablesLoading ? (
                        <Skeleton className="h-9 w-full mt-1" />
                      ) : tables.length === 0 ? (
                        <p className="text-xs text-amber-600 mt-1">Önce kafe yöneticisi masa eklemeli.</p>
                      ) : (
                        <Select value={selectedTableId ?? ''} onValueChange={setSelectedTableId}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Masa seçin..." />
                          </SelectTrigger>
                          <SelectContent>
                            {tables
                              .filter((t) => t.status !== 'siparis' || t.id === selectedTableId)
                              .map((t) => (
                                <SelectItem key={t.id} value={t.id} disabled={t.status === 'siparis' && t.id !== selectedTableId}>
                                  Masa {t.number} {t.status === 'siparis' ? '(dolu)' : `· ${t.status}`}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}

                  {(orderType === 'takeaway' || orderType === 'delivery') && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Müşteri Adı</Label>
                      <Input
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Müşteri adı (opsiyonel)"
                        className="mt-1 h-9"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Menu items */}
            <Card>
              <CardContent className="p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Menü
                </div>
                {menuLoading ? (
                  <div className="space-y-2">
                    {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : allItems.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    <Coffee className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Menüde ürün yok
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scroll pr-1">
                    {categories.map((cat) => {
                      const items = cat.items.filter((i) => i.isAvailable)
                      if (items.length === 0) return null
                      return (
                        <div key={cat.id}>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2 px-1">
                            {cat.icon ? <span>{cat.icon}</span> : <Coffee className="w-3.5 h-3.5" />}
                            {cat.name}
                            <Badge variant="outline" className="text-[10px] h-4">{items.length}</Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {items.map((item) => {
                              const Icon = STATION_ICON[item.station] ?? Coffee
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => addToCart(item)}
                                  className="group p-2.5 rounded-lg border border-border hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 text-left transition-all"
                                >
                                  <div className="flex items-start gap-2">
                                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                                      {item.photo ? (
                                        <img src={item.photo} alt={item.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <Icon className="w-4 h-4 text-muted-foreground" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-medium leading-tight truncate">{item.name}</div>
                                      <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                                        {formatCurrency(item.price, item.currency)}
                                      </div>
                                    </div>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: cart */}
          <Card className="lg:sticky lg:top-4 h-fit">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-semibold">Sepet</span>
                  {cart.length > 0 && (
                    <Badge variant="outline" className="text-[10px] h-5">{cart.length}</Badge>
                  )}
                </div>
                {cart.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={clearCart} className="h-7 text-xs text-red-600 hover:text-red-700">
                    <Trash2 className="w-3 h-3 mr-1" />
                    Temizle
                  </Button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  Sepet boş
                </div>
              ) : (
                <div className="space-y-2 max-h-[40vh] overflow-y-auto custom-scroll">
                  {cart.map((c, idx) => {
                    const Icon = STATION_ICON[c.menuItem.station] ?? Coffee
                    return (
                      <div key={idx} className="p-2 rounded-lg bg-muted/50">
                        <div className="flex items-start gap-2">
                          <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-medium leading-tight">{c.menuItem.name}</span>
                              <button
                                onClick={() => removeFromCart(idx)}
                                className="text-red-500 hover:text-red-700 shrink-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {formatCurrency(c.menuItem.price, c.menuItem.currency)} × {c.qty} ={' '}
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                {formatCurrency(c.menuItem.price * c.qty, c.menuItem.currency)}
                              </span>
                            </div>
                            <Input
                              value={c.notes}
                              onChange={(e) => updateNotes(idx, e.target.value)}
                              placeholder="Not: az şekerli..."
                              className="h-7 mt-1 text-[11px]"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 w-6 p-0"
                            onClick={() => updateQty(idx, -1)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="text-xs font-semibold w-6 text-center">{c.qty}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 w-6 p-0"
                            onClick={() => updateQty(idx, 1)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {cart.length > 0 && (
                <div className="space-y-2 mt-3 pt-3 border-t">
                  <Input
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Sipariş notu (genel)"
                    className="h-8 text-xs"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Toplam</span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(cartTotal)}
                    </span>
                  </div>
                  <Button
                    onClick={handleSendOrder}
                    disabled={sending || (orderType === 'dine_in' && !selectedTableId)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    {sending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                        Gönderiliyor...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-1.5" />
                        Siparişi Gönder
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active orders tab */}
      {tab === 'active' && (
        <div className="space-y-3">
          {ordersLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Receipt className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <h3 className="font-semibold mb-1">Aktif sipariş yok</h3>
                <p className="text-sm text-muted-foreground">
                  Tüm siparişler tamamlandı veya ödendi.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {orders.map((o) => {
                const meta = ORDER_STATUS_META[o.status] ?? ORDER_STATUS_META.acik
                return (
                  <Card
                    key={o.id}
                    className={cn('cursor-pointer hover:shadow-md transition-shadow', meta.color.split(' ').filter(c => c.startsWith('border')).join(' '))}
                  >
                    <CardContent className="p-3" onClick={() => openOrderDetail(o)}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-bold text-sm">#{o.number}</div>
                          <div className="text-[11px] text-muted-foreground">{formatDateTime(o.createdAt)}</div>
                        </div>
                        <Badge variant="outline" className={cn('text-[10px]', meta.color)}>
                          <meta.icon className="w-3 h-3 mr-1" />
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
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
                            Gel-Al {o.customerName ? `· ${o.customerName}` : ''}
                          </>
                        )}
                      </div>
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-2">
                        {formatCurrency(o.total)}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full mt-2 h-7 text-xs"
                        onClick={(e) => { e.stopPropagation(); openOrderDetail(o) }}
                      >
                        Detay
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Order detail dialog */}
      <Dialog open={activeOrderDialog} onOpenChange={setActiveOrderDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Sipariş #{activeOrder?.number}
              {activeOrder && (
                <Badge variant="outline" className={cn('text-[10px]', (ORDER_STATUS_META[activeOrder.status] ?? ORDER_STATUS_META.acik).color)}>
                  {(ORDER_STATUS_META[activeOrder.status] ?? ORDER_STATUS_META.acik).label}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {activeOrder && formatDateTime(activeOrder.createdAt)}
            </DialogDescription>
          </DialogHeader>
          {activeOrder && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scroll pr-1">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Tip:</span>{' '}
                  <span className="font-medium">
                    {activeOrder.type === 'dine_in' ? 'Masa' : activeOrder.type === 'takeaway' ? 'Paket' : 'Gel-Al'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Masa:</span>{' '}
                  <span className="font-medium">{activeOrder.table?.number ?? '—'}</span>
                </div>
                {activeOrder.customerName && (
                  <div>
                    <span className="text-muted-foreground">Müşteri:</span>{' '}
                    <span className="font-medium">{activeOrder.customerName}</span>
                  </div>
                )}
              </div>
              {activeOrder.notes && (
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-200">
                  <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                  {activeOrder.notes}
                </div>
              )}
              <div className="space-y-1.5">
                {activeOrder.items?.map((it) => {
                  const Icon = STATION_ICON[it.station] ?? Coffee
                  return (
                    <div key={it.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                      <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium">{it.name}</span>
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
                            {formatCurrency(it.unitPrice * it.qty)}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {it.qty} × {formatCurrency(it.unitPrice)}
                        </div>
                        {it.notes && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">Not: {it.notes}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm font-semibold">Toplam</span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(activeOrder.total)}
                </span>
              </div>
              {activeOrder.status !== 'odendi' && activeOrder.status !== 'iptal' && (
                <Button
                  variant="outline"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={() => setCancelTarget(activeOrder)}
                >
                  <X className="w-4 h-4 mr-1.5" />
                  Siparişi İptal Et
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(o) => { if (!o) setCancelTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sipariş iptal edilsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              #{cancelTarget?.number} numaralı sipariş iptal edilecek. Masa boşaltılacak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelOrder}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              İptal Et
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
