'use client'

// ============================================================
// ExportDocsTab — Belge Yönetimi > İHRACAT BELGELERİ sekmesi
// Dış ticaret evrakları: ATR, EUR.1, Menşe Şahadetnamesi,
// İhracat Beyannamesi, Konşimento, Sigorta Poliçesi
// · Şirket → Sipariş hiyerarşisi (Sipariş Belgeleri sekmesiyle aynı desen)
// · Her sipariş için 6 belge butonu — tıklayınca otomatik üretilir (idempotent)
// · Üretilen belgeler rozetle işaretlenir (numara tooltip'te)
// · Yetki: erp.manage VEYA invoices.view (ticari evrak — depocu göremez)
// ============================================================

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiPost } from '@/lib/api-client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import {
  Globe2, Search, X, Package, ChevronDown, ChevronRight, Building2,
  FileCheck2, Loader2, Ship, ShieldCheck, ScrollText, Stamp,
  FileBadge, FileSpreadsheet, Anchor,
} from 'lucide-react'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ExportDocPdfDialog } from './export-doc-pdf-dialog'
import type { ExportDocType } from './parts/export-doc-types'

// Belge türü → ikon (buton + istatistik)
const DOC_ICONS: Record<ExportDocType, React.ComponentType<{ className?: string }>> = {
  atr: FileBadge,
  eur1: FileSpreadsheet,
  mense: ScrollText,
  gumruk: Stamp,
  konsimento: Anchor,
  sigorta: ShieldCheck,
}

const DOC_BUTTON_STYLES: Record<ExportDocType, string> = {
  atr: 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/30 dark:border-sky-900/50 dark:text-sky-300',
  eur1: 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 dark:bg-teal-950/30 dark:border-teal-900/50 dark:text-teal-300',
  mense: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-300',
  gumruk: 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:border-violet-900/50 dark:text-violet-300',
  konsimento: 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-300',
  sigorta: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-300',
}

const DOC_TYPE_ORDER: ExportDocType[] = ['atr', 'eur1', 'mense', 'gumruk', 'konsimento', 'sigorta']

export interface ExportOrderDoc {
  id: string
  number: string
  status: string
  orderDate: string
  customer?: { id: string; name: string; segment?: string; status?: string } | null
  exportDocs?: { id: string; type: string; number: string; status: string }[]
}

interface Props {
  orders: ExportOrderDoc[]
  isLoading: boolean
  search: string
  onSearchChange: (v: string) => void
}

export function ExportDocsTab({ orders, isLoading, search, onSearchChange }: Props) {
  const qc = useQueryClient()
  const [openCompanies, setOpenCompanies] = useState<Record<string, boolean>>({})
  const [generating, setGenerating] = useState<string | null>(null)
  const [activeDoc, setActiveDoc] = useState<{ docId: string; docType: string; docNumber: string } | null>(null)

  // Şirketlere göre grupla
  const companies = useMemo(() => {
    const map = new Map<string, { name: string; segment?: string; orders: ExportOrderDoc[] }>()
    for (const o of orders) {
      const key = o.customer?.id ?? '_'
      if (!map.has(key)) {
        map.set(key, {
          name: o.customer?.name ?? 'Bilinmeyen Şirket',
          segment: o.customer?.segment,
          orders: [],
        })
      }
      map.get(key)!.orders.push(o)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  }, [orders])

  // Tür bazlı istatistik — kaç siparişte hangi belge var
  const typeStats = useMemo(() => {
    const stats: Record<string, number> = {}
    for (const t of DOC_TYPE_ORDER) {
      stats[t] = orders.filter((o) => (o.exportDocs ?? []).some((d) => d.type === t)).length
    }
    return stats
  }, [orders])

  const toggleCompany = (name: string) => {
    setOpenCompanies((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  // Belge üret + PDF aç (idempotent — varsa mevcut belge döner)
  const generateDoc = async (order: ExportOrderDoc, type: ExportDocType) => {
    const genKey = `${order.id}:${type}`
    setGenerating(genKey)
    try {
      const res = await apiPost<{
        type: string
        created: boolean
        document: { id: string; number: string }
      }>(`/api/orders/${order.id}/generate-document`, { type })

      if (res.created) {
        toast.success(`${res.document.number} belgesi oluşturuldu`)
      }
      setActiveDoc({ docId: res.document.id, docType: type, docNumber: res.document.number })
      qc.invalidateQueries({ queryKey: ['documents-orders'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Belge oluşturulamadı')
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Tür istatistikleri — 6 belge türü */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {DOC_TYPE_ORDER.map((t) => {
          const Icon = DOC_ICONS[t]
          return (
            <Card key={t} className="border-dashed">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                    {SHORT_LABELS[t]}
                  </span>
                </div>
                <div className="text-xl font-bold tabular-nums">
                  {typeStats[t] ?? 0}
                  <span className="text-xs font-normal text-muted-foreground"> / {orders.length}</span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Bilgi şeridi */}
      <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50/50 dark:border-teal-900/50 dark:bg-teal-950/20 px-3 py-2.5">
        <Globe2 className="w-4 h-4 text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
        <p className="text-xs text-teal-800 dark:text-teal-300">
          <b>İhracat evrak seti:</b> ATR (AB ülkeleri), EUR.1 (STA ülkeleri), Menşe Şahadetnamesi,
          İhracat Beyannamesi, Konşimento (denizyolu) ve Sigorta Poliçesi — sipariş bazlı otomatik üretilir.
          Belgeyi açtıktan sonra Incoterms, taşıma şekli, liman ve gemi bilgilerini düzenleyebilirsiniz.
        </p>
      </div>

      {/* Arama */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Şirket veya sipariş no ara..."
              className="pl-9"
            />
            {search && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                aria-label="Aramayı temizle"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Şirketler → Siparişler → Belge butonları */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : companies.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Ship className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Sipariş bulunamadı</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map((company) => {
            const isOpen = openCompanies[company.name] ?? true
            const docCount = company.orders.reduce((s, o) => s + (o.exportDocs?.length ?? 0), 0)
            return (
              <Card key={company.name} className="overflow-hidden">
                {/* Şirket başlığı */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => toggleCompany(company.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleCompany(company.name)
                    }
                  }}
                  className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-muted/50 to-muted/20 hover:from-muted/70 hover:to-muted/30 transition-all text-left cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-950 dark:to-emerald-950 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-teal-700 dark:text-teal-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{company.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {company.orders.length} sipariş
                      {company.segment ? ` · ${company.segment}` : ''}
                    </div>
                  </div>
                  {docCount > 0 && (
                    <Badge variant="outline" className="text-[10px] gap-1 shrink-0 bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-900/60">
                      <Globe2 className="w-2.5 h-2.5" /> {docCount} ihracat belgesi
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {company.orders.length}
                  </Badge>
                </div>

                {/* Sipariş listesi */}
                {isOpen && (
                  <div className="overflow-x-auto border-t">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableHead className="pl-4 min-w-[120px]">Sipariş No</TableHead>
                          <TableHead className="min-w-[100px]">Tarih</TableHead>
                          <TableHead className="min-w-[320px] text-right pr-4">İhracat Belgeleri</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {company.orders.map((o) => (
                          <TableRow key={o.id} className="hover:bg-muted/20">
                            <TableCell className="pl-4">
                              <div className="flex items-center gap-2">
                                <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="font-mono text-xs font-semibold">{o.number}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDate(o.orderDate)}
                            </TableCell>
                            <TableCell className="text-right pr-4">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {DOC_TYPE_ORDER.map((t) => {
                                  const existing = (o.exportDocs ?? []).find((d) => d.type === t)
                                  const Icon = DOC_ICONS[t]
                                  const busy = generating === `${o.id}:${t}`
                                  return (
                                    <Tooltip key={t}>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className={cn(
                                            'h-7 text-[11px] gap-1',
                                            existing ? DOC_BUTTON_STYLES[t] : 'text-muted-foreground',
                                          )}
                                          disabled={busy}
                                          onClick={() => generateDoc(o, t)}
                                        >
                                          {busy ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                          ) : (
                                            <Icon className="w-3 h-3" />
                                          )}
                                          {SHORT_LABELS[t]}
                                          {existing && <FileCheck2 className="w-3 h-3" />}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        {existing
                                          ? `${existing.number} — görüntüle`
                                          : `${SHORT_LABELS[t]} otomatik oluştur`}
                                      </TooltipContent>
                                    </Tooltip>
                                  )
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Alt bilgi */}
      {!isLoading && orders.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Globe2 className="w-3.5 h-3.5" />
            <span>{orders.length} sipariş · {companies.length} şirket</span>
          </div>
          <span>Belge numaraları: ATR-YYYY-NNN · EUR1 · MSH · GBE · KNS · SIG</span>
        </div>
      )}

      {/* İhracat belgesi PDF diyaloğu */}
      {activeDoc && (
        <ExportDocPdfDialog
          docId={activeDoc.docId}
          docType={activeDoc.docType}
          docNumber={activeDoc.docNumber}
          open={!!activeDoc}
          onOpenChange={(v) => { if (!v) setActiveDoc(null) }}
        />
      )}
    </div>
  )
}

// Kısa etiketler — buton metinleri
const SHORT_LABELS: Record<ExportDocType, string> = {
  atr: 'ATR',
  eur1: 'EUR.1',
  mense: 'Menşe',
  gumruk: 'Beyanname',
  konsimento: 'Konşimento',
  sigorta: 'Sigorta',
}
