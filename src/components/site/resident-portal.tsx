'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/format'
import { Home, CheckCircle2, Megaphone, AlertTriangle, Phone } from 'lucide-react'

export function ResidentPortal() {
  const [session, setSession] = useState<string | null>(null)
  const [resident, setResident] = useState<{ name: string; phone: string; apartment: any } | null>(null)
  const [loginForm, setLoginForm] = useState({ phone: '', password: '' })
  const [loggingIn, setLoggingIn] = useState(false)

  const handleLogin = async () => {
    setLoggingIn(true)
    try {
      const res = await apiPost<{ sessionId: string; resident: any }>('/api/resident-auth', loginForm)
      setSession(res.sessionId)
      setResident(res.resident)
      toast.success(`Hoş geldiniz, ${res.resident.name}`)
    } catch (e: any) {
      toast.error(e.message || 'Giriş başarısız')
    } finally {
      setLoggingIn(false)
    }
  }

  if (!session || !resident) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-soft">
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-3">
                <Home className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl font-bold">Sakin Girişi</h2>
              <p className="text-sm text-muted-foreground mt-1">Aidat ve duyurularınızı görüntüleyin</p>
            </div>
            <div className="space-y-3">
              <div><Label className="text-xs">Telefon</Label><Input value={loginForm.phone} onChange={e => setLoginForm({ ...loginForm, phone: e.target.value })} placeholder="+90 5xx xxx xx xx" /></div>
              <div><Label className="text-xs">Şifre</Label><Input type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="••••" onKeyDown={e => e.key === 'Enter' && handleLogin()} /></div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleLogin} disabled={loggingIn || !loginForm.phone || !loginForm.password}>
                {loggingIn ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <ResidentDashboard session={session} resident={resident} />
}

function ResidentDashboard({ session, resident }: { session: string; resident: any }) {
  const headers = { 'x-resident-session': session }

  const { data: duesData } = useQuery({
    queryKey: ['resident-dues', session],
    queryFn: () => apiGet<{ items: any[]; stats: { totalDebt: number; totalPaid: number } }>('/api/resident-portal/dues', { headers } as any),
  })

  const { data: announcements = [] } = useQuery({
    queryKey: ['resident-announcements', session],
    queryFn: () => apiGet<any[]>('/api/resident-portal/announcements', { headers } as any),
  })

  const { data: complaints = [] } = useQuery({
    queryKey: ['resident-complaints', session],
    queryFn: () => apiGet<any[]>('/api/resident-portal/complaints', { headers } as any),
  })

  const dues = duesData?.items ?? []
  const totalDebt = duesData?.stats?.totalDebt ?? 0

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Merhaba, {resident.name} 👋</h2>
          <p className="text-sm text-muted-foreground">
            {resident.apartment ? `${resident.apartment.block} ${resident.apartment.number}` : 'Daire bilgisi yok'} · {resident.apartment?.site?.name}
          </p>
        </div>
      </div>

      {/* Borç durumu */}
      <Card className={cn('shadow-soft', totalDebt > 0 ? 'border-red-200 bg-red-50/30' : 'border-emerald-200 bg-emerald-50/30')}>
        <CardContent className="p-4 flex items-center gap-4">
          <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', totalDebt > 0 ? 'bg-red-100' : 'bg-emerald-100')}>
            {totalDebt > 0 ? <AlertTriangle className="w-6 h-6 text-red-600" /> : <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
          </div>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Aidat Borcunuz</div>
            <div className={cn('text-2xl font-bold tabular-nums', totalDebt > 0 ? 'text-red-600' : 'text-emerald-600')}>
              {totalDebt > 0 ? formatCurrency(totalDebt) : 'Borç yok ✓'}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="dues">
        <TabsList>
          <TabsTrigger value="dues" className="text-xs">Aidatlarım</TabsTrigger>
          <TabsTrigger value="announcements" className="text-xs">Duyurular</TabsTrigger>
          <TabsTrigger value="complaints" className="text-xs">Şikayetlerim</TabsTrigger>
        </TabsList>

        {/* Aidatlar */}
        <TabsContent value="dues" className="mt-4 space-y-2">
          {dues.length === 0 ? (
            <Card><CardContent className="py-8 text-center"><p className="text-sm text-muted-foreground">Aidat kaydı yok</p></CardContent></Card>
          ) : (
            dues.map((d: any) => (
              <Card key={d.id}><CardContent className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{d.month}/{d.year} Aidatı</div>
                  <div className="text-xs text-muted-foreground">Son tarih: {formatDate(d.dueDate)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{formatCurrency(d.amount, d.currency)}</span>
                  <Badge variant="outline" className={cn('text-[10px]', d.status === 'odendi' ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50')}>
                    {d.status === 'odendi' ? 'Ödendi' : 'Ödenmedi'}
                  </Badge>
                </div>
              </CardContent></Card>
            ))
          )}
        </TabsContent>

        {/* Duyurular */}
        <TabsContent value="announcements" className="mt-4 space-y-2">
          {announcements.length === 0 ? (
            <Card><CardContent className="py-8 text-center"><Megaphone className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">Duyuru yok</p></CardContent></Card>
          ) : (
            announcements.map((a: any) => (
              <Card key={a.id}><CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                  <span className="font-medium text-sm">{a.title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{a.content}</p>
                <div className="text-xs text-muted-foreground mt-1">{formatDate(a.publishDate)}</div>
              </CardContent></Card>
            ))
          )}
        </TabsContent>

        {/* Şikayetler */}
        <TabsContent value="complaints" className="mt-4 space-y-2">
          {complaints.length === 0 ? (
            <Card><CardContent className="py-8 text-center"><AlertTriangle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">Şikayet yok</p></CardContent></Card>
          ) : (
            complaints.map((c: any) => (
              <Card key={c.id}><CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={cn('text-[10px]', c.status === 'cozuldu' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50')}>
                    {c.status === 'acik' ? 'Açık' : c.status === 'cozuldu' ? 'Çözüldü' : c.status}
                  </Badge>
                  <span className="font-medium text-sm">{c.title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{c.description}</p>
                {c.response && <div className="mt-2 p-2 rounded-lg bg-muted/30 text-xs"><strong>Cevap:</strong> {c.response}</div>}
              </CardContent></Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
