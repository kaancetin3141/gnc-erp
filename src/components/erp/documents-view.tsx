'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api-client'
import type { SessionUser } from '@/types'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import {
  FileStack, Search, X, RefreshCw, Package, Receipt, Truck,
  ClipboardList, ChevronDown, ChevronRight, Building2,
  FileCheck2, Loader2, Download, Layers, Printer,
} from 'lucide-react'
import { formatDate, formatCurrency, toCSV, downloadFile } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import { IrsaliyeView } from './irsaliye-view'
import { InvoicePdfDialog } from './parts/invoice-detail-dialog'
import { IrsaliyePdfDialog } from './irsaliye-pdf-dialog'
import { PackingListPdfDialog } from './parts/packing-list-pdf-dialog'
import { CombinedOrderPrintDialog } from './parts/combined-docs-print-dialog'
import { CompanyDocsPrintDialog } from './parts/company-docs-print-dialog'

// ============================================================
// BELGE YÖNETİMİ — Eski "İrsaliyeler" sayfasının yerine geçer.
// · Şirketler (müşteriler) listelenir, altında SİPARİŞLERİ görünür
// · Her siparişin yanında YETKİYE GÖRE belge butonları:
//     · Müdür     → Fatura + İrsaliye + Çeki Listesi
//     · Depocu    → İrsaliye + Çeki Listesi (fatura butonu görünmez)
//     · ERP admin → hepsi
// · Belgeler OTOMATİK üretilir: butona tıklayınca siparişten
//   belge yoksa oluşturulur, varsa mevcut belge gösterilir.
// ============================================================

interface OrderDoc {
  id: string
  number: string
  status: string
  orderDate: string
  totalAmount?: number
  currency?: string
  customer?: { id: string; name: string; segment?: string; status?: string } | null
  quote?: { id: string; number: string } | null
  invoice?: { id: string; number: string; status: string; packingListNo?: string | null } | null
  irsaliyeler?: { id: string; number: string; status: string }[]
  _count?: { trackingSteps: number; productionItems?: number }
}

interface OrdersResponse {
  items: OrderDoc[]
  total: number
  hidePrices?: boolean
}

const ORDER_STATUS_META: Record<string, { label: string; cls: string }> = {
  hazirlaniyor: { label: 'Hazırlanıyor', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/60' },
  onaylandi: { label: 'Onaylandı', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/60' },
  uretimde: { label: 'Üretimde', cls: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/60' },
  sevk_yapildi: { label: 'Sevk Edildi', cls: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-900/60' },
  teslim_edildi: { label: 'Teslim', cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800' },
  iptal: { label: 'İptal', cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/60' },
}

// Fatura durumu etiketi (CSV için)
function ORDER_DOC_LABEL(status: string): string {
  switch (status) {
    case 'odeme_bekliyor': return 'Ödeme Bekliyor'
    case 'odendi': return 'Ödendi'
    case 'gecikti': return 'Gecikti'
    case 'iptal': return 'İptal'
    default: return status
  }
}

type GeneratedDoc =
  | { kind: 'invoice'; invoiceId: string }
  | { kind: 'irsaliye'; irsaliyeId: string; irsaliyeNumber: string }
  | { kind: 'packing'; invoiceId: string }

export function DocumentsView() {
  const qc = useQueryClient()
  const { user } = useAppStore()
  const su = user as SessionUser | null

  // Yetkiler
  const canSeeInvoice = hasPermission(su, 'invoices.view') || hasPermission(su, 'erp.manage')
  const canSeeIrsaliye = hasPermission(su, 'irsaliye.view')
  const canSeePacking = canSeeIrsaliye // çeki listesi = irsaliye.view sahiplerine açık (müdür + depocu)

  const [search, setSearch] = useState('')
  const [openCompanies, setOpenCompanies] = useState<Record<string, boolean>>({})
  const [generating, setGenerating] = useState<string | null>(null) // "orderId:type"
  const [activeDoc, setActiveDoc] = useState<GeneratedDoc | null>(null)
  const [combinedOrder, setCombinedOrder] = useState<{ id: string; number: string; customerName?: string } | null>(null)
  const [companyPrint, setCompanyPrint] = useState<{ name: string; orders: { id: string; number: string }[] } | null>(null)

  const canExport = hasPermission(su, 'export.data')

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['documents-orders', search],
    queryFn: () => {
      const p = new URLSearchParams({ limit: '200' })
      if (search) p.set('search', search)
      return apiGet<OrdersResponse>(`/api/orders?${p.toString()}`)
    },
  })

  const orders = useMemo(() => data?.items ?? [], [data])
  const hidePrices = data?.hidePrices === true

  // Şirketlere göre grupla
  const companies = useMemo(() => {
    const map = new Map<string, { name: string; segment?: string; orders: OrderDoc[] }>()
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
    // Şirket adına göre sırala
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  }, [orders])

  // Özet
  const stats = useMemo(() => {
    const invoiced = orders.filter((o) => o.invoice).length
    const irsaliye = orders.filter((o) => (o.irsaliyeler?.length ?? 0) > 0).length
    const packing = orders.filter((o) => o.invoice?.packingListNo).length
    return { orders: data?.total ?? 0, companies: companies.length, invoiced, irsaliye, packing }
  }, [orders, companies, data])

  // Belge üret + PDF aç
  const generateDoc = async (order: OrderDoc, type: 'invoice' | 'irsaliye' | 'packing_list') => {
    const genKey = `${order.id}:${type}`
    setGenerating(genKey)
    try {
      const res = await apiPost<{
        type: string
        created: boolean
        document: {
          id: string
          number: string
          packingListNo?: string | null
        }
        documentType: 'invoice' | 'irsaliye'
      }>(`/api/orders/${order.id}/generate-document`, { type })

      if (res.created) {
        toast.success(`Belge otomatik oluşturuldu${res.document.number ? `: ${res.document.number}` : ''}`)
      }

      if (type === 'irsaliye') {
        setActiveDoc({ kind: 'irsaliye', irsaliyeId: res.document.id, irsaliyeNumber: res.document.number })
      } else if (type === 'packing_list') {
        setActiveDoc({ kind: 'packing', invoiceId: res.document.id })
      } else {
        setActiveDoc({ kind: 'invoice', invoiceId: res.document.id })
      }

      // Belge durumlarını tazele
      qc.invalidateQueries({ queryKey: ['documents-orders'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['irsaliye'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Belge oluşturulamadı')
    } finally {
      setGenerating(null)
    }
  }

  const toggleCompany = (name: string) => {
    setOpenCompanies((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  // CSV dışa aktarma — siparişler + belge durumları
  const handleExportCSV = () => {
    if (orders.length === 0) {
      toast.error('Dışa aktarılacak sipariş yok')
      return
    }
    const rows = orders.map((o) => ({
      'Sipariş No': o.number,
      'Şirket': o.customer?.name ?? '',
      'Tarih': formatDate(o.orderDate),
      'Durum': ORDER_STATUS_META[o.status]?.label ?? o.status,
      'Fatura No': o.invoice?.number ?? '',
      'Fatura Durumu': o.invoice ? ORDER_DOC_LABEL(o.invoice.status) : 'Yok',
      'İrsaliye No': o.irsaliyeler?.[0]?.number ?? '',
      'İrsaliye Durumu': o.irsaliyeler?.[0] ? ORDER_STATUS_META[o.irsaliyeler[0].status]?.label ?? o.irsaliyeler[0].status : 'Yok',
      'Çeki Listesi No': o.invoice?.packingListNo ?? '',
      ...(hidePrices ? {} : { 'Tutar': o.totalAmount ?? 0, 'Para': o.currency ?? 'TRY' }),
    }))
    const csv = toCSV(rows)
    downloadFile(csv, `belge-yonetimi-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success(`${orders.length} sipariş dışa aktarıldı`)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileStack className="w-6 h-6 text-violet-600" />
            Belge Yönetimi
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Şirketler ve sipariş belgeleri — fatura, irsaliye ve çeki listesi otomatik üretilir
            {canSeeIrsaliye && !canSeeInvoice && (
              <span className="ml-2 text-violet-600 font-medium">(görüş alanınız: İrsaliye + Çeki Listesi)</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={orders.length === 0}>
              <Download className="w-4 h-4 mr-1.5" />
              CSV Dışa Aktar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('w-4 h-4 mr-1.5', isFetching && 'animate-spin')} />
            Yenile
          </Button>
        </div>
      </div>

      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="orders" className="gap-1.5">
            <Package className="w-3.5 h-3.5" /> Sipariş Belgeleri
          </TabsTrigger>
          <TabsTrigger value="irsaliye" className="gap-1.5">
            <Truck className="w-3.5 h-3.5" /> İrsaliye Listesi
          </TabsTrigger>
        </TabsList>

        {/* ==================== TAB 1: SİPARİŞ BELGELERİ ==================== */}
        <TabsContent value="orders" className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sipariş</div>
                <div className="text-xl font-bold">{stats.orders}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Şirket</div>
                <div className="text-xl font-bold">{stats.companies}</div>
              </CardContent>
            </Card>
            {canSeeInvoice && (
              <Card className="bg-emerald-50/50 dark:bg-emerald-950/20">
                <CardContent className="p-3">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Faturalı</div>
                  <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{stats.invoiced}</div>
                </CardContent>
              </Card>
            )}
            {canSeeIrsaliye && (
              <Card className="bg-violet-50/50 dark:bg-violet-950/20">
                <CardContent className="p-3">
                  <div className="text-[10px] uppercase tracking-wider text-violet-700 dark:text-violet-400">İrsaliyeli</div>
                  <div className="text-xl font-bold text-violet-700 dark:text-violet-400">{stats.irsaliye}</div>
                </CardContent>
              </Card>
            )}
            {canSeePacking && (
              <Card className="bg-amber-50/50 dark:bg-amber-950/20">
                <CardContent className="p-3">
                  <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Çeki Listeli</div>
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{stats.packing}</div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Arama */}
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Şirket veya sipariş no ara..."
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
            </CardContent>
          </Card>

          {/* Şirketler → Siparişler */}
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : companies.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Building2 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">Sipariş bulunamadı</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {companies.map((company) => {
                const isOpen = openCompanies[company.name] ?? true
                return (
                  <Card key={company.name} className="overflow-hidden">
                    {/* Şirket başlığı — tıklanınca açılır/kapanır, sağdaki butonlar tıklamayı yutmaz */}
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
                      className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-muted/50 to-muted/20 hover:from-muted/70 hover:to-muted/30 transition-all text-left cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    >
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{company.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {company.orders.length} sipariş
                          {company.segment ? ` · ${company.segment}` : ''}
                        </div>
                      </div>
                      {/* Şirket belge özeti */}
                      {(() => {
                        const inv = company.orders.filter((o) => o.invoice).length
                        const irs = company.orders.filter((o) => (o.irsaliyeler?.length ?? 0) > 0).length
                        const pack = company.orders.filter((o) => o.invoice?.packingListNo).length
                        return (
                          <div className="hidden sm:flex items-center gap-1 shrink-0">
                            {canSeeInvoice && inv > 0 && (
                              <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/60 gap-0.5">
                                <Receipt className="w-2.5 h-2.5" /> {inv}
                              </Badge>
                            )}
                            {canSeeIrsaliye && irs > 0 && (
                              <Badge variant="outline" className="text-[9px] bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/60 gap-0.5">
                                <Truck className="w-2.5 h-2.5" /> {irs}
                              </Badge>
                            )}
                            {canSeePacking && pack > 0 && (
                              <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/60 gap-0.5">
                                <ClipboardList className="w-2.5 h-2.5" /> {pack}
                              </Badge>
                            )}
                          </div>
                        )
                      })()}
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {company.orders.length}
                      </Badge>

                      {/* ŞİRKET TOPLU BELGE YAZDIRMA — tüm siparişler tek yazdırmada */}
                      {(canSeeInvoice || canSeeIrsaliye) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] gap-1 shrink-0 text-violet-700 border-violet-200 hover:bg-violet-50 dark:text-violet-300 dark:border-violet-900/50"
                              onClick={(e) => {
                                e.stopPropagation()
                                setCompanyPrint({
                                  name: company.name,
                                  orders: company.orders.map((o) => ({ id: o.id, number: o.number })),
                                })
                              }}
                            >
                              <Printer className="w-3 h-3" />
                              <span className="hidden md:inline">Tümünü Yazdır</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Şirketin tüm sipariş belgelerini tek yazdırmada birleştir
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Sipariş listesi */}
                    {isOpen && (
                      <div className="overflow-x-auto border-t">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableHead className="pl-4 min-w-[120px]">Sipariş No</TableHead>
                              <TableHead className="min-w-[100px]">Tarih</TableHead>
                              <TableHead className="min-w-[110px]">Durum</TableHead>
                              {!hidePrices && (
                                <TableHead className="text-right min-w-[100px]">Tutar</TableHead>
                              )}
                              <TableHead className="min-w-[240px] text-right pr-4">Belgeler</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {company.orders.map((o) => {
                              const st = ORDER_STATUS_META[o.status] ?? { label: o.status, cls: '' }
                              const hasIrs = (o.irsaliyeler?.length ?? 0) > 0
                              return (
                                <TableRow key={o.id} className="hover:bg-muted/20">
                                  <TableCell className="pl-4">
                                    <div className="flex items-center gap-2">
                                      <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                      <span className="font-mono text-xs font-semibold">{o.number}</span>
                                    </div>
                                    {o.quote && (
                                      <div className="text-[10px] text-muted-foreground mt-0.5 ml-5.5">
                                        Teklif: {o.quote.number}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {formatDate(o.orderDate)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={cn('text-[10px]', st.cls)}>
                                      {st.label}
                                    </Badge>
                                  </TableCell>
                                  {!hidePrices && (
                                    <TableCell className="text-right text-sm font-medium tabular-nums">
                                      {formatCurrency(o.totalAmount ?? 0, o.currency || 'TRY')}
                                    </TableCell>
                                  )}
                                  <TableCell className="text-right pr-4">
                                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                      {/* FATURA — müdür + ERP admin */}
                                      {canSeeInvoice && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className={cn(
                                                'h-7 text-[11px] gap-1',
                                                o.invoice
                                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-300'
                                                  : 'text-muted-foreground',
                                              )}
                                              disabled={generating === `${o.id}:invoice`}
                                              onClick={() => generateDoc(o, 'invoice')}
                                            >
                                              {generating === `${o.id}:invoice` ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                              ) : (
                                                <Receipt className="w-3 h-3" />
                                              )}
                                              Fatura
                                              {o.invoice && <FileCheck2 className="w-3 h-3 text-emerald-600" />}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {o.invoice ? `Faturayı görüntüle (${o.invoice.number})` : 'Faturayı otomatik oluştur'}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}

                                      {/* İRSALİYE — müdür + depocu */}
                                      {canSeeIrsaliye && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className={cn(
                                                'h-7 text-[11px] gap-1',
                                                hasIrs
                                                  ? 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:border-violet-900/50 dark:text-violet-300'
                                                  : 'text-muted-foreground',
                                              )}
                                              disabled={generating === `${o.id}:irsaliye`}
                                              onClick={() => generateDoc(o, 'irsaliye')}
                                            >
                                              {generating === `${o.id}:irsaliye` ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                              ) : (
                                                <Truck className="w-3 h-3" />
                                              )}
                                              İrsaliye
                                              {hasIrs && <FileCheck2 className="w-3 h-3 text-violet-600" />}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {hasIrs ? `İrsaliyeyi görüntüle (${o.irsaliyeler![0].number})` : 'İrsaliyeyi otomatik oluştur'}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}

                                      {/* TÜM BELGELER — birleşik yazdırma */}
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-[11px] gap-1 text-violet-700 border-violet-200 hover:bg-violet-50 dark:text-violet-300 dark:border-violet-900/50"
                                            disabled={generating === `${o.id}:combined`}
                                            onClick={() =>
                                              setCombinedOrder({
                                                id: o.id,
                                                number: o.number,
                                                customerName: o.customer?.name,
                                              })
                                            }
                                          >
                                            <Layers className="w-3 h-3" />
                                            Tümü
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          Tüm belgeleri tek yazdırmada birleştir (her belge ayrı A4)
                                        </TooltipContent>
                                      </Tooltip>

                                      {/* ÇEKİ LİSTESİ — müdür + depocu */}
                                      {canSeePacking && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className={cn(
                                                'h-7 text-[11px] gap-1',
                                                o.invoice?.packingListNo
                                                  ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-300'
                                                  : 'text-muted-foreground',
                                              )}
                                              disabled={generating === `${o.id}:packing_list`}
                                              onClick={() => generateDoc(o, 'packing_list')}
                                            >
                                              {generating === `${o.id}:packing_list` ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                              ) : (
                                                <ClipboardList className="w-3 h-3" />
                                              )}
                                              Çeki Listesi
                                              {o.invoice?.packingListNo && <FileCheck2 className="w-3 h-3 text-amber-600" />}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {o.invoice?.packingListNo
                                              ? `Çeki listesini görüntüle (${o.invoice.packingListNo})`
                                              : 'Çeki listesini otomatik oluştur'}
                                          </TooltipContent>
                                        </Tooltip>
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
                  </Card>
                )
              })}
            </div>
          )}

          {/* Alt bilgi */}
          {!isLoading && orders.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <FileStack className="w-3.5 h-3.5" />
                <span>{orders.length} sipariş · {companies.length} şirket gösteriliyor</span>
              </div>
              <span>Belgeler otomatik üretilir — butona tıkladığınızda oluşturulur ve açılır</span>
            </div>
          )}
        </TabsContent>

        {/* ==================== TAB 2: İRSALİYE LİSTESİ ==================== */}
        <TabsContent value="irsaliye">
          <IrsaliyeView />
        </TabsContent>
      </Tabs>

      {/* ==================== PDF DIALOG'LARI ==================== */}
      {/* Fatura PDF */}
      {activeDoc?.kind === 'invoice' && (
        <InvoicePdfDialog
          invoice={{ id: activeDoc.invoiceId } as never}
          detail={null}
          onClose={() => setActiveDoc(null)}
        />
      )}

      {/* İrsaliye PDF */}
      {activeDoc?.kind === 'irsaliye' && (
        <IrsaliyePdfDialog
          irsaliyeId={activeDoc.irsaliyeId}
          irsaliyeNumber={activeDoc.irsaliyeNumber}
          open={!!activeDoc}
          onOpenChange={(v) => { if (!v) setActiveDoc(null) }}
        />
      )}

      {/* Çeki Listesi PDF */}
      {activeDoc?.kind === 'packing' && (
        <PackingListPdfDialog
          invoiceId={activeDoc.invoiceId}
          open={!!activeDoc}
          onOpenChange={(v) => { if (!v) setActiveDoc(null) }}
        />
      )}

      {/* Tüm Belgeler — birleşik yazdırma */}
      <CombinedOrderPrintDialog
        order={combinedOrder}
        canSeeInvoice={canSeeInvoice}
        canSeeIrsaliye={canSeeIrsaliye}
        open={!!combinedOrder}
        onOpenChange={(v) => { if (!v) setCombinedOrder(null) }}
      />

      {/* ŞİRKET TOPLU BELGE YAZDIRMA — şirketin tüm siparişleri */}
      <CompanyDocsPrintDialog
        company={companyPrint}
        canSeeInvoice={canSeeInvoice}
        canSeeIrsaliye={canSeeIrsaliye}
        open={!!companyPrint}
        onOpenChange={(v) => { if (!v) setCompanyPrint(null) }}
      />
    </div>
  )
}
