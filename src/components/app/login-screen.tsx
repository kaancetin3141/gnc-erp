'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/app-store'
import { apiPost } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2, ChevronRight, Sparkles, Database, Shield, MapPin } from 'lucide-react'
import { initials } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/rbac'
import type { SessionUser, Role } from '@/types'

interface DemoUser {
  id: string
  email: string
  name: string
  role: Role
  title: string | null
  tenantId: string
  tenantName: string
  avatarUrl: string | null
  employeeCode: string | null
}

export function LoginScreen() {
  const setSession = useAppStore((s) => s.setSession)
  const [users, setUsers] = useState<DemoUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loginId, setLoginId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsSeed, setNeedsSeed] = useState(false)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      setLoading(true)
      const res = await fetch('/api/auth')
      const data = await res.json()
      if (!Array.isArray(data)) {
        // API hata döndürdü — kullanıcıya göster
        if (data?.error) {
          setError(data.error)
        } else {
          setNeedsSeed(true)
        }
      } else if (data.length === 0) {
        setNeedsSeed(true)
      } else {
        setUsers(data)
      }
    } catch {
      setError('Kullanıcılar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  async function handleSeed() {
    try {
      setSeeding(true)
      setError(null)
      await apiPost('/api/seed')
      await loadUsers()
      setNeedsSeed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Seed başarısız')
    } finally {
      setSeeding(false)
    }
  }

  async function handleLogin(userId: string) {
    try {
      setLoginId(userId)
      setError(null)
      const res = await apiPost<{ sessionId: string; user: SessionUser }>('/api/auth', { userId })
      setSession(res.user, res.sessionId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Giriş başarısız')
      setLoginId(null)
    }
  }

  const tenantGroups = users.reduce<Record<string, DemoUser[]>>((acc, u) => {
    if (!acc[u.tenantName]) acc[u.tenantName] = []
    acc[u.tenantName].push(u)
    return acc
  }, {})

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
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
            Müşteri portföyü, Google Maps potansiyel müşteri madenciliği, pipeline ve raporlar — hepsi tek platformda.
          </p>

          <div className="space-y-3 max-w-md">
            {[
              { icon: Building2, text: 'Müşteri 360° — tüm iletişim tek sayfada' },
              { icon: MapPin, text: 'Harita tabanlı potansiyel müşteri bulma' },
              { icon: Shield, text: 'Rol bazlı yetki + çok kiracılı izolasyon' },
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

      <div className="lg:w-1/2 flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Demo Girişi</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Test için bir kullanıcı seçin. Her rolün farklı yetkileri vardır.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {needsSeed && (
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

          {loading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {!loading && !needsSeed && (
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1 custom-scroll">
              {Object.entries(tenantGroups).map(([tenantName, tenantUsers]) => (
                <div key={tenantName}>
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{tenantName}</span>
                    <span className="text-xs text-slate-400">({tenantUsers.length} kullanıcı)</span>
                  </div>
                  <div className="space-y-2">
                    {tenantUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleLogin(u.id)}
                        disabled={loginId !== null}
                        className="w-full group flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all text-left disabled:opacity-50"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center text-sm font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                          {initials(u.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 dark:text-white text-sm truncate">{u.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {ROLE_LABELS[u.role]} {u.title ? `· ${u.title}` : ''}
                          </div>
                          {u.employeeCode && (
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{u.employeeCode}</div>
                          )}
                        </div>
                        {loginId === u.id ? (
                          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
