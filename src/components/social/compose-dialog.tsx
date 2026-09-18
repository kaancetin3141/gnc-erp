'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PLATFORMS, PLATFORM_LIST, isCompatibleWith } from '@/lib/social/platforms'
import type { PlatformKey } from '@/lib/social/platforms'
import type { SocialAccountItem, SocialPostItem } from '@/lib/social/types'
import { PlatformBadge } from './platform-badge'
import {
  Image as ImageIcon, Video, Link as LinkIcon, FileText, Plus, Send, Calendar as CalIcon,
  AlertTriangle, ChevronDown, ChevronRight, Hash, X, Loader2, Sparkles,
} from 'lucide-react'

interface ComposeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editPost?: SocialPostItem | null
  defaultPlatform?: PlatformKey
  onComposed?: () => void
}

const MEDIA_TYPES = [
  { value: 'text', label: 'Metin', icon: FileText },
  { value: 'image', label: 'Görsel', icon: ImageIcon },
  { value: 'video', label: 'Video', icon: Video },
  { value: 'link', label: 'Bağlantı', icon: LinkIcon },
] as const

export function ComposeDialog({
  open,
  onOpenChange,
  editPost = null,
  defaultPlatform,
  onComposed,
}: ComposeDialogProps) {
  const qc = useQueryClient()

  // Bağlı hesapları çek
  const { data: accounts, isLoading: accountsLoading } = useQuery<SocialAccountItem[]>({
    queryKey: ['social-accounts'],
    queryFn: () => apiGet<SocialAccountItem[]>('/api/social/accounts'),
    enabled: open,
  })
  const accountsList = accounts ?? []
  const connectedPlatforms = useMemo(
    () => Array.from(new Set(accountsList.map((a) => a.platform))) as PlatformKey[],
    [accountsList],
  )

  // Form state
  const [content, setContent] = useState('')
  const [selected, setSelected] = useState<PlatformKey[]>([])
  const [mediaType, setMediaType] = useState<'text' | 'image' | 'video' | 'link'>('text')
  const [mediaFiles, setMediaFiles] = useState<string[]>([])
  const [linkUrl, setLinkUrl] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now')
  const [scheduledAt, setScheduledAt] = useState<string>('')
  const [perPlatform, setPerPlatform] = useState<Partial<Record<PlatformKey, string>>>({})
  const [perPlatformOpen, setPerPlatformOpen] = useState(false)
  const [mediaUrlInput, setMediaUrlInput] = useState('')

  // open değiştiğinde formu init
  useEffect(() => {
    if (!open) return
    if (editPost) {
      setContent(editPost.content)
      setSelected(editPost.platforms)
      setMediaType((editPost.mediaType === 'carousel' ? 'image' : editPost.mediaType) as 'text' | 'image' | 'video' | 'link')
      setMediaFiles(editPost.mediaUrls || [])
      setLinkUrl(editPost.linkUrl || '')
      setCampaignName(editPost.campaignName || '')
      setPerPlatform(editPost.perPlatformContent || {})
      if (editPost.scheduledAt) {
        setScheduleMode('scheduled')
        const d = new Date(editPost.scheduledAt)
        const tz = d.getTimezoneOffset() * 60000
        setScheduledAt(new Date(d.getTime() - tz).toISOString().slice(0, 16))
      } else {
        setScheduleMode('now')
        setScheduledAt('')
      }
    } else {
      setContent('')
      setSelected(defaultPlatform ? [defaultPlatform] : [])
      setMediaType('text')
      setMediaFiles([])
      setLinkUrl('')
      setCampaignName('')
      setPerPlatform({})
      setScheduleMode('now')
      setScheduledAt('')
    }
  }, [open, editPost, defaultPlatform])

  // Hashtag parse
  const hashtags = useMemo(() => {
    const matches = content.match(/#([\p{L}\p{N}_]+)/gu) || []
    return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())))
  }, [content])

  // Mention parse
  const mentions = useMemo(() => {
    const matches = content.match(/@([\p{L}\p{N}_\.]+)/gu) || []
    return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())))
  }, [content])

  // Karakter limiti kontrolü
  const charInfo = useMemo(() => {
    if (selected.length === 0) return { min: 0, max: 0, minPlatform: '', maxPlatform: '', overLimit: [] as PlatformKey[] }
    const limits = selected.map((p) => ({ p, limit: PLATFORMS[p].charLimit }))
    const min = limits.reduce((m, x) => (x.limit < m.limit ? x : m), limits[0])
    const max = limits.reduce((m, x) => (x.limit > m.limit ? x : m), limits[0])
    const overLimit = selected.filter((p) => content.length > PLATFORMS[p].charLimit)
    return {
      min: min.limit,
      max: max.limit,
      minPlatform: PLATFORMS[min.p].shortLabel,
      maxPlatform: PLATFORMS[max.p].shortLabel,
      overLimit,
    }
  }, [selected, content])

  // Platform toggle
  function togglePlatform(p: PlatformKey) {
    setSelected((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
  }

  function addMediaUrl() {
    if (!mediaUrlInput.trim()) return
    setMediaFiles((prev) => [...prev, mediaUrlInput.trim()])
    setMediaUrlInput('')
  }

  function removeMedia(idx: number) {
    setMediaFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    setMediaFiles((prev) => [...prev, ...files.map((f) => `mock://${f.name}`)])
    e.target.value = ''
  }

  // Submit
  const submitMutation = useMutation({
    mutationFn: async () => {
      const body = {
        content,
        platforms: selected,
        mediaUrls: mediaFiles,
        mediaType,
        linkUrl: linkUrl || undefined,
        hashtags,
        mentions,
        perPlatformContent: perPlatform,
        campaignName: campaignName || undefined,
        scheduledAt: scheduleMode === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        publishNow: scheduleMode === 'now',
      }
      if (editPost) {
        return apiPatch(`/api/social/posts/${editPost.id}`, body)
      }
      return apiPost('/api/social/posts', body)
    },
    onSuccess: () => {
      toast.success(editPost ? 'Gönderi güncellendi' : scheduleMode === 'now' ? 'Yayınlandı!' : 'Zamanlandı!', {
        description: `${selected.length} platforma${scheduleMode === 'now' ? ' yayınlandı' : ' zamanlandı'}`,
      })
      qc.invalidateQueries({ queryKey: ['social-posts'] })
      qc.invalidateQueries({ queryKey: ['social-calendar'] })
      qc.invalidateQueries({ queryKey: ['social-analytics'] })
      onOpenChange(false)
      onComposed?.()
    },
    onError: (e: Error) => {
      toast.error('İşlem başarısız', { description: e.message })
    },
  })

  const canSubmit =
    content.trim().length > 0 &&
    selected.length > 0 &&
    (scheduleMode === 'now' || (scheduleMode === 'scheduled' && scheduledAt)) &&
    !submitMutation.isPending

  // Uyumluluk uyarıları
  const compatWarnings = useMemo(() => {
    return selected
      .map((p) => ({
        platform: p,
        result: isCompatibleWith(
          { content, mediaType, mediaCount: mediaFiles.length, hasLink: !!linkUrl },
          p,
        ),
      }))
      .filter((x) => !x.result.compatible)
  }, [selected, content, mediaType, mediaFiles.length, linkUrl])

  const visiblePlatforms = PLATFORM_LIST.filter((p) => connectedPlatforms.includes(p.key))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            {editPost ? 'Gönderiyi Düzenle' : 'Yeni Gönderi Oluştur'}
          </DialogTitle>
          <DialogDescription>
            Birden fazla platforma aynı anda paylaşın veya zamanlayın.
          </DialogDescription>
        </DialogHeader>

        {accountsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : accountsList.length === 0 ? (
          <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm">
            <AlertTriangle className="inline w-4 h-4 text-amber-600 mr-1.5" />
            Henüz bağlı hesap yok. Önce <b>Hesaplar</b> sekmesinden bir platforma bağlanın.
          </div>
        ) : (
          <div className="space-y-5">
            {/* Platform seçimi */}
            <div>
              <Label className="mb-2 block">Platformlar</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {visiblePlatforms.map((p) => {
                  const checked = selected.includes(p.key)
                  return (
                    <label
                      key={p.key}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-colors',
                        checked
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-accent',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePlatform(p.key)}
                      />
                      <PlatformBadge platform={p.key} size="sm" />
                      <span className="text-xs text-muted-foreground truncate">
                        {p.charLimit}kr
                      </span>
                    </label>
                  )
                })}
              </div>
              {selected.length === 0 && (
                <p className="text-xs text-amber-600 mt-1.5">En az bir platform seçin.</p>
              )}
            </div>

            {/* Metin */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="compose-content">İçerik</Label>
                <span
                  className={cn(
                    'text-xs',
                    charInfo.overLimit.length > 0
                      ? 'text-red-600 font-semibold'
                      : 'text-muted-foreground',
                  )}
                >
                  {content.length} kr ·
                  {' min:'} {charInfo.min} ({charInfo.minPlatform}) ·
                  {' max:'} {charInfo.max} ({charInfo.maxPlatform})
                </span>
              </div>
              <Textarea
                id="compose-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Bugün paylaşacaklarınız..."
                className="min-h-[120px] resize-y"
              />
              {/* Hashtag önerileri */}
              {hashtags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                  {hashtags.map((h) => (
                    <Badge key={h} variant="secondary" className="text-[10px] gap-0.5">
                      <Hash className="w-3 h-3" />
                      {h}
                    </Badge>
                  ))}
                  {mentions.length > 0 && mentions.map((m) => (
                    <Badge key={m} variant="outline" className="text-[10px]">
                      @{m}
                    </Badge>
                  ))}
                </div>
              )}
              {charInfo.overLimit.length > 0 && (
                <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Şu platformlarda karakter limiti aşıldı: {charInfo.overLimit.map((p) => PLATFORMS[p].shortLabel).join(', ')}
                </p>
              )}
            </div>

            {/* Medya tipi */}
            <div>
              <Label className="mb-2 block">Medya Tipi</Label>
              <div className="flex flex-wrap gap-2">
                {MEDIA_TYPES.map((m) => {
                  const Icon = m.icon
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMediaType(m.value)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                        mediaType === m.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'hover:bg-accent',
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Medya yükleme */}
            <div>
              <Label className="mb-2 block">Medya (mock)</Label>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="https://ornek.com/gorsel.jpg"
                  value={mediaUrlInput}
                  onChange={(e) => setMediaUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMediaUrl() } }}
                />
                <Button type="button" size="sm" variant="outline" onClick={addMediaUrl}>
                  <Plus className="w-4 h-4" /> Ekle
                </Button>
                <label>
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    className="sr-only"
                    onChange={onFileChange}
                  />
                  <Button type="button" size="sm" variant="outline" asChild>
                    <span><ImageIcon className="w-4 h-4" /> Dosya</span>
                  </Button>
                </label>
              </div>
              {mediaFiles.length > 0 && (
                <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {mediaFiles.map((url, idx) => (
                    <div
                      key={idx}
                      className="group relative aspect-square rounded-md border bg-muted overflow-hidden flex items-center justify-center"
                    >
                      <span className="text-[10px] text-muted-foreground text-center p-1 line-clamp-2 break-all">
                        {url.replace('mock://', '').split('/').pop()}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeMedia(idx)}
                        className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Link + Kampanya */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="compose-link" className="mb-1.5 block">Bağlantı (opsiyonel)</Label>
                <Input
                  id="compose-link"
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="compose-campaign" className="mb-1.5 block">Kampanya Adı (opsiyonel)</Label>
                <Input
                  id="compose-campaign"
                  placeholder="Yaz İndirimi 2025"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                />
              </div>
            </div>

            {/* Zamanlama */}
            <div>
              <Label className="mb-2 block">Zamanlama</Label>
              <RadioGroup
                value={scheduleMode}
                onValueChange={(v) => setScheduleMode(v as 'now' | 'scheduled')}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="now" id="sch-now" />
                  <span className="text-sm flex items-center gap-1">
                    <Send className="w-3.5 h-3.5" /> Hemen Yayınla
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="scheduled" id="sch-later" />
                  <span className="text-sm flex items-center gap-1">
                    <CalIcon className="w-3.5 h-3.5" /> Zamanla
                  </span>
                </label>
              </RadioGroup>
              {scheduleMode === 'scheduled' && (
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="mt-2 max-w-xs"
                />
              )}
            </div>

            {/* Per-platform customization */}
            {selected.length > 0 && (
              <Collapsible open={perPlatformOpen} onOpenChange={setPerPlatformOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between">
                    <span className="flex items-center gap-1.5">
                      {perPlatformOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      Platform Bazlı Özelleştirme
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {Object.keys(perPlatform).filter((k) => (perPlatform as Record<string, string>)[k]).length}/{selected.length}
                    </Badge>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 mt-2">
                  {selected.map((p) => {
                    const def = PLATFORMS[p]
                    const val = perPlatform[p] ?? ''
                    return (
                      <div key={p}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <PlatformBadge platform={p} size="sm" />
                            <span className="text-xs text-muted-foreground">{def.charLimit} karakter</span>
                          </div>
                          <span className={cn('text-xs', val.length > def.charLimit ? 'text-red-600' : 'text-muted-foreground')}>
                            {val.length || '—'} kr
                          </span>
                        </div>
                        <Textarea
                          placeholder={`Bu platform için özel metin (boşsa ana metin kullanılır)...`}
                          value={val}
                          onChange={(e) => setPerPlatform((prev) => ({ ...prev, [p]: e.target.value }))}
                          className="min-h-[60px] text-sm"
                        />
                      </div>
                    )
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Uyumluluk uyarıları */}
            {compatWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
                {compatWarnings.map((w) => (
                  <div key={w.platform} className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      <b>{PLATFORMS[w.platform].label}:</b> {w.result.reason}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitMutation.isPending}>
            İptal
          </Button>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={!canSubmit || accountsList.length === 0}
          >
            {submitMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : scheduleMode === 'now' ? (
              <Send className="w-4 h-4" />
            ) : (
              <CalIcon className="w-4 h-4" />
            )}
            {editPost ? 'Kaydet' : scheduleMode === 'now' ? 'Yayınla' : 'Zamanla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
