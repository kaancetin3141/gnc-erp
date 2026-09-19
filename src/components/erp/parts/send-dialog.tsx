'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '@/lib/api-client'

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
  MessageCircle, Mail, Printer, RefreshCw, Send,
  FileText, ExternalLink,
} from 'lucide-react'
import { formatCurrency, formatDate, whatsappLink } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Quote } from './types'
import {
  buildProformaWhatsAppMessage, buildProformaMailSubject, buildProformaMailBody,
  getProformaStatusMeta,
  buildQuoteWhatsAppMessage,
} from './proforma-utils'

// ============================================================
// Send Dialog — WhatsApp / Mail / PDF seçenekleri
// Hem PROFORMA (isProforma=true) hem de TEKLİF (isProforma=false)
// kayıtları için çalışır: proformaId verilirse /api/proforma,
// quoteId verilirse /api/quotes uçları kullanılır.
// ============================================================

interface Props {
  proformaId?: string | null
  quoteId?: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onPrint?: () => void
}

type Channel = 'whatsapp' | 'email'

export function SendDialog({ proformaId, quoteId, open, onOpenChange, onPrint }: Props) {
  const qc = useQueryClient()
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [customNote, setCustomNote] = useState('')
  const [markAsSent, setMarkAsSent] = useState(true)
  const [sending, setSending] = useState(false)

  const fetchUrl = proformaId ? `/api/proforma/${proformaId}` : `/api/quotes/${quoteId}`
  const isProformaDoc = !!proformaId

  const { data: proforma, isLoading } = useQuery({
    queryKey: ['doc-send', proformaId ?? quoteId, isProformaDoc],
    queryFn: () => apiGet<Quote>(fetchUrl),
    enabled: !!(proformaId || quoteId) && open,
  })

  const customer = proforma?.customer
  const lines = proforma?.lines ?? []

  // WhatsApp link — kayıt türüne göre (proforma/teklif) mesaj üret
  const waLink = useMemo(() => {
    if (!proforma) return '#'
    const msg = customNote.trim() || (isProformaDoc
      ? buildProformaWhatsAppMessage({
        number: proforma.number,
        customerName: customer?.name ?? '',
        total: proforma.total,
        currency: proforma.currency,
        validUntil: proforma.validUntil,
      })
      : buildQuoteWhatsAppMessage({
        number: proforma.number,
        customerName: customer?.name ?? '',
        total: proforma.total,
        currency: proforma.currency,
        validUntil: proforma.validUntil,
      }))
    return whatsappLink(customer?.phone ?? null, msg)
  }, [proforma, customer, customNote, isProformaDoc])

  // Mail link
  const mailLink = useMemo(() => {
    if (!proforma) return '#'
    const subject = buildProformaMailSubject(proforma.number)
    const body = customNote.trim() || buildProformaMailBody({
      number: proforma.number,
      customerName: customer?.name ?? '',
      total: proforma.total,
      currency: proforma.currency,
      validUntil: proforma.validUntil,
    })
    const to = customer?.email ?? ''
    const params = new URLSearchParams({ subject, body })
    return `mailto:${to}?${params.toString()}`
  }, [proforma, customer, customNote])

  const defaultMessage = useMemo(() => {
    if (!proforma) return ''
    return isProformaDoc
      ? buildProformaWhatsAppMessage({
        number: proforma.number,
        customerName: customer?.name ?? '',
        total: proforma.total,
        currency: proforma.currency,
        validUntil: proforma.validUntil,
      })
      : buildQuoteWhatsAppMessage({
        number: proforma.number,
        customerName: customer?.name ?? '',
        total: proforma.total,
        currency: proforma.currency,
        validUntil: proforma.validUntil,
      })
  }, [proforma, customer, isProformaDoc])

  const handleSend = async () => {
    if (!proforma) return
    setSending(true)
    try {
      // 1) Aksiyon: seçilen kanalı aç (yeni sekmede)
      if (channel === 'whatsapp') {
        if (waLink === '#') {
          toast.error('Müşteri telefonu geçersiz veya eksik')
          setSending(false)
          return
        }
        window.open(waLink, '_blank', 'noopener,noreferrer')
      } else {
        if (!customer?.email) {
          toast.error('Müşteri e-postası eksik')
          setSending(false)
          return
        }
        window.location.href = mailLink
      }

      // 2) Opsiyonel: durumu 'gonderildi' işaretle
      if (markAsSent && proforma.status === 'taslak') {
        if (isProformaDoc) {
          await apiPatch(`/api/proforma/${proforma.id}`, { status: 'gonderildi' })
          qc.invalidateQueries({ queryKey: ['proforma', proforma.id] })
          qc.invalidateQueries({ queryKey: ['proformas'] })
        } else {
          await apiPatch(`/api/quotes/${proforma.id}`, { status: 'gonderildi' })
          qc.invalidateQueries({ queryKey: ['quote', proforma.id] })
        }
        qc.invalidateQueries({ queryKey: ['quotes'] })
      }

      toast.success(`${isProformaDoc ? 'Proforma' : 'Teklif'} gönderildi` + (markAsSent ? ' · Durum: Gönderildi' : ''))
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSending(false)
    }
  }

  if (!proformaId && !quoteId) return null

  const statusMeta = proforma ? getProformaStatusMeta(proforma.status) : null
  const hasPhone = !!(customer?.phone)
  const hasEmail = !!(customer?.email)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-emerald-600" />
            {isProformaDoc ? 'Proforma Gönder' : 'Teklif Gönder'}
          </DialogTitle>
          <DialogDescription>
            Müşteriye WhatsApp veya e-posta ile gönderin. PDF&apos;ini de kaydedebilirsiniz.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !proforma ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Proforma özet kartı */}
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-mono text-sm font-medium">{proforma.number}</span>
                    {statusMeta && (
                      <Badge variant="outline" className={cn('text-[10px] h-5', statusMeta.color)}>
                        {statusMeta.label}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {customer?.name ?? '—'}
                    {proforma.validUntil && ` · Geçerlilik: ${formatDate(proforma.validUntil)}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums">{formatCurrency(proforma.total, proforma.currency)}</div>
                  <div className="text-[10px] text-muted-foreground">{lines.length} kalem</div>
                </div>
              </div>
            </div>

            {/* Kanal seçimi */}
            <div className="space-y-1.5">
              <Label className="text-xs">Gönderim Kanalı</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setChannel('whatsapp')}
                  className={cn(
                    'flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all text-left',
                    channel === 'whatsapp'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                      : 'border-border hover:border-emerald-300 bg-background',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <MessageCircle className={cn('w-4 h-4', channel === 'whatsapp' ? 'text-emerald-600' : 'text-muted-foreground')} />
                    <span className="text-sm font-semibold">WhatsApp</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {hasPhone ? customer?.phone : 'Telefon yok'}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setChannel('email')}
                  className={cn(
                    'flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all text-left',
                    channel === 'email'
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30'
                      : 'border-border hover:border-teal-300 bg-background',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Mail className={cn('w-4 h-4', channel === 'email' ? 'text-teal-600' : 'text-muted-foreground')} />
                    <span className="text-sm font-semibold">E-Posta</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-full">
                    {hasEmail ? customer?.email : 'E-posta yok'}
                  </div>
                </button>
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

            <Separator />

            {/* Mesaj önizleme / düzenleme */}
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
                value={customNote || defaultMessage}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="Varsayılan mesaj kullanılır..."
                className="text-xs min-h-32 font-mono"
              />
              <div className="text-[10px] text-muted-foreground">
                {channel === 'whatsapp'
                  ? 'Bu metin WhatsApp mesajına otomatik kopyalanır.'
                  : 'Bu metin e-posta gövdesine otomatik kopyalanır.'}
              </div>
            </div>

            <Separator />

            {/* PDF / Print butonu */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/30">
              <div className="min-w-0">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Printer className="w-4 h-4 text-violet-600" />
                  PDF Olarak Kaydet
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Profesyonel {isProformaDoc ? 'proforma' : 'teklif'} dokümanını yazdır veya PDF olarak kaydet.
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (onPrint) onPrint()
                }}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Aç
              </Button>
            </div>

            {/* Gönderildi işaretle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={markAsSent}
                onChange={(e) => setMarkAsSent(e.target.checked)}
                className="rounded border-input"
                disabled={proforma.status !== 'taslak'}
              />
              <span className="text-xs text-muted-foreground">
                Gönderim sonrası durumu &quot;Gönderildi&quot; olarak işaretle
                {proforma.status !== 'taslak' && (
                  <span className="ml-1 text-amber-600">(mevcut durum: {statusMeta?.label})</span>
                )}
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            İptal
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !proforma}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {sending ? (
              <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
            ) : channel === 'whatsapp' ? (
              <MessageCircle className="w-4 h-4 mr-1.5" />
            ) : (
              <Mail className="w-4 h-4 mr-1.5" />
            )}
            {channel === 'whatsapp' ? 'WhatsApp ile Gönder' : 'E-Posta ile Gönder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
