'use client'

import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import QRCode from 'react-qr-code'
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  MessageCircle, Mail, Printer, RefreshCw, Send, Download,
  FileText, ExternalLink, Link2, Copy, CheckCheck, QrCode,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { sendWhatsAppTracked } from '@/lib/whatsapp-hub'
import { cn } from '@/lib/utils'
import type { Quote, Invoice } from './types'
import {
  buildProformaWhatsAppMessage, buildProformaMailSubject, buildProformaMailBody,
  getProformaStatusMeta,
  buildQuoteWhatsAppMessage,
} from './proforma-utils'
import {
  buildInvoiceDocMessage, buildInvoiceDocMailSubject, getInvoiceStatusMeta,
} from './invoice-utils'

// ============================================================
// Send Dialog — WhatsApp / E-Posta / Paylaşım Linki seçenekleri
// PROFORMA (proformaId) · TEKLİF (quoteId) · FATURA (invoiceId)
// kayıtları için çalışır:
//   - proformaId → /api/proforma uçları
//   - quoteId    → /api/quotes uçları
//   - invoiceId  → /api/invoices uçları
// E-posta kanalı GERÇEK SMTP gönderimi yapar (/api/documents/send):
//   SMTP ayarlıysa PDF ekli gerçek mail → mode:'smtp'
//   ayarlı değilse mailto fallback → mode:'mailto'
// Paylaşım Linki kanalı HMAC imzalı herkese açık PDF bağlantısı
// üretir (/api/documents/share-link) + QR kod gösterir.
// ============================================================

interface Props {
  proformaId?: string | null
  quoteId?: string | null
  invoiceId?: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onPrint?: () => void
}

type DocKind = 'proforma' | 'quote' | 'invoice'
type Channel = 'whatsapp' | 'email' | 'link'

interface SendDoc {
  id: string
  number: string
  status: string
  subtotal: number
  taxTotal: number
  total: number
  currency: string
  issueDate: string | Date
  validUntil?: string | null
  dueDate?: string | null
  customer?: {
    id?: string
    name?: string | null
    phone?: string | null
    email?: string | null
  } | null
  lines?: unknown[]
}

interface ShareLinkInfo {
  url: string
  expiresAt: string
}

export function SendDialog({ proformaId, quoteId, invoiceId, open, onOpenChange, onPrint }: Props) {
  const qc = useQueryClient()
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [customNote, setCustomNote] = useState('')
  const [includeLink, setIncludeLink] = useState(true)
  const [markAsSent, setMarkAsSent] = useState(true)
  const [sending, setSending] = useState(false)
  const [share, setShare] = useState<ShareLinkInfo | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const shareRequested = useRef<string | null>(null)
  const [copied, setCopied] = useState(false)

  const docKind: DocKind = invoiceId ? 'invoice' : proformaId ? 'proforma' : 'quote'
  const docId = invoiceId ?? proformaId ?? quoteId
  const isProformaDoc = docKind === 'proforma'
  const isInvoiceDoc = docKind === 'invoice'
  const typeLabel = isInvoiceDoc ? 'Fatura' : isProformaDoc ? 'Proforma' : 'Teklif'

  const fetchUrl = isInvoiceDoc
    ? `/api/invoices/${invoiceId}`
    : isProformaDoc
      ? `/api/proforma/${proformaId}`
      : `/api/quotes/${quoteId}`

  const { data: doc, isLoading } = useQuery({
    queryKey: ['doc-send', docId, docKind],
    queryFn: () => apiGet<SendDoc>(fetchUrl),
    enabled: !!docId && open,
  })

  const customer = doc?.customer
  const lines = doc?.lines ?? []

  // ---- Paylaşım linki — diyalog açılışında bir kez üretilir ----
  useEffect(() => {
    if (!open || !doc || !docId) return
    const key = `${docKind}:${docId}`
    if (shareRequested.current === key) return
    shareRequested.current = key
    setShareLoading(true)
    apiPost<{ path: string; expiresAt: string }>('/api/documents/share-link', {
      docType: docKind,
      docId,
    })
      .then((r) => {
        setShare({ url: `${window.location.origin}${r.path}`, expiresAt: r.expiresAt })
      })
      .catch(() => setShare(null))
      .finally(() => setShareLoading(false))
  }, [open, doc, docId, docKind])

  // Diyalog kapandığında state sıfırla (yeni açılış temiz başlasın)
  useEffect(() => {
    if (!open) {
      setCustomNote('')
      setChannel('whatsapp')
      setIncludeLink(true)
      setCopied(false)
      shareRequested.current = null
      setShare(null)
    }
  }, [open])

  const baseMessage = useMemo(() => {
    if (!doc) return ''
    if (isInvoiceDoc) {
      return buildInvoiceDocMessage({
        number: doc.number,
        customerName: customer?.name ?? '',
        total: doc.total,
        currency: doc.currency,
        dueDate: doc.dueDate ?? null,
      })
    }
    return isProformaDoc
      ? buildProformaWhatsAppMessage({
        number: doc.number,
        customerName: customer?.name ?? '',
        total: doc.total,
        currency: doc.currency,
        validUntil: doc.validUntil,
      })
      : buildQuoteWhatsAppMessage({
        number: doc.number,
        customerName: customer?.name ?? '',
        total: doc.total,
        currency: doc.currency,
        validUntil: doc.validUntil,
      })
  }, [doc, customer, isProformaDoc, isInvoiceDoc])

  // WhatsApp mesaj metni — paylaşım linki (aktifse) mesajın sonuna eklenir;
  // WhatsApp tam URL'yi otomatik link önizlemesine çevirir.
  const waMessage = useMemo(() => {
    const base = customNote.trim() || baseMessage
    if (!includeLink || !share) return base
    return `${base}\n\n📄 Belgeyi online görüntülemek için: ${share.url}`
  }, [customNote, baseMessage, includeLink, share])

  // E-posta konusu + gövdesi (gövde: link'siz temel metin — sunucu şablonu linki buton olarak ekler)
  const mailSubject = useMemo(() => {
    if (!doc) return ''
    return isInvoiceDoc
      ? buildInvoiceDocMailSubject(doc.number)
      : buildProformaMailSubject(doc.number)
  }, [doc, isInvoiceDoc])

  const mailBody = useMemo(() => {
    if (!doc) return ''
    return customNote.trim() || (isInvoiceDoc ? baseMessage : buildProformaMailBody({
      number: doc.number,
      customerName: customer?.name ?? '',
      total: doc.total,
      currency: doc.currency,
      validUntil: doc.validUntil,
    }))
  }, [doc, customer, customNote, isInvoiceDoc, baseMessage])

  const pdfBasePath = isInvoiceDoc
    ? `/api/invoices/${docId}/pdf`
    : isProformaDoc
      ? `/api/proforma/${docId}/pdf`
      : `/api/quotes/${docId}/pdf`

  const handleCopyLink = async () => {
    if (!share) return
    try {
      await navigator.clipboard.writeText(share.url)
      setCopied(true)
      toast.success('Paylaşım linki kopyalandı')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Kopyalanamadı — linki elle seçip kopyalayın')
    }
  }

  const createShareIfNeeded = async (): Promise<ShareLinkInfo | null> => {
    if (share) return share
    if (!docId) return null
    try {
      const r = await apiPost<{ path: string; expiresAt: string }>('/api/documents/share-link', {
        docType: docKind,
        docId,
      })
      const s = { url: `${window.location.origin}${r.path}`, expiresAt: r.expiresAt }
      setShare(s)
      return s
    } catch {
      return null
    }
  }

  const handleSend = async () => {
    if (!doc) return
    setSending(true)
    try {
      // 1) Kanal aksiyonu
      if (channel === 'whatsapp') {
        if (!customer?.phone) {
          toast.error('Müşteri telefonu geçersiz veya eksik')
          setSending(false)
          return
        }
        // WhatsApp Mesaj Merkezi kaydı + wa.me sekmesi + gönderildi işaretleme
        const result = await sendWhatsAppTracked({
          phone: customer.phone,
          body: waMessage,
          title: `${typeLabel} Gönderimi — ${doc.number}`,
          contextType: isInvoiceDoc ? 'fatura_gonderim' : isProformaDoc ? 'proforma_gonderim' : 'teklif_gonderim',
          contextId: doc.id,
          contextNo: doc.number,
          customerId: customer.id ?? null,
          customerName: customer.name ?? null,
          amount: doc.total,
          currency: doc.currency,
        })
        if (!result.popupOpened) {
          toast.info('WhatsApp penceresi engellendi — mesaj Mesaj Merkezi kuyruğunda')
        }
      } else if (channel === 'email') {
        if (!customer?.email) {
          toast.error('Müşteri e-postası eksik')
          setSending(false)
          return
        }
        // GERÇEK e-posta: SMTP ayarlıysa PDF ekli gönderim, değilse mailto fallback
        const res = await apiPost<{
          mode: 'smtp' | 'mailto'
          mailto?: string
          attachment?: string | null
          note?: string
        }>('/api/documents/send', {
          docType: docKind,
          docId: doc.id,
          channel: 'email',
          to: customer.email,
          subject: mailSubject,
          body: mailBody,
          attachPdf: true,
          includeShareLink: includeLink,
        })
        if (res.mode === 'smtp') {
          toast.success('E-posta gönderildi (SMTP)', {
            description: res.attachment ? `PDF eki: ${res.attachment}` : undefined,
          })
        } else {
          window.location.href = res.mailto ?? '#'
          toast.info('SMTP ayarlı değil — e-posta uygulaman açıldı', {
            description: 'PDF ekinin otomatik gitmesi için Ayarlar > SMTP bilgilerini doldurun.',
            duration: 6000,
          })
        }
      } else {
        // Paylaşım Linki — link üret + kopyala
        const s = await createShareIfNeeded()
        if (!s) {
          toast.error('Paylaşım linki oluşturulamadı')
          setSending(false)
          return
        }
        try {
          await navigator.clipboard.writeText(s.url)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch { /* kopyalama başarısız olsa da akış sürsün */ }
      }

      // 2) Opsiyonel: durumu 'gonderildi' işaretle (fatura için geçersiz —
      //    fatura durumları taslak/gonderildi içermez, checkbox gizlenir)
      if (markAsSent && !isInvoiceDoc && doc.status === 'taslak') {
        if (isProformaDoc) {
          await apiPatch(`/api/proforma/${doc.id}`, { status: 'gonderildi' })
          qc.invalidateQueries({ queryKey: ['proforma', doc.id] })
          qc.invalidateQueries({ queryKey: ['proformas'] })
        } else {
          await apiPatch(`/api/quotes/${doc.id}`, { status: 'gonderildi' })
          qc.invalidateQueries({ queryKey: ['quote', doc.id] })
        }
        qc.invalidateQueries({ queryKey: ['quotes'] })
      }

      const doneLabel = channel === 'whatsapp'
        ? 'WhatsApp ile gönderildi'
        : channel === 'email'
          ? 'E-posta tamamlandı'
          : 'Paylaşım linki hazırlandı'
      toast.success(`${typeLabel} ${doneLabel}` + (markAsSent && !isInvoiceDoc ? ' · Durum: Gönderildi' : ''))
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSending(false)
    }
  }

  if (!docId) return null

  const statusMeta = doc
    ? (isInvoiceDoc ? getInvoiceStatusMeta(doc.status) : getProformaStatusMeta(doc.status))
    : null
  const hasPhone = !!(customer?.phone)
  const hasEmail = !!(customer?.email)

  const channelButton = (c: Channel, icon: ReactNode, title: string, sub: string, activeCls: string, hoverCls: string) => (
    <button
      type="button"
      onClick={() => setChannel(c)}
      className={cn(
        'flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all text-left',
        channel === c ? activeCls : `border-border ${hoverCls} bg-background`,
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="text-[10px] text-muted-foreground truncate max-w-full">{sub}</div>
    </button>
  )

  const footerButton = () => {
    if (channel === 'whatsapp') {
      return { icon: <MessageCircle className="w-4 h-4 mr-1.5" />, label: 'WhatsApp ile Gönder' }
    }
    if (channel === 'email') {
      return { icon: <Mail className="w-4 h-4 mr-1.5" />, label: 'E-Posta ile Gönder' }
    }
    return {
      icon: copied ? <CheckCheck className="w-4 h-4 mr-1.5" /> : <Link2 className="w-4 h-4 mr-1.5" />,
      label: 'Linki Kopyala',
    }
  }
  const fb = footerButton()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-emerald-600" />
            {typeLabel} Gönder
          </DialogTitle>
          <DialogDescription>
            Müşteriye WhatsApp veya e-posta ile gönderin, herkese açık paylaşım linki üretin.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !doc ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Belge özet kartı */}
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-mono text-sm font-medium">{doc.number}</span>
                    {statusMeta && (
                      <Badge variant="outline" className={cn('text-[10px] h-5', statusMeta.color)}>
                        {statusMeta.label}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {customer?.name ?? '—'}
                    {isInvoiceDoc
                      ? (doc.dueDate && ` · Vade: ${formatDate(doc.dueDate)}`)
                      : (doc.validUntil && ` · Geçerlilik: ${formatDate(doc.validUntil)}`)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums">{formatCurrency(doc.total, doc.currency)}</div>
                  <div className="text-[10px] text-muted-foreground">{lines.length} kalem</div>
                </div>
              </div>
            </div>

            {/* Kanal seçimi */}
            <div className="space-y-1.5">
              <Label className="text-xs">Gönderim Kanalı</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {channelButton(
                  'whatsapp',
                  <MessageCircle className={cn('w-4 h-4', channel === 'whatsapp' ? 'text-emerald-600' : 'text-muted-foreground')} />,
                  'WhatsApp',
                  hasPhone ? (customer?.phone ?? '') : 'Telefon yok',
                  'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
                  'hover:border-emerald-300',
                )}
                {channelButton(
                  'email',
                  <Mail className={cn('w-4 h-4', channel === 'email' ? 'text-teal-600' : 'text-muted-foreground')} />,
                  'E-Posta',
                  hasEmail ? (customer?.email ?? '') : 'E-posta yok',
                  'border-teal-500 bg-teal-50 dark:bg-teal-950/30',
                  'hover:border-teal-300',
                )}
                {channelButton(
                  'link',
                  <Link2 className={cn('w-4 h-4', channel === 'link' ? 'text-violet-600' : 'text-muted-foreground')} />,
                  'Paylaşım Linki',
                  shareLoading ? 'Oluşturuluyor...' : 'Herkese açık + QR',
                  'border-violet-500 bg-violet-50 dark:bg-violet-950/30',
                  'hover:border-violet-300',
                )}
              </div>
              {channel === 'whatsapp' && !hasPhone && (
                <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Müşteri telefonu eksik. Önce müşteri kartından ekleyin.
                </div>
              )}
              {channel === 'email' && !hasEmail && (
                <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Müşteri e-postası eksik. Önce müşteri kartından ekleyin.
                </div>
              )}
            </div>

            {/* Paylaşım linki kartı — link kanalı seçiliyken veya her kanalda referans */}
            {channel === 'link' && (
              <div className="p-3 rounded-lg border-2 border-violet-200 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 space-y-3">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-violet-600" />
                  <span className="text-sm font-semibold">Herkese Açık Paylaşım Linki</span>
                  <Badge variant="outline" className="text-[10px] h-5 ml-auto">
                    {share ? '30 gün geçerli' : shareLoading ? 'oluşturuluyor' : 'üretilmedi'}
                  </Badge>
                </div>
                {shareLoading && !share ? (
                  <Skeleton className="h-10 w-full" />
                ) : share ? (
                  <>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 text-[11px] bg-background border border-border rounded px-2 py-1.5 truncate font-mono">
                        {share.url}
                      </code>
                      <Button type="button" size="sm" variant="outline" onClick={handleCopyLink} className="shrink-0 h-8">
                        {copied
                          ? <CheckCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          : <Copy className="w-3.5 h-3.5 mr-1" />}
                        {copied ? 'Kopyalandı' : 'Kopyala'}
                      </Button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg border border-border shrink-0">
                        <QRCode value={share.url} size={88} />
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-relaxed min-w-0">
                        QR kodu müşteriye gösterip telefon kamerasıyla açtırabilirsiniz.
                        Link ile PDF, <span className="font-medium text-foreground">giriş gerektirmeden</span> tarayıcıda açılır.
                        Bağlantı HMAC imzalıdır ve {formatDate(share.expiresAt)} tarihine kadar geçerlidir.
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-amber-700 dark:text-amber-400">
                    Paylaşım linki oluşturulamadı — gönderdiğinizde tekrar denenecek.
                  </div>
                )}
              </div>
            )}

            {/* WhatsApp link anahtarı — link kanalında anlamsız */}
            {channel !== 'link' && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeLink}
                  onChange={(e) => setIncludeLink(e.target.checked)}
                  className="rounded border-input"
                />
                <span className="text-xs text-muted-foreground">
                  Mesaja <span className="font-medium text-foreground">herkese açık paylaşım linki</span> ekle
                  (WhatsApp otomatik önizleme çıkarır, e-postada &quot;Online Görüntüle&quot; butonu olur)
                </span>
              </label>
            )}

            <Separator />

            {/* Mesaj önizleme / düzenleme */}
            {channel !== 'link' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mesaj Önizleme</Label>
                  <button
                    type="button"
                    onClick={() => setCustomNote('')}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Varsayılana sıfırla
                  </button>
                </div>
                <Textarea
                  value={waMessage}
                  onChange={(e) => {
                    const v = e.target.value
                    // Mesaj kutusunda düzenleme yapılırken otomatik eklenen link
                    // metni customNote'a iki kez yazılmasın
                    if (share && v.includes(share.url)) {
                      const stripped = v
                        .replace(`\n\n📄 Belgeyi online görüntülemek için: ${share.url}`, '')
                        .replace(`📄 Belgeyi online görüntülemek için: ${share.url}`, '')
                      setCustomNote(stripped)
                    } else {
                      setCustomNote(v)
                    }
                  }}
                  placeholder="Varsayılan mesaj kullanılır..."
                  className="text-xs min-h-32 font-mono"
                />
                <div className="text-[10px] text-muted-foreground">
                  {channel === 'whatsapp'
                    ? 'Bu metin WhatsApp mesajına otomatik kopyalanır.'
                    : 'Bu metin e-posta gövdesine kopyalanır; PDF eki sunucu tarafından eklenir.'}
                </div>
              </div>
            )}

            {channel !== 'link' && <Separator />}

            {/* PDF gerçek dosya butonları */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/30">
              <div className="min-w-0">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Printer className="w-4 h-4 text-violet-600" />
                  PDF Dosyası
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Sunucuda üretilen gerçek PDF&apos;i indirin veya yazdırın.
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { window.location.href = `${pdfBasePath}?download=1` }}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  İndir
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { if (onPrint) onPrint() }}
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Aç
                </Button>
              </div>
            </div>

            {/* Gönderildi işaretle — fatura durumlarında 'gonderildi' yok, yalnız teklif/proforma */}
            {!isInvoiceDoc && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={markAsSent}
                  onChange={(e) => setMarkAsSent(e.target.checked)}
                  className="rounded border-input"
                  disabled={doc.status !== 'taslak'}
                />
                <span className="text-xs text-muted-foreground">
                  Gönderim sonrası durumu &quot;Gönderildi&quot; olarak işaretle
                  {doc.status !== 'taslak' && (
                    <span className="ml-1 text-amber-600">(mevcut durum: {statusMeta?.label})</span>
                  )}
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            İptal
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !doc || (channel === 'link' && shareLoading)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {sending ? (
              <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
            ) : fb.icon}
            {fb.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
