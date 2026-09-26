'use client'

// ============================================================
// ExportDocPdfDialog — İhracat Belgesi Önizleme & Yönetim
// · GET /api/export-docs/[id] ile belge + kalem verisi
// · A4 önizleme (ExportDocDocPage) — şablon (InvoiceTemplate) uygulanır
// · Durum yönetimi: taslak → hazir → imzalandi → gonderildi / iptal
// · Dış ticaret alanları düzenlenebilir: incoterms, taşıma, limanlar,
//   gemi/konteyner, plaka, sigorta bilgileri
// ============================================================

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Printer, Globe2, Loader2, PencilLine, CheckCircle2, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInvoiceTemplate } from '@/components/pdf/pdf-template'
import { ExportDocDocPage } from './parts/doc-pages'
import {
  type ExportDocPdfData, EXPORT_DOC_TYPES, EXPORT_DOC_STATUS_META,
  TRANSPORT_MODES, INCOTERMS,
} from './parts/export-doc-types'

interface Props {
  docId: string | null
  docType: string | null
  docNumber: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

const STATUS_FLOW = ['taslak', 'hazir', 'imzalandi', 'gonderildi']

export function ExportDocPdfDialog({ docId, docType, docNumber, open, onOpenChange }: Props) {
  const qc = useQueryClient()
  const { data: tpl } = useInvoiceTemplate()
  const [editOpen, setEditOpen] = useState(false)

  const { data: doc, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['export-doc', docId],
    queryFn: () => apiGet<ExportDocPdfData>(`/api/export-docs/${docId}`),
    enabled: !!docId && open,
  })

  // Düzenleme formu state — belge yüklenince doldur
  const [form, setForm] = useState({
    transportMode: '', incoterms: '', destinationCountry: '',
    portOfLoading: '', portOfDischarge: '', vesselName: '', containerNo: '',
    vehiclePlate: '', carrierName: '', insuranceCompany: '', notes: '',
  })
  useEffect(() => {
    if (doc) {
      setForm({
        transportMode: doc.transportMode ?? 'karayolu',
        incoterms: doc.incoterms ?? 'FOB',
        destinationCountry: doc.destinationCountry ?? '',
        portOfLoading: doc.portOfLoading ?? '',
        portOfDischarge: doc.portOfDischarge ?? '',
        vesselName: doc.vesselName ?? '',
        containerNo: doc.containerNo ?? '',
        vehiclePlate: doc.vehiclePlate ?? '',
        carrierName: doc.carrierName ?? '',
        insuranceCompany: doc.insuranceCompany ?? '',
        notes: doc.notes ?? '',
      })
    }
  }, [doc])

  const patchMutation = useMutation({
    mutationFn: (data: Partial<Record<string, string>>) => apiPatch(`/api/export-docs/${docId}`, data),
    onSuccess: () => {
      toast.success('Belge güncellendi')
      setEditOpen(false)
      refetch()
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (e: Error) => toast.error('Güncelleme başarısız', { description: e.message }),
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiPatch(`/api/export-docs/${docId}`, { status }),
    onSuccess: (_d, status) => {
      toast.success(`Durum: ${EXPORT_DOC_STATUS_META[status]?.label ?? status}`)
      refetch()
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (e: Error) => toast.error('Durum değiştirilemedi', { description: e.message }),
  })

  if (!docId) return null

  const meta = doc ? EXPORT_DOC_TYPES[doc.type] : (docType ? EXPORT_DOC_TYPES[docType as keyof typeof EXPORT_DOC_TYPES] : null)
  const statusMeta = doc ? EXPORT_DOC_STATUS_META[doc.status] : null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onOpenChange(false); setEditOpen(false) } }}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto custom-scroll print:max-w-none print:max-h-none print:p-0 print:shadow-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-teal-600 shrink-0" />
                <span className="truncate">{meta?.label ?? 'İhracat Belgesi'} Önizleme</span>
                {docNumber && (
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">{docNumber}</Badge>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {meta?.description}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setEditOpen((v) => !v)} disabled={!doc}>
                <PencilLine className="w-4 h-4 mr-1.5" /> Bilgiler
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1.5" /> Yazdır / PDF
              </Button>
            </div>
          </div>

          {/* Durum yönetimi satırı */}
          {doc && (
            <div className="flex items-center gap-2 flex-wrap pt-2">
              {statusMeta && (
                <Badge variant="outline" className={cn('text-[10px]', statusMeta.color)}>
                  {statusMeta.label}
                </Badge>
              )}
              {/* Sonraki durum butonları */}
              {doc.status !== 'gonderildi' && doc.status !== 'iptal' && (
                <>
                  {doc.status === 'taslak' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs text-sky-700 border-sky-200 hover:bg-sky-50"
                      disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('hazir')}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Hazır İşaretle
                    </Button>
                  )}
                  {doc.status === 'hazir' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
                      disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('imzalandi')}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> İmzalandı
                    </Button>
                  )}
                  {doc.status === 'imzalandi' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                      disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('gonderildi')}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Gönderildi
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('iptal')}>
                    <Ban className="w-3 h-3 mr-1" /> İptal
                  </Button>
                </>
              )}
              {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
          )}
        </DialogHeader>

        {/* Düzenleme paneli */}
        {editOpen && doc && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3 print:hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Taşıma Şekli</Label>
                <Select value={form.transportMode} onValueChange={(v) => setForm((f) => ({ ...f, transportMode: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRANSPORT_MODES.map((t) => (
                      <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Incoterms</Label>
                <Select value={form.incoterms} onValueChange={(v) => setForm((f) => ({ ...f, incoterms: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INCOTERMS.map((t) => (
                      <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Hedef Ülke</Label>
                <Input className="h-9" value={form.destinationCountry} placeholder="DE"
                  onChange={(e) => setForm((f) => ({ ...f, destinationCountry: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Taşıyıcı Firma</Label>
                <Input className="h-9" value={form.carrierName} placeholder="Nakliye A.Ş."
                  onChange={(e) => setForm((f) => ({ ...f, carrierName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Yükleme / Çıkış</Label>
                <Input className="h-9" value={form.portOfLoading} placeholder="İstanbul (Ambarlı)"
                  onChange={(e) => setForm((f) => ({ ...f, portOfLoading: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Varış / Boşaltma</Label>
                <Input className="h-9" value={form.portOfDischarge} placeholder="Hamburg"
                  onChange={(e) => setForm((f) => ({ ...f, portOfDischarge: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Araç Plakası (karayolu)</Label>
                <Input className="h-9" value={form.vehiclePlate} placeholder="16 ABC 123"
                  onChange={(e) => setForm((f) => ({ ...f, vehiclePlate: e.target.value }))} />
              </div>
              {doc.type === 'konsimento' && (
                <>
                  <div>
                    <Label className="text-xs mb-1 block">Gemi Adı</Label>
                    <Input className="h-9" value={form.vesselName} placeholder="MSC Olivia"
                      onChange={(e) => setForm((f) => ({ ...f, vesselName: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Konteyner No</Label>
                    <Input className="h-9" value={form.containerNo} placeholder="MSCU1234567"
                      onChange={(e) => setForm((f) => ({ ...f, containerNo: e.target.value }))} />
                  </div>
                </>
              )}
              {doc.type === 'sigorta' && (
                <div>
                  <Label className="text-xs mb-1 block">Sigorta Şirketi</Label>
                  <Input className="h-9" value={form.insuranceCompany} placeholder="Anadolu Sigorta"
                    onChange={(e) => setForm((f) => ({ ...f, insuranceCompany: e.target.value }))} />
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs mb-1 block">Notlar</Label>
              <Textarea className="min-h-[56px]" value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(false)}>Vazgeç</Button>
              <Button size="sm" disabled={patchMutation.isPending} onClick={() => patchMutation.mutate(form)}>
                {patchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Kaydet
              </Button>
            </div>
          </div>
        )}

        {isLoading || !doc ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[70vh] print:overflow-visible print:max-h-none">
            <div className="a4-wrap print:break-after-page">
              <ExportDocDocPage doc={doc} tpl={tpl} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
