'use client'

import { useRef, useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import type { SessionUser } from '@/types'
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Plus, Trash2, Square, Circle, RectangleHorizontal, Pencil, Move,
  Users, AlertCircle, MapPin,
} from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

export interface CafeTable {
  id: string
  cafeId: string
  number: string
  shape: string // square | round | rectangle
  x: number
  y: number
  width: number
  height: number
  capacity: number
  status: string // bos | dolu | rezerve | siparis
  orders?: { id: string; number: string; status: string; total: number; _count: { items: number } }[]
}

interface TablesResponse { items: CafeTable[] }

const STATUS_META: Record<string, { label: string; bg: string; ring: string; dot: string; text: string }> = {
  bos: {
    label: 'Boş',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    ring: 'border-emerald-400 dark:border-emerald-700',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  dolu: {
    label: 'Dolu',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    ring: 'border-amber-400 dark:border-amber-700',
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
  },
  siparis: {
    label: 'Sipariş',
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    ring: 'border-sky-400 dark:border-sky-700',
    dot: 'bg-sky-500',
    text: 'text-sky-700 dark:text-sky-300',
  },
  rezerve: {
    label: 'Rezerve',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    ring: 'border-violet-400 dark:border-violet-700',
    dot: 'bg-violet-500',
    text: 'text-violet-700 dark:text-violet-300',
  },
}

function statusMeta(s: string) {
  return STATUS_META[s] ?? STATUS_META.bos
}

// ============================================================
// Table Layout — kuş bakışı
// ============================================================

export function CafeTableLayout({ cafeId }: { cafeId: string }) {
  const { user } = useAppStore()
  const qc = useQueryClient()
  const canManage = hasPermission(user as SessionUser | null, 'cafe.manage')
  const canOrder = hasPermission(user as SessionUser | null, 'cafe.orders') || canManage

  const { data, isLoading } = useQuery({
    queryKey: ['cafe-tables', cafeId],
    queryFn: () => apiGet<TablesResponse>(`/api/cafe/${cafeId}/tables`),
    refetchInterval: 15_000,
  })

  const tables = data?.items ?? []

  const [selected, setSelected] = useState<CafeTable | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Add form
  const [newNumber, setNewNumber] = useState('')
  const [newShape, setNewShape] = useState('square')
  const [newCapacity, setNewCapacity] = useState(4)

  // Edit form
  const [editNumber, setEditNumber] = useState('')
  const [editShape, setEditShape] = useState('square')
  const [editCapacity, setEditCapacity] = useState(4)
  const [editStatus, setEditStatus] = useState('bos')

  // Drag işlemleri — sayım bazlı (%)
  const containerRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent, t: CafeTable) => {
    if (!canManage) return
    e.stopPropagation()
    // currentTarget her zaman masa kapsayıcı div'dir (handler'ın bağlandığı element).
    // e.target bazen iç span/svg olabilir ve pointer capture desteklemeyebilir.
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // Bazı tarayıcılarda pointer capture desteklenmez — sessizce yoksay.
    }
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    // Tıklanan noktanın masa içindeki oransal konumu
    const px = ((e.clientX - rect.left) / rect.width) * 100
    const py = ((e.clientY - rect.top) / rect.height) * 100
    setDragOffset({ x: px - t.x, y: py - t.y })
    setDragId(t.id)
  }, [canManage])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragId || !canManage) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((e.clientX - rect.left) / rect.width) * 100
    const py = ((e.clientY - rect.top) / rect.height) * 100
    // Yeni konum (clamp)
    const nx = Math.max(0, Math.min(100, px - dragOffset.x))
    const ny = Math.max(0, Math.min(100, py - dragOffset.y))
    // Optimistik: state'i güncelle (drag devam ediyor)
    // Persist sadece pointer up'ta
    // Local cache'i invalidate etmeden güncellemek için setQueryData
    qc.setQueryData<TablesResponse>(['cafe-tables', cafeId], (old) => {
      if (!old) return old
      return {
        ...old,
        items: old.items.map((it) =>
          it.id === dragId ? { ...it, x: nx, y: ny } : it,
        ),
      }
    })
  }, [dragId, dragOffset, canManage, qc, cafeId])

  const handlePointerUp = useCallback(async () => {
    if (!dragId) return
    const table = qc.getQueryData<TablesResponse>(['cafe-tables', cafeId])?.items.find((t) => t.id === dragId)
    setDragId(null)
    if (!table) return
    // Persist
    try {
      await apiPatch(`/api/cafe/${cafeId}/tables/${dragId}`, { x: table.x, y: table.y })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Konum kaydedilemedi')
      qc.invalidateQueries({ queryKey: ['cafe-tables', cafeId] })
    }
  }, [dragId, qc, cafeId])

  // Add table
  async function handleAdd() {
    if (!newNumber.trim()) {
      toast.error('Masa numarası gerekli')
      return
    }
    try {
      await apiPost(`/api/cafe/${cafeId}/tables`, {
        number: newNumber,
        shape: newShape,
        capacity: newCapacity,
      })
      qc.invalidateQueries({ queryKey: ['cafe-tables', cafeId] })
      setAddOpen(false)
      setNewNumber('')
      setNewShape('square')
      setNewCapacity(4)
      toast.success('Masa eklendi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi')
    }
  }

  // Edit table
  function openEdit(t: CafeTable) {
    setSelected(t)
    setEditNumber(t.number)
    setEditShape(t.shape)
    setEditCapacity(t.capacity)
    setEditStatus(t.status)
    setEditOpen(true)
  }

  async function handleSaveEdit() {
    if (!selected) return
    if (!editNumber.trim()) {
      toast.error('Masa numarası gerekli')
      return
    }
    try {
      await apiPatch(`/api/cafe/${cafeId}/tables/${selected.id}`, {
        number: editNumber,
        shape: editShape,
        capacity: editCapacity,
        status: editStatus,
      })
      qc.invalidateQueries({ queryKey: ['cafe-tables', cafeId] })
      setEditOpen(false)
      toast.success('Masa güncellendi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    }
  }

  async function handleDelete() {
    if (!selected) return
    try {
      await apiDelete(`/api/cafe/${cafeId}/tables/${selected.id}`)
      qc.invalidateQueries({ queryKey: ['cafe-tables', cafeId] })
      setDeleteOpen(false)
      setEditOpen(false)
      toast.success('Masa silindi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi')
    }
  }

  const counts = useMemo(() => ({
    total: tables.length,
    bos: tables.filter((t) => t.status === 'bos').length,
    dolu: tables.filter((t) => t.status === 'dolu').length,
    siparis: tables.filter((t) => t.status === 'siparis').length,
    rezerve: tables.filter((t) => t.status === 'rezerve').length,
  }), [tables])

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <CountChip label="Toplam" value={counts.total} color="slate" />
          <CountChip label="Boş" value={counts.bos} color="emerald" />
          <CountChip label="Dolu" value={counts.dolu} color="amber" />
          <CountChip label="Sipariş" value={counts.siparis} color="sky" />
          <CountChip label="Rezerve" value={counts.rezerve} color="violet" />
        </div>
        {canManage && (
          <Button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-1.5" />
            Masa Ekle
          </Button>
        )}
      </div>

      {/* Floor plan */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          {isLoading ? (
            <Skeleton className="aspect-[4/3] w-full rounded-lg" />
          ) : tables.length === 0 ? (
            <div className="aspect-[4/3] w-full rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-center p-6">
              <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-3">
                <MapPin className="w-7 h-7 text-emerald-600/70" />
              </div>
              <h3 className="font-semibold mb-1">Henüz masa yok</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Kafenizin kuş bakışı haritasını oluşturmak için masa ekleyin. Masaları sürükleyerek konumlandırabilirsiniz.
              </p>
              {canManage && (
                <Button onClick={() => setAddOpen(true)} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="w-4 h-4 mr-1.5" />
                  İlk Masayı Ekle
                </Button>
              )}
            </div>
          ) : (
            <div
              ref={containerRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className={cn(
                'relative w-full aspect-[4/3] rounded-lg overflow-hidden select-none',
                'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950',
                'border-2 border-dashed border-border',
                canManage && 'cursor-crosshair',
              )}
              style={{
                backgroundImage: `
                  linear-gradient(rgba(100,116,139,0.08) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(100,116,139,0.08) 1px, transparent 1px)
                `,
                backgroundSize: '5% 5%, 5% 5%',
              }}
            >
              {/* Title overlay */}
              <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold pointer-events-none">
                Kuş Bakışı · {tables.length} masa
              </div>

              {tables.map((t) => {
                const meta = statusMeta(t.status)
                const isRound = t.shape === 'round'
                const isRect = t.shape === 'rectangle'
                const activeOrder = t.orders?.[0]
                return (
                  <div
                    key={t.id}
                    onPointerDown={(e) => handlePointerDown(e, t)}
                    onClick={(e) => {
                      // Sürükleme olmadıysa tıklama
                      if (!dragId) {
                        e.stopPropagation()
                        openEdit(t)
                      }
                    }}
                    className={cn(
                      'absolute flex flex-col items-center justify-center',
                      'border-2 shadow-sm transition-all',
                      meta.bg, meta.ring, meta.text,
                      isRound ? 'rounded-full' : isRect ? 'rounded-lg' : 'rounded-md',
                      canManage ? 'cursor-move hover:shadow-md hover:scale-105' : 'cursor-pointer hover:shadow-md',
                      dragId === t.id && 'shadow-lg scale-105 z-10',
                    )}
                    style={{
                      left: `${t.x}%`,
                      top: `${t.y}%`,
                      width: `${t.width}%`,
                      height: `${t.height}%`,
                      transform: 'translate(-50%, -50%)',
                      touchAction: 'none',
                    }}
                    title={`Masa ${t.number} · ${meta.label}`}
                  >
                    <span className="text-[11px] sm:text-xs font-bold leading-none">{t.number}</span>
                    <span className="hidden sm:flex items-center gap-0.5 text-[9px] mt-0.5 opacity-70">
                      <Users className="w-2.5 h-2.5" />
                      {t.capacity}
                    </span>
                    {activeOrder && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 border-2 border-white dark:border-slate-900 animate-pulse" />
                    )}
                  </div>
                )
              })}

              {/* Drag hint */}
              {canManage && tables.length > 0 && (
                <div className="absolute bottom-2 right-2 text-[10px] text-slate-400 pointer-events-none flex items-center gap-1">
                  <Move className="w-3 h-3" />
                  Sürükle & Konumlandır
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tables list — mobile friendly */}
      <Card>
        <CardContent className="p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Masa Listesi
          </div>
          {tables.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Masa yok</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-72 overflow-y-auto custom-scroll">
              {tables.map((t) => {
                const meta = statusMeta(t.status)
                return (
                  <button
                    key={t.id}
                    onClick={() => openEdit(t)}
                    className={cn(
                      'flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all hover:shadow-sm',
                      meta.bg, meta.ring, meta.text,
                    )}
                  >
                    <div className="text-sm font-bold">{t.number}</div>
                    <div className="text-[10px] flex items-center gap-1 mt-0.5">
                      <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                      {meta.label}
                    </div>
                    <div className="text-[10px] opacity-70 mt-0.5 flex items-center gap-0.5">
                      <Users className="w-2.5 h-2.5" /> {t.capacity}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Masa</DialogTitle>
            <DialogDescription>
              Kafenizin kuş bakışı haritasına masa ekleyin. Konumu sürükleyerek değiştirebilirsiniz.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="t-number">Masa Numarası *</Label>
              <Input
                id="t-number"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="Örn: M1, Teras-1"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label>Şekil</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                  { v: 'square', label: 'Kare', icon: Square },
                  { v: 'round', label: 'Yuvarlak', icon: Circle },
                  { v: 'rectangle', label: 'Dikdörtgen', icon: RectangleHorizontal },
                ].map((s) => (
                  <button
                    key={s.v}
                    onClick={() => setNewShape(s.v)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 p-3 rounded-lg border-2 transition-all',
                      newShape === s.v
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                        : 'border-border hover:border-emerald-300',
                    )}
                  >
                    <s.icon className="w-4 h-4" />
                    <span className="text-xs">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="t-cap">Kapasite (kişi)</Label>
              <Input
                id="t-cap"
                type="number"
                min={1}
                max={20}
                value={newCapacity}
                onChange={(e) => setNewCapacity(Number(e.target.value) || 1)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>İptal</Button>
            <Button onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-1.5" />
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Masa {selected?.number}</DialogTitle>
            <DialogDescription>
              Masa bilgilerini düzenleyin veya durumu değiştirin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="e-number">Masa Numarası</Label>
              <Input
                id="e-number"
                value={editNumber}
                onChange={(e) => setEditNumber(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Şekil</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                  { v: 'square', label: 'Kare', icon: Square },
                  { v: 'round', label: 'Yuvarlak', icon: Circle },
                  { v: 'rectangle', label: 'Dikdörtgen', icon: RectangleHorizontal },
                ].map((s) => (
                  <button
                    key={s.v}
                    onClick={() => setEditShape(s.v)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 p-3 rounded-lg border-2 transition-all',
                      editShape === s.v
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                        : 'border-border hover:border-emerald-300',
                    )}
                  >
                    <s.icon className="w-4 h-4" />
                    <span className="text-xs">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="e-cap">Kapasite</Label>
                <Input
                  id="e-cap"
                  type="number"
                  min={1}
                  max={20}
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(Number(e.target.value) || 1)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Durum</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bos">Boş</SelectItem>
                    <SelectItem value="dolu">Dolu</SelectItem>
                    <SelectItem value="siparis">Sipariş</SelectItem>
                    <SelectItem value="rezerve">Rezerve</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selected?.orders && selected.orders.length > 0 && (
              <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-sky-700 dark:text-sky-300">
                      Aktif Sipariş: {selected.orders[0].number}
                    </div>
                    <div className="text-[10px] text-sky-600 dark:text-sky-400">
                      {selected.orders[0]._count.items} kalem · {selected.orders[0].status}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700">
                    {selected.orders[0].total.toFixed(2)} ₺
                  </Badge>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
            {canManage ? (
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 sm:mr-auto"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Sil
              </Button>
            ) : <div />}
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={() => setEditOpen(false)} className="flex-1 sm:flex-initial">
                Kapat
              </Button>
              {canManage && (
                <Button onClick={handleSaveEdit} className="bg-emerald-600 hover:bg-emerald-700 flex-1 sm:flex-initial">
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Kaydet
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Masa silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.number} numaralı masa kalıcı olarak silinecek. Bu işlem geri alınamaz.
              {selected?.orders && selected.orders.length > 0 && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  Bu masada aktif sipariş var!
                </span>
              )}
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

// ============================================================
// Count chip
// ============================================================

const CHIP_COLORS: Record<string, string> = {
  slate: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/50',
  emerald: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30',
  amber: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30',
  sky: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/30',
  violet: 'text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30',
}

function CountChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={cn('px-3 py-1.5 rounded-lg', CHIP_COLORS[color] ?? CHIP_COLORS.slate)}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
    </div>
  )
}
