'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from '@/components/ui/tooltip'

import {
  Bot, Sparkles, Phone, MessageCircle, Mail, Clock,
  CheckCircle2, TrendingUp, Crown, Building2, User, AlertCircle,
} from 'lucide-react'

// ------------------------------------------------------------
// Tipler — API yanıt şeması
// ------------------------------------------------------------
interface ScoredCustomer {
  id: string
  name: string
  segment: string
  ownerId: string
  ownerName: string
  lastActivityAt: string | null
  daysSinceLastActivity: number | null
  openDealValue: number
  activityCount90d: number
  score: number
  scoreBreakdown: {
    recency: number
    segment: number
    dealValue: number
    activity: number
  }
  suggestedAction: 'Ara' | 'WhatsApp' | 'E-posta' | 'Takip'
}

interface PrioritizeResponse {
  items: ScoredCustomer[]
  total: number
  generatedAt: string
}

interface AutoAssignResponse {
  assigned: number
  skipped: number
  scanned: number
  tasks: Array<{ id: string; customerId: string; customerName: string; score: number; suggestedAction: string }>
  limit: number
}

const SEGMENT_META: Record<string, { label: string; color: string; icon: typeof Crown }> = {
  vip: { label: 'VIP', color: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50', icon: Crown },
  kurumsal: { label: 'Kurumsal', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50', icon: Building2 },
  standart: { label: 'Standart', color: 'text-slate-700 bg-slate-100 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700', icon: User },
  potansiyel: { label: 'Potansiyel', color: 'text-violet-700 bg-violet-50 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/50', icon: TrendingUp },
}

const ACTION_META: Record<string, { label: string; color: string; icon: typeof Phone }> = {
  'Ara': { label: 'Ara', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50', icon: Phone },
  'WhatsApp': { label: 'WhatsApp', color: 'text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900/50', icon: MessageCircle },
  'E-posta': { label: 'E-posta', color: 'text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/50', icon: Mail },
  'Takip': { label: 'Takip', color: 'text-slate-700 bg-slate-100 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700', icon: Clock },
}

function scoreColor(score: number): string {
  if (score > 70) return 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60'
  if (score >= 50) return 'text-amber-700 bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-900/60'
  return 'text-slate-700 bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 border-slate-200 dark:border-slate-700'
}

function scoreBar(score: number): string {
  if (score > 70) return 'bg-emerald-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-slate-400'
}

// ============================================================
// Ana bileşen
// ============================================================
export function AiPanel() {
  const qc = useQueryClient()
  const user = useAppStore((s) => s.user)
  const openCustomer = useAppStore((s) => s.openCustomer)
  const [creatingIds, setCreatingIds] = useState<Set<string>>(new Set())
  const [bulkRunning, setBulkRunning] = useState(false)

  const canManage = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'superadmin'

  const { data, isLoading, isFetching, refetch } = useQuery<PrioritizeResponse>({
    queryKey: ['ai-prioritize'],
    queryFn: () => apiGet<PrioritizeResponse>('/api/ai/prioritize?limit=10'),
    enabled: false, // manuel tetikleme
  })

  const items = data?.items ?? []

  const handleAnalyze = () => {
    refetch()
    toast.success('AI analizi başlatıldı', {
      description: 'Müşteriler potansiyel puanına göre sıralanıyor.',
    })
  }

  const handleCreateSingle = async (customer: ScoredCustomer) => {
    setCreatingIds((prev) => new Set(prev).add(customer.id))
    try {
      const result = await apiPost<AutoAssignResponse>('/api/ai/auto-assign', {
        customerId: customer.id,
      })
      if (result.assigned > 0) {
        toast.success('Görev oluşturuldu', {
          description: `${customer.name} için ${customer.suggestedAction} görevi atandı (Puan: ${customer.score})`,
        })
      } else {
        toast.info('Görev atlanmadı', {
          description: `${customer.name} için zaten açık bir AI görevi mevcut.`,
        })
      }
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['automation-status'] })
    } catch (e) {
      toast.error('Görev oluşturulamadı', {
        description: e instanceof Error ? e.message : '',
      })
    } finally {
      setCreatingIds((prev) => {
        const next = new Set(prev)
        next.delete(customer.id)
        return next
      })
    }
  }

  const handleBulkAssign = async () => {
    setBulkRunning(true)
    try {
      const result = await apiPost<AutoAssignResponse>('/api/ai/auto-assign', {
        limit: 10,
      })
      toast.success('Toplu AI görevi oluşturuldu', {
        description: `${result.assigned} yeni görev · ${result.skipped} zaten mevcut · ${result.scanned} müşteri tarandı`,
      })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['automation-status'] })
    } catch (e) {
      toast.error('Toplu görev oluşturulamadı', {
        description: e instanceof Error ? e.message : '',
      })
    } finally {
      setBulkRunning(false)
    }
  }

  return (
    <Card className="border-violet-200 dark:border-violet-900/50 bg-gradient-to-br from-violet-50/50 to-transparent dark:from-violet-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              AI Destekli Potansiyel Analizi
              <Badge variant="outline" className="text-[10px] bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/50">
                <Sparkles className="w-3 h-3 mr-1" /> AI
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Yapay zeka, potansiyel skoru yüksek müşterileri otomatik görev listesine önerir.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Skor açıklaması */}
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="flex items-center gap-1.5 p-2 rounded-md bg-background/60 border border-violet-200/60 dark:border-violet-900/30">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">&gt;70: Ara</span>
          </div>
          <div className="flex items-center gap-1.5 p-2 rounded-md bg-background/60 border border-violet-200/60 dark:border-violet-900/30">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">50-70: WhatsApp</span>
          </div>
          <div className="flex items-center gap-1.5 p-2 rounded-md bg-background/60 border border-violet-200/60 dark:border-violet-900/30">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-muted-foreground">{'<50: E-posta/Takip'}</span>
          </div>
          <div className="flex items-center gap-1.5 p-2 rounded-md bg-background/60 border border-violet-200/60 dark:border-violet-900/30">
            <TrendingUp className="w-3 h-3 text-violet-500" />
            <span className="text-muted-foreground">{data?.total ?? '—'} müşteri</span>
          </div>
        </div>

        {/* Analiz butonu */}
        <Button
          type="button"
          size="sm"
          className="w-full bg-violet-600 hover:bg-violet-700"
          onClick={handleAnalyze}
          disabled={isFetching}
        >
          {isFetching ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
              Analiz ediliyor...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              AI Analizi Çalıştır
            </>
          )}
        </Button>

        {/* Sonuçlar */}
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="text-center py-6 px-3 rounded-lg border border-dashed border-violet-200/60 dark:border-violet-900/40">
            <AlertCircle className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {data ? 'Bu filtrede potansiyel müşteri bulunamadı.' : 'Analizi çalıştırmak için yukarıdaki butona tıklayın.'}
            </p>
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className="space-y-2 max-h-[28rem] overflow-y-auto custom-scroll pr-1">
            {items.map((c, idx) => {
              const seg = SEGMENT_META[c.segment] ?? SEGMENT_META.standart
              const act = ACTION_META[c.suggestedAction] ?? ACTION_META['Takip']
              const creating = creatingIds.has(c.id)
              return (
                <div
                  key={c.id}
                  className="p-3 rounded-lg border border-violet-200/70 dark:border-violet-900/40 bg-background/70 hover:border-violet-300 dark:hover:border-violet-800 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="text-[10px] font-bold text-violet-500 tabular-nums mt-0.5">#{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => openCustomer(c.id)}
                        className="text-left min-w-0 flex-1 group"
                      >
                        <div className="text-sm font-medium truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                          {c.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-4 gap-0.5', seg.color)}>
                            <seg.icon className="w-2.5 h-2.5" />
                            {seg.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {c.ownerName}
                          </span>
                        </div>
                      </button>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-bold tabular-nums cursor-help', scoreColor(c.score))}>
                            {c.score}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          <div className="space-y-1">
                            <div className="font-medium">Skor Dağılımı</div>
                            <div className="flex justify-between gap-3">
                              <span className="text-muted-foreground">Recency:</span>
                              <span className="tabular-nums">{c.scoreBreakdown.recency}/40</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-muted-foreground">Segment:</span>
                              <span className="tabular-nums">{c.scoreBreakdown.segment}/25</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-muted-foreground">Fırsat:</span>
                              <span className="tabular-nums">{c.scoreBreakdown.dealValue}/20</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-muted-foreground">Aktivite:</span>
                              <span className="tabular-nums">{c.scoreBreakdown.activity}/15</span>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  {/* Skor barı */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', scoreBar(c.score))}
                        style={{ width: `${c.score}%` }}
                      />
                    </div>
                    <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-4 gap-0.5', act.color)}>
                      <act.icon className="w-2.5 h-2.5" />
                      {act.label}
                    </Badge>
                  </div>

                  {/* Alt satır: son aktivite + buton */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 min-w-0">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {c.lastActivityAt ? `Son: ${formatRelative(c.lastActivityAt)}` : 'İletişim yok'}
                      </span>
                    </div>
                    {canManage && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2 gap-1 shrink-0"
                        onClick={() => handleCreateSingle(c)}
                        disabled={creating}
                      >
                        {creating ? (
                          <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-violet-500" />
                        )}
                        Görev Oluştur
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Toplu AI görevi butonu */}
        {canManage && items.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/40"
            onClick={handleBulkAssign}
            disabled={bulkRunning}
          >
            {bulkRunning ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mr-1.5" />
                Görevler oluşturuluyor...
              </>
            ) : (
              <>
                <Bot className="w-3.5 h-3.5 mr-1.5" />
                Top 10'a Otomatik Görev Oluştur
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
