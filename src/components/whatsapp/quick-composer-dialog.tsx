'use client'

// ============================================================
// Hızlı WhatsApp Bestecisi — müşteri kartlarından tek tıkla
// izlenebilir (tracked) WhatsApp mesajı göndermek için.
// sendWhatsAppTracked kullanır: Merkez kaydı + wa.me + durum.
// ============================================================

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { MessageSquareText, Loader2 } from 'lucide-react'
import { sendWhatsAppTracked } from '@/lib/whatsapp-hub'

interface QuickComposerProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  phone: string | null | undefined
  defaultMessage?: string
  title?: string
  customerId?: string | null
  customerName?: string | null
}

export function WhatsAppQuickComposer({
  open,
  onOpenChange,
  phone,
  defaultMessage = '',
  title,
  customerId,
  customerName,
}: QuickComposerProps) {
  const [phoneValue, setPhoneValue] = useState(phone ?? '')
  const [body, setBody] = useState(defaultMessage)
  const [sending, setSending] = useState(false)

  // Diyalo her açılışta güncel müşteri verisiyle dolar
  useEffect(() => {
    if (open) {
      setPhoneValue(phone ?? '')
      setBody(defaultMessage)
    }
  }, [open, phone, defaultMessage])

  const canSend = !!phoneValue.trim() && !!body.trim() && !sending

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    try {
      const result = await sendWhatsAppTracked({
        phone: phoneValue.trim(),
        body: body.trim(),
        title: title ?? (customerName ? `Serbest Mesaj — ${customerName}` : 'Serbest Mesaj'),
        contextType: 'serbest',
        customerId: customerId ?? null,
        customerName: customerName ?? null,
      })
      toast.success(result.popupOpened
        ? 'WhatsApp penceresi açıldı — Merkeze kaydedildi'
        : 'Mesaj kuyruğa alındı — WhatsApp Merkezinden gönderebilirsiniz')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderim başarısız')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="w-5 h-5 text-emerald-600" />
            WhatsApp Gönder
            {customerName && <span className="text-sm font-normal text-muted-foreground">— {customerName}</span>}
          </DialogTitle>
          <DialogDescription>
            Mesaj Merkeze kaydedilir; popup engellenirse kuyruktan tek tıkla gönderebilirsiniz.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Telefon</Label>
            <Input
              value={phoneValue}
              onChange={(e) => setPhoneValue(e.target.value)}
              placeholder="+90 5xx xxx xx xx"
              inputMode="tel"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Mesaj</Label>
              <span className="text-[10px] text-muted-foreground">{body.length} karakter</span>
            </div>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Merhaba, ..."
              className="min-h-28"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Vazgeç
          </Button>
          <Button
            onClick={handleSend}
            disabled={!canSend}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {sending
              ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              : <MessageSquareText className="w-4 h-4 mr-1.5" />}
            Gönder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
