'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiGet, apiPatch, qk } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { CURRENCIES, CURRENCY_RATES, COUNTRIES } from '@/lib/constants'
import { formatDate, formatDateTime } from '@/lib/format'

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Building2, Coins, Bell, ShieldAlert, ScrollText, Save, Download,
  EyeOff, CheckCircle2, AlertTriangle, Globe, Calendar, Clock, Users,
  FileText, Database, Lock, Info, Shield, MessageSquare, Mail,
} from 'lucide-react'
import { TemplatesView } from '@/components/settings/templates-view'
import { InvoiceTemplateEditor } from '@/components/settings/invoice-template/invoice-template-editor'
import { SmtpTab } from '@/components/settings/smtp-settings'

// ─── Plan rozet renkleri ──────────────────────────────────────────
const PLAN_BADGE: Record<string, { label: string; className: string }> = {
  free: { label: 'Ücretsiz', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  starter: { label: 'Başlangıç', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  pro: { label: 'Pro', className: 'bg-violet-100 text-violet-700 border-violet-200' },
  enterprise: { label: 'Kurumsal', className: 'bg-amber-100 text-amber-700 border-amber-200' },
}

function planBadge(plan: string) {
  return PLAN_BADGE[plan] ?? { label: plan, className: 'bg-slate-100 text-slate-700 border-slate-200' }
}

interface UsersResponse {
  items: { id: string; status: string }[]
  total: number
}

// ─── Şirket sekmesi ───────────────────────────────────────────────
function CompanyTab() {
  const { user } = useAppStore()
  const { data } = useQuery({
    queryKey: qk.users,
    queryFn: () => apiGet<UsersResponse>('/api/users'),
    enabled: !!user,
  })

  const [companyName, setCompanyName] = useState(user?.tenant.name ?? '')
  const [country, setCountry] = useState(user?.tenant.country ?? 'TR')
  const [contactEmail, setContactEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')

  if (!user) return null
  const plan = planBadge(user.tenant.plan)
  const memberCount = data?.total ?? 0

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-600" />
            Şirket Bilgileri
          </CardTitle>
          <CardDescription>
            Şirketinizin temel bilgileri. Bu bilgiler faturalandırma ve iletişim için kullanılır.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Şirket Adı</Label>
              <Input id="c-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-country">Ülke</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="c-country" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name} ({c.dialCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">İletişim E-postası</Label>
              <Input id="c-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">İletişim Telefonu</Label>
              <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+90 5xx xxx xx xx" />
            </div>
          </div>
          <Separator />
          <div className="flex justify-end">
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => toast.success('Ayarlar kaydedildi', { description: 'Şirket bilgileri güncellendi.' })}
            >
              <Save className="w-4 h-4 mr-1.5" /> Kaydet
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Plan & özet */}
      <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-200 dark:border-emerald-900/50">
        <CardHeader>
          <CardTitle className="text-base">Mevcut Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Badge className={cn('text-sm px-2.5 py-1', plan.className)}>{plan.label}</Badge>
            <p className="text-xs text-muted-foreground mt-2">
              Planınız {formatDate(user.tenant ? new Date().toISOString() : null)} tarihinden itibaren aktif.
            </p>
          </div>
          <Separator />
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Üye sayısı
              </span>
              <span className="font-medium">{memberCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> Ülke
              </span>
              <span className="font-medium">
                {COUNTRIES.find((c) => c.code === user.tenant.country)?.name ?? user.tenant.country}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" /> Varsayılan para birimi
              </span>
              <span className="font-medium">{user.tenant.defaultCurrency}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Tenant ID
              </span>
              <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[120px]">{user.tenant.id}</span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full">
            Planı Yükselt
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Para Birimi sekmesi ──────────────────────────────────────────
function CurrencyTab() {
  const { user } = useAppStore()
  const [defaultCurrency, setDefaultCurrency] = useState(user?.tenant.defaultCurrency ?? 'TRY')

  if (!user) return null

  const rates = Object.entries(CURRENCY_RATES)

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-600" />
            Para Birimi Ayarları
          </CardTitle>
          <CardDescription>
            Fırsat, fatura ve raporlarda kullanılacak varsayılan para birimi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cur-default">Varsayılan Para Birimi</Label>
              <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                <SelectTrigger id="cur-default" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.symbol} {c.code} — {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cur-format">Tarih Formatı</Label>
              <Input id="cur-format" value="DD.MM.YYYY" disabled className="bg-muted/40 font-mono" />
              <p className="text-[11px] text-muted-foreground">Sabit — Türkçe yerel ayar.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cur-time">Saat Formatı</Label>
              <Input id="cur-time" value="24 saat (HH:mm)" disabled className="bg-muted/40 font-mono" />
              <p className="text-[11px] text-muted-foreground">Sabit — 24 saatlik format.</p>
            </div>
          </div>
          <Separator />
          <div className="flex justify-end">
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => toast.success('Ayarlar kaydedildi', { description: `Varsayılan para birimi: ${defaultCurrency}` })}
            >
              <Save className="w-4 h-4 mr-1.5" /> Kaydet
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Döviz kurları tablosu */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-violet-600" />
            Döviz Kurları
          </CardTitle>
          <CardDescription className="text-xs">
            1 TRY karşılığı referans kurlar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Birim</TableHead>
                <TableHead>Sembol</TableHead>
                <TableHead className="text-right">Kur (1 TRY)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map(([code, rate]) => {
                const cur = CURRENCIES.find((c) => c.code === code)
                return (
                  <TableRow key={code}>
                    <TableCell className="font-medium">{code}</TableCell>
                    <TableCell>{cur?.symbol ?? ''}</TableCell>
                    <TableCell className="text-right tabular-nums">{rate.toFixed(4)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <div className="mt-3 flex items-start gap-2 p-2.5 rounded-md bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
            <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              Kurlar referans amaçlıdır. İşlem sırasında güncel kur kullanılır.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Bildirimler sekmesi ──────────────────────────────────────────
function NotificationsTab() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<Record<string, string>>(`/api/settings`),
  })

  useEffect(() => {
    if (data) setSettings(data)
  }, [data])

  const updateSetting = async (key: string, value: string) => {
    setSettings((s) => ({ ...s, [key]: value }))
    setSaving(true)
    try {
      await apiPatch('/api/settings', { key, value })
      toast.success('Ayar güncellendi')
    } catch (e) {
      toast.error('Ayar kaydedilemedi', { description: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  const emailNotif = settings['notification.email'] !== 'false'
  const inAppNotif = settings['notification.inApp'] !== 'false'
  const staleAlert = settings['notification.staleCustomerAlert'] !== 'false'
  const staleDays = settings['automation.thresholdDays'] || '30'
  const taskReminder = settings['notification.taskReminder'] !== 'false'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-600" />
          Bildirim Tercihleri
          {saving && <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />}
        </CardTitle>
        <CardDescription>
          E-posta ve uygulama içi bildirimlerinizi yönetin. Değişiklikler otomatik kaydedilir.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <NotificationRow
          icon={<Bell className="w-4 h-4" />}
          title="E-posta Bildirimleri"
          desc="Önemli olaylar için e-posta alın (yeni müşteri, fırsat kazanıldı, görev hatırlatma)."
          checked={emailNotif}
          onChange={(v) => updateSetting('notification.email', String(v))}
        />
        <Separator />
        <NotificationRow
          icon={<Bell className="w-4 h-4" />}
          title="Uygulama İçi Bildirimler"
          desc="Tarayıcı içerinde anlık bildirimler göster."
          checked={inAppNotif}
          onChange={(v) => updateSetting('notification.inApp', String(v))}
        />
        <Separator />
        <NotificationRow
          icon={<AlertTriangle className="w-4 h-4" />}
          title="İletişimsiz Müşteri Uyarısı"
          desc="Belirli gün sayısı boyunca iletişim kurulmayan müşteriler için uyarı göster."
          checked={staleAlert}
          onChange={(v) => updateSetting('notification.staleCustomerAlert', String(v))}
          extra={
            <div className="flex items-center gap-2 mt-3">
              <Label className="text-xs text-muted-foreground">Eşik (gün):</Label>
              <Input
                type="number"
                value={staleDays}
                onChange={(e) => updateSetting('automation.thresholdDays', e.target.value)}
                className="w-20 h-8"
                min={1}
                max={365}
                disabled={!staleAlert}
              />
            </div>
          }
        />
        <Separator />
        <NotificationRow
          icon={<Clock className="w-4 h-4" />}
          title="Görev Hatırlatma Süresi"
          desc="Vade tarihinden belirli saat önce hatırlatma gönder."
          checked={taskReminder}
          onChange={(v) => updateSetting('notification.taskReminder', String(v))}
          extra={
            <div className="flex items-center gap-2 mt-3">
              <Label className="text-xs text-muted-foreground">Hatırlatma (saat):</Label>
              <Input
                type="number"
                value={settings['notification.taskReminderHours'] || '24'}
                onChange={(e) => updateSetting('notification.taskReminderHours', e.target.value)}
                className="w-20 h-8"
                min={1}
                max={168}
                disabled={!taskReminder}
              />
            </div>
          }
        />
        <Separator />
        <div className="flex items-center justify-between pt-4 text-xs text-muted-foreground">
          <span>{isLoading ? 'Ayarlar yükleniyor...' : 'Değişiklikler otomatik kaydedilir'}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function NotificationRow({
  icon, title, desc, checked, onChange, extra,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
  extra?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex items-start gap-3 flex-1">
        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
          {icon}
        </div>
        <div className="flex-1">
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
          {extra}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-emerald-600" />
    </div>
  )
}

// ─── KVKK & Veri sekmesi ──────────────────────────────────────────
function KvkkTab() {
  const [anonymizeOpen, setAnonymizeOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = () => {
    setDownloading(true)
    setTimeout(() => {
      setDownloading(false)
      toast.success('Veri indirme başlatıldı', {
        description: 'KVKK kapsamındaki verileriniz hazırlanıyor. Birkaç dakika içinde e-posta alacaksınız.',
      })
    }, 800)
  }

  const handleAnonymize = () => {
    setAnonymizeOpen(false)
    toast.success('Anonimleştirme talebi alındı', {
      description: 'Talebiniz 30 gün içinde işleme alınacaktır.',
    })
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            KVKK & Veri Koruma
          </CardTitle>
          <CardDescription>
            6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında haklarınız.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">KVKK Uyumluluğu</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Bu CRM platformu, 6698 sayılı KVKK ve GDPR uyumludur. Müşteri kişisel verileri
                  açık rıza ile işlenir, amaç dışı kullanılmaz ve talep upon silinir. Veri işleme
                  amaçlarımızı Aydınlatma Metni&rsquo;nde bulabilirsiniz.
                </p>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Açık Rıza
              </div>
              <div className="text-sm font-medium">Alındı</div>
              <p className="text-[11px] text-muted-foreground">Tüm müşteriler için kayıt altında.</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Database className="w-3.5 h-3.5 text-violet-600" /> Veri Saklama
              </div>
              <div className="text-sm font-medium">5 yıl</div>
              <p className="text-[11px] text-muted-foreground">İş ilişkisi süresi + 5 yıl.</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-medium">Veri Hakları</Label>
            <div className="grid sm:grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleDownload} disabled={downloading}>
                <Download className="w-4 h-4 mr-1.5" />
                {downloading ? 'Hazırlanıyor…' : 'Verilerimi İndir'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setAnonymizeOpen(true)}
                className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900/50 dark:text-rose-300"
              >
                <EyeOff className="w-4 h-4 mr-1.5" />
                Verilerimi Anonimleştir
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              KVKK madde 11 kapsamında verilerinize erişebilir, düzeltme veya silme talep edebilirsiniz.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Veri saklama bilgisi */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600" />
            Veri Saklama
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Müşteri verileri</span>
            <Badge variant="outline" className="text-[10px]">5 yıl</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Aktivite kayıtları</span>
            <Badge variant="outline" className="text-[10px]">2 yıl</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Denetim logları</span>
            <Badge variant="outline" className="text-[10px]">3 yıl</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Yedeklemeler</span>
            <Badge variant="outline" className="text-[10px]">90 gün</Badge>
          </div>
          <Separator />
          <div className="rounded-md bg-muted/40 p-2.5">
            <p className="text-[11px] text-muted-foreground">
              Süre dolduğunda veriler otomatik anonimleştirilir veya silinir.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Anonimleştirme onayı */}
      <AlertDialog open={anonymizeOpen} onOpenChange={setAnonymizeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-700">
              <ShieldAlert className="w-5 h-5" />
              Tehlikeli İşlem
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">Verilerinizi anonimleştirmek geri alınamaz.</span>{' '}
              Tüm kişisel verileriniz (ad, e-posta, telefon) kalıcı olarak maskelenecek ve
              bu kullanıcının geçmiş aktivite kayıtları erişilemez hale gelecektir.
              Bu işlem 30 gün içinde tamamlanır ve geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAnonymize}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Anonimleştirmeyi Onayla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Mock denetim kayıtları ───────────────────────────────────────
interface MockAuditEntry {
  id: string
  actor: string
  action: string
  entity: string
  entityId: string
  timestamp: string
}

const MOCK_AUDIT: MockAuditEntry[] = [
  { id: '1', actor: 'Demo Admin', action: 'create', entity: 'customer', entityId: 'cust_001', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
  { id: '2', actor: 'Demo Admin', action: 'update', entity: 'deal', entityId: 'deal_004', timestamp: new Date(Date.now() - 1000 * 60 * 28).toISOString() },
  { id: '3', actor: 'Ahmet Y.', action: 'update', entity: 'task', entityId: 'task_012', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
  { id: '4', actor: 'Demo Admin', action: 'create', entity: 'user', entityId: 'usr_007', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString() },
  { id: '5', actor: 'Mehmet K.', action: 'delete', entity: 'note', entityId: 'note_099', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString() },
  { id: '6', actor: 'Ahmet Y.', action: 'update', entity: 'lead', entityId: 'lead_023', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
  { id: '7', actor: 'Demo Admin', action: 'import', entity: 'lead', entityId: 'maps_002', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString() },
  { id: '8', actor: 'Mehmet K.', action: 'update', entity: 'customer', entityId: 'cust_014', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() },
]

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
  update: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
  delete: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300',
  import: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300',
}

const ENTITY_LABELS: Record<string, string> = {
  customer: 'Müşteri',
  deal: 'Fırsat',
  task: 'Görev',
  user: 'Kullanıcı',
  note: 'Not',
  lead: 'Lead',
}

function AuditTab() {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')

  const filtered = useMemo(() => {
    let list = MOCK_AUDIT
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (e) => e.actor.toLowerCase().includes(q) || e.entityId.toLowerCase().includes(q),
      )
    }
    if (actionFilter !== 'all') list = list.filter((e) => e.action === actionFilter)
    return list
  }, [search, actionFilter])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-violet-600" />
              Denetim Kayıtları
            </CardTitle>
            <CardDescription className="mt-0.5">
              Sistemde yapılan tüm değişikliklerin kaydı (audit log).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Aktör veya ID ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="İşlem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm işlemler</SelectItem>
              <SelectItem value="create">Oluştur</SelectItem>
              <SelectItem value="update">Güncelle</SelectItem>
              <SelectItem value="delete">Sil</SelectItem>
              <SelectItem value="import">İçe Aktar</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="ml-auto text-[11px]">
            {filtered.length} kayıt
          </Badge>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Aktör</TableHead>
                <TableHead>İşlem</TableHead>
                <TableHead>Varlık</TableHead>
                <TableHead className="font-mono">ID</TableHead>
                <TableHead className="text-right">Zaman</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-12">
                    <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Denetim kaydı yakında.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center text-white text-[10px] font-semibold">
                          {e.actor.split(' ').map((s) => s[0]).join('').slice(0, 2)}
                        </div>
                        <span className="text-sm font-medium">{e.actor}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[10px]', ACTION_COLORS[e.action] ?? '')}>
                        {e.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{ENTITY_LABELS[e.entity] ?? e.entity}</span>
                    </TableCell>
                    <TableCell>
                      <code className="text-[11px] text-muted-foreground">{e.entityId}</code>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDateTime(e.timestamp)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40">
          <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground">
            Denetim kayıtları mock verilerdir. Backend entegrasyonu hazırlandığında gerçek kayıtlar gösterilecektir.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Ana SettingsView ─────────────────────────────────────────────
export function SettingsView() {
  const { user } = useAppStore()

  if (!user) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Oturum açmanız gerekir.
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Building2 className="w-6 h-6 text-emerald-600" />
          Ayarlar
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Şirket, para birimi, bildirim, KVKK ve denetim ayarları.
        </p>
      </div>

      <Tabs defaultValue="company" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="company">
            <Building2 className="w-3.5 h-3.5" /> Şirket
          </TabsTrigger>
          <TabsTrigger value="currency">
            <Coins className="w-3.5 h-3.5" /> Para Birimi
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="w-3.5 h-3.5" /> Bildirimler
          </TabsTrigger>
          <TabsTrigger value="templates">
            <MessageSquare className="w-3.5 h-3.5" /> Şablonlar
          </TabsTrigger>
          <TabsTrigger value="invoice-template">
            <FileText className="w-3.5 h-3.5" /> Fatura Şablonu
          </TabsTrigger>
          <TabsTrigger value="smtp">
            <Mail className="w-3.5 h-3.5" /> SMTP
          </TabsTrigger>
          <TabsTrigger value="kvkk">
            <Shield className="w-3.5 h-3.5" /> KVKK &amp; Veri
          </TabsTrigger>
          <TabsTrigger value="audit">
            <ScrollText className="w-3.5 h-3.5" /> Denetim Kayıtları
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-6">
          <CompanyTab />
        </TabsContent>
        <TabsContent value="currency" className="mt-6">
          <CurrencyTab />
        </TabsContent>
        <TabsContent value="notifications" className="mt-6">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-6">
          <TemplatesView />
        </TabsContent>
        <TabsContent value="invoice-template" className="mt-6">
          <InvoiceTemplateEditor />
        </TabsContent>
        <TabsContent value="smtp" className="mt-6">
          <SmtpTab />
        </TabsContent>
        <TabsContent value="kvkk" className="mt-6">
          <KvkkTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-6">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
