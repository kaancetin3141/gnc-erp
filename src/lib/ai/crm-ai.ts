// ============================================================
// GNC CRM — AI Motoru (LLM tabanlı)
//
// Z-AI Web Dev SDK kullanarak:
//   - Lead scoring (0-100)
//   - Deal risk detection
//   - Activity summary
//   - Sales forecast
//   - Akıllı asistan
//
// Z-AI SDK backend'de çalışır — client'tan çağrılmaz.
// ============================================================

import ZAI from 'z-ai-web-dev-sdk'

let zaiInstance: ZAI | null = null

async function getZai(): Promise<ZAI> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

export interface LeadScoreInput {
  name: string
  sector?: string
  city?: string
  phone?: string
  web?: string
  email?: string
  hasActivity: boolean
  activityCount: number
  lastActivityDaysAgo: number | null
  convertedToCustomer: boolean
  source?: string
  rating?: number
  reviewCount?: number
}

export interface LeadScoreResult {
  score: number // 0-100
  level: 'çok düşük' | 'düşük' | 'orta' | 'yüksek' | 'çok yüksek'
  reasons: string[]
  recommendations: string[]
}

// Lead scoring — ML yerine rule-based + LLM yorumu
export async function scoreLead(input: LeadScoreInput): Promise<LeadScoreResult> {
  // Rule-based puanlama
  let score = 30 // başlangıç
  const reasons: string[] = []

  // Aktivite var mı
  if (input.hasActivity) {
    score += 15
    reasons.push('Aktivite kaydı mevcut')
  }
  // Aktivite yoğunluğu
  if (input.activityCount >= 5) {
    score += 20
    reasons.push(`${input.activityCount} aktivite — yoğun ilgi`)
  } else if (input.activityCount >= 2) {
    score += 10
    reasons.push(`${input.activityCount} aktivite — orta ilgi`)
  } else if (input.activityCount === 0) {
    score -= 10
    reasons.push('Aktivite yok — pasif lead')
  }

  // Son aktivite zamanı
  if (input.lastActivityDaysAgo !== null) {
    if (input.lastActivityDaysAgo <= 7) {
      score += 15
      reasons.push('Son 7 günde aktivite — sıcak lead')
    } else if (input.lastActivityDaysAgo <= 30) {
      score += 5
    } else if (input.lastActivityDaysAgo > 60) {
      score -= 15
      reasons.push('60+ gündür iletişim yok — soğumuş')
    }
  }

  // Çevrildi mi
  if (input.convertedToCustomer) {
    score = Math.max(score, 80)
    reasons.push('Müşteriye çevrilmiş — yüksek kalite')
  }

  // İletişim bilgileri
  if (input.phone && input.email) score += 5
  if (input.web) score += 5

  // Maps rating
  if (input.rating && input.rating >= 4) {
    score += 10
    reasons.push(`Yüksek Google rating (${input.rating})`)
  }
  if (input.reviewCount && input.reviewCount > 50) {
    score += 5
    reasons.push(`${input.reviewCount} yorum — aktif işletme`)
  }

  // Sector boost (B2B sektörler daha değerli)
  if (input.sector) {
    const sector = input.sector.toLowerCase()
    if (sector.includes('holding') || sector.includes('san') || sector.includes('tic')) {
      score += 10
      reasons.push('B2B/Kurumsal sektör — yüksek potansiyel')
    }
  }

  // Sınırlandır
  score = Math.max(0, Math.min(100, score))

  // Level
  const level: LeadScoreResult['level'] =
    score >= 80 ? 'çok yüksek' :
    score >= 60 ? 'yüksek' :
    score >= 40 ? 'orta' :
    score >= 20 ? 'düşük' : 'çok düşük'

  // AI ile öneri üret
  const recommendations = await generateLeadRecommendations(input, score, level)

  return { score, level, reasons, recommendations }
}

async function generateLeadRecommendations(input: LeadScoreInput, score: number, level: string): Promise<string[]> {
  try {
    const zai = await getZai()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: 'Sen bir KOBİ satış danışmanısın. Lead için 3 kısa pratik öneri ver. Türkçe, 1-2 cümlelik maddeler halinde. JSON dizi formatında dön: ["öneri1","öneri2","öneri3"]',
        },
        {
          role: 'user',
          content: `Lead: ${input.name} | Sektör: ${input.sector || 'belirsiz'} | Şehir: ${input.city || 'belirsiz'} | Aktivite sayısı: ${input.activityCount} | Son aktivite: ${input.lastActivityDaysAgo} gün önce | Skor: ${score}/100 (${level})`,
        },
      ],
      thinking: { type: 'disabled' },
    })
    const content = completion.choices[0]?.message?.content ?? '[]'
    // JSON parse et
    const match = content.match(/\[([\s\S]*?)\]/)
    if (match) {
      try {
        return JSON.parse(match[0]) as string[]
      } catch {
        return [content.slice(0, 200)]
      }
    }
    return [content.slice(0, 200)]
  } catch {
    // Fallback — rule-based öneri
    const recs: string[] = []
    if (input.lastActivityDaysAgo === null || input.lastActivityDaysAgo > 14) {
      recs.push('İlk teması kur — telefon araması planla')
    }
    if (input.activityCount < 2) {
      recs.push('Daha fazla aktivite ekle — ziyaret veya e-posta')
    }
    if (score < 40) {
      recs.push('Bu lead düşük puanlı — önceliklendirme gerekebilir')
    } else if (score >= 70) {
      recs.push('Yüksek kaliteli lead — fırsata çevir')
    }
    recs.push('KVKK izni al ve iletişim bilgilerini tamamla')
    return recs.slice(0, 3)
  }
}

export interface DealRiskInput {
  title: string
  stage: string
  value: number
  probability: number
  expectedCloseDate: string
  daysInStage: number
  activityCount: number
  lastActivityDaysAgo: number | null
  customerStale: boolean
}

export interface DealRiskResult {
  riskLevel: 'düşük' | 'orta' | 'yüksek' | 'kritik'
  riskScore: number // 0-100
  reasons: string[]
  recommendations: string[]
}

// Deal risk detection
export async function analyzeDealRisk(input: DealRiskInput): Promise<DealRiskResult> {
  let risk = 0
  const reasons: string[] = []

  // Stage'de çok uzun süre
  if (input.daysInStage > 30) {
    risk += 30
    reasons.push(`${input.daysInStage} gündür aynı aşamada — takılmış`)
  } else if (input.daysInStage > 14) {
    risk += 15
    reasons.push('14+ gündür aynı aşamada — yavaş ilerliyor')
  }

  // Aktivite yok
  if (input.activityCount === 0) {
    risk += 25
    reasons.push('Aktivite kaydı yok — ölü fırsat olabilir')
  } else if (input.activityCount < 2) {
    risk += 10
    reasons.push('Az aktivite — ilgi azalıyor')
  }

  // Son aktivite çok eski
  if (input.lastActivityDaysAgo !== null && input.lastActivityDaysAgo > 14) {
    risk += 25
    reasons.push(`${input.lastActivityDaysAgo} gündür iletişim yok`)
  } else if (input.lastActivityDaysAgo !== null && input.lastActivityDaysAgo > 7) {
    risk += 10
    reasons.push('Son 1 haftada aktivite yok')
  }

  // Vade tarihi geçti
  if (input.expectedCloseDate) {
    const closeDate = new Date(input.expectedCloseDate)
    const now = new Date()
    if (closeDate < now) {
      risk += 20
      reasons.push('Kapanış tarihi geçti — gecikmiş')
    } else {
      const daysToClose = Math.ceil((closeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysToClose <= 3 && input.probability < 80) {
        risk += 10
        reasons.push('Kapanış yakın ama olasılık düşük')
      }
    }
  }

  // Müşteri iletişimsiz
  if (input.customerStale) {
    risk += 15
    reasons.push('Müşteri 30+ gündür iletişimsiz')
  }

  // Olasılık düşük ama değer yüksek
  if (input.probability < 30 && input.value > 50000) {
    risk += 10
    reasons.push('Yüksek değer ama düşük olasılık — riskli')
  }

  risk = Math.max(0, Math.min(100, risk))

  const riskLevel: DealRiskResult['riskLevel'] =
    risk >= 70 ? 'kritik' :
    risk >= 50 ? 'yüksek' :
    risk >= 25 ? 'orta' : 'düşük'

  return {
    riskLevel,
    riskScore: risk,
    reasons,
    recommendations: [], // TODO: AI ile üret
  }
}

// Activity summary — uzun aktivite listesini özetle
export async function summarizeActivities(activities: Array<{
  type: string
  subject: string
  date: string
  outcome?: string | null
  customerName?: string
  userName?: string
}>): Promise<string> {
  if (activities.length === 0) return 'Henüz aktivite kaydı yok.'

  try {
    const zai = await getZai()
    const activitiesText = activities.slice(0, 15).map((a, i) => {
      return `${i + 1}. [${a.date.slice(0, 10)}] ${a.type.toUpperCase()} — ${a.subject}${a.outcome ? ` (${a.outcome})` : ''}${a.customerName ? ` | ${a.customerName}` : ''}${a.userName ? ` · ${a.userName}` : ''}`
    }).join('\n')

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: 'Sen bir satış asistanısın. Müşteri aktivitelerini özetle. 2-3 paragraf halinde, önemli trendleri ve önerileri belirt. Türkçe yaz.',
        },
        {
          role: 'user',
          content: `Bu müşteri için ${activities.length} aktivite kaydı var. Son ${Math.min(15, activities.length)} aktivite:\n\n${activitiesText}\n\nÖzet:`,
        },
      ],
      thinking: { type: 'disabled' },
    })
    return completion.choices[0]?.message?.content ?? 'Özet oluşturulamadı.'
  } catch (e) {
    // Fallback — basit istatistik
    const typeCounts: Record<string, number> = {}
    for (const a of activities) {
      typeCounts[a.type] = (typeCounts[a.type] || 0) + 1
    }
    const stats = Object.entries(typeCounts).map(([t, c]) => `${t}: ${c}`).join(', ')
    return `Toplam ${activities.length} aktivite. Tür dağılımı: ${stats}.`
  }
}

// Sales forecast — gelecek dönem ciro tahmini
export async function forecastSales(historicalData: Array<{ month: string; revenue: number; dealCount: number }>): Promise<{
  nextMonthForecast: number
  confidence: number
  reasoning: string
}> {
  if (historicalData.length < 2) {
    return {
      nextMonthForecast: 0,
      confidence: 0,
      reasoning: 'Yeterli veri yok (en az 2 ay gerekli)',
    }
  }

  try {
    const zai = await getZai()
    const dataStr = historicalData.map((d) => `${d.month}: ${d.revenue}₺ (${d.dealCount} fırsat)`).join('\n')
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: 'Sen bir satış tahmin uzmanısın. Tarihsel verilerden gelecek ayın cirosunu tahmin et. JSON formatında dön: {"forecast": sayı, "confidence": 0-100, "reasoning": "kısa açıklama"}',
        },
        {
          role: 'user',
          content: `Son ${historicalData.length} ayın satış verisi:\n${dataStr}\n\nGelecek ay için tahmin:`,
        },
      ],
      thinking: { type: 'disabled' },
    })
    const content = completion.choices[0]?.message?.content ?? '{}'
    const match = content.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        return {
          nextMonthForecast: parsed.forecast || 0,
          confidence: parsed.confidence || 50,
          reasoning: parsed.reasoning || 'Tahmin yapıldı',
        }
      } catch {
        // Fallback
      }
    }
  } catch {
    // Fallback
  }

  // Rule-based fallback — basit ortalama + trend
  const revenues = historicalData.map((d) => d.revenue)
  const avg = revenues.reduce((s, r) => s + r, 0) / revenues.length
  const lastMonth = revenues[revenues.length - 1]
  const trend = revenues.length > 1 ? (lastMonth - revenues[revenues.length - 2]) / revenues[revenues.length - 2] : 0
  const forecast = Math.max(0, Math.round(lastMonth * (1 + trend * 0.5)))
  return {
    nextMonthForecast: forecast,
    confidence: Math.max(30, Math.min(80, 50 + trend * 100)),
    reasoning: `Ortalama: ${Math.round(avg)}₺, geçen ay: ${lastMonth}₺, trend: %${(trend * 100).toFixed(1)}`,
  }
}

// AI Assistant — sohbet tabanlı yardımcı
export async function askAssistant(question: string, context: {
  userName?: string
  tenantName?: string
  sector?: string
  customerCount?: number
  openDeals?: number
  pipelineValue?: number
  pendingTasks?: number
  recentActivities?: Array<{ type: string; subject: string; date: string }>
}): Promise<string> {
  try {
    const zai = await getZai()
    const contextStr = Object.entries(context)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => {
        if (k === 'recentActivities' && Array.isArray(v)) {
          const acts = v.slice(0, 5).map((a: { type: string; subject: string; date: string }) => `[${a.date}] ${a.type}: ${a.subject}`).join(', ')
          return `${k}: ${acts}`
        }
        return `${k}: ${v}`
      })
      .join('\n')

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `Sen GNC CRM'in AI satış asistanısın. Kullanıcıya satış, müşteri yönetimi, fırsat önceliklendirme, görev planlama konularında yardımcı ol. Türkçe konuş, pratik öneriler ver. Kısa ve net ol.

Kullanıcı bağlamı:
${contextStr}`,
        },
        {
          role: 'user',
          content: question,
        },
      ],
      thinking: { type: 'disabled' },
    })
    return completion.choices[0]?.message?.content ?? 'Yanıt oluşturulamadı.'
  } catch (e) {
    return `Üzgünüm, şu an yanıt veremiyorum. ${e instanceof Error ? e.message : ''}`
  }
}
