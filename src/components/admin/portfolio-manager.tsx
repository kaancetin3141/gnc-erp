'use client'

// Portfolyo Yöneticisi — gncinc.online ana sitesindeki "Projeler" bölümünü yönetir
// Admin panel > Portfolyo sekmesi. Eklenen projeler anında /api/portfolio'dan yayınlanır.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { SessionUser } from '@/types'

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  LayoutGrid, Plus, Pencil, Trash2, ExternalLink, Globe, Loader2, Rocket,
} from 'lucide-react'

interface PortfolioProject {
  id: string
  title: string
  description: string
  url: string | null
  subdomain: string | null
  status: string // live | soon | planned
  emoji: string
  tech: string[]
  features: string[]
  sortOrder: number
  published: boolean
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  live: { label: 'Canlıda', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900' },
  soon: { label: 'Yakında', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900' },
  planned: { label: 'Planlandı', cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700' },
}

interface FormState {
  title: string
  description: string
  url: string
  subdomain: string
  status: string
  emoji: string
  tech: string
  features: string
  sortOrder: number
  published: boolean
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  url: '',
  subdomain: '',
  status: 'live',
  emoji: '🚀',
  tech: '',
  features: '',
  sortOrder: 99,
  published: true,
}

export function PortfolioManager({ user }: { user: SessionUser }) {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PortfolioProject | null>(null)
  const [deleting, setDeleting] = useState<PortfolioProject | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const canManage = user.role === 'admin' || user.role === 'superadmin'

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['portfolio-admin'],
    queryFn: () => apiGet<{ projects: PortfolioProject[] }>('/api/portfolio-admin'),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['portfolio-admin'] })
    qc.invalidateQueries({ queryKey: ['portfolio-public'] })
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        description: form.description,
        url: form.url || null,
        subdomain: form.subdomain || null,
        status: form.status,
        emoji: form.emoji || '🚀',
        tech: form.tech,
        features: form.features,
        sortOrder: Number(form.sortOrder) || 99,
        published: form.published,
      }
      if (editing) return apiPatch(`/api/portfolio-admin/${editing.id}`, payload)
      return apiPost('/api/portfolio-admin', payload)
    },
    onSuccess: () => {
      setDialogOpen(false)
      invalidate()
    },
  })

  const delMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/portfolio-admin/${id}`),
    onSuccess: () => {
      setDeleting(null)
      invalidate()
    },
  })

  const pubMut = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      apiPatch(`/api/portfolio-admin/${id}`, { published }),
    onSuccess: invalidate,
  })

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (p: PortfolioProject) => {
    setEditing(p)
    setForm({
      title: p.title,
      description: p.description,
      url: p.url ?? '',
      subdomain: p.subdomain ?? '',
      status: p.status,
      emoji: p.emoji,
      tech: p.tech.join(', '),
      features: p.features.join('\n'),
      sortOrder: p.sortOrder,
      published: p.published,
    })
    setDialogOpen(true)
  }

  const projects = data?.projects ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <LayoutGrid className="w-4 h-4 text-sky-600" />
              Ana Site Projeleri
            </CardTitle>
            <CardDescription className="text-xs">
              gncinc.online ana sitesindeki &quot;Projeler&quot; bölümünü buradan yönetin —
              eklediğiniz proje siteye otomatik düşer.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <Loader2 className={cn('w-4 h-4 mr-1.5', isFetching && 'animate-spin')} />
              Yenile
            </Button>
            {canManage && (
              <Button size="sm" onClick={openNew}>
                <Plus className="w-4 h-4 mr-1.5" />
                Yeni Proje
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
              <Rocket className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">
              Henüz proje yok. &quot;Yeni Proje&quot; ile ilk projenizi ekleyin.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {projects.map((p) => {
              const st = STATUS_META[p.status] ?? STATUS_META.live
              return (
                <div
                  key={p.id}
                  className={cn(
                    'rounded-lg border p-3 flex flex-col gap-2 transition-colors',
                    !p.published && 'opacity-60 border-dashed',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl leading-none">{p.emoji}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{p.title}</div>
                        {p.subdomain && (
                          <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {p.subdomain}.gncinc.online
                          </div>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] shrink-0', st.cls)}>
                      {st.label}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>

                  {p.tech.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.tech.slice(0, 4).map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <Switch
                        checked={p.published}
                        disabled={!canManage || pubMut.isPending}
                        onCheckedChange={(v) => pubMut.mutate({ id: p.id, published: v })}
                      />
                      Yayında
                    </label>
                    <div className="flex items-center gap-1">
                      {p.url && (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                          title="Siteyi aç"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {canManage && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)} title="Düzenle">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleting(p)} title="Sil">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground/70">Sıra: {p.sortOrder}</div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {/* Ekle/Düzenle diyaloğu */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Projeyi Düzenle' : 'Yeni Proje Ekle'}</DialogTitle>
            <DialogDescription>
              Kaydettiğinizde ana sitedeki proje listesi otomatik güncellenir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Emoji</Label>
                <Input
                  value={form.emoji}
                  onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                  className="text-center"
                  placeholder="🚀"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Başlık *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Örn. Meyve Patlat 2"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Açıklama *</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Projenin ne yaptığını 1-2 cümleyle anlatın"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Site Adresi</Label>
                <Input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://yeni.gncinc.online"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Alt Alan Adı</Label>
                <Input
                  value={form.subdomain}
                  onChange={(e) => setForm({ ...form, subdomain: e.target.value })}
                  placeholder="yeni"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Durum</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live">Canlıda</SelectItem>
                    <SelectItem value="soon">Yakında</SelectItem>
                    <SelectItem value="planned">Planlandı</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sıra No</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Yayın</Label>
                <div className="flex items-center gap-2 h-9">
                  <Switch
                    checked={form.published}
                    onCheckedChange={(v) => setForm({ ...form, published: v })}
                  />
                  <span className="text-xs text-muted-foreground">{form.published ? 'Yayında' : 'Gizli'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Teknolojiler <span className="text-muted-foreground">(virgülle ayırın)</span></Label>
              <Input
                value={form.tech}
                onChange={(e) => setForm({ ...form, tech: e.target.value })}
                placeholder="Next.js 16, TypeScript, Prisma"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Özellikler <span className="text-muted-foreground">(her satıra bir özellik)</span></Label>
              <Textarea
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
                placeholder={'Randevu yönetimi\nRekor tablosu'}
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Vazgeç</Button>
            <Button
              size="sm"
              disabled={saveMut.isPending || !form.title.trim() || !form.description.trim()}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {editing ? 'Kaydet' : 'Projeyi Ekle'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Silme onayı */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Proje silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleting?.title}&quot; ana sitesinden de kaldırılacak. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && delMut.mutate(deleting.id)}
            >
              {delMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sil'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
