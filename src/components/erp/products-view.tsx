'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import type { SessionUser } from '@/types'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Boxes, AlertTriangle, Plus, Download, Search, X, RefreshCw,
} from 'lucide-react'
import { toCSV, downloadFile } from '@/lib/format'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import type { Product, ProductListResponse } from './parts/types'
import { ProductFormDialog } from './parts/product-form-dialog'
import { ProductDetailDialog } from './parts/product-detail-dialog'
import { ProductStats } from './parts/product-stats'
import { ProductTable } from './parts/product-table'

// ============================================================
// Ana liste bileşeni (orchestrator)
// ============================================================

export function ProductsView() {
  const { user } = useAppStore()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Query parametreleri
  const params = useMemo(() => {
    const p: Record<string, string> = {}
    if (search) p.search = search
    if (category) p.category = category
    if (lowStockOnly) p.lowStock = 'true'
    p.limit = '200'
    return p
  }, [search, category, lowStockOnly])

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['products', params],
    queryFn: () => {
      const qs = new URLSearchParams(params).toString()
      return apiGet<ProductListResponse>(`/api/products?${qs}`)
    },
  })

  const products = data?.items ?? []
  const total = data?.total ?? 0

  // Kategoriler (mevcut ürünlerden türet)
  const categories = useMemo(() => {
    const set = new Set<string>()
    products.forEach((p) => { if (p.category) set.add(p.category) })
    return Array.from(set).sort()
  }, [products])

  // İstatistikler
  const stats = useMemo(() => {
    const totalStockValue = products.reduce((sum, p) => sum + p.stock * p.price, 0)
    const lowStockCount = products.filter((p) => p.stock <= p.minStock && p.stock > 0).length
    const outOfStock = products.filter((p) => p.stock === 0).length
    const lowOrOutCount = lowStockCount + outOfStock
    return {
      total,
      totalStockValue,
      lowStockCount: lowOrOutCount,
      categoryCount: categories.length,
      outOfStock,
    }
  }, [products, total, categories.length])

  const canExport = hasPermission(user as SessionUser | null, 'export.data')

  // CSV dışa aktarma
  const handleExport = () => {
    if (!products.length) {
      toast.error('Dışa aktarılacak ürün yok')
      return
    }
    const rows = products.map((p) => ({
      Ad: p.name,
      SKU: p.sku || '',
      Kategori: p.category || '',
      Fiyat: p.price,
      'Para Birimi': p.currency,
      KDV: p.taxRate,
      Stok: p.stock,
      'Min Stok': p.minStock,
      Birim: p.unit,
      'Stok Değeri': (p.stock * p.price).toFixed(2),
      Durum: p.stock === 0 ? 'Tükendi' : p.stock <= p.minStock ? 'Düşük Stok' : 'Stokta',
    }))
    const csv = toCSV(rows)
    downloadFile(csv, `urunler-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success(`${products.length} ürün dışa aktarıldı`)
  }

  const handleClearFilters = () => {
    setSearch('')
    setCategory('')
    setLowStockOnly(false)
  }

  const activeFilterCount = [search, category].filter(Boolean).length + (lowStockOnly ? 1 : 0)

  // Detay aç
  const openDetail = (p: Product) => {
    setDetailProduct(p)
    setDetailOpen(true)
  }

  // Düzenle
  const openEdit = (p: Product) => {
    setEditProduct(p)
    setDetailOpen(false)
    setEditOpen(true)
  }

  // Detail kapandığında edit'e geçiş varsa state'i temizle
  const handleDetailOpenChange = (v: boolean) => {
    setDetailOpen(v)
    if (!v) {
      // kısa gecikme ile detail product'ı temizle
      setTimeout(() => setDetailProduct(null), 100)
    }
  }

  const handleEditOpenChange = (v: boolean) => {
    setEditOpen(v)
    if (!v) {
      setTimeout(() => setEditProduct(null), 100)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Boxes className="w-6 h-6 text-emerald-600" />
            Ürün & Stok Yönetimi
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toplam <span className="font-semibold text-foreground">{total}</span> ürün
            {stats.lowStockCount > 0 && (
              <span className="ml-2 text-amber-600 font-medium">· {stats.lowStockCount} düşük/tükenmiş stok</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={lowStockOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLowStockOnly((v) => !v)}
            className={lowStockOnly ? 'bg-amber-600 hover:bg-amber-700' : ''}
          >
            <AlertTriangle className="w-4 h-4 mr-1.5" />
            Düşük Stok
            {stats.lowStockCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                {stats.lowStockCount}
              </Badge>
            )}
          </Button>
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1.5" />
              Dışa Aktar
            </Button>
          )}
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Ürün Ekle
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <ProductStats
        stats={stats}
        defaultCurrency={user?.tenant.defaultCurrency || 'TRY'}
      />

      {/* Filtre barı */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün adı, SKU veya kategori ara..."
                className="pl-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <Select value={category || '__none__'} onValueChange={(v) => setCategory(v === '__none__' ? '' : v)}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Tüm Kategoriler</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Yenile"
            >
              <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                <X className="w-3.5 h-3.5 mr-1" />
                Temizle
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ürün tablosu */}
      <Card>
        <CardContent className="p-0">
          <ProductTable
            products={products}
            isLoading={isLoading}
            activeFilterCount={activeFilterCount}
            onClearFilters={handleClearFilters}
            onOpenAdd={() => setAddOpen(true)}
            openDetail={openDetail}
            openEdit={openEdit}
          />
        </CardContent>
      </Card>

      {/* Footer info */}
      {!isLoading && products.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Boxes className="w-3.5 h-3.5" />
            <span>{products.length} / {total} ürün gösteriliyor</span>
          </div>
          {isFetching && (
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Güncelleniyor...
            </span>
          )}
        </div>
      )}

      {/* Dialogs */}
      <ProductFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      <ProductFormDialog
        open={editOpen}
        onOpenChange={handleEditOpenChange}
        editProduct={editProduct}
      />
      <ProductDetailDialog
        product={detailProduct}
        open={detailOpen}
        onOpenChange={handleDetailOpenChange}
        onEdit={openEdit}
      />
    </div>
  )
}
