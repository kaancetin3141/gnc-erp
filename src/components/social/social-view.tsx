'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { SocialAccountItem } from '@/lib/social/types'
import { FeedView } from './feed-view'
import { CalendarView } from './calendar-view'
import { InboxView } from './inbox-view'
import { AccountsView } from './accounts-view'
import { AnalyticsView } from './analytics-view'
import { ComposeDialog } from './compose-dialog'
import {
  Share2, Plus, Inbox, Calendar, Users, BarChart3, FileText, CheckCircle2,
} from 'lucide-react'

const TABS = [
  { value: 'feed', label: 'Akış', icon: FileText },
  { value: 'compose', label: 'Oluştur', icon: Plus },
  { value: 'calendar', label: 'Takvim', icon: Calendar },
  { value: 'inbox', label: 'Gelen Kutusu', icon: Inbox },
  { value: 'accounts', label: 'Hesaplar', icon: Users },
  { value: 'analytics', label: 'Analitik', icon: BarChart3 },
] as const

type TabValue = typeof TABS[number]['value']

export function SocialView() {
  const [tab, setTab] = useState<TabValue>('feed')
  const [composeOpen, setComposeOpen] = useState(false)

  // Toplam bağlı hesap sayısı + inbox unread count
  const { data: accounts } = useQuery<SocialAccountItem[]>({
    queryKey: ['social-accounts'],
    queryFn: () => apiGet<SocialAccountItem[]>('/api/social/accounts'),
  })
  const accountCount = accounts?.length ?? 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="overflow-hidden">
        <CardContent className="p-4 sm:p-6 bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 via-purple-500 to-amber-500 flex items-center justify-center shadow-lg">
                <Share2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                  Sosyal Medya Yönetimi
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  11 platformu tek panelden yönetin · yayınlayın, zamanlayın, analiz edin
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="secondary" className="gap-1 h-7 px-3">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                {accountCount} hesap bağlı
              </Badge>
              <Button onClick={() => setComposeOpen(true)} size="default">
                <Plus className="w-4 h-4" />
                Yeni Gönderi
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="w-full">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList className="w-fit">
            {TABS.map((t) => {
              const Icon = t.icon
              return (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">{t.label}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        <TabsContent value="feed" className="mt-4">
          <FeedView />
        </TabsContent>
        <TabsContent value="compose" className="mt-4">
          <ComposeInline onOpenDialog={() => setComposeOpen(true)} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <CalendarView />
        </TabsContent>
        <TabsContent value="inbox" className="mt-4">
          <InboxView />
        </TabsContent>
        <TabsContent value="accounts" className="mt-4">
          <AccountsView />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <AnalyticsView />
        </TabsContent>
      </Tabs>

      {/* Compose dialog (header button) */}
      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  )
}

// "Oluştur" tab'ı — inline kompozisyon istemiyoruz (dialog kullanıyoruz)
// bunun yerine burada rehber/açıkla ve CTA göster
function ComposeInline({ onOpenDialog }: { onOpenDialog: () => void }) {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-rose-500 via-purple-500 to-amber-500 flex items-center justify-center shadow-lg mb-4">
          <Plus className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Yeni Gönderi Oluştur</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
          Birden fazla sosyal medya platformuna aynı anda içerik gönderin.
          Karakter limiti, platform uyumluluğu ve hashtag desteği ile.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
          {[
            { t: 'Multi-Platform', c: 'from-sky-500 to-blue-600' },
            { t: 'Zamanlama', c: 'from-amber-500 to-orange-600' },
            { t: 'Hashtag & Mention', c: 'from-rose-500 to-pink-600' },
            { t: 'Platform Bazlı Özelleştirme', c: 'from-violet-500 to-purple-600' },
            { t: 'Uyumluluk Kontrolü', c: 'from-emerald-500 to-teal-600' },
          ].map((b) => (
            <span key={b.t} className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white bg-gradient-to-r', b.c)}>
              {b.t}
            </span>
          ))}
        </div>
        <Button onClick={onOpenDialog} size="lg">
          <Plus className="w-4 h-4" /> Oluşturucuyu Aç
        </Button>
        <p className="text-[11px] text-muted-foreground mt-3">
          veya sağ üstteki <b>"Yeni Gönderi"</b> butonunu kullanın
        </p>
      </CardContent>
    </Card>
  )
}

// Spinner/empty fallback
function SocialLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-9 w-full max-w-md rounded-lg" />
      <div className="grid grid-cols-1 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
export { SocialLoading }
