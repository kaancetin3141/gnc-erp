'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiGet } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { whatsappLink, formatPhone, normalizePhone } from '@/lib/format'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  MessageCircle, Mail, Search, Send, Star, ExternalLink,
} from 'lucide-react'
import type { MessageTemplate } from './templates-view'

interface TemplatePickerDialogProps {
  open: boolean
  onClose: () => void
  type: 'whatsapp' | 'email'
  customerName: string
  customerPhone?: string | null
  customerEmail?: string | null
}

interface ListResponse {
  items: MessageTemplate[]
  total: number
}

// Değişkenleri gerçek değerlerle değiştir
function replaceVariables(
  content: string,
  vars: { musteri: string; temsilci: string; firma: string; telefon: string; tarih: string },
): string {
  return content
    .replace(/\{\{musteri\}\}/g, vars.musteri)
    .replace(/\{\{temsilci\}\}/g, vars.temsilci)
    .replace(/\{\{firma\}\}/g, vars.firma)
    .replace(/\{\{telefon\}\}/g, vars.telefon)
    .replace(/\{\{tarih\}\}/g, vars.tarih)
}

export function TemplatePickerDialog({
  open,
  onClose,
  type,
  customerName,
  customerPhone,
  customerEmail,
}: TemplatePickerDialogProps) {
  const user = useAppStore((s) => s.user)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editedContent, setEditedContent] = useState('')
  const [editedSubject, setEditedSubject] = useState('')

  // Şablonları yükle (tip filtresi ile)
  const { data, isLoading } = useQuery({
    queryKey: ['templates', { type, picker: true }],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('type', type)
      params.set('limit', '100')
      return apiGet<ListResponse>(`/api/templates?${params.toString()}`)
    },
    enabled: open,
  })

  // Değişken değerleri
  const variables = useMemo(() => ({
    musteri: customerName || 'Müşteri',
    temsilci: user?.name || 'Temsilci',
    firma: user?.tenant?.name || 'Firma',
    telefon: customerPhone ? formatPhone(customerPhone) : '',
    tarih: new Date().toLocaleDateString('tr-TR'),
  }), [customerName, customerPhone, user?.name, user?.tenant?.name])

  const templates = data?.items ?? []
  const filtered = useMemo(() => {
    if (!search) return templates
    const q = search.toLowerCase()
    return templates.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      t.content.toLowerCase().includes(q) ||
      (t.subject ?? '').toLowerCase().includes(q),
    )
  }, [templates, search])

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  )

  const handleSelect = (t: MessageTemplate) => {
    setSelectedId(t.id)
    setEditedContent(replaceVariables(t.content, variables))
    setEditedSubject(t.subject ? replaceVariables(t.subject, variables) : '')
  }

  const handleSendWhatsApp = () => {
    if (!customerPhone) {
      toast.error('Müşteri telefon numarası yok')
      return
    }
    const url = whatsappLink(customerPhone, editedContent)
    if (url === '#') {
      toast.error('Telefon numarası geçersiz')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    toast.success('WhatsApp açılıyor…')
    onClose()
  }

  const handleSendEmail = () => {
    if (!customerEmail) {
      toast.error('Müşteri e-posta adresi yok')
      return
    }
    const subject = editedSubject || 'İletişim'
    const body = editedContent
    const url = `mailto:${customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = url
    toast.success('E-posta uygulaması açılıyor…')
    onClose()
  }

  const TypeIcon = type === 'whatsapp' ? MessageCircle : Mail
  const typeColor = type === 'whatsapp'
    ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'
    : 'text-sky-600 bg-sky-50 dark:bg-sky-950/30'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center', typeColor)}>
              <TypeIcon className="w-4 h-4" />
            </span>
            {type === 'whatsapp' ? 'WhatsApp Şablonu' : 'E-posta Şablonu'} Seç
          </DialogTitle>
          <DialogDescription>
            Bir hazır şablon seçin, içeriği düzenleyin ve <strong>{customerName}</strong> için gönderin.
            Değişkenler otomatik dolduruldu.
          </DialogDescription>
        </DialogHeader>

        {/* Müşteri bilgisi özeti */}
        <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/50 text-xs">
          <div>
            <div className="text-muted-foreground">Müşteri</div>
            <div className="font-medium truncate">{customerName}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{type === 'whatsapp' ? 'Telefon' : 'E-posta'}</div>
            <div className="font-medium truncate">
              {type === 'whatsapp' ? (customerPhone ? formatPhone(customerPhone) : '—') : (customerEmail ?? '—')}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden grid md:grid-cols-2 gap-4 min-h-[300px]">
          {/* Sol: Şablon listesi */}
          <div className="flex flex-col min-h-0">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Şablon ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll space-y-1.5 pr-1 max-h-[300px] md:max-h-none">
              {isLoading ? (
                [...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Şablon bulunamadı. Ayarlar → Şablonlar bölümünden ekleyebilirsiniz.
                </div>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelect(t)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border transition-all',
                      selectedId === t.id
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-500/30'
                        : 'border-border hover:border-emerald-300 hover:bg-muted/50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-medium text-sm flex items-center gap-1.5 min-w-0">
                        {t.isDefault && <Star className="w-3 h-3 text-amber-500 fill-amber-400 shrink-0" />}
                        <span className="truncate">{t.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-[9px] shrink-0">{t.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {t.content.replace(/\s+/g, ' ').slice(0, 100)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Sağ: Düzenleme alanı */}
          <div className="flex flex-col min-h-0 border-l border-border pl-4">
            {selectedTemplate ? (
              <>
                {type === 'email' && (
                  <div className="space-y-1.5 mb-2">
                    <Label htmlFor="picker-subject" className="text-xs">Konu</Label>
                    <Input
                      id="picker-subject"
                      value={editedSubject}
                      onChange={(e) => setEditedSubject(e.target.value)}
                      className="h-9"
                    />
                  </div>
                )}
                <div className="space-y-1.5 flex-1 flex flex-col">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="picker-content" className="text-xs">Mesaj</Label>
                    <span className="text-[11px] text-muted-foreground">{editedContent.length} karakter</span>
                  </div>
                  <Textarea
                    id="picker-content"
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="flex-1 resize-none min-h-[180px]"
                  />
                  <div className="text-[11px] text-muted-foreground">
                    Değişkenler dolduruldu: <strong>{customerName}</strong> · <strong>{user?.name}</strong> · <strong>{user?.tenant?.name}</strong>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-6">
                <div>
                  <TypeIcon className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Soldan bir şablon seçin
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>İptal</Button>
          {type === 'whatsapp' ? (
            <Button
              onClick={handleSendWhatsApp}
              disabled={!selectedId || !customerPhone || !normalizePhone(customerPhone)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Send className="w-4 h-4 mr-1.5" />
              WhatsApp ile Gönder
              <ExternalLink className="w-3 h-3 ml-1.5 opacity-70" />
            </Button>
          ) : (
            <Button
              onClick={handleSendEmail}
              disabled={!selectedId || !customerEmail}
              className="bg-sky-600 hover:bg-sky-700"
            >
              <Send className="w-4 h-4 mr-1.5" />
              E-posta Uygulamasını Aç
              <ExternalLink className="w-3 h-3 ml-1.5 opacity-70" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
