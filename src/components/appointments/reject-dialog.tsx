'use client'

import { useState, useEffect } from 'react'
import { apiPatch } from '@/lib/api-client'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Ban, MessageCircle } from 'lucide-react'
import { whatsappLink, formatDateTime } from '@/lib/format'

// ============================================================
// Reddet diyaloğu — sebep sorar, durumu 'reddedildi' yapar,
// isteğe bağlı müşteriye WhatsApp ile sebep bildirir.
// ============================================================

export interface RejectTarget {
  id: string
  customerName: string
  customerPhone: string
  date: string
  notes: string | null
  service?: { name?: string | null } | null
}

export function RejectDialog({
  target,
  providerId,
  onOpenChange,
  onDone,
}: {
  target: RejectTarget | null
  providerId: string
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [notify, setNotify] = useState(true)
  const [saving, setSaving] = useState(false)

  // Hedef değişince formu sıfırla
  useEffect(() => {
    if (target) {
      setReason('')
      setNotify(true)
    }
  }, [target])

  if (!target) return null

  const d = new Date(target.date)

  function buildWaMessage(r: string) {
    return (
      `Merhaba ${target!.customerName}, 🙏\n\n` +
      `${formatDateTime(target!.date)} tarihli${target!.service?.name ? ` ${target!.service.name}` : ''} randevunuzu maalesef onaylayamıyoruz. 😔\n\n` +
      (r ? `Sebep: ${r}\n\n` : '') +
      `Uygun başka bir zaman için bize ulaşabilirsiniz. Anlayışınız için teşekkür ederiz! 💚`
    )
  }

  async function handleReject() {
    if (!reason.trim()) {
      toast.error('Lütfen red sebebi yazın')
      return
    }
    setSaving(true)
    try {
      const mergedNotes = `${target!.notes ? target!.notes + '\n' : ''}Reddedilme sebebi: ${reason.trim()}`
      await apiPatch(
        `/api/appointments/providers/${providerId}/appointments/${target!.id}`,
        { status: 'reddedildi', notes: mergedNotes },
      )
      if (notify) {
        window.open(whatsappLink(target!.customerPhone, buildWaMessage(reason.trim())), '_blank', 'noopener,noreferrer')
      }
      toast.success('Randevu reddedildi', {
        description: notify ? 'Müşteriye WhatsApp ile sebep bildirildi' : 'Müşteriye bildirim gönderilmedi',
      })
      onOpenChange(false)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reddedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Ban className="w-4 h-4" />
            Randevuyu Reddet
          </DialogTitle>
          <DialogDescription>
            <strong>{target.customerName}</strong> · {formatDateTime(target.date)}
            {target.service?.name ? ` · ${target.service.name}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="reject-reason" className="text-xs">Red Sebebi *</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Örn: O saatte yoğunluk var, personel izinli, kapalıyız..."
              className="mt-1 resize-none text-sm"
              rows={3}
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {['Personel izinli', 'O saatte dolu', 'O gün kapalıyız'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setReason(p)}
                  className="h-6 px-2 rounded-full border border-border text-[10px] text-muted-foreground hover:bg-accent transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-2.5">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-[#25D366]" />
              <div>
                <div className="text-xs font-medium">WhatsApp ile bildir</div>
                <div className="text-[10px] text-muted-foreground">Sebep müşteriye iletilir</div>
              </div>
            </div>
            <Switch checked={notify} onCheckedChange={setNotify} aria-label="WhatsApp ile bildir" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button onClick={handleReject} disabled={saving} className="bg-red-600 hover:bg-red-700">
            {saving ? 'Kaydediliyor...' : 'Reddet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
