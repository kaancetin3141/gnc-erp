'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/app-store'
import { apiPost } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Building2, Shield, Database, MapPin, Mail, Lock, Eye, EyeOff, LogIn, Sparkles, AlertTriangle } from 'lucide-react'
import type { SessionUser } from '@/types'

export function LoginScreen() {
  const setSession = useAppStore((s) => s.setSession)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingSeed, setCheckingSeed] = useState(true)
  const [needsSeed, setNeedsSeed] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mustChange, setMustChange] = useState(false)

  useEffect(() => {
    checkSeed()
  }, [])

  async function checkSeed() {
    try {
      const res = await fetch('/api/auth')
      const data = await res.json()
      setNeedsSeed(!data?.seeded)
    } catch {
      // sessiz — login denemesi yine de yapılabilir
    } finally {
      setCheckingSeed(false)
    }
  }

  async function handleSeed() {
    try {
      setSeeding(true)
      setError(null)
      await apiPost('/api/seed')
      await checkSeed()
      setNeedsSeed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Seed başarısız')
    } finally {
      setSeeding(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    try {
      setLoading(true)
      setError(null)
      const res = await apiPost<{ sessionId: string; user: SessionUser; mustChangePassword: boolean }>(
        '/api/auth',
        { email: email.trim(), password },
      )
      setSession(res.user, res.sessionId)
      setMustChange(!!res.mustChangePassword)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Giriş başarısız')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Sol marka paneli */}
      <div className="lg:w-1/2 lg:min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)',
          backgroundSize: '40px 40px, 60px 60px',
        }} />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center font-bold text-lg shadow-lg shadow-emerald-500/20">
              G
            </div>
            <div>
              <div className="text-xl font-bold tracking-tight">GNC CRM</div>
              <div className="text-xs text-slate-400">Satış Süperapp</div>
            </div>
          </div>

          <h1 className="text-3xl lg:text-4xl font-bold leading-tight mb-4">
            Satış ekibinizin<br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              tek merkezi
            </span>
          </h1>
          <p className="text-slate-300 text-lg mb-10 max-w-md">
            Müşteri portföyü, harita tabanlı potansiyel müşteri madenciliği, pipeline ve raporlar — hepsi tek platformda.
          </p>

          <div className="space-y-3 max-w-md">
            {[
              { icon: Building2, text: 'Müşteri 360° — tüm iletişim tek sayfada' },
              { icon: MapPin, text: 'Harita tabanlı potansiyel müşteri bulma' },
              { icon: Shield, text: 'Rol bazlı yetki + güvenli oturum yönetimi' },
              { icon: Database, text: 'Pipeline, görevler, raporlar, dışa aktarma' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-slate-200">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <f.icon className="w-4 h-4" />
                </div>
                <span className="text-sm">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-400 mt-8">
          © 2025 GNC CRM · KOBİ segmenti için üretilmiştir · KVKK uyumlu
        </div>
      </div>

      {/* Sağ giriş formu */}
      <div className="lg:w-1/2 flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Giriş Yap</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Hesabınıza e-posta ve şifrenizle giriş yapın.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {mustChange && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              🔐 Varsayılan şifre kullanıyorsunuz — güvenliğiniz için sağ üst menüden
              <span className="font-semibold"> Şifre Değiştir</span>&apos;i kullanın.
            </div>
          )}

          {needsSeed && !checkingSeed && (
            <Card className="p-6 mb-6 border-amber-200 bg-amber-50">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-amber-900 mb-1">Demo verisi henüz oluşturulmadı</div>
                  <p className="text-sm text-amber-700 mb-3">
                    2 şirket, 8 kullanıcı, 30 müşteri ve örnek verileri oluşturmak için aşağıdaki butona tıklayın.
                  </p>
                  <Button onClick={handleSeed} disabled={seeding} size="sm">
                    {seeding ? 'Oluşturuluyor...' : 'Demo Verisi Oluştur'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {checkingSeed ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email" className="text-xs">E-posta</Label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="ornek@gncinc.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 h-11"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password" className="text-xs">Şifre</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10 h-11"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading || !email.trim() || !password || needsSeed}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Giriş yapılıyor...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="w-4 h-4" />
                    Giriş Yap
                  </span>
                )}
              </Button>

              <div className="text-[11px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
                Oturumunuz 30 gün boyunca güvenli şekilde saklanır.<br />
                Şifrenizi unuttuysanız yöneticiniz sıfırlayabilir.
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
