'use client'

// GERÇEK interaktif harita — Leaflet + OpenStreetMap tile'ları (API anahtarsız).
// next/dynamic { ssr: false } ile yüklenir; leaflet yalnızca tarayıcıda import edilir.

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { cn } from '@/lib/utils'
import type { MapsResult } from '@/types'

// ----------------------------------------------------------------------------
// Tipler
// ----------------------------------------------------------------------------

export interface CustomerPoint {
  id: string
  name: string
  lat: number
  lng: number
  city: string | null
  address: string | null
}

export interface MapFocus {
  lat: number
  lng: number
  label?: string
}

export interface OsmMapProps {
  results: MapsResult[]
  selectedIds: Set<string>
  hoveredId: string | null
  onToggleSelect: (placeId: string) => void
  focus: MapFocus | null
  customers: CustomerPoint[]
  showCustomers: boolean
  city: string | null
  resultCount: number
  hasSearched: boolean
  searching: boolean
}

// ----------------------------------------------------------------------------
// Kategori → ikon (emoji) + renk
// ----------------------------------------------------------------------------

const CATEGORY_EMOJI: [RegExp, string][] = [
  [/kafe|cafe/i, '☕'],
  [/restoran/i, '🍽️'],
  [/market/i, '🛒'],
  [/kuaför|güzellik/i, '✂️'],
  [/diş/i, '🦷'],
  [/eczane/i, '💊'],
  [/otomotiv/i, '🔧'],
  [/benzinlik/i, '⛽'],
  [/spor/i, '💪'],
  [/hukuk|avukat/i, '⚖️'],
  [/muhasebe/i, '🧾'],
  [/otel/i, '🛏️'],
  [/veteriner/i, '🐾'],
  [/eğitim/i, '🎓'],
  [/emlak/i, '🏠'],
  [/butik/i, '👗'],
  [/eğlence/i, '🎳'],
]

function categoryEmoji(category: string): string {
  for (const [re, emoji] of CATEGORY_EMOJI) {
    if (re.test(category)) return emoji
  }
  return '🏢'
}

const COLOR = {
  crm: '#10b981', // emerald — CRM'de var
  selected: '#0ea5e9', // sky — seçili
  idle: '#64748b', // slate — yeni
  customer: '#8b5cf6', // violet — müşteri katmanı
  focus: '#8b5cf6',
} as const

// ----------------------------------------------------------------------------
// Pin + popup üretimi
// ----------------------------------------------------------------------------

function pinHtml(r: MapsResult, state: { selected: boolean; hovered: boolean }): {
  html: string
  color: string
} {
  const color = r.existsInCrm
    ? COLOR.crm
    : state.selected
      ? COLOR.selected
      : COLOR.idle
  const emoji = categoryEmoji(r.category)
  const html = `
    <div class="osm-pin ${state.hovered ? 'osm-pin--hover' : ''}"
         style="background:${color}"
         role="img"
         aria-label="${r.name.replace(/"/g, '&quot;')}">
      <span>${emoji}</span>
    </div>`
  return { html, color }
}

function pinIcon(r: MapsResult, state: { selected: boolean; hovered: boolean }): L.DivIcon {
  const { html } = pinHtml(r, state)
  return L.divIcon({
    html,
    className: '', // leaflet default stilini devre dışı bırak
    iconSize: [28, 28],
    iconAnchor: [14, 26], // pin ucu (rotate edilmiş köşe) kabaca aşağıda
    popupAnchor: [0, -14],
  })
}

function buildPopupEl(
  r: MapsResult,
  selected: boolean,
  onToggle: (placeId: string) => void,
): HTMLElement {
  const el = document.createElement('div')
  el.className = 'space-y-1.5 min-w-[200px]'

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const webHref = r.web
    ? /^https?:\/\//i.test(r.web) ? r.web : `https://${r.web}`
    : null

  el.innerHTML = `
    <div style="font-weight:600;font-size:13px;line-height:1.25;">${esc(r.name)}</div>
    <div style="font-size:11px;color:#64748b;">${esc(r.category)}${r.city ? ' · ' + esc(r.city) : ''}</div>
    <div style="font-size:11px;color:#475569;line-height:1.4;">${esc(r.address || '')}</div>
    ${r.phone ? `
      <div style="font-size:11px;">
        <a href="tel:${esc(r.phone.replace(/\s/g, ''))}" style="color:#059669;font-weight:500;">📞 ${esc(r.phone)}</a>
      </div>` : ''}
    ${webHref ? `
      <div style="font-size:11px;">
        <a href="${esc(webHref)}" target="_blank" rel="noreferrer" style="color:#0284c7;word-break:break-all;">🌐 ${esc(r.web!)}</a>
      </div>` : ''}
    ${r.existsInCrm ? `
      <div style="font-size:11px;color:#059669;font-weight:600;">✓ CRM'de kayıtlı</div>` : ''}
    <div style="padding-top:4px;">
      <button data-act="toggle" type="button" ${r.existsInCrm ? 'disabled' : ''}
        style="width:100%;font-size:12px;font-weight:600;padding:5px 8px;border-radius:8px;cursor:${r.existsInCrm ? 'not-allowed' : 'pointer'};border:1px solid ${r.existsInCrm ? '#d1d5db' : '#0f172a'};
        background:${selected ? '#0ea5e9' : '#0f172a'};color:#fff;opacity:${r.existsInCrm ? 0.5 : 1};">
        ${r.existsInCrm ? "CRM'de var" : selected ? '✓ Seçili — çıkar' : "CRM'e Aktar (seç)"}
      </button>
    </div>`

  const btn = el.querySelector<HTMLButtonElement>('[data-act="toggle"]')
  btn?.addEventListener('click', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    onToggle(r.placeId)
  })

  return el
}

// ----------------------------------------------------------------------------
// Bileşen
// ----------------------------------------------------------------------------

export function OsmMap({
  results,
  selectedIds,
  hoveredId,
  onToggleSelect,
  focus,
  customers,
  showCustomers,
  city,
  resultCount,
  hasSearched,
  searching,
}: OsmMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const resultsLayerRef = useRef<L.LayerGroup | null>(null)
  const customerLayerRef = useRef<L.LayerGroup | null>(null)
  const focusLayerRef = useRef<L.LayerGroup | null>(null)
  const toggleRef = useRef(onToggleSelect)

  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    toggleRef.current = onToggleSelect
  }, [onToggleSelect])

  // ---- Harita kurulumu (bir kez) ----
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = L.map(container, {
      center: [39.5, 35.2], // Türkiye
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
    })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> katkıcıları',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map
    setMapReady(true)

    // konteyner boyutu değişince haritayı yeniden ölçekle
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(container)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      markersRef.current.clear()
      resultsLayerRef.current = null
      customerLayerRef.current = null
      focusLayerRef.current = null
      setMapReady(false)
    }
  }, [])

  // ---- Sonuç pinleri — results değişince yeniden kur ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    resultsLayerRef.current?.removeFrom(map)
    markersRef.current.clear()

    const group = L.layerGroup()
    for (const r of results) {
      const marker = L.marker([r.lat, r.lng], {
        icon: pinIcon(r, {
          selected: selectedIds.has(r.placeId),
          hovered: hoveredId === r.placeId,
        }),
        riseOnHover: true,
        title: r.name,
      })
      marker.bindPopup(
        buildPopupEl(r, selectedIds.has(r.placeId), (id) => toggleRef.current(id)),
        { maxWidth: 260, closeButton: true, autoPan: true },
      )
      group.addLayer(marker)
      markersRef.current.set(r.placeId, marker)
    }
    group.addTo(map)
    resultsLayerRef.current = group

    // arama sonrası sonuçlara sığdır
    if (results.length > 0) {
      const bounds = L.latLngBounds(results.map((r) => [r.lat, r.lng] as [number, number]))
      map.flyToBounds(bounds.pad(0.25), { maxZoom: 16, duration: 0.9 })
    }
    // Not: selectedIds/hoveredId kasıtlı olarak bağımlılık dışı — durum güncellemesi
    // ayrı aşağıdaki effect ile ikon değişimiyle yapılır (popup açık kalır).
  }, [results, mapReady])

  // ---- Seçim / hover durum değişimi — pin ikonlarını güncelle ----
  useEffect(() => {
    for (const r of results) {
      const marker = markersRef.current.get(r.placeId)
      if (!marker) continue
      marker.setIcon(
        pinIcon(r, {
          selected: selectedIds.has(r.placeId),
          hovered: hoveredId === r.placeId,
        }),
      )
    }
  }, [results, selectedIds, hoveredId])

  // ---- Geocode odak noktası — uçuş + hedef halkası ----
  // Not: focus objesi her render'da yeniden üretilir; yalnızca koordinat
  // değişince uçuş yapılır (focusKeyRef guard).
  const focusKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const key = focus ? `${focus.lat},${focus.lng}` : null
    const changed = key !== focusKeyRef.current
    focusKeyRef.current = key
    if (!focus || !changed) {
      if (!focus) {
        focusLayerRef.current?.removeFrom(map)
        focusLayerRef.current = null
      }
      return
    }
    map.flyTo([focus.lat, focus.lng], 15, { duration: 1.1 })

    focusLayerRef.current?.removeFrom(map)
    const group = L.layerGroup()
    L.marker([focus.lat, focus.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:9999px;border:3px solid ${COLOR.focus};background:rgba(139,92,246,.25);box-shadow:0 0 0 4px rgba(139,92,246,.18);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      interactive: false,
    }).addTo(group)
    group.addTo(map)
    focusLayerRef.current = group
  }, [focus, mapReady])

  // ---- Müşteri katmanı ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    customerLayerRef.current?.removeFrom(map)
    if (!showCustomers) {
      customerLayerRef.current = null
      return
    }

    const group = L.layerGroup()
    for (const c of customers) {
      if (c.lat == null || c.lng == null) continue
      const m = L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          className: '',
          html: '<div class="osm-customer-dot" title="CRM müşterisi"></div>',
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        }),
        title: c.name,
      })
      m.bindTooltip(`👤 ${c.name}`, { direction: 'top', offset: [0, -4] })
      m.bindPopup(
        `<div style="min-width:170px;">
          <div style="font-weight:600;font-size:13px;">${c.name}</div>
          ${c.address ? `<div style="font-size:11px;color:#64748b;">${c.address}</div>` : ''}
          <div style="font-size:10px;color:#8b5cf6;font-weight:600;margin-top:2px;">CRM Müşterisi</div>
        </div>`,
      )
      group.addLayer(m)
    }
    group.addTo(map)
    customerLayerRef.current = group
  }, [customers, showCustomers, mapReady])

  const initialView = !hasSearched && customers.length === 0

  return (
    <div className="relative isolate">
      <div
        ref={containerRef}
        className={cn(
          'w-full h-[420px] sm:h-[480px] lg:h-[560px] rounded-xl overflow-hidden border border-border',
          'bg-slate-100 dark:bg-slate-900 select-none',
        )}
        role="application"
        aria-label="OpenStreetMap interaktif harita"
      />

      {/* konum etiketi */}
      {(city || hasSearched) && (
        <div className="absolute top-3 left-3 z-[500] flex items-center gap-1.5 max-w-[60%] px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-border shadow-sm pointer-events-none">
          <span className="text-xs font-semibold truncate">
            {focus?.label || city || 'Türkiye'}
          </span>
          {hasSearched && (
            <span className="text-[10px] text-muted-foreground shrink-0">· {resultCount} sonuç</span>
          )}
        </div>
      )}

      {/* arama sırasında yumuşak kaplama */}
      {searching && (
        <div className="absolute inset-0 z-[600] flex items-center justify-center rounded-xl bg-background/45 backdrop-blur-[1.5px] pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/95 dark:bg-slate-800/95 border border-border shadow-lg">
            <span className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            <span className="text-sm font-medium">OpenStreetMap taranıyor…</span>
          </div>
        </div>
      )}

      {/* boş durum */}
      {initialView && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center pointer-events-none">
          <div className="text-center max-w-xs px-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-white/85 dark:bg-slate-800/85 backdrop-blur-sm border border-border flex items-center justify-center mb-3 shadow-sm">
              <span className="text-2xl">🗺️</span>
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Arama yapınca sonuçlar gerçek haritada görünecek
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Soldaki formu doldurup &quot;Ara&quot; butonuna tıklayın
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default OsmMap
