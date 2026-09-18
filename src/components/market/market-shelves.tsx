'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
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
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Layers, Plus, Trash2, Edit, Package, ArrowRight, X,
} from 'lucide-react'
import { toast } from 'sonner'

interface Shelf {
  id: string
  code: string
  name: string | null
  aisle: string | null
  createdAt: string
  _count?: { items: number }
}

interface ShelvesResponse { items: Shelf[] }

interface ShelfItem {
  id: string
  qty: number
  minDisplayQty: number
  product: { id: string; name: string; sku: string | null; price: number; stock: number; category: string | null }
}

interface ShelfItemsResponse { items: ShelfItem[] }

interface ProductOption {
  id: string
  name: string
  sku: string | null
  stock: number
  price: number
}

export function MarketShelves({ marketId }: { marketId: string }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Shelf | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editShelf, setEditShelf] = useState<Shelf | null>(null)
  const [form, setForm] = useState({ code: '', name: '', aisle: '' })
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addProduct, setAddProduct] = useState('')
  const [addQty, setAddQty] = useState(1)
  const [addMin, setAddMin] = useState(2)
  const [adding, setAdding] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['market-shelves', marketId],
    queryFn: () => apiGet<ShelvesResponse>(`/api/market/${marketId}/shelves`),
  })

  const shelves = data?.items ?? []

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['market-shelf-items', marketId, selected?.id],
    queryFn: () => apiGet<ShelfItemsResponse>(`/api/market/${marketId}/shelves/${selected!.id}/items`),
    enabled: !!selected,
  })

  const items = itemsData?.items ?? []

  // Ürün listesi (add dialog için)
  const { data: barcodesData } = useQuery({
    queryKey: ['market-barcodes', marketId],
    queryFn: () => apiGet<{ items: Array<{ product: ProductOption }> }>(`/api/market/${marketId}/barcodes`),
  })
  const products = barcodesData?.items?.map((b) => b.product) ?? []
  const uniqueProducts = Array.from(new Map(products.map((p) => [p.id, p])).values())

  function openCreate() {
    setForm({ code: '', name: '', aisle: '' })
    setEditShelf(null)
    setCreateOpen(true)
  }

  function openEdit(s: Shelf) {
    setForm({ code: s.code, name: s.name ?? '', aisle: s.aisle ?? '' })
    setEditShelf(s)
    setCreateOpen(true)
  }

  async function saveShelf() {
    if (!form.code.trim()) { toast.error('Raf kodu gerekli'); return }
    setSaving(true)
    try {
      if (editShelf) {
        await apiPatch(`/api/market/${marketId}/shelves/${editShelf.id}`, {
          code: form.code, name: form.name || undefined, aisle: form.aisle || undefined,
        })
        toast.success('Raf güncellendi')
      } else {
        await apiPost(`/api/market/${marketId}/shelves`, {
          code: form.code, name: form.name || undefined, aisle: form.aisle || undefined,
        })
        toast.success('Raf oluşturuldu')
      }
      qc.invalidateQueries({ queryKey: ['market-shelves', marketId] })
      setCreateOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  async function deleteShelf(s: Shelf) {
    if (!confirm(`"${s.code}" rafını silmek istediğinize emin misiniz?`)) return
    try {
      await apiDelete(`/api/market/${marketId}/shelves/${s.id}`)
      qc.invalidateQueries({ queryKey: ['market-shelves', marketId] })
      if (selected?.id === s.id) setSelected(null)
      toast.success('Raf silindi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi')
    }
  }

  async function addItem() {
    if (!selected || !addProduct) { toast.error('Ürün seçin'); return }
    setAdding(true)
    try {
      await apiPost(`/api/market/${marketId}/shelves/${selected.id}/items`, {
        productId: addProduct,
        qty: addQty,
        minDisplayQty: addMin,
      })
      qc.invalidateQueries({ queryKey: ['market-shelf-items', marketId, selected.id] })
      setAddOpen(false)
      setAddProduct('')
      setAddQty(1)
      setAddMin(2)
      toast.success('Ürün rafa eklendi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi')
    } finally {
      setAdding(false)
    }
  }

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  // Raf detayı
  if (selected) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{selected.code}</h3>
                  {selected.name && <span className="text-sm text-muted-foreground">— {selected.name}</span>}
                  {selected.aisle && <Badge variant="outline">Koridor: {selected.aisle}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {items.length} ürün bu rafta
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                  <X className="w-3.5 h-3.5 mr-1" />
                  Geri
                </Button>
                <Button size="sm" onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Ürün Ekle
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {itemsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Rafta</TableHead>
                    <TableHead className="text-right">Min Gösterim</TableHead>
                    <TableHead className="text-right">Toplam Stok</TableHead>
                    <TableHead className="text-right">Fiyat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Bu rafta ürün yok
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-medium text-sm">{it.product.name}</TableCell>
                        <TableCell className="text-xs">{it.product.sku ?? '—'}</TableCell>
                        <TableCell className="text-xs">{it.product.category ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <span className={it.qty <= it.minDisplayQty ? 'text-amber-600 font-semibold' : ''}>
                            {it.qty}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs">{it.minDisplayQty}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{it.product.stock}</TableCell>
                        <TableCell className="text-right text-sm">{it.product.price.toLocaleString('tr-TR')} ₺</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add product dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rafa Ürün Ekle — {selected.code}</DialogTitle>
              <DialogDescription>Bu rafa yerleştirilecek ürünü seçin</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Ürün</Label>
                <Select value={addProduct} onValueChange={setAddProduct}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Ürün seçin..." /></SelectTrigger>
                  <SelectContent>
                    {uniqueProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} {p.sku ? `(${p.sku})` : ''} — Stok: {p.stock}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Raftaki Miktar</Label>
                  <Input
                    type="number"
                    min="0"
                    value={addQty}
                    onChange={(e) => setAddQty(Number(e.target.value) || 0)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Min Gösterim</Label>
                  <Input
                    type="number"
                    min="0"
                    value={addMin}
                    onChange={(e) => setAddMin(Number(e.target.value) || 0)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>İptal</Button>
              <Button onClick={addItem} disabled={adding} className="bg-emerald-600 hover:bg-emerald-700">
                {adding ? 'Ekleniyor...' : 'Ekle'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Raf listesi
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Raf Yönetimi</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ürünlerin market içindeki konumlarını yönetin. Koridor ve raf kodları ile düzen.
            </p>
          </div>
          <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-1" />
            Yeni Raf
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shelves.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-3 p-8 text-center text-muted-foreground">
            <Layers className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Henüz raf yok. İlk rafı oluşturun.</p>
          </Card>
        ) : (
          shelves.map((s) => (
            <Card key={s.id} className="hover:border-emerald-400 transition-colors cursor-pointer group" >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3" onClick={() => setSelected(s)}>
                    <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center font-bold text-emerald-700 dark:text-emerald-400">
                      {s.code}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{s.name ?? s.code}</div>
                      {s.aisle && <div className="text-xs text-muted-foreground">Koridor: {s.aisle}</div>}
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {s._count?.items ?? 0} ürün
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteShelf(s)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs"
                  onClick={() => setSelected(s)}
                >
                  Ürünleri Gör <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editShelf ? 'Raf Düzenle' : 'Yeni Raf'}</DialogTitle>
            <DialogDescription>Raf kodu, adı ve koridor bilgisi girin</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Raf Kodu *</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="Örn: A1, B-3, C2"
                className="mt-1 font-mono"
                autoFocus
              />
            </div>
            <div>
              <Label>Raf Adı</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Örn: İçecekler, Atıştırmalık"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Koridor</Label>
              <Input
                value={form.aisle}
                onChange={(e) => setForm({ ...form, aisle: e.target.value })}
                placeholder="Örn: 1, A, Soğuk"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>İptal</Button>
            <Button onClick={saveShelf} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
