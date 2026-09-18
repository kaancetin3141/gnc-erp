'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiGet, apiPost, apiPatch, apiDelete, qk } from '@/lib/api-client'
import { cn } from '@/lib/utils'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  MessageCircle, Mail, Smartphone, Plus, Pencil, Trash2, Copy,
  Search, Sparkles, FileText, Star, Check, X,
} from 'lucide-react'

// ============================================================
// Tipler
// ============================================================
export interface MessageTemplate {
  id: string
  tenantId: string
  name: string
  type: string // whatsapp | email | sms
  category: string // genel | satis | takip | teklif | tesekkur
  subject: string | null
  content: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

interface ListResponse {
  items: MessageTemplate[]
  total: number
}

// ============================================================
// Sabitler
// ============================================================
const TYPE_META: Record<string, { label: string; icon: typeof Mail; color: string }> = {
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50' },
  email: { label: 'E-posta', icon: Mail, color: 'text-sky-700 bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50' },
  sms: { label: 'SMS', icon: Smartphone, color: 'text-violet-700 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900/50' },
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  genel: { label: 'Genel', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  satis: { label: 'Satış', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  takip: { label: 'Takip', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  teklif: { label: 'Teklif', color: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' },
  tesekkur: { label: 'Teşekkür', color: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
}

const VARIABLES = [
  { key: '{{musteri}}', label: 'Müşteri Adı' },
  { key: '{{temsilci}}', label: 'Temsilci Adı' },
  { key: '{{firma}}', label: 'Firma Adı' },
  { key: '{{telefon}}', label: 'Telefon' },
  { key: '{{tarih}}', label: 'Tarih' },
]

// ============================================================
// Yardımcılar
// ============================================================
function getPreview(content: string, max = 80): string {
  const clean = content.replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max) + '…' : clean
}

// ============================================================
// ANA BİLEŞEN — TemplatesView
// ============================================================
export function TemplatesView() {
  const qc = useQueryClient()
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Liste sorgusu
  const { data, isLoading } = useQuery({
    queryKey: qk.templates({ type: typeFilter, category: categoryFilter, search }),
    queryFn: () => {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      if (search) params.set('search', search)
      params.set('limit', '200')
      return apiGet<ListResponse>(`/api/templates?${params.toString()}`)
    },
  })

  // Varsayılanları yükle
  const seedMutation = useMutation({
    mutationFn: () => apiPost<{ seeded: boolean; message: string; created: number }>('/api/templates/seed'),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Silme
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/templates/${id}`),
    onSuccess: () => {
      toast.success('Şablon silindi')
      qc.invalidateQueries({ queryKey: ['templates'] })
      setDeleteId(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const templates = data?.items ?? []

  const handleEdit = (t: MessageTemplate | null) => {
    setEditingId(t?.id ?? null)
    setEditOpen(true)
  }

  const handleCopy = async (t: MessageTemplate) => {
    try {
      await navigator.clipboard.writeText(t.content)
      toast.success('İçerik panoya kopyalandı')
    } catch {
      toast.error('Kopyalama başarısız')
    }
  }

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            Hazır Yazı Şablonları
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            WhatsApp, e-posta ve SMS için düzenlenebilir hazır mesajlar.
            Değişkenler: <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{'{{musteri}}'}</code>{' '}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{'{{temsilci}}'}</code>{' '}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{'{{firma}}'}</code>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            <Sparkles className="w-4 h-4 mr-1.5 text-amber-500" />
            Varsayılanları Yükle
          </Button>
          <Button size="sm" onClick={() => handleEdit(null)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-1.5" /> Yeni Şablon
          </Button>
        </div>
      </div>

      {/* FİLTRELER */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Tip chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground mr-1">Tip:</span>
            <FilterChip
              active={typeFilter === 'all'}
              onClick={() => setTypeFilter('all')}
              label="Tümü"
            />
            {Object.entries(TYPE_META).map(([key, meta]) => (
              <FilterChip
                key={key}
                active={typeFilter === key}
                onClick={() => setTypeFilter(key)}
                label={meta.label}
                icon={meta.icon}
              />
            ))}
          </div>
          {/* Kategori chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground mr-1">Kategori:</span>
            <FilterChip
              active={categoryFilter === 'all'}
              onClick={() => setCategoryFilter('all')}
              label="Tümü"
            />
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <FilterChip
                key={key}
                active={categoryFilter === key}
                onClick={() => setCategoryFilter(key)}
                label={meta.label}
              />
            ))}
          </div>
          {/* Arama */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Şablon adı veya içerik ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* LİSTE */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground" />
            </div>
            <h4 className="font-semibold mb-1">Henüz şablon yok</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Yeni bir şablon oluşturun veya hazır şablonları yükleyin.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                <Sparkles className="w-4 h-4 mr-1.5 text-amber-500" />
                Varsayılanları Yükle
              </Button>
              <Button size="sm" onClick={() => handleEdit(null)} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-1.5" /> Yeni Şablon
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => {
            const typeMeta = TYPE_META[t.type] ?? TYPE_META.whatsapp
            const catMeta = CATEGORY_META[t.category] ?? CATEGORY_META.genel
            const TypeIcon = typeMeta.icon
            return (
              <Card
                key={t.id}
                className="group hover:shadow-md transition-shadow flex flex-col"
              >
                <CardHeader className="pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-semibold truncate flex items-center gap-1.5">
                        {t.name}
                        {t.isDefault && (
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />
                        )}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleCopy(t)}
                        title="İçeriği kopyala"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleEdit(t)}
                        title="Düzenle"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        onClick={() => setDeleteId(t.id)}
                        title="Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={cn('text-[10px]', typeMeta.color)}>
                      <TypeIcon className="w-3 h-3 mr-1" />
                      {typeMeta.label}
                    </Badge>
                    <Badge variant="secondary" className={cn('text-[10px] border-0', catMeta.color)}>
                      {catMeta.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between gap-3">
                  {t.subject && t.type === 'email' && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Konu: </span>
                      <span className="font-medium truncate">{t.subject}</span>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
                    {getPreview(t.content, 200)}
                  </p>
                  <div className="text-[10px] text-muted-foreground/70 pt-2 border-t border-border">
                    {new Date(t.updatedAt).toLocaleDateString('tr-TR')}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* EDIT DIALOG */}
      {editOpen && (
        <TemplateEditDialog
          templateId={editingId}
          onClose={() => {
            setEditOpen(false)
            setEditingId(null)
          }}
        />
      )}

      {/* DELETE CONFIRM */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Şablonu sil?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu işlem geri alınamaz. Şablon kalıcı olarak silinecek.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================
// Filtre chip
// ============================================================
function FilterChip({
  active, onClick, label, icon: Icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon?: typeof Mail
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors border',
        active
          ? 'bg-emerald-600 text-white border-emerald-600'
          : 'bg-background text-muted-foreground border-border hover:bg-muted',
      )}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </button>
  )
}

// ============================================================
// EDİT DİALOG
// ============================================================
interface EditDialogProps {
  templateId: string | null
  onClose: () => void
}

function TemplateEditDialog({ templateId, onClose }: EditDialogProps) {
  const isNew = !templateId

  // Mevcut şablonu yükle (edit modunda)
  const { data: existing, isLoading } = useQuery({
    queryKey: ['template', templateId],
    queryFn: () => apiGet<MessageTemplate>(`/api/templates/${templateId}`),
    enabled: !!templateId,
  })

  // Yeni şablon ise hemen formu göster; edit modunda veri gelene kadar bekle
  if (!isNew && isLoading) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Şablon Yükleniyor…</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-20" />
            <Skeleton className="h-32" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // key ile remount → initial state güvenli
  return (
    <TemplateEditForm
      key={templateId ?? 'new'}
      templateId={templateId}
      initial={isNew ? null : existing ?? null}
      onClose={onClose}
    />
  )
}

interface FormProps {
  templateId: string | null
  initial: MessageTemplate | null
  onClose: () => void
}

function TemplateEditForm({ templateId, initial, onClose }: FormProps) {
  const qc = useQueryClient()
  const isNew = !templateId

  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState(initial?.type ?? 'whatsapp')
  const [category, setCategory] = useState(initial?.category ?? 'genel')
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        type,
        category,
        subject: type === 'email' ? subject.trim() : null,
        content: content.trim(),
        isDefault,
      }
      if (isNew) {
        return apiPost<MessageTemplate>('/api/templates', payload)
      }
      return apiPatch<MessageTemplate>(`/api/templates/${templateId}`, payload)
    },
    onSuccess: () => {
      toast.success(isNew ? 'Şablon oluşturuldu' : 'Şablon güncellendi')
      qc.invalidateQueries({ queryKey: ['templates'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const insertVariable = (key: string) => {
    setContent((prev) => prev + key)
  }

  const canSave = !!name.trim() && !!content.trim() && !saveMutation.isPending

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Yeni Şablon' : 'Şablonu Düzenle'}</DialogTitle>
          <DialogDescription>
            Hazır mesaj şablonu oluştur. Değişkenler müşteri bilgileriyle otomatik doldurulur.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Ad */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Şablon Adı</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Hoş geldin mesajı"
            />
          </div>

          {/* Tip + Kategori */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tip</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">
                    <span className="flex items-center gap-2">
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp
                    </span>
                  </SelectItem>
                  <SelectItem value="email">
                    <span className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-sky-600" /> E-posta
                    </span>
                  </SelectItem>
                  <SelectItem value="sms">
                    <span className="flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-violet-600" /> SMS
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="genel">Genel</SelectItem>
                  <SelectItem value="satis">Satış</SelectItem>
                  <SelectItem value="takip">Takip</SelectItem>
                  <SelectItem value="teklif">Teklif</SelectItem>
                  <SelectItem value="tesekkur">Teşekkür</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Subject (sadece email için) */}
          {type === 'email' && (
            <div className="space-y-1.5">
              <Label htmlFor="tpl-subject">Konu</Label>
              <Input
                id="tpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="E-posta konusu"
              />
            </div>
          )}

          {/* İçerik */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tpl-content">İçerik</Label>
              <span className="text-[11px] text-muted-foreground">{content.length} karakter</span>
            </div>
            <Textarea
              id="tpl-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Mesajınızı yazın… Değişkenler için aşağıdaki butonları kullanın."
              className="resize-y"
            />
            {/* Variable helper */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] text-muted-foreground mr-1">Değişken ekle:</span>
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  title={v.label}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-muted hover:bg-emerald-100 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 transition-colors"
                >
                  {v.key}
                </button>
              ))}
            </div>
          </div>

          {/* Default toggle */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <button
              type="button"
              onClick={() => setIsDefault(!isDefault)}
              className={cn(
                'w-9 h-5 rounded-full p-0.5 transition-colors shrink-0',
                isDefault ? 'bg-emerald-600' : 'bg-muted-foreground/30',
              )}
            >
              <div className={cn(
                'w-4 h-4 rounded-full bg-white transition-transform',
                isDefault ? 'translate-x-4' : 'translate-x-0',
              )} />
            </button>
            <div className="flex-1">
              <div className="text-sm font-medium flex items-center gap-1.5">
                {isDefault ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5" />}
                Varsayılan şablon
              </div>
              <p className="text-[11px] text-muted-foreground">
                Bu tipteki diğer şablonların varsayılan işareti kaldırılır.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saveMutation.isPending ? 'Kaydediliyor…' : isNew ? 'Oluştur' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
