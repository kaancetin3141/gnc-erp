'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import type { SessionUser } from '@/types'
import { CafeTableLayout } from './cafe-table-layout'
import { CafeMenuManager } from './cafe-menu-manager'
import { CafeOrderScreen } from './cafe-order-screen'
import { CafeBarScreen, CafeKitchenScreen } from './cafe-bar-screen'
import { CafeKasaScreen } from './cafe-kasa-screen'
import { CafeReports } from './cafe-reports'
import { CafeReservations } from './cafe-reservations'
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
import { Coffee, Plus, Store, MapPin, Phone, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ============================================================
// Tipler
// ============================================================

export interface Cafe {
  id: string
  name: string
  address: string | null
  phone: string | null
  tableCount: number
  createdAt: string
  _count?: { tables: number; menuCategories: number; cafeOrders: number }
}

interface CafeListResponse {
  items: Cafe[]
}

// ============================================================
// Ana view
// ============================================================

export function CafeView() {
  const { user, selectedCafeId, setSelectedCafeId } = useAppStore()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<string>('tables')

  // Kafeleri çek
  const { data, isLoading } = useQuery({
    queryKey: ['cafes'],
    queryFn: () => apiGet<CafeListResponse>('/api/cafe'),
  })

  const cafes = data?.items ?? []

  // İlk kafeyi otomatik seç
  useEffect(() => {
    if (cafes.length > 0 && !selectedCafeId) {
      setSelectedCafeId(cafes[0].id)
    }
    if (cafes.length > 0 && selectedCafeId && !cafes.find((c) => c.id === selectedCafeId)) {
      setSelectedCafeId(cafes[0].id)
    }
  }, [cafes, selectedCafeId, setSelectedCafeId])

  const selectedCafe = cafes.find((c) => c.id === selectedCafeId) ?? null

  // Rol-bazlı tab görünürlüğü
  const tabs = useMemo(() => {
    const u = user as SessionUser | null
    if (!u) return []
    const all: { key: string; label: string }[] = []

    // Masalar: kasa, komi, admin
    if (hasPermission(u, 'cafe.orders') || hasPermission(u, 'cafe.manage')) {
      all.push({ key: 'tables', label: 'Masalar' })
    }
    // Menü: admin
    if (hasPermission(u, 'cafe.manage')) {
      all.push({ key: 'menu', label: 'Menü' })
    }
    // Siparişler: komi, kasa, admin
    if (hasPermission(u, 'cafe.orders') || hasPermission(u, 'cafe.manage')) {
      all.push({ key: 'orders', label: 'Siparişler' })
    }
    // Bar: barmen, admin
    if (hasPermission(u, 'cafe.bar') || hasPermission(u, 'cafe.manage')) {
      all.push({ key: 'bar', label: 'Bar' })
    }
    // Mutfak: komi, admin (cafe.kitchen)
    if (hasPermission(u, 'cafe.kitchen') || hasPermission(u, 'cafe.manage')) {
      all.push({ key: 'kitchen', label: 'Mutfak' })
    }
    // Rezervasyon: admin (ve komi/garson masaya yerleştirme için)
    if (hasPermission(u, 'cafe.orders') || hasPermission(u, 'cafe.manage')) {
      all.push({ key: 'reservations', label: 'Rezervasyon' })
    }
    // Kasa: kasa, admin
    if (hasPermission(u, 'cafe.manage')) {
      all.push({ key: 'kasa', label: 'Kasa' })
    }
    // Raporlar: kasa, admin
    if (hasPermission(u, 'cafe.manage')) {
      all.push({ key: 'reports', label: 'Raporlar' })
    }
    // Barmen sadece bar görür
    if (u.role === 'barmen') return [{ key: 'bar', label: 'Bar' }]
    return all
  }, [user])

  // Aktif tab geçerli değilse ilkine dön
  useEffect(() => {
    if (tabs.length > 0 && !tabs.find((t) => t.key === tab)) {
      setTab(tabs[0].key)
    }
  }, [tabs, tab])

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error('Kafe adı gerekli')
      return
    }
    setCreating(true)
    try {
      const created = await apiPost<Cafe>('/api/cafe', {
        name: newName,
        address: newAddress || undefined,
        phone: newPhone || undefined,
      })
      qc.invalidateQueries({ queryKey: ['cafes'] })
      setSelectedCafeId(created.id)
      setCreateOpen(false)
      setNewName('')
      setNewAddress('')
      setNewPhone('')
      toast.success('Kafe oluşturuldu')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oluşturulamadı')
    } finally {
      setCreating(false)
    }
  }

  // Yükleniyor
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // Kafe yoksa: oluştur ekranı
  if (cafes.length === 0) {
    return (
      <div className="space-y-4 animate-fade-in">
        <CafeHeader cafe={null} />
        <Card className="p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
            <Coffee className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Henüz kafe yok</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            İlk kafenizi oluşturun. Masa düzeni, menü, sipariş ve ödeme yönetimi için kafe kaydı gerekli.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" />
            Yeni Kafe
          </Button>
        </Card>
        <CreateCafeDialog
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

  // Kafe seçili değilse
  if (!selectedCafe) {
    return (
      <div className="space-y-4">
        <CafeHeader cafe={null} />
        <Card className="p-8 text-center">
          <Skeleton className="h-32 w-full" />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <CafeHeader cafe={selectedCafe} cafes={cafes} />

      {/* Cafe selector (multi-cafe) */}
      {cafes.length > 1 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Seçili Kafe:</Label>
              <Select value={selectedCafeId ?? ''} onValueChange={setSelectedCafeId}>
                <SelectTrigger className="h-9 max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cafes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto custom-scroll pb-1">
          <TabsList className="w-auto inline-flex">
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="text-xs sm:text-sm">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="tables" className="mt-4">
          <CafeTableLayout cafeId={selectedCafe.id} />
        </TabsContent>
        <TabsContent value="menu" className="mt-4">
          <CafeMenuManager cafeId={selectedCafe.id} />
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <CafeOrderScreen cafeId={selectedCafe.id} />
        </TabsContent>
        <TabsContent value="bar" className="mt-4">
          <CafeBarScreen cafeId={selectedCafe.id} />
        </TabsContent>
        <TabsContent value="kitchen" className="mt-4">
          <CafeKitchenScreen cafeId={selectedCafe.id} />
        </TabsContent>
        <TabsContent value="reservations" className="mt-4">
          <CafeReservations cafeId={selectedCafe.id} />
        </TabsContent>
        <TabsContent value="kasa" className="mt-4">
          <CafeKasaScreen cafeId={selectedCafe.id} />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <CafeReports cafeId={selectedCafe.id} />
        </TabsContent>
      </Tabs>

      <CreateCafeDialog
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

function CafeHeader({ cafe, cafes }: { cafe: Cafe | null; cafes?: Cafe[] }) {
  const { user } = useAppStore()
  const u = user as SessionUser | null
  const isCafeRole = u && (u.role === 'kasa' || u.role === 'barmen' || u.role === 'komi')

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
          <Coffee className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight">
            {cafe ? cafe.name : 'Kafe ERP'}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isCafeRole
              ? 'Kafe yönetim sistemi'
              : 'Kafe yönetimi · Masa · Menü · Sipariş · Bar · Kasa'}
          </p>
        </div>
      </div>

      {cafe && (
        <div className="hidden md:flex items-center gap-3 text-xs">
          {cafe._count && (
            <>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                <span>{cafe._count.tables} masa</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Coffee className="w-3.5 h-3.5" />
                <span>{cafe._count.menuCategories} kategori</span>
              </div>
            </>
          )}
          {cafe.address && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              <span className="max-w-[200px] truncate">{cafe.address}</span>
            </div>
          )}
          {cafe.phone && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="w-3.5 h-3.5" />
              <span>{cafe.phone}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Create cafe dialog
// ============================================================

interface CreateCafeDialogProps {
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

function CreateCafeDialog({
  open, onOpenChange, name, setName, address, setAddress,
  phone, setPhone, creating, onCreate,
}: CreateCafeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni Kafe</DialogTitle>
          <DialogDescription>
            Kafe oluşturun ve masa/menü/sipariş yönetimine başlayın.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="cafe-name">Kafe Adı *</Label>
            <Input
              id="cafe-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: Merkez Kafe"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cafe-address">Adres</Label>
            <Input
              id="cafe-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Kafe adresi"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cafe-phone">Telefon</Label>
            <Input
              id="cafe-phone"
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
