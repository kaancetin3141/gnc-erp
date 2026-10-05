'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import type { SessionUser } from '@/types'
import { MarketPosScreen } from './market-pos-screen'
import { MarketSalesList } from './market-sales-list'
import { MarketStockView } from './market-stock-view'
import { MarketStockCount } from './market-stock-count'
import { MarketPurchase } from './market-purchase'
import { MarketShelves } from './market-shelves'
import { MarketReports } from './market-reports'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Store, Plus, MapPin, Phone, ScanLine, Package, ClipboardCheck, Truck, Layers, BarChart3, Settings, Star } from 'lucide-react'
import { LoyaltyTab } from '@/components/loyalty/loyalty-tab'
import { toast } from 'sonner'

// ============================================================
// Tipler
// ============================================================

export interface Market {
  id: string
  name: string
  address: string | null
  phone: string | null
  isActive: boolean
  createdAt: string
  _count?: { shelves: number; posShifts: number; sales: number; barcodes: number; purchases: number }
}

interface MarketListResponse {
  items: Market[]
}

// ============================================================
// Ana view
// ============================================================

export function MarketView() {
  const { user, selectedMarketId, setSelectedMarketId } = useAppStore()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<string>('pos')

  const { data, isLoading } = useQuery({
    queryKey: ['markets'],
    queryFn: () => apiGet<MarketListResponse>('/api/market'),
  })

  const markets = data?.items ?? []

  useEffect(() => {
    if (markets.length > 0 && !selectedMarketId) {
      setSelectedMarketId(markets[0].id)
    }
    if (markets.length > 0 && selectedMarketId && !markets.find((m) => m.id === selectedMarketId)) {
      setSelectedMarketId(markets[0].id)
    }
  }, [markets, selectedMarketId, setSelectedMarketId])

  const selectedMarket = markets.find((m) => m.id === selectedMarketId) ?? null

  // Rol-bazlı tab'ler
  const tabs = useMemo(() => {
    const u = user as SessionUser | null
    if (!u) return []
    const all: { key: string; label: string; icon: typeof Store }[] = []

    if (hasPermission(u, 'market.pos') || hasPermission(u, 'market.manage')) {
      all.push({ key: 'pos', label: 'Kasa', icon: ScanLine })
    }
    if (hasPermission(u, 'market.pos') || hasPermission(u, 'market.manage')) {
      all.push({ key: 'sales', label: 'Satışlar', icon: Store })
    }
    if (hasPermission(u, 'market.stock') || hasPermission(u, 'market.manage')) {
      all.push({ key: 'stock', label: 'Stok', icon: Package })
    }
    if (hasPermission(u, 'market.stock') || hasPermission(u, 'market.manage')) {
      all.push({ key: 'count', label: 'Sayım', icon: ClipboardCheck })
    }
    if (hasPermission(u, 'market.stock') || hasPermission(u, 'market.manage')) {
      all.push({ key: 'purchase', label: 'Mal Kabul', icon: Truck })
    }
    if (hasPermission(u, 'market.stock') || hasPermission(u, 'market.manage')) {
      all.push({ key: 'shelves', label: 'Raflar', icon: Layers })
    }
    if (hasPermission(u, 'market.pos') || hasPermission(u, 'market.manage')) {
      all.push({ key: 'loyalty', label: 'Sadakat Puanı', icon: Star })
    }
    if (hasPermission(u, 'market.manage')) {
      all.push({ key: 'reports', label: 'Raporlar', icon: BarChart3 })
    }
    if (hasPermission(u, 'market.manage')) {
      all.push({ key: 'settings', label: 'Ayarlar', icon: Settings })
    }
    return all
  }, [user])

  useEffect(() => {
    if (tabs.length > 0 && !tabs.find((t) => t.key === tab)) {
      setTab(tabs[0].key)
    }
  }, [tabs, tab])

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error('Market adı gerekli')
      return
    }
    setCreating(true)
    try {
      const created = await apiPost<Market>('/api/market', {
        name: newName,
        address: newAddress || undefined,
        phone: newPhone || undefined,
      })
      qc.invalidateQueries({ queryKey: ['markets'] })
      setSelectedMarketId(created.id)
      setCreateOpen(false)
      setNewName('')
      setNewAddress('')
      setNewPhone('')
      toast.success('Market oluşturuldu')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oluşturulamadı')
    } finally {
      setCreating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (markets.length === 0) {
    return (
      <div className="space-y-4 animate-fade-in">
        <MarketHeader market={null} />
        <Card className="p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
            <Store className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Henüz market yok</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            İlk marketinizi oluşturun. Stok, kasa, barkod, satış, vardiya, iade ve mal kabul yönetimi için market kaydı gerekli.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" />
            Yeni Market
          </Button>
        </Card>
        <CreateMarketDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          name={newName} setName={setNewName}
          address={newAddress} setAddress={setNewAddress}
          phone={newPhone} setPhone={setNewPhone}
          creating={creating}
          onCreate={handleCreate}
        />
      </div>
    )
  }

  if (!selectedMarket) {
    return (
      <div className="space-y-4">
        <MarketHeader market={null} />
        <Card className="p-8 text-center">
          <Skeleton className="h-32 w-full" />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <MarketHeader market={selectedMarket} markets={markets} canCreate={hasPermission(user, 'market.manage')} onCreate={() => setCreateOpen(true)} />

      {markets.length > 1 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Seçili Market:</Label>
              <Select value={selectedMarketId ?? ''} onValueChange={setSelectedMarketId}>
                <SelectTrigger className="h-9 max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {markets.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto custom-scroll pb-1">
          <TabsList className="w-auto inline-flex">
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="text-xs sm:text-sm gap-1.5">
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="pos" className="mt-4">
          <MarketPosScreen marketId={selectedMarket.id} />
        </TabsContent>
        <TabsContent value="sales" className="mt-4">
          <MarketSalesList marketId={selectedMarket.id} />
        </TabsContent>
        <TabsContent value="loyalty" className="mt-4">
          <LoyaltyTab />
        </TabsContent>
        <TabsContent value="stock" className="mt-4">
          <MarketStockView marketId={selectedMarket.id} />
        </TabsContent>
        <TabsContent value="count" className="mt-4">
          <MarketStockCount marketId={selectedMarket.id} />
        </TabsContent>
        <TabsContent value="purchase" className="mt-4">
          <MarketPurchase marketId={selectedMarket.id} />
        </TabsContent>
        <TabsContent value="shelves" className="mt-4">
          <MarketShelves marketId={selectedMarket.id} />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <MarketReports marketId={selectedMarket.id} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <MarketSettings marketId={selectedMarket.id} />
        </TabsContent>
      </Tabs>

      <CreateMarketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        name={newName} setName={setNewName}
        address={newAddress} setAddress={setNewAddress}
        phone={newPhone} setPhone={setNewPhone}
        creating={creating}
        onCreate={handleCreate}
      />
    </div>
  )
}

// ============================================================
// Header
// ============================================================

function MarketHeader({ market, markets, canCreate, onCreate }: {
  market: Market | null
  markets?: Market[]
  canCreate?: boolean
  onCreate?: () => void
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-sm">
          <Store className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight">
            {market ? market.name : 'Market ERP'}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Market yönetimi · Stok · Kasa · Barkod · Vardiya · İade · Mal Kabul
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {market && (
          <div className="hidden md:flex items-center gap-3 text-xs">
            {market._count && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{market._count.shelves} raf</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>{market._count.barcodes} barkod</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Store className="w-3.5 h-3.5" />
                  <span>{market._count.sales} satış</span>
                </div>
              </>
            )}
            {market.address && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                <span className="max-w-[200px] truncate">{market.address}</span>
              </div>
            )}
            {market.phone && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="w-3.5 h-3.5" />
                <span>{market.phone}</span>
              </div>
            )}
          </div>
        )}
        {canCreate && onCreate && (
          <Button onClick={onCreate} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Yeni Market</span>
          </Button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Create market dialog
// ============================================================

interface CreateMarketDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  name: string
  setName: (v: string) => void
  address: string
  setAddress: (v: string) => void
  phone: string
  setPhone: (v: string) => void
  creating: boolean
  onCreate: () => void
}

function CreateMarketDialog({
  open, onOpenChange, name, setName, address, setAddress,
  phone, setPhone, creating, onCreate,
}: CreateMarketDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni Market</DialogTitle>
          <DialogDescription>
            Market oluşturun ve stok/kasa/satış yönetimine başlayın.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="market-name">Market Adı *</Label>
            <Input
              id="market-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: Merkez Market"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="market-address">Adres</Label>
            <Input
              id="market-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Market adresi"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="market-phone">Telefon</Label>
            <Input
              id="market-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+90 5xx xxx xx xx"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            İptal
          </Button>
          <Button
            onClick={onCreate}
            disabled={creating || !name.trim()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {creating ? 'Oluşturuluyor...' : 'Oluştur'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Settings tab (basit)
// ============================================================

function MarketSettings({ marketId }: { marketId: string }) {
  return <MarketSettingsInner marketId={marketId} />
}

function MarketSettingsInner({ marketId }: { marketId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['market', marketId],
    queryFn: () => apiGet<Market>(`/api/market/${marketId}`),
  })
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  useEffect(() => {
    if (data) {
      setName(data.name)
      setAddress(data.address ?? '')
      setPhone(data.phone ?? '')
      setIsActive(data.isActive)
    }
  }, [data])

  async function save() {
    setSaving(true)
    try {
      const { apiPatch } = await import('@/lib/api-client')
      await apiPatch(`/api/market/${marketId}`, { name, address, phone, isActive })
      qc.invalidateQueries({ queryKey: ['markets'] })
      qc.invalidateQueries({ queryKey: ['market', marketId] })
      toast.success('Market güncellendi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />

  return (
    <Card className="p-6 max-w-2xl">
      <h3 className="font-semibold mb-4">Market Ayarları</h3>
      <div className="space-y-3">
        <div>
          <Label>Market Adı</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>Adres</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>Telefon</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
        </div>
        <div className="flex items-center justify-between">
          <Label>Aktif</Label>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 accent-emerald-600"
          />
        </div>
        <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </Button>
      </div>
    </Card>
  )
}
