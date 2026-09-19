'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { apiPost } from '@/lib/api-client'
import { toCSV, downloadFile } from '@/lib/format'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
} from 'lucide-react'

// ---- Customer import row (frontend parse edilmiş hali) ----
export interface CustomerImportRow {
  name?: string | null
  sector?: string | null
  segment?: string | null
  ownerId?: string | null
  source?: string | null
  address?: string | null
  city?: string | null
  district?: string | null
  country?: string | null
  lat?: number | null
  lng?: number | null
  phone?: string | null
  email?: string | null
  web?: string | null
  taxNumber?: string | null
  customerType?: string | null
  status?: string | null
  tags?: string[] | null
  kvkkConsent?: boolean | null
  annualRevenue?: number | null
  employeeCount?: number | null
}

// ---- API cevap ----
interface BulkImportResponse {
  imported: number
  skipped: number
  errors: { row: number; error: string }[]
}

// ---- Şablon alanları (kolon sırası önemli) ----
const TEMPLATE_HEADERS = [
  'Ad',
  'Sektör',
  'Segment',
  'Durum',
  'Tür',
  'Telefon',
  'E-posta',
  'Web',
  'VergiNo',
  'Adres',
  'Şehir',
  'İlçe',
  'Ülke',
  'Enlem',
  'Boylam',
  'Kaynak',
  'SorumluID',
  'Etiketler',
  'KVKK',
  'YıllıkCiro',
  'ÇalışanSayısı',
]

// Şablon örnek satırı (kullanıcı rehber için)
const TEMPLATE_SAMPLE_ROW: string[] = [
  'Acme Lojistik A.Ş.',
  'Lojistik & Taşımacılık',
  'kurumsal',
  'aktif',
  'musteri',
  '+905555555555',
  'info@acme-lojistik.com',
  'https://acme-lojistik.com',
  '1234567890',
  'Atatürk Cad. No:5 Kadıköy',
  'İstanbul',
  'Kadıköy',
  'TR',
  '40.9923',
  '29.0244',
  'manuel',
  '',
  'lojistik,stratejik-müşteri',
  'true',
  '12500000',
  '45',
]

// Alan adı eşleştirme — Turkish header → Customer field
const FIELD_ALIASES: Record<string, keyof CustomerImportRow> = {
  Ad: 'name',
  'Müşteri Adı': 'name',
  'Firma Adı': 'name',
  Name: 'name',
  Sektör: 'sector',
  Sector: 'sector',
  Segment: 'segment',
  Durum: 'status',
  Status: 'status',
  Tür: 'customerType',
  'Müşteri Türü': 'customerType',
  Telefon: 'phone',
  Phone: 'phone',
  'E-posta': 'email',
  Email: 'email',
  Web: 'web',
  Website: 'web',
  VergiNo: 'taxNumber',
  'Vergi No': 'taxNumber',
  'Vergi Numarası': 'taxNumber',
  Adres: 'address',
  Address: 'address',
  Şehir: 'city',
  Sehir: 'city',
  City: 'city',
  İlçe: 'district',
  Ilce: 'district',
  District: 'district',
  Ülke: 'country',
  Ulke: 'country',
  Country: 'country',
  Enlem: 'lat',
  Boylam: 'lng',
  Kaynak: 'source',
  SorumluID: 'ownerId',
  'Sorumlu ID': 'ownerId',
  Etiketler: 'tags',
  KVKK: 'kvkkConsent',
  YıllıkCiro: 'annualRevenue',
  'Yıllık Ciro': 'annualRevenue',
  ÇalışanSayısı: 'employeeCount',
  'Çalışan Sayısı': 'employeeCount',
}

// Customer field → label
const CUSTOMER_FIELDS: { value: keyof CustomerImportRow; label: string }[] = [
  { value: 'name', label: 'Ad *' },
  { value: 'sector', label: 'Sektör' },
  { value: 'segment', label: 'Segment' },
  { value: 'status', label: 'Durum' },
  { value: 'customerType', label: 'Tür' },
  { value: 'phone', label: 'Telefon' },
  { value: 'email', label: 'E-posta' },
  { value: 'web', label: 'Web' },
  { value: 'taxNumber', label: 'Vergi No' },
  { value: 'address', label: 'Adres' },
  { value: 'city', label: 'Şehir' },
  { value: 'district', label: 'İlçe' },
  { value: 'country', label: 'Ülke' },
  { value: 'lat', label: 'Enlem' },
  { value: 'lng', label: 'Boylam' },
  { value: 'source', label: 'Kaynak' },
  { value: 'ownerId', label: 'Sorumlu ID' },
  { value: 'tags', label: 'Etiketler' },
  { value: 'kvkkConsent', label: 'KVKK' },
  { value: 'annualRevenue', label: 'Yıllık Ciro' },
  { value: 'employeeCount', label: 'Çalışan Sayısı' },
]

// Hücre değerini Customer field tipine dönüştür
function coerceValue(
  raw: unknown,
  field: keyof CustomerImportRow,
): string | number | boolean | string[] | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (s === '') return null

  switch (field) {
    case 'lat':
    case 'lng':
    case 'annualRevenue': {
      const n = Number(s.replace(',', '.'))
      return Number.isNaN(n) ? null : n
    }
    case 'employeeCount': {
      const n = parseInt(s.replace(/[^0-9-]/g, ''), 10)
      return Number.isNaN(n) ? null : n
    }
    case 'kvkkConsent':
      return s.toLowerCase() === 'true' || s === '1' || s.toLowerCase() === 'evet'
    case 'tags':
      return s
        .split(/[,;|]/)
        .map((t) => t.trim())
        .filter(Boolean)
    default:
      return s
  }
}

// ---- Bileşen ----
export function BulkImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, keyof CustomerImportRow | ''>>({})
  const [fileName, setFileName] = useState<string>('')
  const [parseError, setParseError] = useState<string>('')
  const [result, setResult] = useState<BulkImportResponse | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const reset = useCallback(() => {
    setRows([])
    setHeaders([])
    setMapping({})
    setFileName('')
    setParseError('')
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v) reset()
      onOpenChange(v)
    },
    [onOpenChange, reset],
  )

  // --- File parse (CSV / Excel) ---
  const parseFile = useCallback((file: File) => {
    setParseError('')
    setResult(null)
    setFileName(file.name)

    const isExcel =
      file.name.toLowerCase().endsWith('.xlsx') ||
      file.name.toLowerCase().endsWith('.xls')

    if (isExcel) {
      // Excel — xlsx ile parse
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
            defval: '',
            raw: false,
          })
          if (json.length === 0) {
            setParseError('Excel dosyasında veri bulunamadı')
            return
          }
          const hs = Object.keys(json[0])
          setHeaders(hs)
          setRows(json)
          // Otomatik eşleştir
          const autoMap: Record<string, keyof CustomerImportRow | ''> = {}
          for (const h of hs) {
            const field = FIELD_ALIASES[h] ?? FIELD_ALIASES[h.toLowerCase()] ?? ''
            autoMap[h] = field
          }
          setMapping(autoMap)
        } catch (err) {
          setParseError(
            err instanceof Error ? err.message : 'Excel parse hatası',
          )
        }
      }
      reader.onerror = () => setParseError('Dosya okunamadı')
      reader.readAsArrayBuffer(file)
    } else {
      // CSV — papaparse
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          if (res.errors.length > 0) {
            setParseError(
              `CSV parse uyarısı: ${res.errors[0].message ?? 'Bilinmeyen hata'}`,
            )
          }
          const data = res.data.filter(
            (r) => Object.values(r).some((v) => v !== '' && v !== null),
          )
          if (data.length === 0) {
            setParseError('CSV dosyasında veri bulunamadı')
            return
          }
          const hs = res.meta.fields ?? Object.keys(data[0])
          setHeaders(hs)
          setRows(data)
          const autoMap: Record<string, keyof CustomerImportRow | ''> = {}
          for (const h of hs) {
            const field =
              FIELD_ALIASES[h] ?? FIELD_ALIASES[h.toLowerCase()] ?? ''
            autoMap[h] = field
          }
          setMapping(autoMap)
        },
        error: (err: Error) => setParseError(err.message),
      })
    }
  }, [])

  // --- Plain <input type="file"> change handler ---
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      parseFile(file)
    },
    [parseFile],
  )

  // --- Drop support via native DnD (no react-dropzone) ---
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) parseFile(file)
    },
    [parseFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  // --- Şablon indir ---
  const handleDownloadTemplate = () => {
    const obj: Record<string, string> = {}
    TEMPLATE_HEADERS.forEach((h, i) => {
      obj[h] = TEMPLATE_SAMPLE_ROW[i] ?? ''
    })
    const csv = toCSV([obj])
    downloadFile(csv, 'musteri-sablon.csv')
    toast.success('Şablon indirildi')
  }

  // --- Mapped rows (mapping'e göre dönüştür) ---
  const mappedRows: CustomerImportRow[] = useMemo(() => {
    return rows.map((r) => {
      const out: CustomerImportRow = {}
      for (const [header, field] of Object.entries(mapping)) {
        if (!field) continue
        const val = coerceValue(r[header], field)
        // null değerleri alan tipi ne olursa olsun kabul et (backend handle eder)
        ;(out as Record<string, unknown>)[field] = val
      }
      return out
    })
  }, [rows, mapping])

  const validRows = mappedRows.filter((r) => r.name && r.name.trim().length > 0)
  const missingNameCount = mappedRows.length - validRows.length

  // --- Mutation ---
  const mutation = useMutation({
    mutationFn: (data: { customers: CustomerImportRow[] }) =>
      apiPost<BulkImportResponse>('/api/customers/bulk-import', data),
    onSuccess: (data) => {
      setResult(data)
      qc.invalidateQueries({ queryKey: ['customers'] })
      toast.success(
        `${data.imported} müşteri içe aktarıldı${
          data.skipped > 0 ? `, ${data.skipped} atlandı` : ''
        }`,
      )
    },
    onError: (err: Error) => {
      toast.error(err.message || 'İçe aktarma başarısız')
    },
  })

  const handleImport = () => {
    if (validRows.length === 0) {
      toast.error('İçe aktarılacak geçerli satır yok')
      return
    }
    mutation.mutate({ customers: validRows })
  }

  // ---- Görsel state ----
  const isResultView = result !== null
  const isPreviewView = rows.length > 0 && !isResultView

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-600" />
            Toplu İçe Aktar — Müşteriler
          </DialogTitle>
          <DialogDescription>
            CSV veya Excel dosyasından müşteri portföyünüze toplu kayıt ekleyin.
            Aynı isim + vergi no / e-posta bulunan kayıtlar atlanır.
          </DialogDescription>
        </DialogHeader>

        {/* ---- Adım 1: File input + şablon ---- */}
        {!isPreviewView && !isResultView && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                  : 'border-slate-300 dark:border-slate-700 hover:border-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'
              }`}
            >
              {/* Plain file input — spec: skip react-dropzone */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="sr-only"
                onChange={handleFileChange}
              />
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">
                {isDragOver
                  ? 'Dosyayı buraya bırakın…'
                  : 'CSV veya Excel dosyasını sürükleyin ya da tıklayın'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                .csv, .xls, .xlsx — maks 1 dosya
              </p>
              {fileName && (
                <Badge variant="secondary" className="mt-3">
                  <FileText className="w-3 h-3 mr-1" />
                  {fileName}
                </Badge>
              )}
            </div>

            {parseError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Parse Hatası</AlertTitle>
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Hangi kolonlar gerekli? Şablonu indirin:</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="w-4 h-4 mr-1.5" />
                Şablon İndir
              </Button>
            </div>

            <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-md bg-muted/40">
              <p className="font-medium text-foreground">İpuçları:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>
                  <b>Ad</b> alanı zorunludur — boş satırlar atlanır.
                </li>
                <li>
                  Boş bırakılan <b>Sorumlu ID</b>, içe aktaran kullanıcıya atanır.
                </li>
                <li>
                  Mevcut müşteri varsa (aynı e-posta veya vergi no), otomatik
                  atlanır.
                </li>
                <li>
                  Etiketler virgülle ayrılır: <code>lojistik,vip</code>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* ---- Adım 2: Önizleme + mapping ---- */}
        {isPreviewView && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span className="font-medium">{fileName}</span>
                <Badge variant="secondary" className="ml-1">
                  {rows.length} satır
                </Badge>
                <Badge variant="outline" className="ml-1">
                  {validRows.length} geçerli
                </Badge>
                {missingNameCount > 0 && (
                  <Badge variant="destructive" className="ml-1">
                    {missingNameCount} adsız
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="text-muted-foreground"
              >
                <X className="w-4 h-4 mr-1" />
                Temizle
              </Button>
            </div>

            {/* Field mapping */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
                Alan Eşleştirme (otomatik — gerekirse değiştirin)
              </div>
              <div className="max-h-64 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {headers.map((h) => (
                  <div
                    key={h}
                    className="flex items-center gap-2 text-xs"
                  >
                    <div className="flex-1 truncate font-medium" title={h}>
                      {h}
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <Select
                      value={mapping[h] ?? '__none__'}
                      onValueChange={(v) =>
                        setMapping((m) => ({
                          ...m,
                          [h]:
                            v === '__none__'
                              ? ''
                              : (v as keyof CustomerImportRow | ''),
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue placeholder="— atla —" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Radix Select does not allow empty string value — use sentinel */}
                        <SelectItem value="__none__">— atla —</SelectItem>
                        {CUSTOMER_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* İlk 5 satır önizleme */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
                Önizleme (ilk 5 satır)
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((h) => (
                        <TableHead key={h} className="text-[10px] whitespace-nowrap">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 5).map((r, i) => (
                      <TableRow key={i}>
                        {headers.map((h) => (
                          <TableCell
                            key={h}
                            className="text-[10px] whitespace-nowrap max-w-[160px] truncate"
                            title={String(r[h] ?? '')}
                          >
                            {String(r[h] ?? '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {parseError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Uyarı</AlertTitle>
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ---- Adım 3: Sonuç ---- */}
        {isResultView && result && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {result.imported}
                </div>
                <div className="text-xs text-muted-foreground">İçe Aktarıldı</div>
              </div>
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 p-4 text-center">
                <AlertCircle className="w-6 h-6 text-amber-600 mx-auto mb-1" />
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {result.skipped}
                </div>
                <div className="text-xs text-muted-foreground">Atlandı (duplikat)</div>
              </div>
              <div className="rounded-lg border bg-red-50 dark:bg-red-950/30 p-4 text-center">
                <AlertCircle className="w-6 h-6 text-red-600 mx-auto mb-1" />
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {result.errors.length}
                </div>
                <div className="text-xs text-muted-foreground">Hata</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Hata detayları (ilk 10)</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-0.5 mt-1">
                    {result.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>
                        Satır {e.row}: {e.error}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="text-sm text-muted-foreground">
              Toplam {rows.length} satır işlendi — {result.imported + result.skipped + result.errors.length}{' '}
              kayıt sonuçlandı.
            </div>
          </div>
        )}

        <DialogFooter className="mt-4">
          {isResultView ? (
            <Button onClick={() => handleOpenChange(false)}>Kapat</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                İptal
              </Button>
              <Button
                onClick={handleImport}
                disabled={
                  mutation.isPending ||
                  validRows.length === 0 ||
                  isPreviewView === false
                }
              >
                {mutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                    İçe Aktarılıyor…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-1.5" />
                    İçe Aktar ({validRows.length})
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>

        {mutation.isPending && (
          <div className="absolute bottom-0 left-0 right-0">
            <Progress className="h-1 rounded-none" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
