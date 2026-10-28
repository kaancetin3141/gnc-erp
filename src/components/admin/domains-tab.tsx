'use client'

// ============================================================
// ADMIN PANEL — Alan Adları sekmesi
// Alt alan adı şeması: {slug}.{base_domain} → customer-page (port 3002)
// - Ana alan adı ayarı (SystemSetting)
// - İşletme slug düzenleme + çakışma kontrolü
// - Konum (lat/lng) düzenleme + GERÇEK OSM Nominatim geocoding
// - DNS + Caddyfile yapılandırma talimatları
// ============================================================

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPut, apiPost } from '@/lib/api-client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Globe, Save, Copy, MapPin, Loader2, RefreshCw, ExternalLink,
  Navigation, Server, ExternalLink as ExtIcon, SearchX, Code2, Check,
} from 'lucide-react'

interface DomainItem {
  id: string
  tenantId: string
  tenantName: string
  name: string
  slug: string | null
  type: string
  city: string | null
  district: string | null
  address: string | null
  isActive: boolean
  lat: number | null
  lng: number | null
  geoCheckedAt: string | null
  services: number
  appointments: number
}

interface DomainsResponse {
  baseDomain: string
  scheme: string
  items: DomainItem[]
}

interface GeocodeResult {
  providerId: string
  name: string
  ok: boolean
  lat?: number
  lng?: number
  label?: string
  error?: string
}

const TYPE_EMOJI: Record<string, string> = {
  berber: '💈', kuafor: '✂️', disci: '🦷', guzellik: '💄', spa: '🧖', dovme: '🎨',
}

export function DomainsTab() {
  const qc = useQueryClient()
  const [baseInput, setBaseInput] = useState<string | null>(null)
  const [slugDrafts, setSlugDrafts] = useState<Record<string, string>>({})
  const [geoDrafts, setGeoDrafts] = useState<Record<string, { lat: string; lng: string }>>({})
  // Siteye göm (embed widget) diyaloğu — satırdaki Code2 butonuyla açılır
  const [embedTarget, setEmbedTarget] = useState<DomainItem | null>(null)
  const [embedBase, setEmbedBase] = useState('')
  const [embedCopied, setEmbedCopied] = useState(false)

  const q = useQuery({
    queryKey: ['admin-domains'],
    queryFn: () => apiGet<DomainsResponse>('/api/admin/domains'),
  })

  const data = q.data
  const baseDomain = data?.baseDomain ?? ''

  // base input senkronizasyonu (ilk yükleme)
  const [synced, setSynced] = useState('')
  if (data && synced !== data.baseDomain) {
    setSynced(data.baseDomain)
    setBaseInput(data.baseDomain)
  }

  const saveBase = useMutation({
    mutationFn: (v: string) => apiPut<{ baseDomain: string }>('/api/admin/domains/settings', { baseDomain: v }),
    onSuccess: (res) => {
      toast.success(res.baseDomain
        ? `Ana alan adı kaydedildi: ${res.baseDomain}`
        : 'Ana alan adı temizlendi (alt alan adı özelliği kapalı)')
      qc.invalidateQueries({ queryKey: ['admin-domains'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const patchProvider = useMutation({
    mutationFn: (p: { providerId: string; patch: Record<string, unknown> }) =>
      apiPatch<{ provider: { name: string } }>('/api/admin/domains', {
        providerId: p.providerId,
        ...p.patch,
      }),
    onSuccess: (res) => {
      toast.success(`Kaydedildi: ${res.provider.name}`)
      qc.invalidateQueries({ queryKey: ['admin-domains'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const geocode = useMutation({
    mutationFn: (p: { providerId?: string; allMissing?: boolean }) =>
      apiPost<{ results: GeocodeResult[]; processed: number; successCount: number }>(
        '/api/admin/domains/geocode',
        p,
      ),
    onSuccess: (res) => {
      const fails = res.results.filter((r) => !r.ok)
      if (res.successCount > 0) {
        toast.success(`${res.successCount} işletmenin konumu bulundu 📍`)
        for (const r of res.results.filter((r) => r.ok)) {
          toast.info(`${r.name}: ${r.lat!.toFixed(4)}, ${r.lng!.toFixed(4)}`)
        }
      }
      if (fails.length > 0) {
        for (const f of fails.slice(0, 3)) toast.warning(`${f.name}: ${f.error}`)
      }
      if (res.successCount === 0 && fails.length === 0) {
        toast.info('İşlenecek işletme yok')
      }
      qc.invalidateQueries({ queryKey: ['admin-domains'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const missingGeo = useMemo(
    () => (data?.items ?? []).filter((i) => i.lat == null || i.lng == null).length,
    [data],
  )

  const caddySnippet = useMemo(() => {
    const bd = baseDomain || 'randevu.ornek.com'
    return `# ${bd} — müşteri sayfası (alt alan adları)
*.${bd} {
    reverse_proxy localhost:3002
}

# ana alan adı → ERP/CRM (port 3001)
${bd}, www.${bd} {
    reverse_proxy localhost:3001
}

# oyun → Fruit Storm (port 3004)
oyun.${bd} {
    reverse_proxy localhost:3004
}

# KaloriAI (port 3003)
kalori.${bd} {
    reverse_proxy localhost:3003
}`
  }, [baseDomain])

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success(`${label} kopyalandı`))
      .catch(() => toast.error('Kopyalanamadı — metni elle seçin'))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Globe className="h-5 w-5 text-sky-600" />
            Alan Adları
            <Badge variant="outline" className="text-[11px]">{'{slug}'}.{baseDomain || 'alanadi.com'}</Badge>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Her işletme otomatik olarak <span className="font-mono">{'{slug}'}.{baseDomain || 'alanadi.com'}</span> adresinde yayımlanır (müşteri sayfası)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => geocode.mutate({ allMissing: true })}
                disabled={geocode.isPending || missingGeo === 0}
              >
                {geocode.isPending
                  ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  : <Navigation className="h-4 w-4 mr-1.5" />}
                Eksik Konumları Bul {missingGeo > 0 && `(${missingGeo})`}
              </Button>
            </TooltipTrigger>
            <TooltipContent>OSM Nominatim ile adreslerden koordinat bulur (çağrı başına 8 işletme)</TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={cn('h-4 w-4 mr-1.5', q.isFetching && 'animate-spin')} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Ana alan adı + DNS talimatı */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Server className="h-4 w-4 text-sky-600" />
              Ana Alan Adı
            </CardTitle>
            <CardDescription className="text-xs">
              Örn: <span className="font-mono">randevu.firmaniz.com</span> girin — tüm işletmeler bunun alt alan adı olur
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="flex gap-2">
              <Input
                placeholder="randevu.ornek.com"
                value={baseInput ?? ''}
                onChange={(e) => setBaseInput(e.target.value)}
                className="h-9 font-mono text-sm"
              />
              <Button
                size="sm"
                onClick={() => saveBase.mutate(baseInput ?? '')}
                disabled={saveBase.isPending}
                className="shrink-0"
              >
                {saveBase.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Kaydet
              </Button>
            </div>
            <div className="rounded-lg border bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground mb-1">DNS ayarı ( Hosting/Cloudflare ): </p>
              <code className="block font-mono text-[10px] bg-background rounded px-2 py-1 mb-1">A&nbsp;&nbsp;&nbsp;@&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ SUNUCU_IP</code>
              <code className="block font-mono text-[10px] bg-background rounded px-2 py-1">CNAME * → alanadi.com.</code>
              <p className="mt-1.5">Wildcard kaydı sayesinde her yeni işletme için DNS değişikliği gerekmez.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Copy className="h-4 w-4 text-emerald-600" />
              Caddyfile (sunucu)
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-[11px]"
                onClick={() => copy(caddySnippet, 'Caddyfile bloğu')}>
                <Copy className="h-3 w-3 mr-1" />Kopyala
              </Button>
            </CardTitle>
            <CardDescription className="text-xs">
              Sunucuda <span className="font-mono">/etc/caddy/Caddyfile</span> içine ekleyin → <span className="font-mono">systemctl reload caddy</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="rounded-lg border bg-slate-950 text-slate-100 dark:bg-slate-900 p-3 text-[10px] leading-relaxed overflow-x-auto custom-scroll max-h-44">
              {caddySnippet}
            </pre>
          </CardContent>
        </Card>
      </div>

      {/* İşletme tablosu */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">İşletme Alt Alan Adları</CardTitle>
          <CardDescription className="text-xs">
            Slug'ı değiştirip satırın Kaydet'ine basın · konum kutucukları müşteri sayfasındaki “en yakın” sıralaması içindir
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {q.isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (data?.items.length ?? 0) === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <SearchX className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Kayıtlı işletme yok — Randevu modülünden işletme ekleyin
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="pl-3 min-w-[170px] text-xs">İşletme</TableHead>
                      <TableHead className="min-w-[150px] text-xs">Alt Alan Adı (slug)</TableHead>
                      <TableHead className="min-w-[180px] text-xs">Yayın Adresi</TableHead>
                      <TableHead className="min-w-[170px] text-xs">Konum (lat, lng)</TableHead>
                      <TableHead className="text-xs">Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.items ?? []).map((p) => {
                      const slugDraft = slugDrafts[p.id] ?? p.slug ?? ''
                      const slugDirty = slugDraft !== (p.slug ?? '')
                      const geoDraft = geoDrafts[p.id] ?? {
                        lat: p.lat?.toString() ?? '',
                        lng: p.lng?.toString() ?? '',
                      }
                      const geoDirty =
                        geoDraft.lat !== (p.lat?.toString() ?? '') ||
                        geoDraft.lng !== (p.lng?.toString() ?? '')
                      const publicUrl = baseDomain && p.slug
                        ? `https://${p.slug}.${baseDomain}`
                        : null
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="pl-3">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{TYPE_EMOJI[p.type] ?? '🏢'}</span>
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate max-w-[200px]">{p.name}</div>
                                <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                                  {p.tenantName} · {p.city ?? '—'}{p.district ? ` / ${p.district}` : ''} · {p.services} hizmet
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Input
                                value={slugDraft}
                                onChange={(e) => setSlugDrafts({ ...slugDrafts, [p.id]: e.target.value })}
                                className="h-8 w-[120px] font-mono text-xs"
                              />
                              <Button
                                size="sm"
                                variant={slugDirty ? 'default' : 'ghost'}
                                className="h-8 w-8 p-0"
                                disabled={!slugDirty || patchProvider.isPending}
                                onClick={() => patchProvider.mutate({ providerId: p.id, patch: { slug: slugDraft } })}
                              >
                                {patchProvider.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {publicUrl ? (
                                <a
                                  href={`/?XTransformPort=3002&isletme=${p.slug}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-mono text-sky-600 hover:underline inline-flex items-center gap-1"
                                  title={publicUrl}
                                >
                                  {p.slug}.{baseDomain}
                                  <ExtIcon className="h-3 w-3 shrink-0" />
                                </a>
                              ) : (
                                <span className="text-xs font-mono text-muted-foreground">
                                  {p.slug ? `${p.slug}.…` : '—'}
                                </span>
                              )}
                              {p.slug && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                      title="Siteye göm — randevu widget kodu"
                                      aria-label={`${p.name} için siteye göm kodu`}
                                      onClick={() => {
                                        setEmbedTarget(p)
                                        setEmbedBase(baseDomain ? `https://randevu.${baseDomain}` : 'https://randevu.gncinc.online')
                                        setEmbedCopied(false)
                                      }}
                                    >
                                      <Code2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Siteye göm kodu</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Input
                                placeholder="lat"
                                value={geoDraft.lat}
                                onChange={(e) => setGeoDrafts({ ...geoDrafts, [p.id]: { ...geoDraft, lat: e.target.value } })}
                                className="h-8 w-[74px] font-mono text-xs"
                              />
                              <Input
                                placeholder="lng"
                                value={geoDraft.lng}
                                onChange={(e) => setGeoDrafts({ ...geoDrafts, [p.id]: { ...geoDraft, lng: e.target.value } })}
                                className="h-8 w-[74px] font-mono text-xs"
                              />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant={geoDirty ? 'default' : 'ghost'}
                                    className="h-8 w-8 p-0"
                                    disabled={patchProvider.isPending}
                                    onClick={() => patchProvider.mutate({
                                      providerId: p.id,
                                      patch: {
                                        lat: geoDraft.lat.trim() === '' ? null : Number(geoDraft.lat),
                                        lng: geoDraft.lng.trim() === '' ? null : Number(geoDraft.lng),
                                      },
                                    })}
                                  >
                                    <Save className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Koordinatları kaydet</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    disabled={geocode.isPending}
                                    onClick={() => geocode.mutate({ providerId: p.id })}
                                  >
                                    <MapPin className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Adresten konum bul (OSM)</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge
                                variant={p.isActive ? 'secondary' : 'outline'}
                                className={cn(
                                  'text-[10px] w-fit cursor-pointer select-none',
                                  p.isActive
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : 'text-slate-500',
                                )}
                                onClick={() => patchProvider.mutate({ providerId: p.id, patch: { isActive: !p.isActive } })}
                                role="button"
                                title="Tıkla: yayınla/kapat"
                              >
                                {p.isActive ? 'yayında' : 'kapalı'}
                              </Badge>
                              {p.geoCheckedAt && (
                                <span className="text-[10px] text-muted-foreground">
                                  geo: {new Date(p.geoCheckedAt).toLocaleDateString('tr-TR')}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sandbox önizleme notu */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
        <ExternalLink className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          <span className="font-medium">Önizleme:</span> Müşteri Sayfası (port 3002):{' '}
          <a href="/?XTransformPort=3002" target="_blank" rel="noreferrer" className="underline font-medium">
            /?XTransformPort=3002
          </a>
          . Bu repo yalnızca ERP/CRM (3001) içerir; Müşteri Sayfası (3002), Fruit Storm ve KaloriAI ayrı repolardır —
          sanal sunucuna GitHub&apos;dan yükleyince Admin Paneli → Servisler sekmesinden
          &quot;Yeni Servis&quot; ile bağlantılarını ekleyebilirsin. Gerçek sunucuda yukarıdaki DNS + Caddyfile
          adımlarıyla <span className="font-mono">isletme-slug.anaalanadi.com</span> adresleri otomatik çalışır.
        </p>
      </div>

      {/* Siteye Göm (embed widget) diyaloğu */}
      <Dialog open={!!embedTarget} onOpenChange={(v) => !v && setEmbedTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Code2 className="h-4 w-4 text-emerald-600" />
              Siteye Göm — {embedTarget?.name}
            </DialogTitle>
            <DialogDescription className="text-sm">
              Aşağıdaki kodu kendi web sitenize yapıştırın: randevu formunuz sitenizde görünür,
              rezervasyonlar doğrudan panelinize düşer. Kodu değiştirmeniz gerekmez — içerik otomatik günceldir.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="embed-base">
                Randevu sitesi adresiniz
              </label>
              <Input
                id="embed-base"
                value={embedBase}
                onChange={(e) => setEmbedBase(e.target.value.trim())}
                className="h-8 font-mono text-xs mt-1"
                placeholder="https://randevu.siteniz.com"
              />
            </div>

            <pre className="text-[11px] leading-relaxed bg-stone-950 text-stone-100 rounded-lg p-3 overflow-x-auto font-mono select-all whitespace-pre-wrap break-all">{embedTarget && `<iframe src="${embedBase || 'https://randevu.siteniz.com'}/widget/${embedTarget.slug}"
        style="width:100%;height:1200px;border:0;border-radius:16px"
        title="Online Randevu — ${embedTarget.name}"
        loading="lazy"></iframe>`}</pre>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8"
                disabled={!embedTarget || !embedBase}
                onClick={async () => {
                  if (!embedTarget) return
                  const code = `<iframe src="${embedBase}/widget/${embedTarget.slug}" style="width:100%;height:1200px;border:0;border-radius:16px" title="Online Randevu — ${embedTarget.name}" loading="lazy"></iframe>`
                  try {
                    await navigator.clipboard.writeText(code)
                    setEmbedCopied(true)
                    toast.success('Widget kodu kopyalandı')
                    setTimeout(() => setEmbedCopied(false), 2000)
                  } catch {
                    toast.error('Kopyalanamadı — kodu elle seçip kopyalayın')
                  }
                }}
              >
                {embedCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {embedCopied ? 'Kopyalandı' : 'Kodu Kopyala'}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Müşteri bu formdan aldığı randevular &quot;web&quot; kaynağıyla panelinize düşer.
              </span>
            </div>

            {embedTarget && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Canlı önizleme:</p>
                <iframe
                  src={`/widget/${embedTarget.slug}?XTransformPort=3002`}
                  title={`${embedTarget.name} widget önizleme`}
                  className="w-full h-[420px] rounded-lg border"
                  loading="lazy"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
