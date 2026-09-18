'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { PhotoUpload } from '@/components/ui/photo-upload'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import {
  Plus, Pencil, Trash2, Coffee, Cookie, GlassWater, Utensils,
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

interface MenuResponse { items: MenuCategory[] }

const STATION_META: Record<string, { label: string; icon: typeof Coffee; color: string }> = {
  bar: { label: 'Bar', icon: GlassWater, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
  kitchen: { label: 'Mutfak', icon: Utensils, color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30' },
  dessert: { label: 'Tatlı', icon: Cookie, color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30' },
}

function stationMeta(s: string) {
  return STATION_META[s] ?? STATION_META.kitchen
}

// ============================================================
// Cafe Menu Manager
// ============================================================

export function CafeMenuManager({ cafeId }: { cafeId: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['cafe-menu', cafeId],
    queryFn: () => apiGet<MenuResponse>(`/api/cafe/${cafeId}/menu`),
  })

  const categories = data?.items ?? []
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

  // Cat dialog
  const [catDialogOpen, setCatDialogOpen] = useState(false)
  const [catName, setCatName] = useState('')
  const [catIcon, setCatIcon] = useState('')

  // Item dialog
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [itemEdit, setItemEdit] = useState<MenuItem | null>(null)
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    price: 0,
    photo: '' as string | null,
    prepTime: 10,
    station: 'kitchen' as 'bar' | 'kitchen' | 'dessert',
    recipe: '',
    isAvailable: true,
  })
  const [itemCatId, setItemCatId] = useState<string | null>(null)

  // Delete
  const [deleteType, setDeleteType] = useState<'category' | 'item' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const items = useMemo(() => {
    if (!selectedCatId) return []
    const cat = categories.find((c) => c.id === selectedCatId)
    return cat?.items ?? []
  }, [categories, selectedCatId])

  // Auto-select first category
  if (categories.length > 0 && !selectedCatId) {
    setSelectedCatId(categories[0].id)
  }

  function openCreateCat() {
    setCatName('')
    setCatIcon('')
    setCatDialogOpen(true)
  }

  async function handleSaveCat() {
    if (!catName.trim()) {
      toast.error('Kategori adı gerekli')
      return
    }
    try {
      await apiPost(`/api/cafe/${cafeId}/menu`, {
        type: 'category',
        name: catName,
        icon: catIcon || undefined,
      })
      qc.invalidateQueries({ queryKey: ['cafe-menu', cafeId] })
      toast.success('Kategori eklendi')
      setCatDialogOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    }
  }

  function openCreateItem(catId: string) {
    setItemEdit(null)
    setItemCatId(catId)
    setItemForm({
      name: '', description: '', price: 0, photo: null,
      prepTime: 10, station: 'kitchen', recipe: '', isAvailable: true,
    })
    setItemDialogOpen(true)
  }

  function openEditItem(item: MenuItem) {
    setItemEdit(item)
    setItemCatId(item.categoryId)
    setItemForm({
      name: item.name,
      description: item.description ?? '',
      price: item.price,
      photo: item.photo,
      prepTime: item.prepTime,
      station: item.station as 'bar' | 'kitchen' | 'dessert',
      recipe: item.recipe ?? '',
      isAvailable: item.isAvailable,
    })
    setItemDialogOpen(true)
  }

  async function handleSaveItem() {
    if (!itemForm.name.trim()) {
      toast.error('Ürün adı gerekli')
      return
    }
    if (itemForm.price < 0) {
      toast.error('Fiyat 0 veya daha büyük olmalı')
      return
    }
    try {
      const payload = {
        name: itemForm.name,
        description: itemForm.description || undefined,
        price: itemForm.price,
        photo: itemForm.photo || undefined,
        prepTime: itemForm.prepTime,
        station: itemForm.station,
        recipe: itemForm.recipe || undefined,
        isAvailable: itemForm.isAvailable,
      }
      if (itemEdit) {
        await apiPatch(`/api/cafe/${cafeId}/menu/${itemEdit.id}`, payload)
        toast.success('Ürün güncellendi')
      } else {
        await apiPost(`/api/cafe/${cafeId}/menu`, {
          type: 'item',
          categoryId: itemCatId,
          ...payload,
        })
        toast.success('Ürün eklendi')
      }
      qc.invalidateQueries({ queryKey: ['cafe-menu', cafeId] })
      setItemDialogOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    }
  }

  async function handleToggleAvailable(item: MenuItem) {
    try {
      await apiPatch(`/api/cafe/${cafeId}/menu/${item.id}`, { isAvailable: !item.isAvailable })
      qc.invalidateQueries({ queryKey: ['cafe-menu', cafeId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    }
  }

  function openDelete(type: 'category' | 'item', target: { id: string; name: string }) {
    setDeleteType(type)
    setDeleteTarget(target)
  }

  async function handleDelete() {
    if (!deleteTarget || !deleteType) return
    try {
      if (deleteType === 'item') {
        await apiDelete(`/api/cafe/${cafeId}/menu/${deleteTarget.id}`)
        qc.invalidateQueries({ queryKey: ['cafe-menu', cafeId] })
        toast.success('Ürün silindi')
      } else {
        // Category delete — our API doesn't expose this directly. Use raw fetch.
        // For now, show info that category delete isn't supported via this UI.
        toast.info('Kategori silme için alt menü kalemlerini taşıyın/silin')
      }
      setDeleteTarget(null)
      setDeleteType(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi')
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64 lg:col-span-2" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Categories sidebar */}
      <Card className="lg:col-span-1">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Kategoriler</div>
            <Button size="sm" variant="outline" onClick={openCreateCat}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Kategori
            </Button>
          </div>
          {categories.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Henüz kategori yok
            </div>
          ) : (
            <div className="space-y-1">
              {categories.map((c) => {
                const isActive = selectedCatId === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCatId(c.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                      isActive
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-medium'
                        : 'hover:bg-muted',
                    )}
                  >
                    {c.icon ? (
                      <span className="text-base leading-none">{c.icon}</span>
                    ) : (
                      <Coffee className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate">{c.name}</span>
                    <Badge variant="outline" className="text-[10px] h-5">
                      {c.items.length}
                    </Badge>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="lg:col-span-2">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">
              {selectedCatId
                ? categories.find((c) => c.id === selectedCatId)?.name
                : 'Ürünler'}
            </div>
            {selectedCatId && (
              <Button size="sm" onClick={() => openCreateItem(selectedCatId)} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Ürün Ekle
              </Button>
            )}
          </div>
          {!selectedCatId ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              Soldan bir kategori seçin
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <Coffee className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Bu kategoride ürün yok</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => openCreateItem(selectedCatId)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                İlk Ürünü Ekle
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto custom-scroll">
              {items.map((item) => {
                const sm = stationMeta(item.station)
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'p-3 rounded-lg border transition-all',
                      item.isAvailable
                        ? 'border-border bg-card'
                        : 'border-border bg-muted/30 opacity-60',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {item.photo ? (
                          <img src={item.photo} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <Coffee className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-sm truncate">{item.name}</div>
                          <Badge className={cn('text-[10px] h-5 border-0', sm.color)}>
                            <sm.icon className="w-3 h-3 mr-0.5" />
                            {sm.label}
                          </Badge>
                        </div>
                        {item.description && (
                          <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                            {item.description}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-1.5">
                          <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(item.price, item.currency)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {item.prepTime} dk
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs flex-1"
                        onClick={() => openEditItem(item)}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Düzenle
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => handleToggleAvailable(item)}
                        title={item.isAvailable ? 'Mevcut değil yap' : 'Mevcut yap'}
                      >
                        <Switch checked={item.isAvailable} className="scale-75" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => openDelete('item', { id: item.id, name: item.name })}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Kategori</DialogTitle>
            <DialogDescription>
              Menü kategorisi oluşturun (örn: İçecekler, Tatlılar).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cat-name">Kategori Adı *</Label>
              <Input
                id="cat-name"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Örn: İçecekler"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="cat-icon">İkon (emoji, opsiyonel)</Label>
              <Input
                id="cat-icon"
                value={catIcon}
                onChange={(e) => setCatIcon(e.target.value)}
                placeholder="☕"
                className="mt-1"
                maxLength={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>İptal</Button>
            <Button onClick={handleSaveCat} className="bg-emerald-600 hover:bg-emerald-700">
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{itemEdit ? 'Ürün Düzenle' : 'Yeni Ürün'}</DialogTitle>
            <DialogDescription>
              Menü kalemi ekleyin. Reçete alanı, hazırlık talimatları içindir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scroll pr-1">
            <div>
              <Label>Ürün Fotoğrafı</Label>
              <div className="mt-1">
                <PhotoUpload
                  value={itemForm.photo}
                  onChange={(v) => setItemForm((f) => ({ ...f, photo: v }))}
                  placeholderIcon="package"
                  size="sm"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="i-name">Ürün Adı *</Label>
              <Input
                id="i-name"
                value={itemForm.name}
                onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Örn: Cappuccino"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="i-desc">Açıklama</Label>
              <Textarea
                id="i-desc"
                value={itemForm.description}
                onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Kısa açıklama..."
                className="mt-1 resize-none"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="i-price">Fiyat (₺) *</Label>
                <Input
                  id="i-price"
                  type="number"
                  min={0}
                  step="0.5"
                  value={itemForm.price}
                  onChange={(e) => setItemForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="i-prep">Hazırlık (dk)</Label>
                <Input
                  id="i-prep"
                  type="number"
                  min={0}
                  value={itemForm.prepTime}
                  onChange={(e) => setItemForm((f) => ({ ...f, prepTime: Number(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>İstasyon</Label>
                <Select
                  value={itemForm.station}
                  onValueChange={(v) => setItemForm((f) => ({ ...f, station: v as 'bar' | 'kitchen' | 'dessert' }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">Bar</SelectItem>
                    <SelectItem value="kitchen">Mutfak</SelectItem>
                    <SelectItem value="dessert">Tatlı</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="i-recipe">Reçete / Hazırlama Talimatları</Label>
              <Textarea
                id="i-recipe"
                value={itemForm.recipe}
                onChange={(e) => setItemForm((f) => ({ ...f, recipe: e.target.value }))}
                placeholder="Örn: 1 shot espresso + 150ml süt köpüğü. Kakao tozu serpin."
                className="mt-1 resize-none"
                rows={4}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Bu reçete barmen/mutfak ekranında görünecek.
              </p>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <Label htmlFor="i-avail" className="text-sm font-medium">Mevcut</Label>
              <Switch
                id="i-avail"
                checked={itemForm.isAvailable}
                onCheckedChange={(v) => setItemForm((f) => ({ ...f, isAvailable: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>İptal</Button>
            <Button onClick={handleSaveItem} className="bg-emerald-600 hover:bg-emerald-700">
              {itemEdit ? 'Güncelle' : 'Ekle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteType(null) } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteType === 'item' ? 'Ürün silinsin mi?' : 'Silinsin mi?'}</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" kalıcı olarak silinecek.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
