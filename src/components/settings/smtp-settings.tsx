'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Mail, Save, Trash2, Send, Loader2, Info, Eye, EyeOff, CheckCircle2 } from 'lucide-react'

interface SmtpSettingsResponse {
  configured: boolean
  host?: string
  port?: number
  secure?: boolean
  user?: string
  from?: string
  hasPassword?: boolean
  updatedAt?: string
}

// Ayarlar > SMTP — gerçek e-posta gönderimi için sunucu bilgileri
export function SmtpTab() {
  const qc = useQueryClient()
  const [host, setHost] = useState('')
  const [port, setPort] = useState('587')
  const [secure, setSecure] = useState(false)
  const [smtpUser, setSmtpUser] = useState('')
  const [pass, setPass] = useState('')
  const [from, setFrom] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [loadedFromServer, setLoadedFromServer] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['smtp-settings'],
    queryFn: () => apiGet<SmtpSettingsResponse>('/api/settings/smtp'),
  })

  // Sunucudan yüklendiğinde forma doldur (şifre hariç — maskeyli gelir)
  if (data && !loadedFromServer) {
    setHost(data.host ?? '')
    setPort(String(data.port ?? 587))
    setSecure(!!data.secure)
    setSmtpUser(data.user ?? '')
    setFrom(data.from ?? '')
    setLoadedFromServer(true)
  }

  const saveMut = useMutation({
    mutationFn: () =>
      apiPost<{ message: string }>('/api/settings/smtp', {
        host, port: Number(port), secure, user: smtpUser, pass, from,
      }),
    onSuccess: (res) => {
      toast.success(res.message ?? 'SMTP ayarları kaydedildi')
      setPass('')
      qc.invalidateQueries({ queryKey: ['smtp-settings'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Kaydedilemedi'),
  })

  const testMut = useMutation({
    mutationFn: (to: string) =>
      apiPost<{ message: string }>('/api/settings/smtp/test', { to }),
    onSuccess: (res) => toast.success(res.message ?? 'Test e-postası gönderildi'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Test başarısız'),
  })

  const deleteMut = useMutation({
    mutationFn: () => apiDelete<{ message: string }>('/api/settings/smtp'),
    onSuccess: (res) => {
      toast.success(res.message ?? 'SMTP ayarları kaldırıldı')
      setHost(''); setPort('587'); setSecure(false); setSmtpUser(''); setPass(''); setFrom('')
      setLoadedFromServer(false)
      qc.invalidateQueries({ queryKey: ['smtp-settings'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Kaldırılamadı'),
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-4.5 h-4.5 text-emerald-600" />
            SMTP E-posta Sunucusu
            {data?.configured && (
              <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <CheckCircle2 className="w-3 h-3" /> Yapılandırıldı
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Bu ayarları girdiğinizde fatura, teklif ve proforma belgeleri <strong>PDF ekiyle gerçek e-posta</strong> olarak gönderilir.
            Girilmediyse gönderim &quot;mailto&quot; yedeğine düşer (e-posta uygulamanız açılır).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900 text-xs text-teal-800 dark:text-teal-300">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Gmail örneği:</strong> sunucu <code className="font-mono">smtp.gmail.com</code>, port{' '}
              <code className="font-mono">465</code> (SSL açık), kullanıcı gmail adresiniz, şifre olarak{' '}
              <strong>Uygulama Şifresi</strong> kullanın (Google Hesap &gt; Güvenlik &gt; 2 Adımlı Doğrulama &gt; Uygulama Şifreleri).
              Yandex: <code className="font-mono">smtp.yandex.com</code> / 465.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="smtp-host" className="text-xs">Sunucu (host) *</Label>
              <Input id="smtp-host" placeholder="smtp.gmail.com" value={host} onChange={(e) => setHost(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-port" className="text-xs">Port</Label>
              <Input id="smtp-port" type="number" placeholder="587" value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <div>
              <div className="text-sm font-medium">SSL / TLS (465 portu)</div>
              <div className="text-xs text-muted-foreground">465 portu kullanıyorsanız açın; 587 için kapalı bırakın.</div>
            </div>
            <Switch checked={secure} onCheckedChange={setSecure} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-user" className="text-xs">Kullanıcı Adı *</Label>
              <Input id="smtp-user" type="email" placeholder="fatura@sirketiniz.com" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-pass" className="text-xs">
                Şifre {data?.hasPassword && <span className="text-emerald-600 font-normal">(kayıtlı — değiştirmek için yenisi girin)</span>}
              </Label>
              <div className="relative">
                <Input
                  id="smtp-pass"
                  type={showPass ? 'text' : 'password'}
                  placeholder={data?.hasPassword ? '••••••••' : 'Şifre'}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPass ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="smtp-from" className="text-xs">Gönderen Adı / Adres (opsiyonel)</Label>
            <Input id="smtp-from" placeholder='"ABC Faturalar" <fatura@sirketiniz.com>' value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>

          <Separator />

          <div className="flex items-center flex-wrap gap-2">
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !host || !smtpUser}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saveMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Kaydet
            </Button>
            {data?.configured && (
              <Button
                variant="outline"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {deleteMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
                Ayarları Kaldır
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {data?.configured && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4 text-teal-600" /> Bağlantı Testi
            </CardTitle>
            <CardDescription>Kendi e-posta adresinize test mesajı gönderin.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 max-w-md">
              <Input
                type="email"
                placeholder="adres@sirketiniz.com"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => testMut.mutate(testTo)}
                disabled={testMut.isPending || !testTo}
                className="shrink-0"
              >
                {testMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                Test Gönder
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
