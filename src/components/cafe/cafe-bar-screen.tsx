'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/lib/format'
import {
  GlassWater, Clock, CheckCircle2, ChefHat, Bell, ChevronDown,
  ChevronUp, FileText, Coffee, AlertCircle,
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

interface CafeOrder {
  id: string
  cafeId: string
  tableId: string | null
  table?: { id: string; number: string; status: string } | null
  number: string
  status: string
  type: string
  customerName: string | null
  total: number
  createdAt: string
  items?: OrderItem[]
}

interface OrdersResponse { items: CafeOrder[] }

const ITEM_STATUS_META: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  bekliyor: { label: 'Bekliyor', color: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900/50', icon: Clock },
  hazirlaniyor: { label: 'Hazırlanıyor', color: 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-950/40 dark:border-sky-900/50', icon: ChefHat },
  hazir: { label: 'Hazır', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-900/50', icon: CheckCircle2 },
  servis_edildi: { label: 'Servis Edildi', color: 'text-teal-700 bg-teal-50 border-teal-200 dark:text-teal-400 dark:bg-teal-950/40 dark:border-teal-900/50', icon: Bell },
}

function itemMeta(s: string) {
  return ITEM_STATUS_META[s] ?? ITEM_STATUS_META.bekliyor
}

// ============================================================
// Bar Screen — barmen için içecek kuyruğu
// ============================================================

export function CafeBarScreen({ cafeId }: { cafeId: string }) {
  const qc = useQueryClient()
  const [expandedRecipes, setExpandedRecipes] = useState<Set<string>>(new Set())
  const [updating, setUpdating] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['cafe-bar-queue', cafeId],
    queryFn: () => apiGet<OrdersResponse>(`/api/cafe/${cafeId}/orders`),
    refetchInterval: 5_000,
  })

  // Sadece bar istasyonu kalemleri, bekliyor/hazirlaniyor durumunda
  const queue = useMemo(() => {
    const all = data?.items ?? []
    const items: { order: CafeOrder; item: OrderItem }[] = []
    for (const o of all) {
      if (o.status === 'iptal' || o.status === 'odendi') continue
      for (const it of o.items ?? []) {
        if (it.station !== 'bar') continue
        if (it.status === 'servis_edildi') continue
        items.push({ order: o, item: it })
      }
    }
    // FIFO: bekliyor önce, sonra hazirlaniyor; createdAt ascending
    items.sort((a, b) => {
      const sa = a.item.status === 'bekliyor' ? 0 : 1
      const sb = b.item.status === 'bekliyor' ? 0 : 1
      if (sa !== sb) return sa - sb
      return new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime()
    })
    return items
  }, [data])

  const counts = useMemo(() => ({
    bekliyor: queue.filter((q) => q.item.status === 'bekliyor').length,
    hazirlaniyor: queue.filter((q) => q.item.status === 'hazirlaniyor').length,
  }), [queue])

  function toggleRecipe(id: string) {
    setExpandedRecipes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleUpdateItem(orderId: string, itemId: string, status: string) {
    setUpdating(itemId)
    try {
      await apiPatch(`/api/cafe/${cafeId}/orders/${orderId}/items/${itemId}`, { status })
      qc.invalidateQueries({ queryKey: ['cafe-bar-queue', cafeId] })
      qc.invalidateQueries({ queryKey: ['cafe-orders', cafeId] })
      const meta = itemMeta(status)
      toast.success(`Kalem "${meta.label}" durumuna güncellendi`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <GlassWater className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Bar İstasyonu</h2>
            <p className="text-xs text-muted-foreground">İçecek hazırlama kuyruğu · FIFO sırasıyla</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
            <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Bekliyor</div>
            <div className="text-lg font-bold text-amber-700 dark:text-amber-400">{counts.bekliyor}</div>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50">
            <div className="text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400">Hazırlanıyor</div>
            <div className="text-lg font-bold text-sky-700 dark:text-sky-400">{counts.hazirlaniyor}</div>
          </div>
        </div>
      </div>

      {/* Queue */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : queue.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <GlassWater className="w-12 h-12 mx-auto text-amber-500/50 mb-3" />
            <h3 className="font-semibold mb-1">Bar kuyruğu boş</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Şu anda bekleyen içecek siparişi yok. Yeni sipariş geldiğinde burada görünecek.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {queue.map(({ order, item }) => {
            const meta = itemMeta(item.status)
            const recipe = item.menuItem?.recipe
            const recipeExpanded = expandedRecipes.has(item.id)
            return (
              <Card
                key={item.id}
                className={cn(
                  'border-2',
                  item.status === 'bekliyor' ? 'border-amber-300 dark:border-amber-700' : 'border-sky-300 dark:border-sky-700',
                )}
              >
                <CardContent className="p-3">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-sm">#{order.number}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {order.table ? `Masa ${order.table.number}` : order.customerName ?? 'Paket'} · {formatRelative(order.createdAt)}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px]', meta.color)}>
                      <meta.icon className="w-3 h-3 mr-1" />
                      {meta.label}
                    </Badge>
                  </div>

                  {/* Item */}
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 mb-2">
                    <div className="w-10 h-10 rounded-md bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center shrink-0">
                      {item.menuItem?.photo ? (
                        <img src={item.menuItem.photo} alt={item.name} className="w-full h-full object-cover rounded-md" />
                      ) : (
                        <GlassWater className="w-5 h-5 text-amber-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{item.name}</div>
                      <div className="text-[11px] text-muted-foreground">Adet: {item.qty}</div>
                    </div>
                    <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{item.qty}×</div>
                  </div>

                  {/* Notes */}
                  {item.notes && (
                    <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-200 mb-2">
                      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{item.notes}</span>
                    </div>
                  )}

                  {/* Recipe */}
                  {recipe && (
                    <button
                      onClick={() => toggleRecipe(item.id)}
                      className="w-full flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 mb-2"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Reçete</span>
                      {recipeExpanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                    </button>
                  )}
                  {recipe && recipeExpanded && (
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-[11px] text-slate-700 dark:text-slate-300 mb-2 whitespace-pre-wrap">
                      {recipe}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1.5">
                    {item.status === 'bekliyor' && (
                      <Button
                        size="sm"
                        className="flex-1 h-8 bg-sky-600 hover:bg-sky-700"
                        disabled={updating === item.id}
                        onClick={() => handleUpdateItem(order.id, item.id, 'hazirlaniyor')}
                      >
                        <ChefHat className="w-3.5 h-3.5 mr-1" />
                        Hazırla
                      </Button>
                    )}
                    {item.status === 'hazirlaniyor' && (
                      <Button
                        size="sm"
                        className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700"
                        disabled={updating === item.id}
                        onClick={() => handleUpdateItem(order.id, item.id, 'hazir')}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Hazır
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Kitchen Screen — komi/admin için mutfak kuyruğu
// ============================================================

export function CafeKitchenScreen({ cafeId }: { cafeId: string }) {
  const qc = useQueryClient()
  const [expandedRecipes, setExpandedRecipes] = useState<Set<string>>(new Set())
  const [updating, setUpdating] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['cafe-kitchen-queue', cafeId],
    queryFn: () => apiGet<OrdersResponse>(`/api/cafe/${cafeId}/orders`),
    refetchInterval: 5_000,
  })

  // Sadece kitchen/dessert istasyonu, bekliyor/hazirlaniyor
  const queue = useMemo(() => {
    const all = data?.items ?? []
    const items: { order: CafeOrder; item: OrderItem }[] = []
    for (const o of all) {
      if (o.status === 'iptal' || o.status === 'odendi') continue
      for (const it of o.items ?? []) {
        if (it.station === 'bar') continue
        if (it.status === 'servis_edildi') continue
        items.push({ order: o, item: it })
      }
    }
    items.sort((a, b) => {
      const sa = a.item.status === 'bekliyor' ? 0 : 1
      const sb = b.item.status === 'bekliyor' ? 0 : 1
      if (sa !== sb) return sa - sb
      return new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime()
    })
    return items
  }, [data])

  const counts = useMemo(() => ({
    bekliyor: queue.filter((q) => q.item.status === 'bekliyor').length,
    hazirlaniyor: queue.filter((q) => q.item.status === 'hazirlaniyor').length,
  }), [queue])

  function toggleRecipe(id: string) {
    setExpandedRecipes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleUpdateItem(orderId: string, itemId: string, status: string) {
    setUpdating(itemId)
    try {
      await apiPatch(`/api/cafe/${cafeId}/orders/${orderId}/items/${itemId}`, { status })
      qc.invalidateQueries({ queryKey: ['cafe-kitchen-queue', cafeId] })
      qc.invalidateQueries({ queryKey: ['cafe-orders', cafeId] })
      const meta = itemMeta(status)
      toast.success(`Kalem "${meta.label}" durumuna güncellendi`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-400 to-red-500 flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Mutfak İstasyonu</h2>
            <p className="text-xs text-muted-foreground">Yemek & tatlı hazırlama kuyruğu</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
            <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Bekliyor</div>
            <div className="text-lg font-bold text-amber-700 dark:text-amber-400">{counts.bekliyor}</div>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50">
            <div className="text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400">Hazırlanıyor</div>
            <div className="text-lg font-bold text-sky-700 dark:text-sky-400">{counts.hazirlaniyor}</div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : queue.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <ChefHat className="w-12 h-12 mx-auto text-rose-500/50 mb-3" />
            <h3 className="font-semibold mb-1">Mutfak kuyruğu boş</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Şu anda bekleyen yemek/tatlı siparişi yok.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {queue.map(({ order, item }) => {
            const meta = itemMeta(item.status)
            const recipe = item.menuItem?.recipe
            const recipeExpanded = expandedRecipes.has(item.id)
            return (
              <Card
                key={item.id}
                className={cn(
                  'border-2',
                  item.status === 'bekliyor' ? 'border-amber-300 dark:border-amber-700' : 'border-sky-300 dark:border-sky-700',
                )}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-sm">#{order.number}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {order.table ? `Masa ${order.table.number}` : order.customerName ?? 'Paket'} · {formatRelative(order.createdAt)}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px]', meta.color)}>
                      <meta.icon className="w-3 h-3 mr-1" />
                      {meta.label}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 mb-2">
                    <div className="w-10 h-10 rounded-md bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center shrink-0">
                      {item.menuItem?.photo ? (
                        <img src={item.menuItem.photo} alt={item.name} className="w-full h-full object-cover rounded-md" />
                      ) : (
                        <Coffee className="w-5 h-5 text-rose-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{item.name}</div>
                      <div className="text-[11px] text-muted-foreground">Adet: {item.qty}</div>
                    </div>
                    <div className="text-lg font-bold text-rose-700 dark:text-rose-300">{item.qty}×</div>
                  </div>

                  {item.notes && (
                    <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-200 mb-2">
                      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{item.notes}</span>
                    </div>
                  )}

                  {recipe && (
                    <button
                      onClick={() => toggleRecipe(item.id)}
                      className="w-full flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 mb-2"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Reçete</span>
                      {recipeExpanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                    </button>
                  )}
                  {recipe && recipeExpanded && (
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-[11px] text-slate-700 dark:text-slate-300 mb-2 whitespace-pre-wrap">
                      {recipe}
                    </div>
                  )}

                  <div className="flex gap-1.5">
                    {item.status === 'bekliyor' && (
                      <Button
                        size="sm"
                        className="flex-1 h-8 bg-sky-600 hover:bg-sky-700"
                        disabled={updating === item.id}
                        onClick={() => handleUpdateItem(order.id, item.id, 'hazirlaniyor')}
                      >
                        <ChefHat className="w-3.5 h-3.5 mr-1" />
                        Hazırla
                      </Button>
                    )}
                    {(item.status === 'hazirlaniyor') && (
                      <Button
                        size="sm"
                        className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700"
                        disabled={updating === item.id}
                        onClick={() => handleUpdateItem(order.id, item.id, 'hazir')}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Hazır
                      </Button>
                    )}
                    {item.status === 'hazir' && (
                      <Button
                        size="sm"
                        className="flex-1 h-8 bg-teal-600 hover:bg-teal-700"
                        disabled={updating === item.id}
                        onClick={() => handleUpdateItem(order.id, item.id, 'servis_edildi')}
                      >
                        <Bell className="w-3.5 h-3.5 mr-1" />
                        Servis Edildi
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
