import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/auth'
import type { PlatformKey } from '@/lib/social/platforms'

// ============================================================
// HESAP TANIAMA — bağlantı testi (kullanıcı raporu: "credits depleted
// hatası veriyor ama X developer panelde kullanım görünmüyor")
//
// Kayıtlı token'ı platformun gerçek "me" endpoint'ine götürür; HTTP
// durumunu + ham hata gövdesini döndürür ve token tipini teşhis eder:
//   · app_only_token  → kullanıcı developer portal'daki APP-only Bearer
//                       Token'ı yapıştırmış (en yaygın hata!)
//   · invalid_token   → token geçersiz / süresi dolmuş / iptal
//   · usage_cap       → app seviyesi kota dolu (panel geç gösterebilir)
//   · ok              → token geçerli, gerçek kullanıcı token'ı
// ============================================================

export interface ProbeResult {
  httpStatus: number | null
  title: string | null
  detail: string | null
  type: string | null
  bodySnippet: string
}

export type DiagnosisKind =
  | 'ok'
  | 'app_only_token'
  | 'invalid_token'
  | 'usage_cap'
  | 'insufficient_permission'
  | 'network_error'
  | 'unknown'

export interface Diagnosis {
  kind: DiagnosisKind
  headline: string
  explanation: string
  recommendations: string[]
  verifiedHandle: string | null
  verifiedName: string | null
  followerCount: number | null
  probe: ProbeResult | null
}

async function fetchProbe(url: string, headers: Record<string, string>): Promise<ProbeResult> {
  try {
    const res = await fetch(url, { headers })
    let bodyText = ''
    try { bodyText = await res.text() } catch { /* gövde yok */ }
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(bodyText) as Record<string, unknown> } catch { /* json değil */ }
    const errObj = (parsed.error ?? {}) as Record<string, unknown>
    return {
      httpStatus: res.status,
      title: (parsed.title as string) ?? (errObj.title as string) ?? null,
      detail: (parsed.detail as string) ?? (errObj.message as string) ?? null,
      type: (parsed.type as string) ?? (errObj.type as string) ?? null,
      bodySnippet: bodyText.slice(0, 500),
    }
  } catch (e) {
    return {
      httpStatus: null,
      title: 'Network Error',
      detail: e instanceof Error ? e.message : String(e),
      type: null,
      bodySnippet: '',
    }
  }
}

function classify(probe: ProbeResult): Diagnosis {
  const blob = `${probe.title ?? ''} ${probe.detail ?? ''} ${probe.type ?? ''} ${probe.bodySnippet}`.toLowerCase()

  if (probe.httpStatus === null) {
    return {
      kind: 'network_error',
      headline: 'Platforma ulaşılamadı',
      explanation: 'API isteği hiç cevap almadan başarısız oldu (ağ/DNS hatası).',
      recommendations: ['İnternet bağlantısını ve DNS ayarlarını kontrol edin', 'Birkaç dakika sonra tekrar test edin'],
      verifiedHandle: null, verifiedName: null, followerCount: null, probe,
    }
  }

  if (probe.httpStatus === 200) {
    return {
      kind: 'ok',
      headline: 'Token geçerli ✓',
      explanation: 'Token gerçek bir kullanıcı (OAuth 2.0) token\'ı ve aktif çalışıyor.',
      recommendations: [
        'Token çalışıyor — yayın hatası alıyorsanız sebep büyük olasılıkla app seviyesi aylık kota (bkz. öneriler)',
      ],
      verifiedHandle: null, verifiedName: null, followerCount: null, probe,
    }
  }

  // App-only Bearer Token — /2/users/me kullanıcı bağlamı ister, app-only reddeder
  if (
    probe.httpStatus === 403 &&
    (blob.includes('client-not-applicable') || blob.includes('operation not authorized') ||
      blob.includes('app-only') || (blob.includes('client-forbidden') && blob.includes('user context')))
  ) {
    return {
      kind: 'app_only_token',
      headline: 'Bu token bir APP token\'ı (Bearer Token) — kullanıcı token\'ı değil',
      explanation:
        'Developer portal (developer.x.com) ana sayfasında görünen uzun "Bearer Token" APP\'e aittir, hesabınıza değil. ' +
        'Bu token ile gönderi YAYINLANAMAZ — X, gönderi atmak için kullanıcı onaylı OAuth 2.0 token\'ı ister. ' +
        'App token\'ı ile yapılan istekler bazı uç noktalarda "credits depleted" gibi yanıltıcı hatalar da üretebilir.',
      recommendations: [
        'Bu token\'la hesap bağlantısını kesin',
        'Gönderi yayınlamak için OAuth 2.0 PKCE akışından USER access token üretin (scope: tweet.read tweet.write offline.access)',
        'Alternatif: app\'i silip yeni proje + app oluşturup OAuth akışını baştan kurun',
      ],
      verifiedHandle: null, verifiedName: null, followerCount: null, probe,
    }
  }

  if (probe.httpStatus === 401 || (blob.includes('invalid') && blob.includes('token'))) {
    return {
      kind: 'invalid_token',
      headline: 'Token geçersiz veya süresi dolmuş',
      explanation: 'Platform bu token\'ı tanımadı (HTTP 401). Token silinmiş, iptal edilmiş veya yanlış kopyalanmış olabilir.',
      recommendations: [
        'Hesabı kesip yeni token ile yeniden bağlayın',
        'Token\'ı kopyalarken başında "Bearer " olmadığına ve boşluk/eksik karakter olmadığına dikkat edin',
      ],
      verifiedHandle: null, verifiedName: null, followerCount: null, probe,
    }
  }

  if (probe.httpStatus === 402 || probe.httpStatus === 429 || blob.includes('credits depleted') || blob.includes('usage cap') || blob.includes('usagecapexceeded')) {
    // HTTP 402 Payment Required = X API kredi (credits) bakiyesi bitti — kullanım kotası değil, ödeme sorunu
    const isPayment = probe.httpStatus === 402 || blob.includes('credits depleted')
    return {
      kind: 'usage_cap',
      headline: isPayment
        ? 'API kredisi bitti (HTTP 402 — Ödeme Gerekli)'
        : 'Kullanım kotası aşıldı (HTTP 429)',
      explanation: isPayment
        ? 'X API kredi (credits) sistemi kullanır: her API isteği hesabınızın kredi bakiyesinden harcanır, bakiye sıfırlandığında HTTP 402 "credits depleted" (Ödeme Gerekli) döner. Bu bir kullanım kotası DEĞİL, ödeme/bakiye sorunudur — o yüzden developer panelin "Usage" grafiğinde kullanım görünmese bile istekler reddedilir. Token\'ınız geçerlidir (bu testte kimlik başarıyla doğrulandı) ama okuma/yazma istekleri kredi olmadan işlenmez.'
        : 'Bu app\'in aylık API kotası tükendi. Kota app seviyesindendir — token\'ın ÜRETİLDİĞİ developer app\'in tüm trafiği ortak sayılır. Aynı app\'i kullanan başka araçlar/botlar kotaları tüketmiş olabilir.',
      recommendations: isPayment
        ? [
            'developer.x.com portalında "Usage" değil Billing / API Credits (Faturalandırma / Kredi) bölümüne bakın — sorun bakiyede',
            'Ücretsiz (Free) planın aylık ücretsiz kredisi çok sınırlıdır; bittiğinde ay sonunda yenilenir veya Basic plana geçilir',
            'Aynı hesaptaki başka uygulamalar/araçlar kredileri tüketmiş olabilir — tüm app\'ler ortak bakiyeyi paylaşır',
            'Uygulama tarafında: beklemek istemiyorsanız yayınlamayı "Simülasyon" moduyla kullanın',
          ]
        : [
            'Panelde POST /2/tweets (posts) satırını özellikle kontrol edin — read ve post kotaları ayrı sayılır',
            'Aynı app altında başka entegrasyon/otomasyon varsa kotaları onlar tüketiyor olabilir',
            'Aylık reset tarihini bekleyin veya Basic plana yükseltin',
          ],
      verifiedHandle: null, verifiedName: null, followerCount: null, probe,
    }
  }

  if (probe.httpStatus === 403) {
    return {
      kind: 'insufficient_permission',
      headline: 'Yetki reddi (HTTP 403)',
      explanation: 'Token geçerli olabilir ama bu işlem için gerekli izin/scope\'a sahip değil veya app kısıtlanmış.',
      recommendations: [
        'Developer portalda app izinlerinin "Read and Write" olduğundan emin olun',
        'OAuth 2.0 bağlantısında tweet.write scope\'u istendiğinden emin olun',
      ],
      verifiedHandle: null, verifiedName: null, followerCount: null, probe,
    }
  }

  return {
    kind: 'unknown',
    headline: `Beklenmeyen yanıt (HTTP ${probe.httpStatus})`,
    explanation: 'Tanınmayan bir hata yanıtı alındı — ham cevabı aşağıda görebilirsiniz.',
    recommendations: ['Ham cevabı inceleyin', `Platform dokümanlarında HTTP ${probe.httpStatus} hatalarını aratın`],
    verifiedHandle: null, verifiedName: null, followerCount: null, probe,
  }
}

// GET — hesabın bağlı olduğu platformda token sağlığı testi yapar
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.manage')) return err('Sosyal medya yönetme yetkiniz yok', 403)

  const { id } = await params
  const account = await db.socialAccount.findFirst({
    where: { id, tenantId: user!.tenantId, isActive: true },
  })
  if (!account) return err('Hesap bulunamadı', 404)
  if (account.authMethod === 'mock' || !account.accessToken) {
    return err('Bu hesap simülasyon modunda — gerçek token testi için "Gerçek Bağla" ile token girin', 400)
  }

  const platform = account.platform as PlatformKey
  let probe: ProbeResult
  let diagnosis: Diagnosis

  if (platform === 'twitter') {
    probe = await fetchProbe(
      'https://api.twitter.com/2/users/me?user.fields=public_metrics,name,username',
      { 'Authorization': `Bearer ${account.accessToken}` },
    )
    diagnosis = classify(probe)

    // 200 ise gerçek hesap bilgilerini çıkar + ikinci test: kredi/bakiye kontrolü
    if (probe.httpStatus === 200) {
      try {
        const data = JSON.parse(probe.bodySnippet) as {
          data?: { id?: string; username?: string; name?: string; public_metrics?: { followers_count?: number } }
        }
        diagnosis.verifiedHandle = data.data?.username ?? null
        diagnosis.verifiedName = data.data?.name ?? null
        diagnosis.followerCount = data.data?.public_metrics?.followers_count ?? null
        if (diagnosis.verifiedHandle && diagnosis.verifiedHandle.toLowerCase() !== account.handle.toLowerCase()) {
          diagnosis.recommendations.push(
            `Dikkat: token @${diagnosis.verifiedHandle} hesabına ait, bağlı hesap ise @${account.handle} — farklı hesaplar olabilir`,
          )
        }

        // Probe B: timeline okuma — kredi bittiğinde 402 döner (users/me bedava çalışır!)
        if (data.data?.id) {
          const probeB = await fetchProbe(
            `https://api.twitter.com/2/users/${data.data.id}/tweets?max_results=5&tweet.fields=created_at`,
            { 'Authorization': `Bearer ${account.accessToken}` },
          )
          if (probeB.httpStatus === 402 || probeB.httpStatus === 429) {
            const paymentDiag = classify(probeB)
            // Kimlik doğrulandı bilgisini koru — sadece kredi teşhisine geç
            paymentDiag.verifiedHandle = diagnosis.verifiedHandle
            paymentDiag.verifiedName = diagnosis.verifiedName
            paymentDiag.followerCount = diagnosis.followerCount
            paymentDiag.explanation =
              `Token kimliği doğrulandı ✓ (@${diagnosis.verifiedHandle ?? account.handle}) — ama ` +
              paymentDiag.explanation
            diagnosis = paymentDiag
          }
        }
      } catch { /* parse hatası — boş bırak */ }
    }
  } else if (platform === 'facebook') {
    probe = await fetchProbe(
      `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(account.accessToken)}`,
      {},
    )
    diagnosis = classify(probe)
    if (probe.httpStatus === 200) {
      try {
        const data = JSON.parse(probe.bodySnippet) as { id?: string; name?: string }
        diagnosis.verifiedName = data.name ?? null
      } catch { /* ignore */ }
    }
  } else if (platform === 'telegram') {
    probe = await fetchProbe(`https://api.telegram.org/bot${account.accessToken}/getMe`, {})
    diagnosis = classify(probe)
    if (probe.httpStatus === 200 && probe.bodySnippet.includes('"ok":true')) {
      try {
        const data = JSON.parse(probe.bodySnippet) as { result?: { username?: string; first_name?: string } }
        diagnosis.verifiedHandle = data.result?.username ?? null
        diagnosis.verifiedName = data.result?.first_name ?? null
      } catch { /* ignore */ }
    }
  } else {
    return err(`${platform} için tanılama testi henüz eklenmedi`, 400)
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'social.account.diagnose',
    entity: 'social_account',
    entityId: account.id,
    after: { platform, kind: diagnosis.kind, httpStatus: probe.httpStatus },
  })

  return ok({ platform, authMethod: account.authMethod, handle: account.handle, diagnosis })
}
