'use client'

// ============================================================
// Sosyal Medya Özet Widget'ı — Dashboard
// Hesaplar, bu ay yayın/zamanlama/başarısız sayıları,
// 30 günlük erişim ve son gönderiler tek bakışta.
// ============================================================

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { PLATFORMS, type PlatformKey } from '@/lib/social/platforms'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Eye,
  Send,
  Users,
} from 'lucide-react'
import { useMemo } from 'react'

interface SocialWidgetTarget {
  id: string
  platform: string
  status: string
  reach: number | null
  likes: number | null
}

interface SocialWidgetPost {
  id: string
  content: string
  status: string
  platforms: string[]
  publishedAt: string | null
  scheduledAt: string | null
  createdAt: string
  targets?: SocialWidgetTarget[]
}

interface SocialWidgetAccount {
  id: string
  platform: string
  handle: string
  displayName: string | null
  isActive: boolean
  authMethod: string
  hasAccessToken: boolean
}

const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  yayinlandi: { label: 'Yayınlandı', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  zamanlandi: { label: 'Zamanlandı', dot: 'bg-amber-500', text: 'text-amber-600' },
  taslak: { label: 'Taslak', dot: 'bg-slate-400', text: 'text-slate-500' },
  basarisiz: { label: 'Başarısız', dot: 'bg-red-500', text: 'text-red-600' },
  iptal: { label: 'İptal', dot: 'bg-slate-300', text: 'text-slate-400' },
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'şimdi'
  if (min < 60) return `${min} dk önce`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} sa önce`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day} gün önce`
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

export function SocialMediaWidget() {
  const setView = useAppStore((s) => s.setView)

  const postsQ = useQuery({
    queryKey: ['social-widget-posts'],
    queryFn: () => apiGet<SocialWidgetPost[]>('/api/social/posts?limit=100'),
    refetchInterval: 2 * 60_000,
    staleTime: 30_000,
  })
  const accQ = useQuery({
    queryKey: ['social-widget-accounts'],
    queryFn: () => apiGet<SocialWidgetAccount[]>('/api/social/accounts'),
    staleTime: 60_000,
  })

  const stats = useMemo(() => {
    const posts = postsQ.data ?? []
    const accounts = accQ.data ?? []
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthAgo = new Date(now.getTime() - 30 * 86400_000)

    let publishedThisMonth = 0
    let scheduled = 0
    let failed = 0
    let drafts = 0
    let reach30d = 0

    for (const p of posts) {
      if (p.status === 'yayinlandi' && p.publishedAt && new Date(p.publishedAt) >= monthStart) {
        publishedThisMonth++
      }
      if (p.status === 'zamanlandi') scheduled++
      if (p.status === 'basarisiz') failed++
      if (p.status === 'taslak') drafts++
      if (p.publishedAt && new Date(p.publishedAt) >= monthAgo) {
        for (const t of p.targets ?? []) reach30d += t.reach ?? 0
      }
    }

    const realAccounts = accounts.filter((a) => a.authMethod !== 'mock' && a.hasAccessToken).length

    return { publishedThisMonth, scheduled, failed, drafts, reach30d, realAccounts, totalAccounts: accounts.length, posts }
  }, [postsQ.data, accQ.data])

  const recent = useMemo(
    () => (stats.posts ?? []).slice(0, 3),
    [stats.posts],
  )

  if (!postsQ.data || !accQ.data) {
    return <Skeleton className="h-full min-h-64 rounded-xl" />
  }

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span
            aria-hidden
            className="w-6 h-6 rounded-md bg-gradient-to-br from-slate-700 to-black text-white flex items-center justify-center"
          >
            <Share2Glyph />
          </span>
          Sosyal Medya
          <BadgeTiny>{stats.totalAccounts} hesap</BadgeTiny>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* İstatistik satırı */}
        <div className="grid grid-cols-4 gap-2">
          <StatCell
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            value={stats.publishedThisMonth}
            label="Bu ay yayın"
            tone="emerald"
          />
          <StatCell
            icon={<CalendarClock className="w-3.5 h-3.5" />}
            value={stats.scheduled}
            label="Zamanlandı"
            tone="amber"
          />
          <StatCell
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            value={stats.failed}
            label="Başarısız"
            tone={stats.failed > 0 ? 'red' : 'muted'}
          />
          <StatCell
            icon={<Eye className="w-3.5 h-3.5" />}
            value={formatCompact(stats.reach30d)}
            label="30g erişim"
            tone="teal"
          />
        </div>

        {/* Gerçek hesap uyarısı */}
        {stats.totalAccounts > 0 && stats.realAccounts === 0 && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
            <Users className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-200">
              Bağlı hesaplar simülasyon modunda — gerçek API anahtarı ekleyerek canlı yayın yapabilirsiniz.
            </p>
          </div>
        )}

        {/* Son gönderiler */}
        <div className="space-y-1.5">
          {recent.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-lg">
              Henüz gönderi yok — ilk gönderinizi oluşturun.
            </p>
          )}
          {recent.map((p) => {
            const meta = STATUS_META[p.status] ?? STATUS_META.taslak
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-muted/40 transition-colors cursor-pointer group"
                onClick={() => setView('social')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setView('social') }}
                aria-label={`Gönderi: ${p.content.slice(0, 40)}`}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', meta.dot)} aria-hidden />
                <span className="text-[11px] leading-snug line-clamp-1 flex-1 min-w-0">
                  {p.content}
                </span>
                <span className="flex -space-x-1 shrink-0" aria-hidden>
                  {(p.platforms ?? []).slice(0, 3).map((pl) => (
                    <span
                      key={pl}
                      title={PLATFORMS[pl as PlatformKey]?.label ?? pl}
                      className="w-[18px] h-[18px] rounded-full bg-gradient-to-br text-white flex items-center justify-center text-[9px] font-bold ring-1 ring-background"
                      style={{ background: PLATFORMS[pl as PlatformKey]?.accent ?? '#64748b' }}
                    >
                      {PLATFORMS[pl as PlatformKey]?.emoji ?? '•'}
                    </span>
                  ))}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-14 text-right">
                  {relTime(p.publishedAt ?? p.scheduledAt ?? p.createdAt)}
                </span>
              </div>
            )
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full group"
          onClick={() => setView('social')}
        >
          <Send className="w-3.5 h-3.5 mr-1" />
          Sosyal Medya Yönetimi'ni Aç
          <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------- küçük yardımcılar ----------

function Share2Glyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
    </svg>
  )
}

function BadgeTiny({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
      {children}
    </span>
  )
}

const TONES: Record<string, string> = {
  emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
  amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
  red: 'text-red-600 bg-red-50 dark:bg-red-950/40',
  teal: 'text-teal-600 bg-teal-50 dark:bg-teal-950/40',
  muted: 'text-muted-foreground bg-muted/60',
}

function StatCell({ icon, value, label, tone }: {
  icon: React.ReactNode
  value: number | string
  label: string
  tone: keyof typeof TONES
}) {
  return (
    <div className="rounded-lg border p-2 text-center space-y-0.5">
      <span className={cn('inline-flex w-6 h-6 rounded-md items-center justify-center', TONES[tone])} aria-hidden>
        {icon}
      </span>
      <div className="text-sm font-bold tabular-nums leading-none">{value}</div>
      <div className="text-[9px] text-muted-foreground leading-tight">{label}</div>
    </div>
  )
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}B`
  return String(n)
}
