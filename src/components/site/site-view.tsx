'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/format'
import { ApartmentFormDialog, type Apartment } from './apartment-form-dialog'
import { BlockFormDialog, type Block } from './block-form-dialog'
import { SiteComplaints, ComplaintCreateButton } from './site-complaints'
import {
  Building2, Plus, CheckCircle2, MessageCircle, Users, Megaphone,
  AlertTriangle, Home, User, Phone, Pencil, Trash2, Calculator, Printer,
} from 'lucide-react'

interface SiteData {
  id: string; name: string; address: string | null; city: string | null; phone: string | null
  dueDay: number; defaultDueAmount: number; currency: string; managerName: string | null
  blocks: { id: string; name: string; _count: { apartments: number } }[]
  siteStaff: { id: string; name: string; role: string; phone: string | null; photo: string | null; salary: number | null }[]
  announcements: { id: string; title: string; content: string; type: string; publishDate: string }[]
  duesStats: { status: string; _count: { amount: number }; _sum: { amount: number } }[]
  _count: { dues: number; complaints: number }
}

interface DuesItem {
  id: string
  amount: number
  currency: string
  month: number
  year: number
  dueDate: string
  status: string
  paidDate?: string | null
  paidAmount?: number | null
  paymentMethod?: string | null
  lateFee?: number | null
  lateFeeAppliedAt?: string | null
  notes?: string | null
  apartment?: { block?: { name: string }; number: string }
  resident?: { name: string; phone: string | null } | null
}

interface ComplaintItem {
  id: string
  title: string
  description: string
  status: string
  response: string | null
  createdAt: string
  resident?: { name: string } | null
}

const STAFF_ROLES = [
  { value: 'kapici', label: 'Kapıcı' },
  { value: 'guvenlik', label: 'Güvenlik' },
  { value: 'temizlik', label: 'Temizlik' },
  { value: 'bahcivan', label: 'Bahçıvan' },
  { value: 'teknik', label: 'Teknik' },
] as const

const APARTMENT_TYPE_LABELS: Record<string, string> = {
  daire: 'Daire',
  dukkan: 'Dükkan',
  depo: 'Depo',
}

export function SiteView() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('overview')
  const [currentMonth] = useState(new Date().getMonth() + 1)
  const [currentYear] = useState(new Date().getFullYear())

  // Daire form/dialog state
  const [aptDialogOpen, setAptDialogOpen] = useState(false)
  const [editApt, setEditApt] = useState<Apartment | null>(null)
  const [deleteApt, setDeleteApt] = useState<Apartment | null>(null)

  // Blok form/dialog state
  const [blockDialogOpen, setBlockDialogOpen] = useState(false)
  const [editBlock, setEditBlock] = useState<Block | null>(null)
  const [deleteBlock, setDeleteBlock] = useState<Block | null>(null)

  const { data: sitesData } = useQuery({
    queryKey: ['sites'],
    queryFn: () => apiGet<{ items: { id: string; name: string }[] }>('/api/site'),
  })
  const siteId = sitesData?.items?.[0]?.id

  const { data: site, isLoading } = useQuery<SiteData>({
    queryKey: ['site', siteId],
    queryFn: () => apiGet(`/api/site/${siteId}`),
    enabled: !!siteId,
  })

  // Daireler (apartments) — units tab'ında yüklenir
  const { data: apartmentsData, isLoading: apartmentsLoading } = useQuery({
    queryKey: ['apartments', siteId],
    queryFn: () => apiGet<{ items: Apartment[] }>(`/api/site/${siteId}/apartments`),
    enabled: !!siteId && tab === 'units',
  })
  const apartments = apartmentsData?.items ?? []

  // Bloklar (blocks) — units tab'ında yüklenir
  const { data: blocksData, isLoading: blocksLoading } = useQuery({
    queryKey: ['blocks', siteId],
    queryFn: () => apiGet<{ items: Block[] }>(`/api/site/${siteId}/blocks`),
    enabled: !!siteId && tab === 'units',
  })
  const blocks = blocksData?.items ?? []

  // Aidat listesi
  const { data: duesData, isLoading: duesLoading } = useQuery<{ items: DuesItem[]; stats: { total: number; totalAmount: number; paidAmount: number; unpaidCount: number } }>({
    queryKey: ['dues', siteId, currentMonth, currentYear],
    queryFn: () => apiGet(`/api/site/${siteId}/dues?month=${currentMonth}&year=${currentYear}`),
    enabled: !!siteId && tab === 'dues',
  })

  // Şikayetler (API düz array döner) — overview & complaints tab'ında yüklenir
  const { data: complaintList = [] } = useQuery<ComplaintItem[]>({
    queryKey: ['complaints', siteId],
    queryFn: () => apiGet<ComplaintItem[]>(`/api/site/${siteId}/complaints`),
    enabled: !!siteId && (tab === 'complaints' || tab === 'overview'),
  })

  if (!sitesData) return <div className="p-8"><Skeleton className="h-32" /></div>

  if (!siteId) {
    return (
      <div className="space-y-5 animate-fade-in">
        <h2 className="text-2xl font-bold">Site Yönetimi</h2>
        <Card><CardContent className="p-8 text-center">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-4">Henüz site kaydı yok. İlk sitenizi oluşturun.</p>
          <CreateSiteDialog onCreated={() => qc.invalidateQueries({ queryKey: ['sites'] })} />
        </CardContent></Card>
      </div>
    )
  }

  const dues = duesData?.items ?? []
  const stats = duesData?.stats

  // Silme handlers
  const handleDeleteApartment = async () => {
    if (!deleteApt) return
    try {
      await apiDelete(`/api/site/${siteId}/apartments/${deleteApt.id}`)
      toast.success('Daire silindi')
      qc.invalidateQueries({ queryKey: ['apartments', siteId] })
      qc.invalidateQueries({ queryKey: ['blocks', siteId] })
      qc.invalidateQueries({ queryKey: ['site', siteId] })
      setDeleteApt(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi')
    }
  }

  const handleDeleteBlock = async () => {
    if (!deleteBlock) return
    try {
      await apiDelete(`/api/site/${siteId}/blocks/${deleteBlock.id}`)
      toast.success('Blok silindi')
      qc.invalidateQueries({ queryKey: ['blocks', siteId] })
      qc.invalidateQueries({ queryKey: ['apartments', siteId] })
      qc.invalidateQueries({ queryKey: ['site', siteId] })
      setDeleteBlock(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi')
    }
  }

  // Aidat makbuzu yazdır (yazıcı-dostu fiş)
  const printDuesReceipt = (d: DuesItem) => {
    const fee = (d.lateFee ?? 0) > 0 ? d.lateFee! : 0
    const total = d.amount + fee
    const win = window.open('', '_blank', 'width=420,height=640')
    if (!win) { toast.error('Yazdırma penceresi açılamadı — pop-up engelleyiciyi kontrol edin'); return }
    win.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Aidat Makbuzu</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; font-family: ui-sans-serif, system-ui, sans-serif; }
        body { padding:24px; color:#111; }
        .head { text-align:center; border-bottom:2px solid #111; padding-bottom:12px; margin-bottom:14px; }
        .head h1 { font-size:18px; }
        .head p { font-size:11px; color:#555; margin-top:2px; }
        .row { display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px dashed #ddd; font-size:12px; }
        .row span:first-child { color:#555; }
        .row span:last-child { font-weight:600; }
        .total { display:flex; justify-content:space-between; padding:10px 0; font-size:15px; font-weight:800; margin-top:8px; border-top:2px solid #111; }
        .status { text-align:center; margin:14px 0; }
        .badge { display:inline-block; padding:4px 14px; border-radius:9999px; font-size:11px; font-weight:700; border:1px solid; }
        .ok { color:#047857; border-color:#6ee7b7; background:#ecfdf5; }
        .late { color:#b91c1c; border-color:#fca5a5; background:#fef2f2; }
        .unpaid { color:#b45309; border-color:#fcd34d; background:#fffbeb; }
        .foot { text-align:center; font-size:10px; color:#777; margin-top:18px; }
        @media print { body { padding:8px; } }
      </style></head><body>
      <div class="head">
        <h1>${site?.name ?? 'Site Yönetimi'}</h1>
        <p>${site?.address ?? ''} ${site?.phone ? '· ' + site.phone : ''}</p>
      </div>
      <div class="row"><span>Makbuz No</span><span>AKB-${d.id.slice(-8).toUpperCase()}</span></div>
      <div class="row"><span>Tarih</span><span>${new Date().toLocaleDateString('tr-TR')}</span></div>
      <div class="row"><span>Daire</span><span>${d.apartment?.block?.name ?? ''} ${d.apartment?.number ?? ''}</span></div>
      <div class="row"><span>Sakin</span><span>${d.resident?.name ?? '—'}</span></div>
      <div class="row"><span>Dönem</span><span>${String(d.month).padStart(2,'0')}/${d.year}</span></div>
      <div class="row"><span>Aidat Tutarı</span><span>${formatCurrency(d.amount, d.currency)}</span></div>
      ${fee > 0 ? `<div class="row"><span>Gecikme Zammı</span><span>+${formatCurrency(fee, d.currency)}</span></div>` : ''}
      <div class="total"><span>TOPLAM</span><span>${formatCurrency(total, d.currency)}</span></div>
      <div class="status">
        <span class="badge ${d.status === 'odendi' ? 'ok' : d.status === 'gecikti' ? 'late' : 'unpaid'}">
          ${d.status === 'odendi' ? 'ÖDENDİ' + (d.paidDate ? ` — ${new Date(d.paidDate).toLocaleDateString('tr-TR')}` : '') : d.status === 'gecikti' ? 'GECİKTİ' : 'ÖDENMEDİ'}
        </span>
      </div>
      ${d.status === 'odendi' && d.paymentMethod ? `<div class="row"><span>Ödeme Yöntemi</span><span>${d.paymentMethod === 'cash' ? 'Nakit' : d.paymentMethod === 'bank' ? 'Banka' : 'Online'}</span></div>` : ''}
      <div class="foot">Bu makbuz GNC CRM Site Yönetimi tarafından oluşturulmuştur.</div>
      <script>window.onload = function() { window.print(); }</script>
    </body></html>`)
    win.document.close()
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{site?.name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {site?.blocks?.length || 0} blok · {site?._count?.dues || 0} aidat kaydı · {site?._count?.complaints || 0} şikayet
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview" className="text-xs">Genel Bakış</TabsTrigger>
          <TabsTrigger value="units" className="text-xs">Blok & Daireler</TabsTrigger>
          <TabsTrigger value="dues" className="text-xs">Aidatlar</TabsTrigger>
          <TabsTrigger value="staff" className="text-xs">Personel</TabsTrigger>
          <TabsTrigger value="announcements" className="text-xs">Duyurular</TabsTrigger>
          <TabsTrigger value="complaints" className="text-xs">Şikayetler</TabsTrigger>
        </TabsList>

        {/* Genel Bakış */}
        <TabsContent value="overview" className="mt-4">
          {isLoading ? <Skeleton className="h-32" /> : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Home className="w-4 h-4 text-emerald-500" /><span className="text-xs text-muted-foreground">Blok</span></div>
                <div className="text-xl font-bold">{site?.blocks?.length || 0}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-violet-500" /><span className="text-xs text-muted-foreground">Personel</span></div>
                <div className="text-xl font-bold">{site?.siteStaff?.length || 0}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-amber-500" /><span className="text-xs text-muted-foreground">Açık Şikayet</span></div>
                <div className="text-xl font-bold">{complaintList.filter(c => c.status === 'acik').length}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Megaphone className="w-4 h-4 text-sky-500" /><span className="text-xs text-muted-foreground">Duyuru</span></div>
                <div className="text-xl font-bold">{site?.announcements?.length || 0}</div>
              </CardContent></Card>
            </div>
          )}
          {site && site.blocks?.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-500" /> Blok & Daireler</span>
                  <Button size="sm" variant="outline" onClick={() => setTab('units')}>
                    <Building2 className="w-4 h-4 mr-1.5" /> Yönet
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {site.blocks.map(b => (
                    <div key={b.id} className="p-3 rounded-lg border border-border bg-muted/20">
                      <div className="font-medium text-sm">{b.name}</div>
                      <div className="text-xs text-muted-foreground">{b._count.apartments} daire</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Blok & Daireler */}
        <TabsContent value="units" className="mt-4 space-y-5">
          {/* Bloklar */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-600" />
                Bloklar
                {blocks.length > 0 && (
                  <Badge variant="outline" className="text-[10px] ml-1">{blocks.length}</Badge>
                )}
              </h3>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditBlock(null); setBlockDialogOpen(true) }}>
                <Plus className="w-4 h-4 mr-1.5" /> Blok Ekle
              </Button>
            </div>
            {blocksLoading ? <Skeleton className="h-24" /> : blocks.length === 0 ? (
              <Card><CardContent className="py-10 text-center">
                <Building2 className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground mb-3">Henüz blok eklenmemiş. İlk bloğunuzu oluşturun.</p>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditBlock(null); setBlockDialogOpen(true) }}>
                  <Plus className="w-4 h-4 mr-1.5" /> İlk Bloğu Ekleyin
                </Button>
              </CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {blocks.map(b => (
                  <Card key={b.id}><CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          {b.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {b.floors} kat · {b._count?.apartments ?? 0} daire
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Düzenle"
                          onClick={() => { setEditBlock(b); setBlockDialogOpen(true) }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700" title="Sil"
                          onClick={() => setDeleteBlock(b)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent></Card>
                ))}
              </div>
            )}
          </section>

          {/* Daireler */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Home className="w-4 h-4 text-emerald-600" />
                Daireler
                {apartments.length > 0 && (
                  <Badge variant="outline" className="text-[10px] ml-1">{apartments.length}</Badge>
                )}
              </h3>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => { setEditApt(null); setAptDialogOpen(true) }}
                disabled={blocks.length === 0}
                title={blocks.length === 0 ? 'Önce blok ekleyin' : 'Yeni daire ekle'}>
                <Plus className="w-4 h-4 mr-1.5" /> Daire Ekle
              </Button>
            </div>
            {apartmentsLoading ? <Skeleton className="h-48" /> : apartments.length === 0 ? (
              <Card><CardContent className="py-10 text-center">
                <Home className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground mb-3">
                  {blocks.length === 0 ? 'Daire eklemek için önce bir blok oluşturun.' : 'Henüz daire eklenmemiş. İlk daireyi ekleyin.'}
                </p>
                {blocks.length > 0 && (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditApt(null); setAptDialogOpen(true) }}>
                    <Plus className="w-4 h-4 mr-1.5" /> İlk Daireyi Ekleyin
                  </Button>
                )}
              </CardContent></Card>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60">
                      <TableHead className="text-xs uppercase">Daire No</TableHead>
                      <TableHead className="text-xs uppercase">Blok</TableHead>
                      <TableHead className="text-xs uppercase">Kat</TableHead>
                      <TableHead className="text-xs uppercase">Tip</TableHead>
                      <TableHead className="text-xs uppercase text-right">Alan (m²)</TableHead>
                      <TableHead className="text-xs uppercase">Sakin</TableHead>
                      <TableHead className="text-xs uppercase text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apartments.map(a => (
                      <TableRow key={a.id} className="text-sm even:bg-muted/20">
                        <TableCell className="font-medium">{a.number}</TableCell>
                        <TableCell className="text-muted-foreground">{a.block?.name ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{a.floor ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {APARTMENT_TYPE_LABELS[a.type] ?? a.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{a.area != null ? a.area : '—'}</TableCell>
                        <TableCell>
                          {a.resident ? (
                            <span className="text-muted-foreground">{a.resident.name}</span>
                          ) : (
                            <span className="text-muted-foreground/60 italic">Boş</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Düzenle"
                            onClick={() => { setEditApt(a); setAptDialogOpen(true) }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700" title="Sil"
                            onClick={() => setDeleteApt(a)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </TabsContent>

        {/* Aidatlar */}
        <TabsContent value="dues" className="mt-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={async () => {
              try {
                const r = await apiPost<{ created: number; markedLate: number; lateFeeApplied: number; totalLateFee: number; message: string }>(`/api/site/${siteId}/dues`, { month: currentMonth, year: currentYear, generateAll: true, amount: site?.defaultDueAmount })
                toast.success(r.message)
                qc.invalidateQueries({ queryKey: ['dues'] })
              } catch (e) { toast.error(e instanceof Error ? e.message : 'Aidat oluşturulamadı') }
            }}>
              <Plus className="w-4 h-4 mr-1.5" /> Bu Ay Aidat Oluştur
            </Button>
            <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={async () => {
              try {
                const r = await apiPatch<{ markedLate: number; lateFeeApplied: number; totalLateFee: number; message: string }>(`/api/site/${siteId}/dues`, { action: 'calculate-late-fees' })
                if (r.markedLate === 0 && r.lateFeeApplied === 0) {
                  toast.info('Gecikmiş aidat yok — uygulanacak gecikme zammı bulunamadı')
                } else {
                  toast.success(r.message)
                }
                qc.invalidateQueries({ queryKey: ['dues'] })
              } catch (e) { toast.error(e instanceof Error ? e.message : 'Gecikme zammı hesaplanamadı') }
            }}>
              <Calculator className="w-4 h-4 mr-1.5" /> Gecikmeleri Hesapla
            </Button>
            <Button variant="outline" size="sm" onClick={async () => {
              try {
                const r = await apiPost<{ sent: number; links: Array<{ link: string; waMessageId?: string }> }>(`/api/site/${siteId}/dues/send-reminders`, {})
                if (r.links.length === 0) { toast.info('Hatırlatma gereken aidat yok'); return }
                // Open WhatsApp links — her açılan link için Merkez kaydını gonderildi işaretle
                let opened = 0
                const valid = r.links.filter((l: { link: string }) => l.link && l.link !== '#')
                valid.forEach((l: { link: string; waMessageId?: string }, i: number) => {
                  setTimeout(() => {
                    const popup = window.open(l.link, '_blank', 'noopener,noreferrer')
                    if (popup && l.waMessageId) {
                      apiPatch(`/api/whatsapp/messages/${l.waMessageId}`, { status: 'gonderildi' }).catch(() => {})
                    }
                    if (popup) opened++
                    if (i === valid.length - 1) {
                      toast.success(opened === valid.length
                        ? `${valid.length} hatırlatma gönderildi — Merkeze kaydedildi`
                        : `${opened}/${valid.length} hatırlatma açıldı — kalanlar WhatsApp Merkezi kuyruğunda`)
                    }
                  }, i * 500)
                })
                if (valid.length < r.links.length) {
                  toast.info(`${r.links.length - valid.length} sakin için geçersiz telefon numarası — atlandı`)
                }
                qc.invalidateQueries({ queryKey: ['dues'] })
              } catch (e) { toast.error(e instanceof Error ? e.message : 'Hatırlatma gönderilemedi') }
            }}>
              <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp Hatırlatma
            </Button>
          </div>

          {stats && (
            <div className="grid grid-cols-3 gap-2">
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Toplam</div><div className="text-lg font-bold tabular-nums">{formatCurrency(stats.totalAmount)}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Tahsil Edilen</div><div className="text-lg font-bold tabular-nums text-emerald-600">{formatCurrency(stats.paidAmount)}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Ödenmeyen</div><div className="text-lg font-bold tabular-nums text-red-600">{stats.unpaidCount}</div></CardContent></Card>
            </div>
          )}

          {duesLoading ? <Skeleton className="h-48" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-muted/60">
                  <TableHead className="text-xs uppercase">Daire</TableHead>
                  <TableHead className="text-xs uppercase">Sakin</TableHead>
                  <TableHead className="text-xs uppercase text-right">Tutar</TableHead>
                  <TableHead className="text-xs uppercase text-right">Gec. Zammı</TableHead>
                  <TableHead className="text-xs uppercase text-right">Toplam</TableHead>
                  <TableHead className="text-xs uppercase">Son Tarih</TableHead>
                  <TableHead className="text-xs uppercase">Durum</TableHead>
                  <TableHead className="text-xs uppercase text-right">İşlem</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {dues.map((d) => {
                    const fee = (d.lateFee ?? 0) > 0 ? d.lateFee! : 0
                    const total = d.amount + fee
                    return (
                    <TableRow key={d.id} className="text-sm even:bg-muted/20">
                      <TableCell>{d.apartment?.block?.name} {d.apartment?.number}</TableCell>
                      <TableCell className="text-muted-foreground">{d.resident?.name ?? '—'}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(d.amount, d.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fee > 0 ? (
                          <span className="text-red-600 font-medium">+{formatCurrency(fee, d.currency)}</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatCurrency(total, d.currency)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(d.dueDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px]', d.status === 'odendi' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : d.status === 'gecikti' ? 'text-red-600 bg-red-50 border-red-200' : 'text-amber-600 bg-amber-50 border-amber-200')}>
                          {d.status === 'odendi' ? 'Ödendi' : d.status === 'gecikti' ? 'Gecikti' : 'Ödenmedi'}
                        </Badge>
                        {fee > 0 && (
                          <span className="block text-[10px] text-red-600/80 mt-0.5" title={d.lateFeeAppliedAt ? `Uygulama: ${formatDate(d.lateFeeAppliedAt)}` : 'Gecikme zammı uygulandı'}>
                            %5 zam
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {d.status === 'odenmedi' && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" title="Ödendi"
                              onClick={async () => { await apiPatch(`/api/site/${siteId}/dues/${d.id}`, { status: 'odendi' }); qc.invalidateQueries({ queryKey: ['dues'] }); toast.success('Ödendi') }}>
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                            {d.resident?.phone && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" title="WhatsApp Hatırlat"
                                onClick={async () => {
                                  try {
                                    const r = await apiPost<{ sent: number; links: Array<{ link: string; waMessageId?: string }> }>(`/api/site/${siteId}/dues/send-reminders`, { duesId: d.id })
                                    const l = r.links[0]
                                    if (!l) { toast.error('Hatırlatma oluşturulamadı'); return }
                                    const popup = window.open(l.link, '_blank', 'noopener,noreferrer')
                                    if (popup && l.waMessageId) {
                                      apiPatch(`/api/whatsapp/messages/${l.waMessageId}`, { status: 'gonderildi' }).catch(() => {})
                                      toast.success('WhatsApp açıldı — Merkeze kaydedildi')
                                    } else {
                                      toast.info('Mesaj kuyruğa alındı — WhatsApp Merkezinden gönderebilirsiniz')
                                    }
                                    qc.invalidateQueries({ queryKey: ['dues'] })
                                  } catch (e) { toast.error(e instanceof Error ? e.message : 'Hatırlatma gönderilemedi') }
                                }}>
                                <MessageCircle className="w-4 h-4" />
                              </Button>
                            )}
                          </>
                        )}
                        {d.status === 'gecikti' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" title="Ödendi (Gecikme ile)"
                            onClick={async () => { await apiPatch(`/api/site/${siteId}/dues/${d.id}`, { status: 'odendi', paidAmount: total }); qc.invalidateQueries({ queryKey: ['dues'] }); toast.success('Ödendi (gecikme zammı dahil)') }}>
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" title="Makbuz Yazdır"
                          onClick={() => printDuesReceipt(d)}>
                          <Printer className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Personel */}
        <TabsContent value="staff" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {site?.siteStaff?.map(s => (
              <Card key={s.id}><CardContent className="p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  {s.photo ? <img src={s.photo} className="w-full h-full rounded-lg object-cover" alt={s.name} /> : <User className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{s.name}</div>
                  <Badge variant="outline" className="text-[10px] mt-0.5">{STAFF_ROLES.find(r => r.value === s.role)?.label ?? s.role}</Badge>
                  {s.phone && <div className="text-xs text-muted-foreground mt-1"><Phone className="w-3 h-3 inline mr-1" />{s.phone}</div>}
                  {s.salary && <div className="text-xs text-muted-foreground">{formatCurrency(s.salary)}</div>}
                </div>
              </CardContent></Card>
            ))}
            {(!site?.siteStaff || site.siteStaff.length === 0) && (
              <Card><CardContent className="py-8 text-center col-span-full">
                <Users className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Henüz personel eklenmemiş</p>
              </CardContent></Card>
            )}
          </div>
        </TabsContent>

        {/* Duyurular */}
        <TabsContent value="announcements" className="mt-4">
          <div className="space-y-2">
            {site?.announcements?.map(a => (
              <Card key={a.id}><CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                  {a.title}
                </div>
                <p className="text-sm text-muted-foreground">{a.content}</p>
                <div className="text-xs text-muted-foreground mt-1">{formatDate(a.publishDate)}</div>
              </CardContent></Card>
            ))}
            {(!site?.announcements || site.announcements.length === 0) && (
              <Card><CardContent className="py-8 text-center">
                <Megaphone className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Henüz duyuru yok</p>
              </CardContent></Card>
            )}
          </div>
        </TabsContent>

        {/* Şikayetler — gelişmiş arıza/talep yönetimi */}
        <TabsContent value="complaints" className="mt-4">
          <div className="flex justify-end mb-2">
            <ComplaintCreateButton siteId={siteId} />
          </div>
          <SiteComplaints siteId={siteId} />
        </TabsContent>
      </Tabs>

      {/* Daire Ekle/Düzenle Dialog */}
      <ApartmentFormDialog
        open={aptDialogOpen}
        onOpenChange={(v) => { setAptDialogOpen(v); if (!v) setEditApt(null) }}
        editApartment={editApt}
        siteId={siteId}
      />

      {/* Blok Ekle/Düzenle Dialog */}
      <BlockFormDialog
        open={blockDialogOpen}
        onOpenChange={(v) => { setBlockDialogOpen(v); if (!v) setEditBlock(null) }}
        editBlock={editBlock}
        siteId={siteId}
      />

      {/* Daire Silme Onayı */}
      <AlertDialog open={deleteApt != null} onOpenChange={(v) => { if (!v) setDeleteApt(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Daireyi Sil</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteApt && (
                <>
                  <span className="font-medium">{deleteApt.block?.name ?? ''} {deleteApt.number}</span> numaralı daireyi silmek üzerisiniz.
                  Bu daireye ait tüm aidat kayıtları da silinecek. Bu işlem geri alınamaz.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDeleteApartment() }}
              className="bg-red-600 hover:bg-red-700 text-white">
              <Trash2 className="w-4 h-4 mr-1.5" /> Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Blok Silme Onayı */}
      <AlertDialog open={deleteBlock != null} onOpenChange={(v) => { if (!v) setDeleteBlock(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bloğu Sil</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBlock && (
                <>
                  <span className="font-medium">{deleteBlock.name}</span> bloğunu silmek üzerisiniz.
                  Bu bloktaki tüm daireler ve onlara ait aidat kayıtları da silinecek. Bu işlem geri alınamaz.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDeleteBlock() }}
              className="bg-red-600 hover:bg-red-700 text-white">
              <Trash2 className="w-4 h-4 mr-1.5" /> Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CreateSiteDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', address: '', city: '', phone: '', managerName: '', dueDay: '5', defaultDueAmount: '500' })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPost('/api/site', form)
      toast.success('Site oluşturuldu')
      onCreated()
      setOpen(false)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Oluşturulamadı') }
    finally { setSaving(false) }
  }

  return (
    <>
      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-1.5" /> Site Ekle
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Yeni Site</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Site Adı *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label className="text-xs">Adres</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Şehir</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
              <div><Label className="text-xs">Telefon</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div><Label className="text-xs">Yönetici</Label><Input value={form.managerName} onChange={e => setForm({ ...form, managerName: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Aidat Günü</Label><Input type="number" value={form.dueDay} onChange={e => setForm({ ...form, dueDay: e.target.value })} /></div>
              <div><Label className="text-xs">Aidat Tutarı (₺)</Label><Input type="number" value={form.defaultDueAmount} onChange={e => setForm({ ...form, defaultDueAmount: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={saving || !form.name}>{saving ? 'Kaydediliyor...' : 'Oluştur'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
