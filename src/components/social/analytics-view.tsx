'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, AreaChart, Area, Legend,
} from 'recharts'
import { cn } from '@/lib/utils'
import { formatCompactNumber, formatRelative } from '@/lib/format'
import { PLATFORMS } from '@/lib/social/platforms'
import type { SocialAnalyticsSummary } from '@/lib/social/types'
import { PlatformBadge } from './platform-badge'
import {
  Users, FileText, Heart, Eye, BarChart3, TrendingUp, RefreshCw,
  MessageCircle, Repeat2, Sparkles,
} from 'lucide-react'

export function AnalyticsView() {
  const { data, isLoading, refetch, isFetching } = useQuery<SocialAnalyticsSummary>({
    queryKey: ['social-analytics'],
    queryFn: () => apiGet<SocialAnalyticsSummary>('/api/social/analytics'),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (!data) return null

  const kpis = [
    {
      label: 'Toplam Takipçi',
      value: formatCompactNumber(data.totalFollowers),
      raw: data.totalFollowers,
      icon: Users,
      color: 'from-sky-500 to-blue-600',
      sub: `${data.perPlatform.length} platform`,
    },
    {
      label: 'Toplam Gönderi',
      value: formatCompactNumber(data.totalPosts),
      raw: data.totalPosts,
      icon: FileText,
      color: 'from-emerald-500 to-teal-600',
      sub: 'son 20 yayın',
    },
    {
      label: 'Toplam Etkileşim',
      value: formatCompactNumber(data.totalEngagement),
      raw: data.totalEngagement,
      icon: Heart,
      color: 'from-rose-500 to-pink-600',
      sub: 'beğeni + yorum + paylaşım',
    },
    {
      label: 'Toplam Erişim',
      value: formatCompactNumber(data.totalReach),
      raw: data.totalReach,
      icon: TrendingUp,
      color: 'from-amber-500 to-orange-600',
      sub: 'tekil kullanıcı',
    },
    {
      label: 'Toplam Gösterim',
      value: formatCompactNumber(data.totalImpressions),
      raw: data.totalImpressions,
      icon: Eye,
      color: 'from-violet-500 to-purple-600',
      sub: 'görüntülenme',
    },
  ]

  // Per-platform breakdown data for bar chart
  const perPlatformData = data.perPlatform.map((p) => ({
    name: PLATFORMS[p.platform]?.shortLabel ?? p.platform,
    fullLabel: PLATFORMS[p.platform]?.label ?? p.platform,
    Takipçi: p.followers,
    Gönderi: p.posts,
    Beğeni: p.likes,
    Yorum: p.comments,
    Paylaşım: p.shares,
    // toplam etkileşim = beğeni + yorum + paylaşım (API ayrı alan döndürmüyor)
    Etkileşim: p.likes + p.comments + p.shares,
    Erişim: p.reach,
    engagementRate: p.engagementRate,
    platform: p.platform,
  }))

  // Renkler per platform
  const platformBarColors = (key: string) => PLATFORMS[key as keyof typeof PLATFORMS]?.accent ?? '#8884d8'

  return (
    <div className="space-y-4">
      {/* Üst bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-base font-semibold">Performans Özeti</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.label} className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className={cn('w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm mb-2', kpi.color)}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="text-xl font-bold tracking-tight">{kpi.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{kpi.label}</div>
                <div className="text-[10px] text-muted-foreground/80 mt-1">{kpi.sub}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Per-platform bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform Bazında Dağılım</CardTitle>
          <CardDescription>Her platform için takipçi ve etkileşim metrikleri</CardDescription>
        </CardHeader>
        <CardContent>
          {perPlatformData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              Henüz veri yok
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perPlatformData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#d1d5db' }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactNumber(Number(v))} />
                    <RTooltip
                      contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                      formatter={(value: number, name: string) => [formatCompactNumber(value), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Takipçi" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Etkileşim" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Erişim" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Detay tablo */}
              <div className="overflow-x-auto -mx-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform</TableHead>
                      <TableHead className="text-right">Takipçi</TableHead>
                      <TableHead className="text-right">Gönderi</TableHead>
                      <TableHead className="text-right">Beğeni</TableHead>
                      <TableHead className="text-right">Yorum</TableHead>
                      <TableHead className="text-right">Paylaşım</TableHead>
                      <TableHead className="text-right">Erişim</TableHead>
                      <TableHead className="text-right">Etk. Oranı</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.perPlatform.map((p) => (
                      <TableRow key={p.platform}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <PlatformBadge platform={p.platform} size="sm" />
                            <span className="text-xs text-muted-foreground hidden sm:inline">
                              {PLATFORMS[p.platform]?.label}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatCompactNumber(p.followers)}</TableCell>
                        <TableCell className="text-right text-sm">{p.posts}</TableCell>
                        <TableCell className="text-right text-sm">{formatCompactNumber(p.likes)}</TableCell>
                        <TableCell className="text-right text-sm">{formatCompactNumber(p.comments)}</TableCell>
                        <TableCell className="text-right text-sm">{formatCompactNumber(p.shares)}</TableCell>
                        <TableCell className="text-right text-sm">{formatCompactNumber(p.reach)}</TableCell>
                        <TableCell className="text-right">
                          <span className={cn(
                            'text-xs font-semibold',
                            p.engagementRate > 5 ? 'text-emerald-600' :
                              p.engagementRate > 2 ? 'text-amber-600' : 'text-muted-foreground',
                          )}>
                            {p.engagementRate.toFixed(2)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly trend + Recent posts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Haftalık Trend</CardTitle>
            <CardDescription>Son 7 günün gönderi ve etkileşim sayısı</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.weeklyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="postsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => {
                      const d = new Date(v)
                      return `${d.getDate()}/${d.getMonth() + 1}`
                    }}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompactNumber(Number(v))} />
                  <RTooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                    labelFormatter={(label: string) => {
                      const d = new Date(label)
                      return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
                    }}
                    formatter={(value: number, name: string) => [formatCompactNumber(value), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="posts"
                    name="Gönderi"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#postsGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="engagement"
                    name="Etkileşim"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    fill="url(#engGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top platforms by engagement rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Etkileşim Oranı Sıralaması</CardTitle>
            <CardDescription>En yüksek etkileşim oranına sahip platformlar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...data.perPlatform]
              .sort((a, b) => b.engagementRate - a.engagementRate)
              .slice(0, 5)
              .map((p, i) => {
                const maxRate = Math.max(...data.perPlatform.map((x) => x.engagementRate), 1)
                const pct = (p.engagementRate / maxRate) * 100
                return (
                  <div key={p.platform} className="flex items-center gap-2">
                    <div className="w-5 text-xs text-muted-foreground">#{i + 1}</div>
                    <PlatformBadge platform={p.platform} size="sm" />
                    <div className="flex-1">
                      <Progress value={pct} className="h-2" />
                    </div>
                    <span className="text-xs font-semibold w-12 text-right">
                      {p.engagementRate.toFixed(2)}%
                    </span>
                  </div>
                )
              })}
            {data.perPlatform.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Veri yok</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent posts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Son Yayınlanan Gönderiler
          </CardTitle>
          <CardDescription>En son yayınlanan 10 gönderinin performansı</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Henüz yayınlanmış gönderi yok</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {data.recentPosts.map((post) => {
                const total = (post.targets ?? []).reduce(
                  (acc, t) => ({
                    likes: acc.likes + t.likes,
                    comments: acc.comments + t.comments,
                    shares: acc.shares + t.shares,
                    views: acc.views + t.views,
                    reach: acc.reach + t.reach,
                  }),
                  { likes: 0, comments: 0, shares: 0, views: 0, reach: 0 },
                )
                return (
                  <div key={post.id} className="flex items-start gap-3 rounded-lg border p-3">
                    <div className="flex flex-col gap-1 shrink-0">
                      {(post.platforms || []).slice(0, 3).map((pl) => (
                        <PlatformBadge key={pl} platform={pl} size="sm" showLabel={false} />
                      ))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2">{post.content}</p>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {post.publishedAt ? formatRelative(post.publishedAt) : '—'}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-wrap items-center gap-2 justify-end">
                      <Metric icon={Heart} value={total.likes} color="text-rose-500" />
                      <Metric icon={MessageCircle} value={total.comments} color="text-blue-500" />
                      <Metric icon={Repeat2} value={total.shares} color="text-emerald-500" />
                      <Metric icon={Eye} value={total.views} color="text-amber-500" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ icon: Icon, value, color }: { icon: typeof Heart; value: number; color: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1">
          <Icon className={cn('w-3 h-3', color)} />
          <span className="text-xs font-medium">{formatCompactNumber(value)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">{formatCompactNumber(value)}</TooltipContent>
    </Tooltip>
  )
}
