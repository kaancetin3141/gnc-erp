'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ScanLine, Search, Plus, Minus, Trash2, ShoppingCart,
  Banknote, CreditCard, Wallet, X, Receipt, Play, Square, FileText, Printer,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

// ============================================================
// Tipler
// ============================================================

interface Product {
  id: string
  name: string
  sku: string | null
  price: number
  stock: number
  taxRate: number
  category: string | null
  unit: string
  minStock: number
}

interface Barcode {
  id: string
  code: string
  type: string
  product: Product
}

interface BarcodesResponse {
  items: Barcode[]
}

interface LookupResponse {
  found: boolean
  matchType: string
  product: Product | null
  barcode: { id: string; code: string; type: string } | null
  shelfItems: Array<{ shelf: { id: string; code: string; name: string | null; aisle: string | null } }>
  suggestions?: Product[]
}

interface Shift {
  id: string
  number: string
  status: string
  openingCash: number
  closingCash: number | null
  expectedCash: number | null
  difference: number | null
  openingTime: string
  closingTime: string | null
  notes: string | null
  _count?: { sales: number }
}

interface ShiftsResponse {
  items: Shift[]
}

interface CartItem {
  productId: string
  barcode: string | null
  name: string
  price: number
  qty: number
  taxRate: number
  stock: number
}

interface SaleResponse {
  id: string
  number: string
  total: number
  cashAmount: number
  cardAmount: number
  paymentMethod: string
  subtotal: number
  taxTotal: number
  discount: number
  createdAt: string
  items: Array<{
    id: string
    name: string
    qty: number
    unitPrice: number
    lineTotal: number
    taxRate: number
  }>
}

// ============================================================
// POS Screen
// ============================================================

export function MarketPosScreen({ marketId }: { marketId: string }) {
  const { user } = useAppStore()
  const userName = user?.name ?? '—'
  const qc = useQueryClient()

  // Vardiya durumu
  const { data: shiftsData, isLoading: shiftsLoading } = useQuery({
    queryKey: ['market-shifts', marketId],
    queryFn: () => apiGet<ShiftsResponse>(`/api/market/${marketId}/pos/shifts?status=acik`),
    refetchInterval: 10_000,
  })
  const openShift = shiftsData?.items?.[0] ?? null

  // Barkod listesi (hızlı arama için)
  const { data: barcodesData } = useQuery({
    queryKey: ['market-barcodes', marketId],
    queryFn: () => apiGet<BarcodesResponse>(`/api/market/${marketId}/barcodes`),
  })
  const allBarcodes = barcodesData?.items ?? []

  const [cart, setCart] = useState<CartItem[]>([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [discount, setDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mixed'>('cash')
  const [cashGiven, setCashGiven] = useState(0)
  const [cardAmount, setCardAmount] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [lastSale, setLastSale] = useState<SaleResponse | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [shiftDialog, setShiftDialog] = useState<'open' | 'close' | null>(null)
  const [shiftForm, setShiftForm] = useState({ openingCash: 0, closingCash: 0, notes: '' })
  const [zReportOpen, setZReportOpen] = useState(false)
  const [lastClosedShift, setLastClosedShift] = useState<Shift | null>(null)

  const barcodeRef = useRef<HTMLInputElement>(null)

  // Autofocus on barcode input
  useEffect(() => {
    if (openShift && !receiptOpen && !shiftDialog && !zReportOpen && !searchOpen) {
      barcodeRef.current?.focus()
    }
  }, [openShift, receiptOpen, shiftDialog, zReportOpen, searchOpen])

  // Barkod ile ürün ara ve sepete ekle
  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = barcodeInput.trim()
    if (!code) return

    try {
      const res = await apiPost<LookupResponse>(`/api/market/${marketId}/barcodes/lookup`, { code })
      if (res.found && res.product) {
        addToCart(res.product, res.barcode?.code ?? null)
        setBarcodeInput('')
        toast.success(`${res.product.name} eklendi`)
      } else {
        toast.error(`Barkod bulunamadı: ${code}`)
        if (res.suggestions && res.suggestions.length > 0) {
          setSearchOpen(true)
          setSearch(code)
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Arama başarısız')
    }
  }

  function addToCart(product: Product, barcode: string | null) {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id)
      if (existing) {
        if (existing.qty >= product.stock) {
          toast.error(`Yetersiz stok: ${product.name} (stok: ${product.stock})`)
          return prev
        }
        return prev.map((c) =>
          c.productId === product.id ? { ...c, qty: c.qty + 1 } : c,
        )
      }
      if (product.stock <= 0) {
        toast.error(`Stokta yok: ${product.name}`)
        return prev
      }
      return [
        ...prev,
        {
          productId: product.id,
          barcode,
          name: product.name,
          price: product.price,
          qty: 1,
          taxRate: product.taxRate,
          stock: product.stock,
        },
      ]
    })
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.productId !== productId) return c
          const newQty = c.qty + delta
          if (newQty <= 0) return { ...c, qty: 0 }
          if (newQty > c.stock) {
            toast.error(`Stok aşıldı (max: ${c.stock})`)
            return c
          }
          return { ...c, qty: newQty }
        })
        .filter((c) => c.qty > 0),
    )
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((c) => c.productId !== productId))
  }

  function clearCart() {
    setCart([])
    setDiscount(0)
    setCashGiven(0)
    setCardAmount(0)
  }

  // Sepet toplamları
  const subtotal = cart.reduce((s, x) => s + x.price * x.qty, 0)
  const discountAmount = Math.min(discount, subtotal)
  const taxableBase = Math.max(0, subtotal - discountAmount)
  const taxTotal = cart.reduce((s, x) => {
    const ratio = subtotal > 0 ? (x.price * x.qty) / subtotal : 0
    const lineAfterDisc = taxableBase * ratio
    return s + lineAfterDisc - lineAfterDisc / (1 + x.taxRate / 100)
  }, 0)
  const total = taxableBase
  const change = paymentMethod === 'cash' ? Math.max(0, cashGiven - total) : 0
  const mixedShort = paymentMethod === 'mixed' ? Math.max(0, total - cashGiven - cardAmount) : 0

  // Sık satılan ürünler — son barkodlar (basit demo)
  const quickProducts = allBarcodes.slice(0, 8)

  async function completeSale() {
    if (cart.length === 0) {
      toast.error('Sepet boş')
      return
    }
    if (!openShift) {
      toast.error('Önce vardiya açın')
      setShiftDialog('open')
      return
    }
    if (paymentMethod === 'cash' && cashGiven < total) {
      toast.error('Nakit yetersiz')
      return
    }
    if (paymentMethod === 'mixed' && cashGiven + cardAmount < total) {
      toast.error('Ödeme tutarı yetersiz')
      return
    }

    setProcessing(true)
    try {
      const sale = await apiPost<SaleResponse>(`/api/market/${marketId}/pos/sales`, {
        items: cart.map((c) => ({
          productId: c.productId,
          barcode: c.barcode,
          qty: c.qty,
        })),
        paymentMethod,
        cashAmount: paymentMethod === 'cash' ? cashGiven : paymentMethod === 'mixed' ? cashGiven : 0,
        cardAmount: paymentMethod === 'card' ? total : paymentMethod === 'mixed' ? cardAmount : 0,
        discount: discountAmount,
      })

      setLastSale(sale)
      setReceiptOpen(true)
      clearCart()
      qc.invalidateQueries({ queryKey: ['market-shifts', marketId] })
      qc.invalidateQueries({ queryKey: ['market-sales', marketId] })
      qc.invalidateQueries({ queryKey: ['market-barcodes', marketId] })
      toast.success(`Satış tamamlandı: ${sale.number}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Satış başarısız')
    } finally {
      setProcessing(false)
    }
  }

  async function openShiftAction() {
    try {
      await apiPost(`/api/market/${marketId}/pos/shifts`, {
        openingCash: Number(shiftForm.openingCash),
        notes: shiftForm.notes,
      })
      qc.invalidateQueries({ queryKey: ['market-shifts', marketId] })
      toast.success('Vardiya açıldı')
      setShiftDialog(null)
      setShiftForm({ openingCash: 0, closingCash: 0, notes: '' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Vardiya açılamadı')
    }
  }

  async function closeShiftAction() {
    try {
      const result = await apiPatch<Shift>(`/api/market/${marketId}/pos/shifts/${openShift?.id}`, {
        action: 'close',
        closingCash: Number(shiftForm.closingCash),
        notes: shiftForm.notes,
      })
      qc.invalidateQueries({ queryKey: ['market-shifts', marketId] })
      setLastClosedShift(result)
      setZReportOpen(true)
      setShiftDialog(null)
      setShiftForm({ openingCash: 0, closingCash: 0, notes: '' })
      toast.success('Vardiya kapatıldı')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Vardiya kapatılamadı')
    }
  }

  if (shiftsLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  // Vardiya kapalıysa uyarı göster
  if (!openShift) {
    return (
      <div className="space-y-4">
        <Card className="p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center mb-4">
            <Play className="w-8 h-8 text-amber-600" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Vardiya Kapalı</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Satış yapabilmek için kasa vardiyasını açın. Açılış nakiti girerek vardiya başlatın.
          </p>
          <Button onClick={() => setShiftDialog('open')} className="bg-emerald-600 hover:bg-emerald-700">
            <Play className="w-4 h-4 mr-2" />
            Vardiya Aç
          </Button>
        </Card>
        <ShiftDialog
          open={shiftDialog !== null}
          mode={shiftDialog}
          onOpenChange={(v) => !v && setShiftDialog(null)}
          form={shiftForm}
          setForm={setShiftForm}
          onConfirm={shiftDialog === 'open' ? openShiftAction : closeShiftAction}
          shift={openShift}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Vardiya barı */}
      <Card className="border-emerald-200 dark:border-emerald-900/50">
        <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 hover:bg-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
              VARDİYA AÇIK
            </Badge>
            <div className="text-sm">
              <span className="font-medium">{openShift.number}</span>
              <span className="text-muted-foreground ml-2">· {userName}</span>
              <span className="text-muted-foreground ml-2">· Açılış: {formatCurrency(openShift.openingCash)}</span>
              <span className="text-muted-foreground ml-2">· {formatDateTime(openShift.openingTime)}</span>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShiftDialog('close')}
            className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/30"
          >
            <Square className="w-3.5 h-3.5 mr-1" />
            Vardiyayı Kapat (Z Raporu)
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Sol: Barkod + Ürün arama + Sepet */}
        <div className="lg:col-span-3 space-y-3">
          {/* Barkod input */}
          <Card>
            <CardContent className="p-4">
              <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-600" />
                  <Input
                    ref={barcodeRef}
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Barkod okutun veya ürün adı girin..."
                    className="pl-10 h-12 text-base font-medium"
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" size="lg" className="bg-emerald-600 hover:bg-emerald-700 h-12 px-6">
                  Ekle
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 px-3"
                  onClick={() => { setSearchOpen(true); setSearch('') }}
                  title="Ürün ara"
                >
                  <Search className="w-5 h-5" />
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Hızlı ürünler */}
          {quickProducts.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground mb-2 px-1">Hızlı Erişim</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {quickProducts.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => addToCart(b.product, b.code)}
                      className="text-left p-2 rounded-lg border border-border hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors"
                    >
                      <div className="text-xs font-medium truncate">{b.product.name}</div>
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">
                        {formatCurrency(b.product.price)}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sepet */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between p-3 border-b">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium text-sm">Sepet</span>
                  <Badge variant="secondary">{cart.length} kalem</Badge>
                </div>
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20">
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Temizle
                  </Button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Sepet boş. Barkod okutun veya ürün arayın.</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px] sm:h-[400px]">
                  <div className="divide-y">
                    {cart.map((c) => (
                      <div key={c.productId} className="p-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatCurrency(c.price)} × {c.qty} = <span className="font-medium text-foreground">{formatCurrency(c.price * c.qty)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            onClick={() => updateQty(c.productId, -1)}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                          <Input
                            className="h-8 w-14 text-center px-1"
                            value={c.qty}
                            onChange={(e) => {
                              const q = parseInt(e.target.value) || 0
                              if (q <= 0) { removeFromCart(c.productId); return }
                              if (q > c.stock) { toast.error(`Stok aşıldı (max: ${c.stock})`); return }
                              setCart((prev) => prev.map((x) => x.productId === c.productId ? { ...x, qty: q } : x))
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            onClick={() => updateQty(c.productId, 1)}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                            onClick={() => removeFromCart(c.productId)}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sağ: Ödeme */}
        <div className="lg:col-span-2">
          <Card className="sticky top-4">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600" />
                Ödeme
              </h3>

              {/* Toplamlar */}
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ara Toplam</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">İndirim</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      value={discount || ''}
                      onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                      className="h-7 w-24 text-right text-xs"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">KDV</span>
                  <span className="font-medium">{formatCurrency(taxTotal)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="font-semibold">Genel Toplam</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xl">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Ödeme yöntemi */}
              <div className="space-y-2">
                <Label className="text-xs">Ödeme Yöntemi</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => setPaymentMethod('cash')}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all',
                      paymentMethod === 'cash'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                        : 'border-border hover:border-emerald-300',
                    )}
                  >
                    <Banknote className="w-5 h-5" />
                    <span className="text-xs font-medium">Nakit</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('card')}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all',
                      paymentMethod === 'card'
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400'
                        : 'border-border hover:border-violet-300',
                    )}
                  >
                    <CreditCard className="w-5 h-5" />
                    <span className="text-xs font-medium">Kart</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('mixed')}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all',
                      paymentMethod === 'mixed'
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
                        : 'border-border hover:border-amber-300',
                    )}
                  >
                    <Wallet className="w-5 h-5" />
                    <span className="text-xs font-medium">Karışık</span>
                  </button>
                </div>
              </div>

              {/* Ödeme tutarları */}
              {paymentMethod === 'cash' && (
                <div className="space-y-2">
                  <Label className="text-xs">Alınan Nakit</Label>
                  <Input
                    type="number"
                    min="0"
                    value={cashGiven || ''}
                    onChange={(e) => setCashGiven(Number(e.target.value) || 0)}
                    className="text-lg font-semibold h-12"
                    placeholder="0"
                  />
                  {cashGiven >= total && (
                    <div className="flex justify-between p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Para Üstü</span>
                      <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(change)}</span>
                    </div>
                  )}
                  {/* Hızlı nakit butonları */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {[50, 100, 200, 500].map((v) => (
                      <Button
                        key={v}
                        variant="outline"
                        size="sm"
                        onClick={() => setCashGiven(v)}
                        className="text-xs"
                      >
                        {v}
                      </Button>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setCashGiven(total)}>
                    Tam Tutar
                  </Button>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-center">
                  <CreditCard className="w-6 h-6 mx-auto text-violet-600 mb-1" />
                  <p className="text-sm font-medium text-violet-700 dark:text-violet-400">
                    Kart ile {formatCurrency(total)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Pos cihazından tahsil edin</p>
                </div>
              )}

              {paymentMethod === 'mixed' && (
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Nakit</Label>
                    <Input
                      type="number"
                      min="0"
                      value={cashGiven || ''}
                      onChange={(e) => setCashGiven(Number(e.target.value) || 0)}
                      className="h-10"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Kart</Label>
                    <Input
                      type="number"
                      min="0"
                      value={cardAmount || ''}
                      onChange={(e) => setCardAmount(Number(e.target.value) || 0)}
                      className="h-10"
                      placeholder="0"
                    />
                  </div>
                  {mixedShort > 0 && (
                    <p className="text-xs text-red-600">Eksik: {formatCurrency(mixedShort)}</p>
                  )}
                  {mixedShort === 0 && (cashGiven + cardAmount) > 0 && (
                    <p className="text-xs text-emerald-600">Toplam: {formatCurrency(cashGiven + cardAmount)}</p>
                  )}
                </div>
              )}

              <Button
                onClick={completeSale}
                disabled={processing || cart.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-base font-semibold"
              >
                {processing ? 'İşleniyor...' : (
                  <>
                    <Receipt className="w-5 h-5 mr-2" />
                    Fiş Kes ({formatCurrency(total)})
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <ProductSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        marketId={marketId}
        search={search}
        setSearch={setSearch}
        onPick={(p, b) => { addToCart(p, b); setSearchOpen(false); setSearch('') }}
      />

      <ReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        sale={lastSale}
        marketName={user?.tenant.name ?? 'Market'}
      />

      <ShiftDialog
        open={shiftDialog !== null}
        mode={shiftDialog}
        onOpenChange={(v) => !v && setShiftDialog(null)}
        form={shiftForm}
        setForm={setShiftForm}
        onConfirm={shiftDialog === 'open' ? openShiftAction : closeShiftAction}
        shift={openShift}
      />

      <ZReportDialog
        open={zReportOpen}
        onOpenChange={setZReportOpen}
        shift={lastClosedShift}
        marketName={user?.tenant.name ?? 'Market'}
      />
    </div>
  )
}

// ============================================================
// Ürün arama dialogu
// ============================================================

function ProductSearchDialog({
  open, onOpenChange, marketId, search, setSearch, onPick,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  marketId: string
  search: string
  setSearch: (v: string) => void
  onPick: (p: Product, barcode: string | null) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['market-barcodes', marketId, search],
    queryFn: () => apiGet<BarcodesResponse>(`/api/market/${marketId}/barcodes?search=${encodeURIComponent(search)}`),
    enabled: open && search.length > 0,
  })
  const list = (data?.items ?? []).filter((b) =>
    !search || b.product.name.toLowerCase().includes(search.toLowerCase()) || b.code.includes(search),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ürün Ara</DialogTitle>
          <DialogDescription>İsme veya barkoda göre arayın</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ürün adı veya barkod..."
              className="pl-9"
            />
          </div>
          <ScrollArea className="h-[400px]">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Aranıyor...</div>
            ) : list.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Ürün bulunamadı</div>
            ) : (
              <div className="space-y-1">
                {list.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onPick(b.product, b.code)}
                    className="w-full text-left p-3 rounded-lg border border-border hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{b.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Barkod: {b.code} · Stok: {b.product.stock} {b.product.unit}
                        </div>
                      </div>
                      <div className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                        {formatCurrency(b.product.price)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Fiş yazdırma dialogu
// ============================================================

function ReceiptDialog({
  open, onOpenChange, sale, marketName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  sale: SaleResponse | null
  marketName: string
}) {
  if (!sale) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" />
            Fiş — {sale.number}
          </DialogTitle>
          <DialogDescription>Satış başarıyla tamamlandı</DialogDescription>
        </DialogHeader>

        <div className="print-content">
          <div className="font-mono text-xs space-y-2 p-4 bg-white dark:bg-background border rounded-lg">
            <div className="text-center">
              <div className="font-bold text-sm">{marketName}</div>
              <div className="text-[10px] text-muted-foreground">{formatDateTime(sale.createdAt)}</div>
              <div className="text-[10px]">Fiş No: {sale.number}</div>
            </div>
            <div className="border-t border-dashed pt-2">
              {sale.items.map((it) => (
                <div key={it.id} className="flex justify-between">
                  <span className="truncate flex-1">{it.name} × {it.qty}</span>
                  <span className="ml-2">{formatCurrency(it.lineTotal)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed pt-2 space-y-0.5">
              <div className="flex justify-between">
                <span>Ara Toplam</span>
                <span>{formatCurrency(sale.subtotal)}</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex justify-between">
                  <span>İndirim</span>
                  <span>-{formatCurrency(sale.discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>KDV</span>
                <span>{formatCurrency(sale.taxTotal)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm border-t pt-1">
                <span>TOPLAM</span>
                <span>{formatCurrency(sale.total)}</span>
              </div>
            </div>
            <div className="border-t border-dashed pt-2 text-[10px]">
              <div className="flex justify-between">
                <span>Ödeme: {sale.paymentMethod === 'cash' ? 'Nakit' : sale.paymentMethod === 'card' ? 'Kart' : 'Karışık'}</span>
              </div>
              {sale.cashAmount > 0 && (
                <div className="flex justify-between">
                  <span>Nakit</span>
                  <span>{formatCurrency(sale.cashAmount)}</span>
                </div>
              )}
              {sale.cardAmount > 0 && (
                <div className="flex justify-between">
                  <span>Kart</span>
                  <span>{formatCurrency(sale.cardAmount)}</span>
                </div>
              )}
            </div>
            <div className="text-center text-[10px] pt-2 border-t border-dashed">
              <p>Teşekkür ederiz!</p>
            </div>
          </div>
        </div>

        <DialogFooter className="print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Kapat</Button>
          <Button onClick={() => window.print()} className="bg-emerald-600 hover:bg-emerald-700">
            <Printer className="w-4 h-4 mr-2" />
            Yazdır
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Vardiya dialog
// ============================================================

function ShiftDialog({
  open, mode, onOpenChange, form, setForm, onConfirm, shift,
}: {
  open: boolean
  mode: 'open' | 'close' | null
  onOpenChange: (v: boolean) => void
  form: { openingCash: number; closingCash: number; notes: string }
  setForm: (f: { openingCash: number; closingCash: number; notes: string }) => void
  onConfirm: () => void
  shift: Shift | null
}) {
  if (!mode) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'open' ? 'Vardiya Aç' : 'Vardiya Kapat'}</DialogTitle>
          <DialogDescription>
            {mode === 'open'
              ? 'Kasa açılış nakitini girin.'
              : 'Kasa kapanış nakitini girin. Sistem beklenen tutarı otomatik hesaplar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === 'open' ? (
            <div>
              <Label>Açılış Nakiti</Label>
              <Input
                type="number"
                min="0"
                value={form.openingCash || ''}
                onChange={(e) => setForm({ ...form, openingCash: Number(e.target.value) || 0 })}
                className="text-lg font-semibold mt-1"
                placeholder="0"
                autoFocus
              />
            </div>
          ) : (
            <>
              {shift && (
                <div className="p-3 rounded-lg bg-muted space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Açılış Nakiti</span>
                    <span>{formatCurrency(shift.openingCash)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vardiya No</span>
                    <span className="font-medium">{shift.number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Açılış</span>
                    <span>{formatDateTime(shift.openingTime)}</span>
                  </div>
                </div>
              )}
              <div>
                <Label>Kapanış Nakiti (Kasadaki)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.closingCash || ''}
                  onChange={(e) => setForm({ ...form, closingCash: Number(e.target.value) || 0 })}
                  className="text-lg font-semibold mt-1"
                  placeholder="0"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Beklenen nakit tutarı, satışlar ve iadeler hesaplandıktan sonra Z raporunda gösterilecektir.
              </p>
            </>
          )}
          <div>
            <Label>Notlar</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Opsiyonel not..."
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button onClick={onConfirm} className="bg-emerald-600 hover:bg-emerald-700">
            {mode === 'open' ? 'Vardiyayı Aç' : 'Vardiyayı Kapat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Z Raporu dialog
// ============================================================

function ZReportDialog({
  open, onOpenChange, shift, marketName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  shift: Shift | null
  marketName: string
}) {
  if (!shift) return null

  const diff = shift.difference ?? 0
  const diffColor = diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-amber-600' : 'text-red-600'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-600" />
            Z Raporu — {shift.number}
          </DialogTitle>
          <DialogDescription>Vardiya kapanış raporu</DialogDescription>
        </DialogHeader>

        <div className="print-content">
          <div className="font-mono text-xs space-y-2 p-4 bg-white dark:bg-background border rounded-lg">
            <div className="text-center">
              <div className="font-bold text-sm">{marketName}</div>
              <div className="text-[10px]">Z RAPORU</div>
              <div className="text-[10px] text-muted-foreground">{formatDateTime(shift.closingTime ?? new Date())}</div>
              <div className="text-[10px]">Vardiya: {shift.number}</div>
            </div>
            <div className="border-t border-dashed pt-2 space-y-0.5">
              <div className="flex justify-between">
                <span>Açılış Nakiti</span>
                <span>{formatCurrency(shift.openingCash)}</span>
              </div>
              <div className="flex justify-between">
                <span>Beklenen Nakit</span>
                <span>{formatCurrency(shift.expectedCash ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Fişli Kapanış</span>
                <span>{formatCurrency(shift.closingCash ?? 0)}</span>
              </div>
              <div className={cn('flex justify-between font-bold border-t pt-1', diffColor)}>
                <span>NAKİT FARK</span>
                <span>{diff > 0 ? '+' : ''}{formatCurrency(diff)}</span>
              </div>
            </div>
            <div className="text-center text-[10px] pt-2 border-t border-dashed">
              <p>Vardiya kapatıldı</p>
            </div>
          </div>
        </div>

        <DialogFooter className="print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Kapat</Button>
          <Button onClick={() => window.print()} className="bg-amber-600 hover:bg-amber-700">
            <Printer className="w-4 h-4 mr-2" />
            Yazdır
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
