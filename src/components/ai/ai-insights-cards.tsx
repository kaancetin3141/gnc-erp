'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import { apiPost } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LeadScoreResult {
  leadId: string
  score: number
  level: 'çok düşük' | 'düşük' | 'orta' | 'yüksek' | 'çok yüksek'
  reasons: string[]
  recommendations: string[]
}

export function LeadScoreCard({ leadId }: { leadId: string }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['lead-score', leadId],
    queryFn: () => apiPost<LeadScoreResult>('/api/ai/lead-score', { leadId }),
    enabled: false, // Manuel tetiklenir
  })

  const score = data?.score ?? 0
  const scoreColor = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-sky-600' : score >= 40 ? 'text-amber-600' : 'text-red-600'
  const progressBar = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-sky-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <Card className="border-emerald-200 dark:border-emerald-900/50 overflow-hidden">
      <CardHeader className="pb-2 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border-b border-emerald-100 dark:border-emerald-900/50">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            AI Lead Skoru
          </CardTitle>
          {data && (
            <Badge className={cn(
              'text-[10px] uppercase',
              score >= 80 && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
              score >= 60 && score < 80 && 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
              score >= 40 && score < 60 && 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
              score < 40 && 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
            )}>
              {data.level}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {isLoading || isFetching ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            AI analiz ediyor...
          </div>
        ) : data ? (
          <>
            {/* Score bar */}
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">Skor</span>
                <span className={cn('text-3xl font-bold tabular-nums', scoreColor)}>{score}<span className="text-sm text-muted-foreground">/100</span></span>
              </div>
              <Progress value={score} className={cn('h-2', progressBar)} />
            </div>

            {/* Reasons */}
            {data.reasons.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Analiz
                </div>
                {data.reasons.slice(0, 4).map((r, i) => (
                  <div key={i} className="text-xs flex items-start gap-1.5">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recommendations */}
            {data.recommendations.length > 0 && (
              <div className="space-y-1 pt-2 border-t">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" /> AI Önerileri
                </div>
                {data.recommendations.map((r, i) => (
                  <div key={i} className="text-xs p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200 flex items-start gap-1.5">
                    <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Re-analyze button */}
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => refetch()} disabled={isFetching}>
              <Sparkles className="w-3 h-3 mr-1" /> Yeniden Analiz Et
            </Button>
          </>
        ) : (
          <div className="text-center py-2">
            <p className="text-xs text-muted-foreground mb-3">
              AI, lead'in aktivitelerini, sektörünü, iletişim sıklığını ve daha fazlasını analiz ederek 0-100 arası skor verir.
            </p>
            <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> AI Skoru Hesapla
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Deal risk badge — pipeline kartlarında gösterilecek
export function DealRiskBadge({ dealId, dealStage, dealValue }: { dealId: string; dealStage: string; dealValue: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['deal-risk', dealId],
    queryFn: () => apiPost<{ dealId: string; riskLevel: 'düşük' | 'orta' | 'yüksek' | 'kritik'; riskScore: number; reasons: string[]; recommendations: string[] }>('/api/ai/deal-risk', { dealId }),
    enabled: dealStage !== 'kazanıldı' && dealStage !== 'kaybedildi' && dealValue > 10000,
    staleTime: 5 * 60 * 1000, // 5 dakika cache
  })

  if (isLoading || !data) return null

  const colors = {
    kritik: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-900',
    yüksek: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900',
    orta: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-900',
    düşük: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  }

  return (
    <Badge variant="outline" className={cn('text-[9px] px-1 py-0 h-4 flex items-center gap-0.5', colors[data.riskLevel])} title={data.reasons.join('\n')}>
      <AlertTriangle className="w-2.5 h-2.5" /> {data.riskLevel}
    </Badge>
  )
}

// Activity summary component — customer 360'da
export function AiActivitySummaryCard({ customerId }: { customerId: string }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['ai-activity-summary', customerId],
    queryFn: () => apiPost<{ customerId: string; customerName: string; activityCount: number; summary: string }>('/api/ai/activity-summary', { customerId }),
    enabled: false,
  })

  return (
    <Card className="border-violet-200 dark:border-violet-900/50">
      <CardHeader className="pb-2 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 border-b border-violet-100 dark:border-violet-900/50">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-violet-600" />
          AI Aktivite Özeti
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-2">
        {isLoading || isFetching ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> AI özetliyor...
          </div>
        ) : data ? (
          <>
            <div className="text-xs text-muted-foreground mb-2">
              {data.activityCount} aktivite analiz edildi
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{data.summary}</p>
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => refetch()} disabled={isFetching}>
              <Sparkles className="w-3 h-3 mr-1" /> Yeniden Özetle
            </Button>
          </>
        ) : (
          <div className="text-center py-2">
            <p className="text-xs text-muted-foreground mb-3">
              AI, son aktivitelerinizi analiz ederek trend ve öneriler içeren özet oluşturur.
            </p>
            <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> AI Özet Oluştur
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
