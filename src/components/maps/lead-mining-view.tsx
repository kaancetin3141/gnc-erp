'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  MapPin, Search, Download, Plus, Star, Phone, Globe, Check, X,
  Loader2, Users, Eye, UserPlus, ZoomIn, ZoomOut, Layers, History,
  Clock, ChevronRight, Building2, Filter, FileSpreadsheet, AlertCircle,
  CheckCircle2, UserCircle, Sparkles, Navigation,
} from 'lucide-react'

import { apiGet, apiPost, apiPatch, qk } from '@/lib/api-client'
import { CITIES, MAPS_CATEGORIES, LEAD_STATUSES, getLabel, getColor } from '@/lib/constants'
import {
  formatPhone, formatDate, formatRelative, telLink, toCSV, downloadFile,
} from '@/lib/format'
import { hasPermission } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import type { MapsResult, Lead, MapsSearch, UserListItem } from '@/types'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const RADII = [5, 10, 25, 50] as const
const DAILY_LIMIT = 50

// ----------------------------------------------------------------------------
// API response shapes
// ----------------------------------------------------------------------------

interface SearchResponse {
  results: MapsResult[]
  searchId: string
  search: MapsSearch
}
interface ImportResponse {
  created: Lead[]
  skipped: number
  searchId: string
}
interface UsersResponse {
  items: UserListItem[]
}
interface LeadsResponse {
  items: Lead[]
  total: number
}
interface MapsSearchesResponse {
  items: MapsSearch[]
}

// ----------------------------------------------------------------------------
// Small UI helpers
// ----------------------------------------------------------------------------

function StarRating({
  rating,
  reviewCount,
  className,
}: {
  rating: number | null
  reviewCount?: number | null
  className?: string
}) {
  if (rating === null || rating === undefined) {
    return <span className={cn('text-xs text-muted-foreground', className)}>—</span>
  }
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
      <span className="text-xs font-medium tabular-nums">{rating.toFixed(1)}</span>
      {reviewCount !== null && reviewCount !== undefined && reviewCount > 0 && (
        <span className="text-[10px] text-muted-foreground">({reviewCount})</span>
      )}
    </div>
  )
}

function webHref(web: string | null): string | null {
  if (!web) return null
  if (/^https?:\/\//i.test(web)) return web
  return `https://${web}`
}

// ----------------------------------------------------------------------------
// Map bounds + normalization + clustering
// ----------------------------------------------------------------------------

interface Bounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

function computeBounds(results: MapsResult[]): Bounds | null {
  if (results.length === 0) return null
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const r of results) {
    minLat = Math.min(minLat, r.lat)
    maxLat = Math.max(maxLat, r.lat)
    minLng = Math.min(minLng, r.lng)
    maxLng = Math.max(maxLng, r.lng)
  }
  const latRange = maxLat - minLat || 0.01
  const lngRange = maxLng - minLng || 0.01
  return {
    minLat: minLat - latRange * 0.18,
    maxLat: maxLat + latRange * 0.18,
    minLng: minLng - lngRange * 0.18,
    maxLng: maxLng + lngRange * 0.18,
  }
}

function project(lat: number, lng: number, b: Bounds, zoom: number) {
  const xRange = b.maxLng - b.minLng || 1
  const yRange = b.maxLat - b.minLat || 1
  let x = ((lng - b.minLng) / xRange) * 100
  let y = ((b.maxLat - lat) / yRange) * 100 // invert Y
  // zoom around center (50,50)
  x = 50 + (x - 50) * zoom
  y = 50 + (y - 50) * zoom
  // clamp to viewport with padding
  x = Math.max(4, Math.min(96, x))
  y = Math.max(6, Math.min(94, y))
  return { x, y }
}

interface MarkerItem {
  type: 'cluster' | 'single'
  x: number
  y: number
  count: number
  results: MapsResult[]
}

function clusterMarkers(
  positions: { x: number; y: number; result: MapsResult }[],
  threshold: number,
): MarkerItem[] {
  const items: MarkerItem[] = []
  const assigned = new Set<number>()
  for (let i = 0; i < positions.length; i++) {
    if (assigned.has(i)) continue
    const group = [positions[i]]
    assigned.add(i)
    for (let j = i + 1; j < positions.length; j++) {
      if (assigned.has(j)) continue
      const dx = positions[i].x - positions[j].x
      const dy = positions[i].y - positions[j].y
      if (Math.sqrt(dx * dx + dy * dy) < threshold) {
        group.push(positions[j])
        assigned.add(j)
      }
    }
    const cx = group.reduce((s, g) => s + g.x, 0) / group.length
    const cy = group.reduce((s, g) => s + g.y, 0) / group.length
    items.push({
      type: group.length > 1 ? 'cluster' : 'single',
      x: cx,
      y: cy,
      count: group.length,
      results: group.map((g) => g.result),
    })
  }
  return items
}

// ----------------------------------------------------------------------------
// MapView — SVG + HTML markers, zoom, clusters, popover, legend
// ----------------------------------------------------------------------------

interface MapViewProps {
  results: MapsResult[]
  selectedIds: Set<string>
  onToggleSelect: (placeId: string) => void
  city: string | null
  hasSearched: boolean
}

function MapView({
  results, selectedIds, onToggleSelect, city, hasSearched,
}: MapViewProps) {
  const [zoom, setZoom] = useState(1)
  const [activeMarker, setActiveMarker] = useState<MarkerItem | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // NOTE: zoom + activeMarker reset is handled by remount via `key` prop on
  // the parent (key changes per search), so no effect needed here.
  const bounds = useMemo(() => computeBounds(results), [results])

  const items = useMemo(() => {
    if (!bounds) return []
    const positions = results.map((r) => ({
      ...project(r.lat, r.lng, bounds, zoom),
      result: r,
    }))
    // threshold shrinks as we zoom in
    const threshold = Math.max(2.5, 8 / zoom)
    return clusterMarkers(positions, threshold)
  }, [results, bounds, zoom])

  // deterministically generated street lines for visual richness
  const streets = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; w: number; o: number }[] = []
    let seed = 7
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    for (let i = 0; i < 14; i++) {
      const x1 = rand() * 100
      const y1 = rand() * 100
      const len = 20 + rand() * 50
      const angle = rand() * Math.PI * 2
      lines.push({
        x1,
        y1,
        x2: x1 + Math.cos(angle) * len,
        y2: y1 + Math.sin(angle) * len,
        w: 0.4 + rand() * 1.4,
        o: 0.04 + rand() * 0.08,
      })
    }
    return lines
  }, [])

  const handleZoomIn = () => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))
  const handleZoomOut = () => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))

  const markerColor = (r: MapsResult): string => {
    if (r.existsInCrm) return 'emerald'
    if (selectedIds.has(r.placeId)) return 'sky'
    return 'slate'
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[420px] sm:h-[480px] lg:h-[560px] rounded-xl overflow-hidden border border-border bg-slate-100 dark:bg-slate-900 select-none"
    >
      {/* SVG background: gradient + grid + streets + water blobs */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="mapBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.96 0.012 150)" />
            <stop offset="55%" stopColor="oklch(0.94 0.018 170)" />
            <stop offset="100%" stopColor="oklch(0.92 0.014 200)" />
          </linearGradient>
          <radialGradient id="park" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="oklch(0.88 0.05 145)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="oklch(0.88 0.05 145)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="water" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="oklch(0.82 0.04 220)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="oklch(0.82 0.04 220)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#mapBg)" />

        {/* parks + water blobs */}
        <ellipse cx="22" cy="30" rx="14" ry="10" fill="url(#park)" />
        <ellipse cx="78" cy="72" rx="18" ry="12" fill="url(#park)" />
        <ellipse cx="88" cy="22" rx="16" ry="10" fill="url(#water)" />
        <ellipse cx="12" cy="82" rx="12" ry="8" fill="url(#water)" />

        {/* grid lines */}
        <g stroke="oklch(0.7 0.01 200)" strokeWidth="0.12" opacity="0.45">
          {Array.from({ length: 11 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" />
          ))}
          {Array.from({ length: 11 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} />
          ))}
        </g>

        {/* streets */}
        <g stroke="oklch(0.55 0.005 200)" fill="none" strokeLinecap="round">
          {streets.map((s, i) => (
            <line
              key={i}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              strokeWidth={s.w}
              opacity={s.o}
            />
          ))}
        </g>

        {/* main avenues */}
        <g stroke="oklch(0.5 0.005 200)" strokeWidth="0.7" opacity="0.18" fill="none" strokeLinecap="round">
          <path d="M 0 55 Q 30 50 50 52 T 100 48" />
          <path d="M 45 0 Q 48 30 52 50 T 58 100" />
          <path d="M 10 10 Q 40 40 60 60 T 95 90" />
        </g>
      </svg>

      {/* city label */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/85 dark:bg-slate-800/85 backdrop-blur-sm border border-border shadow-sm">
        <Navigation className="w-3.5 h-3.5 text-emerald-600" />
        <span className="text-xs font-semibold">{city || 'Türkiye'}</span>
        <span className="text-[10px] text-muted-foreground">· {results.length} sonuç</span>
      </div>

      {/* zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-lg bg-white/85 dark:bg-slate-800/85 backdrop-blur-sm border border-border shadow-sm p-1">
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          onClick={handleZoomIn} disabled={zoom >= 3}
          aria-label="Yakınlaştır"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Separator className="my-0.5" />
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          onClick={handleZoomOut} disabled={zoom <= 1}
          aria-label="Uzaklaştır"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
      </div>

      {/* markers layer (HTML for native events + popover) */}
      <div className="absolute inset-0">
        {items.map((item, idx) => {
          if (item.type === 'cluster') {
            // dominant color of cluster
            const allCrm = item.results.every((r) => r.existsInCrm)
            const allSelected = item.results.every((r) => selectedIds.has(r.placeId))
            const ringClass = allCrm
              ? 'bg-emerald-500/90 border-emerald-600 text-white'
              : allSelected
                ? 'bg-sky-500/90 border-sky-600 text-white'
                : 'bg-slate-600/90 border-slate-700 text-white'
            return (
              <button
                key={`c${idx}`}
                type="button"
                className={cn(
                  'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-lg',
                  'flex items-center justify-center text-[11px] font-bold backdrop-blur-sm',
                  'hover:scale-110 transition-transform z-10',
                  'min-w-[28px] min-h-[28px] px-1',
                  ringClass,
                )}
                style={{ left: `${item.x}%`, top: `${item.y}%` }}
                onClick={() => {
                  setActiveMarker(item)
                  if (zoom < 3) handleZoomIn()
                }}
                aria-label={`${item.count} işletme küme`}
              >
                {item.count}
              </button>
            )
          }
          const r = item.results[0]
          const color = markerColor(r)
          const isHovered = hovered === r.placeId
          const isActive = activeMarker?.results[0]?.placeId === r.placeId
          const colorClasses: Record<string, string> = {
            emerald: 'text-emerald-600 fill-emerald-500 drop-shadow-emerald',
            sky: 'text-sky-600 fill-sky-500 drop-shadow-sky',
            slate: 'text-slate-500 fill-slate-400',
          }
          return (
            <button
              key={r.placeId}
              type="button"
              className={cn(
                'absolute -translate-x-1/2 -translate-y-full transition-transform',
                'hover:scale-125 hover:z-20 focus:z-20 focus:outline-none',
                (isHovered || isActive) && 'scale-125 z-20',
              )}
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
              onMouseEnter={() => setHovered(r.placeId)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setActiveMarker(item)}
              aria-label={r.name}
            >
              <svg width="26" height="34" viewBox="0 0 26 34" className="overflow-visible">
                <path
                  d="M13 0C5.8 0 0 5.8 0 13c0 9.5 13 21 13 21s13-11.5 13-21C26 5.8 20.2 0 13 0z"
                  className={colorClasses[color]}
                  stroke="white"
                  strokeWidth="1.6"
                />
                <circle cx="13" cy="13" r="4.5" fill="white" />
              </svg>
              {(selectedIds.has(r.placeId) || r.existsInCrm) && (
                <span
                  className={cn(
                    'absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow',
                    r.existsInCrm ? 'bg-emerald-500' : 'bg-sky-500',
                  )}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* active marker popover */}
      {activeMarker && (
        <div
          className="absolute z-30"
          style={{
            left: `${Math.min(72, Math.max(28, activeMarker.x))}%`,
            top: `${Math.max(20, activeMarker.y - 8)}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="relative rounded-lg border border-border bg-popover text-popover-foreground shadow-xl p-3 w-60 animate-fade-in">
            <button
              type="button"
              className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setActiveMarker(null)}
              aria-label="Kapat"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {activeMarker.type === 'cluster' ? (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {activeMarker.count} işletme
                  </span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto custom-scroll pr-1">
                  {activeMarker.results.slice(0, 6).map((r) => (
                    <button
                      key={r.placeId}
                      type="button"
                      className="w-full text-left text-xs hover:bg-muted rounded px-1.5 py-1 flex items-center gap-1.5"
                      onClick={() => {
                        onToggleSelect(r.placeId)
                      }}
                    >
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          r.existsInCrm ? 'bg-emerald-500' : selectedIds.has(r.placeId) ? 'bg-sky-500' : 'bg-slate-400',
                        )}
                      />
                      <span className="truncate">{r.name}</span>
                    </button>
                  ))}
                  {activeMarker.results.length > 6 && (
                    <div className="text-[10px] text-muted-foreground px-1.5 pt-0.5">
                      +{activeMarker.results.length - 6} daha...
                    </div>
                  )}
                </div>
                {zoom < 3 && (
                  <Button
                    size="sm" variant="outline" className="w-full mt-2 h-7 text-xs"
                    onClick={handleZoomIn}
                  >
                    <ZoomIn className="w-3 h-3 mr-1" /> Yakınlaştır
                  </Button>
                )}
              </div>
            ) : (
              (() => {
                const r = activeMarker.results[0]
                return (
                  <div>
                    <div className="flex items-start gap-2 mb-1.5 pr-4">
                      <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold leading-tight truncate">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground">{r.category}</div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{r.address}</p>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <StarRating rating={r.rating} reviewCount={r.reviewCount} />
                      {r.existsInCrm ? (
                        <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 mr-0.5" /> CRM'de var
                        </Badge>
                      ) : selectedIds.has(r.placeId) ? (
                        <Badge className="text-[10px] h-5 bg-sky-100 text-sky-700 border-sky-200">
                          <Check className="w-3 h-3 mr-0.5" /> Seçili
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-5">Yeni</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {r.phone && (
                        <Button asChild size="sm" variant="outline" className="h-7 flex-1 text-xs">
                          <a href={telLink(r.phone)} target="_blank" rel="noreferrer">
                            <Phone className="w-3 h-3 mr-1" /> Ara
                          </a>
                        </Button>
                      )}
                      {!r.existsInCrm && (
                        <Button
                          size="sm" variant={selectedIds.has(r.placeId) ? 'secondary' : 'default'}
                          className="h-7 flex-1 text-xs"
                          onClick={() => onToggleSelect(r.placeId)}
                        >
                          {selectedIds.has(r.placeId) ? (
                            <><Check className="w-3 h-3 mr-1" /> Seçili</>
                          ) : (
                            <><Plus className="w-3 h-3 mr-1" /> Seç</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })()
            )}
          </div>
        </div>
      )}

      {/* legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 px-3 py-2 rounded-lg bg-white/85 dark:bg-slate-800/85 backdrop-blur-sm border border-border shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-medium">Mevcut</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
          <span className="text-[10px] font-medium">Seçili</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
          <span className="text-[10px] font-medium">Yeni</span>
        </div>
      </div>

      {/* empty state */}
      {!hasSearched && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center max-w-xs px-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border border-border flex items-center justify-center mb-3 shadow-sm">
              <MapPin className="w-7 h-7 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Arama yapınca sonuçlar burada görünecek
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Soldaki formu doldurup "Ara" butonuna tıklayın
            </p>
          </div>
        </div>
      )}

      {hasSearched && results.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">Sonuç bulunamadı</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Farklı bir sorgu deneyin</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Import dialog
// ----------------------------------------------------------------------------

interface ImportDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  selectedResults: MapsResult[]
  searchId: string | null
  onImported: () => void
}

function ImportDialog({
  open, onOpenChange, selectedResults, searchId, onImported,
}: ImportDialogProps) {
  const { user } = useAppStore()
  const qc = useQueryClient()
  // Initialize owner to the current user from the store (sync, persisted).
  // No effect needed — the store is hydrated synchronously via zustand/persist
  // and this component only mounts after login.
  const [ownerId, setOwnerId] = useState<string>(
    () => useAppStore.getState().user?.id ?? '',
  )

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: qk.users,
    queryFn: () => apiGet<UsersResponse>('/api/users'),
    enabled: open,
  })

  const importMutation = useMutation({
    mutationFn: () =>
      apiPost<ImportResponse>('/api/maps/import', {
        searchId,
        items: selectedResults,
        ownerId,
      }),
    onSuccess: (data) => {
      const createdCount = data.created.length
      const skippedCount = data.skipped
      if (createdCount > 0) {
        toast.success(`${createdCount} lead içe aktarıldı`, {
          description: skippedCount > 0 ? `${skippedCount} kayıt zaten mevcut, atlandı.` : undefined,
        })
      } else {
        toast.info('İçe aktarılacak yeni kayıt yok', {
          description: `${skippedCount} kayıt zaten CRM'de mevcut.`,
        })
      }
      qc.invalidateQueries({ queryKey: qk.leads({ source: 'google_maps' }) })
      qc.invalidateQueries({ queryKey: qk.mapsSearches })
      onImported()
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error('İçe aktarma başarısız', { description: e.message }),
  })

  const users = usersData?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lead Olarak Aktar</DialogTitle>
          <DialogDescription>
            {selectedResults.length} kayıt seçili. Bir sahibi atayın ve içe aktarın.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Seçili kayıt</span>
              <span className="font-semibold">{selectedResults.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">CRM'de var (atlanacak)</span>
              <span className="font-semibold text-amber-600">
                {selectedResults.filter((r) => r.existsInCrm).length}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Yeni eklenecek</span>
              <span className="font-semibold text-emerald-600">
                {selectedResults.filter((r) => !r.existsInCrm).length}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Sahip</label>
            <Select value={ownerId} onValueChange={setOwnerId} disabled={usersLoading}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Kullanıcı seçin" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <span className="flex items-center gap-2">
                      <UserCircle className="w-3.5 h-3.5 text-muted-foreground" />
                      {u.name}
                      {u.id === user?.id && (
                        <span className="text-[10px] text-muted-foreground">(sen)</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Leadler bu kullanıcıya atanacak. İstediğin zaman lead detayından değiştirebilirsin.
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">İptal</Button>
          </DialogClose>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending || !ownerId || selectedResults.length === 0}
          >
            {importMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-1.5" />
            )}
            İçe Aktar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ----------------------------------------------------------------------------
// Lead detail dialog (view action)
// ----------------------------------------------------------------------------

function LeadDetailDialog({
  lead, open, onOpenChange,
}: {
  lead: Lead | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  if (!lead) return null
  const statusColor = getColor(LEAD_STATUSES, lead.status)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            {lead.name}
          </DialogTitle>
          <DialogDescription>
            {lead.category || 'Kategori belirtilmedi'} · {lead.city || 'Şehir belirtilmedi'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Durum</div>
            <Badge variant="outline" className={cn('text-xs', statusColor)}>
              {getLabel(LEAD_STATUSES, lead.status)}
            </Badge>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Sahip</div>
            <div>{lead.owner?.name ?? '—'}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Telefon</div>
            {lead.phone ? (
              <a href={telLink(lead.phone)} className="text-emerald-600 hover:underline flex items-center gap-1">
                <Phone className="w-3 h-3" /> {formatPhone(lead.phone)}
              </a>
            ) : <span>—</span>}
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Web</div>
            {lead.web ? (
              <a href={webHref(lead.web) || '#'} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline flex items-center gap-1 truncate">
                <Globe className="w-3 h-3 shrink-0" /> <span className="truncate">{lead.web}</span>
              </a>
            ) : <span>—</span>}
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Puan</div>
            <StarRating rating={lead.rating} reviewCount={lead.reviewCount} />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Oluşturulma</div>
            <div>{formatDate(lead.createdAt)}</div>
          </div>
          <div className="col-span-2 space-y-1">
            <div className="text-xs text-muted-foreground">Adres</div>
            <div className="text-sm">{lead.address || '—'}</div>
          </div>
        </div>

        {lead.convertedCustomer && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Müşteriye dönüştürüldü
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{lead.convertedCustomer.name}</div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Kapat</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------

export function LeadMiningView() {
  const { user, openCustomer } = useAppStore()
  const qc = useQueryClient()

  // search form state
  const [query, setQuery] = useState('')
  const [city, setCity] = useState<string>('İstanbul')
  const [radius, setRadius] = useState<number>(10)

  // results state
  const [results, setResults] = useState<MapsResult[]>([])
  const [searchId, setSearchId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hasSearched, setHasSearched] = useState(false)

  // dialog state
  const [importOpen, setImportOpen] = useState(false)
  const [detailLead, setDetailLead] = useState<Lead | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // leads filter
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('')

  const canImport = hasPermission(user, 'leads.import')
  const canSearch = hasPermission(user, 'maps.search')

  // ---- recent searches (for history + daily limit) ----
  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: qk.mapsSearches,
    queryFn: () => apiGet<MapsSearchesResponse>('/api/maps/search?limit=20'),
  })
  const recentSearches = recentData?.items ?? []

  const todayCount = useMemo(() => {
    const today = new Date()
    return recentSearches.filter((s) => {
      const d = new Date(s.createdAt)
      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      )
    }).length
  }, [recentSearches])

  const limitReached = todayCount >= DAILY_LIMIT

  // ---- search mutation ----
  const searchMutation = useMutation({
    mutationFn: (vars: { query: string; city: string; radius: number }) =>
      apiPost<SearchResponse>('/api/maps/search', {
        query: vars.query,
        city: vars.city,
        radius: vars.radius * 1000, // km → m
      }),
    onSuccess: (data) => {
      setResults(data.results)
      setSearchId(data.searchId)
      setSelectedIds(new Set())
      setHasSearched(true)
      qc.invalidateQueries({ queryKey: qk.mapsSearches })
      toast.success(`${data.results.length} işletme bulundu`, {
        description: `${data.results.filter((r) => r.existsInCrm).length} tanesi zaten CRM'de.`,
      })
    },
    onError: (e: Error) => toast.error('Arama başarısız', { description: e.message }),
  })

  const handleSearch = useCallback(() => {
    if (!query.trim()) {
      toast.error('Arama sorgusu gerekli')
      return
    }
    if (!city) {
      toast.error('Şehir seçin')
      return
    }
    if (limitReached) {
      toast.error('Günlük arama limitine ulaşıldı', {
        description: `Limit: ${DAILY_LIMIT} arama/gün. Yarın tekrar deneyin.`,
      })
      return
    }
    searchMutation.mutate({ query: query.trim(), city, radius })
  }, [query, city, radius, limitReached, searchMutation])

  const rerunSearch = useCallback((s: MapsSearch) => {
    setQuery(s.query)
    setCity(s.city || 'İstanbul')
    setRadius(s.radius ? Math.round(s.radius / 1000) : 10)
    if (limitReached) {
      toast.error('Günlük arama limitine ulaşıldı')
      return
    }
    searchMutation.mutate({
      query: s.query,
      city: s.city || 'İstanbul',
      radius: s.radius ? Math.round(s.radius / 1000) : 10,
    })
  }, [limitReached, searchMutation])

  // ---- selection ----
  const toggleSelect = useCallback((placeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(placeId)) next.delete(placeId)
      else next.add(placeId)
      return next
    })
  }, [])

  const selectAllNew = useCallback(() => {
    setSelectedIds(new Set(results.filter((r) => !r.existsInCrm).map((r) => r.placeId)))
  }, [results])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const selectedResults = useMemo(
    () => results.filter((r) => selectedIds.has(r.placeId)),
    [results, selectedIds],
  )

  // ---- CSV export ----
  const handleExportCsv = useCallback(() => {
    if (results.length === 0) {
      toast.error('Dışa aktarılacak sonuç yok')
      return
    }
    const rows = results.map((r) => ({
      Ad: r.name,
      Kategori: r.category,
      Adres: r.address,
      Sehir: r.city,
      Telefon: r.phone || '',
      Web: r.web || '',
      Puan: r.rating ?? '',
      YorumSayisi: r.reviewCount ?? '',
      CRMdeVar: r.existsInCrm ? 'evet' : 'hayir',
      Enlem: r.lat,
      Boylam: r.lng,
    }))
    const csv = toCSV(rows)
    const dateStr = new Date().toISOString().slice(0, 10)
    downloadFile(csv, `maps-arama-${dateStr}.csv`)
    toast.success('CSV indirildi', { description: `${results.length} kayıt` })
  }, [results])

  // ---- leads from maps ----
  const leadsQuery = useQuery({
    queryKey: qk.leads({ source: 'google_maps', status: leadStatusFilter }),
    queryFn: () => {
      const params = new URLSearchParams({ source: 'google_maps', limit: '100' })
      if (leadStatusFilter) params.set('status', leadStatusFilter)
      return apiGet<LeadsResponse>(`/api/leads?${params.toString()}`)
    },
  })
  const leads = leadsQuery.data?.items ?? []

  const convertMutation = useMutation({
    mutationFn: (id: string) =>
      apiPatch<Lead>(`/api/leads/${id}`, { status: 'donustu' }),
    onSuccess: (lead) => {
      toast.success('Müşteriye dönüştürüldü', {
        description: lead.convertedCustomer
          ? `"${lead.name}" → ${lead.convertedCustomer.name} olarak oluşturuldu`
          : `"${lead.name}" müşteri olarak işaretlendi`,
        action: lead.convertedCustomer ? {
          label: 'Görüntüle',
          onClick: () => openCustomer(lead.convertedCustomer!.id),
        } : undefined,
      })
      qc.invalidateQueries({ queryKey: qk.leads({ source: 'google_maps' }) })
    },
    onError: (e: Error) => toast.error('Dönüştürme başarısız', { description: e.message }),
  })

  const openDetail = (lead: Lead) => {
    setDetailLead(lead)
    setDetailOpen(true)
  }

  // ---- daily limit display ----
  const limitPct = Math.min(100, (todayCount / DAILY_LIMIT) * 100)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="w-6 h-6 text-emerald-600" />
            Potansiyel Müşteri Madenciliği
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Google Maps üzerindeki işletmeleri ara, seç ve CRM'ne lead olarak aktar.
          </p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="grid lg:grid-cols-5 gap-4">
        {/* ---------- LEFT PANEL ---------- */}
        <div className="lg:col-span-3 space-y-4">
          {/* Search form card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  Arama
                </CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border',
                      limitReached
                        ? 'border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900/50'
                        : limitPct > 70
                          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/50'
                          : 'border-border bg-muted/40 text-muted-foreground',
                    )}>
                      <AlertCircle className="w-3 h-3" />
                      <span className="font-medium">Günlük arama limiti: {todayCount}/{DAILY_LIMIT}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Maps API maliyet koruması için günlük {DAILY_LIMIT} arama ile sınırlıdır.
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* category quick-select chips */}
              <div className="flex flex-wrap gap-1.5">
                {MAPS_CATEGORIES.map((c) => (
                  <button
                    key={c.query}
                    type="button"
                    onClick={() => setQuery(c.query)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full border transition-colors',
                      'hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700',
                      'dark:hover:bg-emerald-950/30 dark:hover:border-emerald-800',
                      query === c.query
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800'
                        : 'bg-muted/40 border-border text-muted-foreground',
                    )}
                  >
                    {c.category}
                  </button>
                ))}
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                <div className="sm:col-span-1">
                  <Input
                    placeholder="Arama sorgusu (örn: diş kliniği)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                    disabled={!canSearch || limitReached || searchMutation.isPending}
                  />
                </div>
                <Select value={city} onValueChange={setCity} disabled={!canSearch || searchMutation.isPending}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Şehir" />
                  </SelectTrigger>
                  <SelectContent>
                    {CITIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(radius)}
                  onValueChange={(v) => setRadius(Number(v))}
                  disabled={!canSearch || searchMutation.isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Yarıçap" />
                  </SelectTrigger>
                  <SelectContent>
                    {RADII.map((r) => (
                      <SelectItem key={r} value={String(r)}>{r} km</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleSearch}
                  disabled={!canSearch || limitReached || searchMutation.isPending}
                >
                  {searchMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 mr-1.5" />
                  )}
                  Ara
                </Button>
                {hasSearched && results.length > 0 && (
                  <Button variant="outline" onClick={handleExportCsv}>
                    <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                    CSV Dışa Aktar
                  </Button>
                )}
                {!canSearch && (
                  <span className="text-xs text-muted-foreground">
                    Harita araması yapma yetkiniz yok.
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results card */}
          {searchMutation.isPending && !hasSearched ? (
            <Card>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ) : hasSearched ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    Sonuçlar
                    <Badge variant="secondary" className="ml-1">{results.length}</Badge>
                    {selectedIds.size > 0 && (
                      <Badge className="ml-1 bg-sky-100 text-sky-700 border-sky-200">
                        {selectedIds.size} seçili
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={selectAllNew}
                      disabled={results.length === 0}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Tümünü Seç
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={clearSelection}
                      disabled={selectedIds.size === 0}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Seçimi Temizle
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {results.length === 0 ? (
                  <div className="p-8 text-center">
                    <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Sonuç bulunamadı.</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Farklı bir sorgu veya şehir deneyin.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-[420px] overflow-y-auto custom-scroll border-t">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="w-10 pl-4">
                            <Checkbox
                              checked={results.length > 0 && results.every((r) => r.existsInCrm || selectedIds.has(r.placeId))}
                              onCheckedChange={(v) => {
                                if (v) selectAllNew()
                                else clearSelection()
                              }}
                              aria-label="Tümünü seç"
                            />
                          </TableHead>
                          <TableHead>İşletme</TableHead>
                          <TableHead className="hidden md:table-cell">Adres</TableHead>
                          <TableHead className="hidden lg:table-cell">İletişim</TableHead>
                          <TableHead className="text-right">Puan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r) => {
                          const selected = selectedIds.has(r.placeId)
                          return (
                            <TableRow
                              key={r.placeId}
                              data-state={selected ? 'selected' : undefined}
                              className="cursor-pointer"
                              onClick={() => toggleSelect(r.placeId)}
                            >
                              <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selected}
                                  onCheckedChange={() => toggleSelect(r.placeId)}
                                  disabled={r.existsInCrm}
                                  aria-label={r.name}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="min-w-0">
                                    <div className="font-medium text-sm truncate flex items-center gap-1.5">
                                      {r.name}
                                      {r.existsInCrm && (
                                        <Badge className="text-[10px] h-4 px-1 bg-emerald-100 text-emerald-700 border-emerald-200">
                                          <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> CRM'de
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">{r.category}</div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell max-w-[220px]">
                                <span className="text-xs text-muted-foreground truncate block">
                                  {r.address}
                                </span>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <div className="flex items-center gap-1.5">
                                  {r.phone && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <a
                                          href={telLink(r.phone)}
                                          onClick={(e) => e.stopPropagation()}
                                          target="_blank" rel="noreferrer"
                                          className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600"
                                        >
                                          <Phone className="w-3.5 h-3.5" />
                                        </a>
                                      </TooltipTrigger>
                                      <TooltipContent>{formatPhone(r.phone)}</TooltipContent>
                                    </Tooltip>
                                  )}
                                  {r.web && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <a
                                          href={webHref(r.web) || '#'}
                                          onClick={(e) => e.stopPropagation()}
                                          target="_blank" rel="noreferrer"
                                          className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-sky-50 hover:border-sky-200 hover:text-sky-600"
                                        >
                                          <Globe className="w-3.5 h-3.5" />
                                        </a>
                                      </TooltipTrigger>
                                      <TooltipContent>{r.web}</TooltipContent>
                                    </Tooltip>
                                  )}
                                  {!r.phone && !r.web && (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <StarRating rating={r.rating} reviewCount={r.reviewCount} className="justify-end" />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
              {results.length > 0 && selectedIds.size > 0 && (
                <div className="border-t bg-muted/30 p-3 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size} kayıt lead olarak aktarılacak
                  </span>
                  <Button
                    size="sm"
                    onClick={() => setImportOpen(true)}
                    disabled={!canImport}
                  >
                    <UserPlus className="w-4 h-4 mr-1.5" />
                    Seçilenleri Lead Olarak Aktar
                  </Button>
                </div>
              )}
            </Card>
          ) : null}

          {/* Recent searches */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5">
                <History className="w-4 h-4 text-muted-foreground" />
                Son Aramalar
              </CardTitle>
              <CardDescription className="text-xs">
                Tekrar çalıştırmak için bir aramaya tıklayın.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {recentLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : recentSearches.length === 0 ? (
                <div className="p-6 text-center">
                  <Clock className="w-7 h-7 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Henüz arama geçmişi yok.</p>
                </div>
              ) : (
                <ScrollArea className="max-h-72">
                  <div className="divide-y">
                    {recentSearches.slice(0, 10).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => rerunSearch(s)}
                        className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                          <Search className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{s.query}</span>
                            <Badge variant="outline" className="text-[10px] h-4 px-1">
                              {s.city || '—'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span>{s.resultCount} sonuç</span>
                            {s.importedCount > 0 && (
                              <>
                                <span>·</span>
                                <span className="text-emerald-600">{s.importedCount} aktarıldı</span>
                              </>
                            )}
                            <span>·</span>
                            <span>{formatRelative(s.createdAt)}</span>
                            {s.user && s.user.id !== user?.id && (
                              <>
                                <span>·</span>
                                <span>{s.user.name}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---------- RIGHT PANEL: MAP ---------- */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-4 space-y-3">
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  Harita Görünümü
                </CardTitle>
                <CardDescription className="text-xs">
                  {hasSearched
                    ? `${results.length} işletme haritada gösteriliyor`
                    : 'Arama sonuçları haritada görünecek'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <MapView
                  key={searchId ?? 'initial'}
                  results={results}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  city={city}
                  hasSearched={hasSearched}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ---------- LEADS FROM MAPS ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-violet-600" />
                Maps Leadleri
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Google Maps'ten içe aktarılan potansiyel müşteriler
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setLeadStatusFilter('')}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                    leadStatusFilter === ''
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  Tümü
                </button>
                {LEAD_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setLeadStatusFilter(s.value)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full border transition-colors',
                      leadStatusFilter === s.value
                        ? cn(s.color, 'font-medium')
                        : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {leadsQuery.isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : leads.length === 0 ? (
            <div className="p-10 text-center">
              <UserPlus className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {leadStatusFilter
                  ? 'Bu durumda Maps leadi yok.'
                  : 'Henüz Maps leadi yok.'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Yukarıdan arama yapıp seçili işletmeleri lead olarak aktarın.
              </p>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto custom-scroll border-t">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="pl-4">İşletme</TableHead>
                    <TableHead className="hidden md:table-cell">Şehir</TableHead>
                    <TableHead className="hidden lg:table-cell">İletişim</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Puan</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="hidden md:table-cell">Sahip</TableHead>
                    <TableHead className="hidden lg:table-cell">Tarih</TableHead>
                    <TableHead className="text-right pr-4">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => {
                    const statusColor = getColor(LEAD_STATUSES, lead.status)
                    return (
                      <TableRow key={lead.id}>
                        <TableCell className="pl-4">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{lead.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {lead.category || '—'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {lead.city || '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {lead.phone ? (
                            <a
                              href={telLink(lead.phone)}
                              className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3" />
                              {formatPhone(lead.phone)}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-right">
                          <StarRating rating={lead.rating} reviewCount={lead.reviewCount} className="justify-end" />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px]', statusColor)}>
                            {getLabel(LEAD_STATUSES, lead.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {lead.owner?.name ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(lead.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => openDetail(lead)}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Görüntüle</TooltipContent>
                            </Tooltip>
                            {lead.status !== 'donustu' ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon" variant="ghost" className="h-7 w-7 hover:bg-emerald-50 hover:text-emerald-600"
                                    onClick={() => convertMutation.mutate(lead.id)}
                                    disabled={convertMutation.isPending}
                                  >
                                    <UserPlus className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Müşteriye Dönüştür</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 text-emerald-700 border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 mr-0.5" /> Dönüştü
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        selectedResults={selectedResults}
        searchId={searchId}
        onImported={() => {
          // drop CRM-existing from selection after import
          setSelectedIds(new Set())
        }}
      />
      <LeadDetailDialog lead={detailLead} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  )
}
