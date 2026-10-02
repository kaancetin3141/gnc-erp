'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCompactNumber, formatRelative } from '@/lib/format'
import { PLATFORMS, PLATFORM_LIST, platformProfileUrl, tokenExpiryStatus } from '@/lib/social/platforms'
import type { PlatformKey } from '@/lib/social/platforms'
import type { SocialAccountItem } from '@/lib/social/types'
import { PlatformAvatar } from './platform-badge'
import { AccountCredentialsDialog } from './account-credentials-dialog'
import {
  Plus, CheckCircle2, BadgeCheck, Users, FileText, RefreshCw,
  Unplug, Loader2, Sparkles, KeyRound, ExternalLink, AlertTriangle,
  Stethoscope, CheckCircle, XCircle, HelpCircle, Info,
} from 'lucide-react'

// Tanılama yanıtı tipleri (/api/social/accounts/[id]/diagnose)
interface DiagnoseResponse {
  platform: PlatformKey
  authMethod: string
  handle: string
  diagnosis: {
    kind: 'ok' | 'app_only_token' | 'invalid_token' | 'usage_cap' | 'insufficient_permission' | 'network_error' | 'unknown'
    headline: string
    explanation: string
    recommendations: string[]
    verifiedHandle: string | null
    verifiedName: string | null
    followerCount: number | null
    probe: { httpStatus: number | null; title: string | null; detail: string | null; type: string | null; bodySnippet: string } | null
  }
}

export function AccountsView() {
  const qc = useQueryClient()
  const [connectOpen, setConnectOpen] = useState(false)
  const [credentialsOpen, setCredentialsOpen] = useState(false)
  const [credentialsPlatform, setCredentialsPlatform] = useState<PlatformKey | null>(null)
  const [disconnectAcc, setDisconnectAcc] = useState<SocialAccountItem | null>(null)
  const [diagnoseAcc, setDiagnoseAcc] = useState<SocialAccountItem | null>(null)

  const { data: accounts, isLoading, refetch, isFetching } = useQuery<SocialAccountItem[]>({
    queryKey: ['social-accounts'],
    queryFn: () => apiGet<SocialAccountItem[]>('/api/social/accounts'),
  })

  const accountsList = accounts ?? []
  // Hangi platformlar bağlı?
  const connectedPlatforms = new Set(accountsList.map((a) => a.platform))
  // Bağlanabilir tüm platformlar (bağlı olmayanlar dahil)
  const disconnectedPlatforms = PLATFORM_LIST.filter((p) => !connectedPlatforms.has(p.key))

  // Connect
  const connectMutation = useMutation({
    mutationFn: (body: { platform: string; handle: string; displayName?: string; bio?: string }) =>
      apiPost('/api/social/accounts', body),
    onSuccess: () => {
      toast.success('Hesap bağlandı')
      setConnectOpen(false)
      qc.invalidateQueries({ queryKey: ['social-accounts'] })
    },
    onError: (e: Error) => toast.error('Bağlantı başarısız', { description: e.message }),
  })

  // Disconnect
  const disconnectMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/social/accounts/${id}`),
    onSuccess: () => {
      toast.success('Hesap bağlantısı kesildi')
      setDisconnectAcc(null)
      qc.invalidateQueries({ queryKey: ['social-accounts'] })
    },
    onError: (e: Error) => toast.error('İşlem başarısız', { description: e.message }),
  })

  // Toplam takipçi
  const totalFollowers = accountsList.reduce((s, a) => s + a.followerCount, 0)
  const totalPosts = accountsList.reduce((s, a) => s + a.postCount, 0)

  return (
    <div className="space-y-4">
      {/* Üst bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="w-3 h-3" /> {accountsList.length} bağlı hesap
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Users className="w-3 h-3" /> {formatCompactNumber(totalFollowers)} takipçi
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <FileText className="w-3 h-3" /> {formatCompactNumber(totalPosts)} gönderi
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={() => setConnectOpen(true)}>
            <Plus className="w-4 h-4" /> Yeni Hesap Bağla
          </Button>
        </div>
      </div>

      {/* Bağlı hesaplar */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Bağlı hesaplar */}
          {accountsList.map((a) => {
            const def = PLATFORMS[a.platform]
            const expiry = tokenExpiryStatus(a.tokenExpiresAt)
            const daysLeft = a.tokenExpiresAt
              ? Math.ceil((new Date(a.tokenExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
              : null
            return (
              <Card key={a.id} className="overflow-hidden group">
                {/* Gradient header */}
                <div className={cn('h-14 bg-gradient-to-r relative', def.gradient)}>
                  <div className="absolute top-2 right-2">
                    <PlatformAvatar platform={a.platform} size={32} className="border-2 border-background" />
                  </div>
                  {/* Profil linki — gradient header sol altı */}
                  <a
                    href={platformProfileUrl(a.platform, a.handle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${def.label} profilini aç`}
                    className="absolute bottom-2 left-2 inline-flex items-center gap-1 text-[10px] font-medium text-white/90 hover:text-white bg-black/25 hover:bg-black/40 rounded-md px-1.5 py-0.5 transition-colors"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    Profili Aç
                  </a>
                </div>
                <CardContent className="p-4 pt-3 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold truncate">{a.displayName || a.handle}</span>
                        {a.isVerified && <BadgeCheck className="w-4 h-4 text-blue-500" />}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        @{a.handle}
                      </div>
                    </div>
                    {/* Bağlantı tipi rozeti */}
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] px-1.5 py-0 h-4 shrink-0',
                        a.authMethod === 'mock' && 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200',
                        a.authMethod === 'manual_token' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200',
                        a.authMethod === 'oauth' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200',
                      )}
                    >
                      {a.authMethod === 'mock' ? 'Mock' : 'Gerçek'}
                    </Badge>
                  </div>
                  {a.bio && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.bio}</p>
                  )}
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                    <Stat label="Takipçi" value={formatCompactNumber(a.followerCount)} />
                    <Stat label="Takip" value={formatCompactNumber(a.followingCount)} />
                    <Stat label="Gönderi" value={formatCompactNumber(a.postCount)} />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Bağlandı {formatRelative(a.connectedAt)}
                    {a.lastSyncedAt && ` · Son sync ${formatRelative(a.lastSyncedAt)}`}
                  </div>
                  {/* Token bitiş uyarısı — gerçek hesaplarda */}
                  {a.authMethod !== 'mock' && (expiry === 'expired' || expiry === 'soon') && (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 text-[10px] font-medium rounded-md px-2 py-1 border',
                        expiry === 'expired'
                          ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900'
                          : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
                      )}
                    >
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      {expiry === 'expired'
                        ? 'Token süresi doldu — yeniden bağlayın'
                        : `Token ${daysLeft} gün içinde bitiyor`}
                    </div>
                  )}
                  <div className="flex gap-2">
                    {a.authMethod !== 'mock' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 text-sky-700 border-sky-200 hover:bg-sky-50 hover:text-sky-800 dark:text-sky-300 dark:border-sky-900 dark:hover:bg-sky-950/40"
                        onClick={() => setDiagnoseAcc(a)}
                        title="Gerçek API testi — token sağlığını teşhis et"
                      >
                        <Stethoscope className="w-3.5 h-3.5" /> Test Et
                      </Button>
                    )}
                    {a.authMethod === 'mock' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 dark:hover:bg-emerald-950/30"
                        onClick={() => { setCredentialsPlatform(a.platform); setCredentialsOpen(true) }}
                      >
                        <KeyRound className="w-3.5 h-3.5" /> Gerçek Bağla
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className={a.authMethod === 'mock' ? 'text-red-600 hover:bg-red-50 hover:text-red-700' : 'flex-1 text-red-600 hover:bg-red-50 hover:text-red-700'}
                      onClick={() => setDisconnectAcc(a)}
                    >
                      <Unplug className="w-3.5 h-3.5" /> {a.authMethod === 'mock' ? '' : 'Bağlantıyı Kes'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* Bağlanabilir platformlar (placeholder kartlar) */}
          {disconnectedPlatforms.map((p) => (
            <Card
              key={p.key}
              className="border-dashed hover:bg-accent/50 cursor-pointer group"
              onClick={() => { setCredentialsPlatform(p.key); setCredentialsOpen(true) }}
            >
              <CardContent className="p-4 h-full flex flex-col items-center justify-center text-center min-h-[200px]">
                <PlatformAvatar platform={p.key} size={48} className="mb-3" />
                <div className="font-semibold">{p.label}</div>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                  {p.description}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50"
                  onClick={(e) => { e.stopPropagation(); setCredentialsPlatform(p.key); setCredentialsOpen(true) }}
                >
                  <KeyRound className="w-3.5 h-3.5" /> Gerçek Hesap Bağla
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 text-xs"
                  onClick={(e) => { e.stopPropagation(); setConnectOpen(true) }}
                >
                  <Plus className="w-3 h-3" /> Mock Bağla (test)
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Connect Dialog (mock) */}
      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnect={(body) => connectMutation.mutate(body)}
        isPending={connectMutation.isPending}
        defaultPlatform={disconnectedPlatforms[0]?.key}
      />

      {/* Real Account Credentials Dialog */}
      {credentialsPlatform && (
        <AccountCredentialsDialog
          open={credentialsOpen}
          onOpenChange={setCredentialsOpen}
          platform={credentialsPlatform}
        />
      )}

      {/* Bağlantı Tanılama Dialog */}
      {diagnoseAcc && (
        <DiagnoseDialog
          open={!!diagnoseAcc}
          onOpenChange={(o) => !o && setDiagnoseAcc(null)}
          account={diagnoseAcc}
        />
      )}

      {/* Disconnect Alert */}
      <AlertDialog open={!!disconnectAcc} onOpenChange={(o) => !o && setDisconnectAcc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bağlantıyı kes?</AlertDialogTitle>
            <AlertDialogDescription>
              <span>{disconnectAcc && PLATFORMS[disconnectAcc.platform]?.label} hesabı </span>
              <b>@{disconnectAcc?.handle}</b> bağlantısı kesilecek.
              Hesap pasife alınacak (yeni gönderi yayınlanamayacak). Mevcut yayınlanmış gönderiler korunur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => disconnectAcc && disconnectMutation.mutate(disconnectAcc.id)}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? 'Kesiliyor...' : 'Bağlantıyı Kes'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}

// Tanılama türüne göre görünüm
const KIND_STYLE: Record<string, { color: string; bg: string; icon: typeof CheckCircle }> = {
  ok: { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900', icon: CheckCircle },
  app_only_token: { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900', icon: XCircle },
  invalid_token: { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900', icon: XCircle },
  usage_cap: { color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900', icon: AlertTriangle },
  insufficient_permission: { color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900', icon: AlertTriangle },
  network_error: { color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800', icon: HelpCircle },
  unknown: { color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800', icon: HelpCircle },
}

function DiagnoseDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  account: SocialAccountItem
}) {
  // Her açılışta yeni test — cache kullanma
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<DiagnoseResponse>({
    queryKey: ['social-diagnose', account.id, open],
    queryFn: () => apiGet<DiagnoseResponse>(`/api/social/accounts/${account.id}/diagnose`),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  const d = data?.diagnosis
  const kind = d?.kind ?? 'unknown'
  const style = KIND_STYLE[kind] ?? KIND_STYLE.unknown
  const KindIcon = style.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-sky-600" />
            Bağlantı Testi — {PLATFORMS[account.platform]?.label} @{account.handle}
          </DialogTitle>
          <DialogDescription>
            Kayıtlı token platformun gerçek API'sine gönderildi. Sonuç aşağıda.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
            <p className="text-sm text-muted-foreground">Platform API'si test ediliyor...</p>
          </div>
        ) : isError || !d ? (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Test çalıştırılamadı: {error instanceof Error ? error.message : 'bilinmeyen hata'}</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Sonuç kartı */}
            <div className={cn('rounded-lg border p-4 space-y-2', style.bg)}>
              <div className={cn('flex items-center gap-2 font-semibold text-sm', style.color)}>
                <KindIcon className="w-5 h-5 shrink-0" />
                {d.headline}
              </div>
              <p className={cn('text-xs leading-relaxed', style.color)}>
                {d.explanation}
              </p>
              {d.verifiedHandle && (
                <div className={cn('text-xs font-medium', style.color)}>
                  Doğrulanan hesap: @{d.verifiedHandle}
                  {d.followerCount != null && ` · ${formatCompactNumber(d.followerCount)} takipçi`}
                </div>
              )}
            </div>

            {/* Öneriler */}
            {d.recommendations.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                  Ne yapmalısınız?
                </div>
                <ul className="space-y-1.5">
                  {d.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Ham teknik detay */}
            {d.probe && (
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                  Teknik detay (ham API yanıtı)
                </summary>
                <pre className="mt-2 rounded-md bg-muted/60 border p-3 text-[10px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
{`HTTP ${d.probe.httpStatus ?? '-'}\ntitle:  ${d.probe.title ?? '-'}\ndetail: ${d.probe.detail ?? '-'}\ntype:   ${d.probe.type ?? '-'}\n\n${d.probe.bodySnippet}`}
                </pre>
              </details>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} /> Tekrar Test Et
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ConnectDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  onConnect: (body: { platform: string; handle: string; displayName?: string; bio?: string }) => void
  isPending: boolean
  defaultPlatform?: PlatformKey
}

function ConnectDialog({ open, onOpenChange, onConnect, isPending, defaultPlatform }: ConnectDialogProps) {
  const [platform, setPlatform] = useState<string>(defaultPlatform ?? 'twitter')
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')

  // open değişince reset
  useEffect(() => {
    if (open) {
      setPlatform(defaultPlatform ?? 'twitter')
      setHandle('')
      setDisplayName('')
      setBio('')
    }
  }, [open, defaultPlatform])

  const def = PLATFORMS[platform as PlatformKey]
  const canSubmit = handle.trim().length > 0 && !isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Yeni Hesap Bağla
          </DialogTitle>
          <DialogDescription>
            Mock bağlantı — gerçek OAuth yerine örnek veri ile hesap oluşturur.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Platform seçimi */}
          <div>
            <Label className="mb-1.5 block">Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Platform seçin" />
              </SelectTrigger>
              <SelectContent>
                {PLATFORM_LIST.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.emoji} {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {def && (
              <p className="text-[11px] text-muted-foreground mt-1">{def.description}</p>
            )}
          </div>

          {/* Handle */}
          <div>
            <Label htmlFor="conn-handle" className="mb-1.5 block">
              Kullanıcı Adı (Handle)
            </Label>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">@</span>
              <Input
                id="conn-handle"
                placeholder={platform === 'facebook' ? 'sayfaadi' : 'kullanici_adi'}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
              />
            </div>
          </div>

          {/* Display name */}
          <div>
            <Label htmlFor="conn-name" className="mb-1.5 block">Görünüm Adı (opsiyonel)</Label>
            <Input
              id="conn-name"
              placeholder="Şirket Adı / Sayfa Adı"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {/* Bio */}
          <div>
            <Label htmlFor="conn-bio" className="mb-1.5 block">Bio (opsiyonel)</Label>
            <Textarea
              id="conn-bio"
              placeholder="Kısa açıklama..."
              className="min-h-[60px]"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>

          {/* Önizleme */}
          {def && (
            <div className="rounded-lg border p-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <PlatformAvatar platform={platform as PlatformKey} size={28} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {displayName || handle || '...'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    @{handle || 'kullanici_adi'} · {def.label}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            İptal
          </Button>
          <Button
            onClick={() => onConnect({
              platform,
              handle,
              displayName: displayName || undefined,
              bio: bio || undefined,
            })}
            disabled={!canSubmit}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Bağla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
