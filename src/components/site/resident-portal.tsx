'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/format'
import { Home, CheckCircle2, Megaphone, AlertTriangle, LogOut, Plus } from 'lucide-react'

const SESSION_KEY = 'gnc_resident_session'
const RESIDENT_KEY = 'gnc_resident_info'

const COMPLAINT_CATEGORIES = [
  { value: 'su', label: 'Su Tesisatı' },
  { value: 'elektrik', label: 'Elektrik' },
  { value: 'asansor', label: 'Asansör' },
  { value: 'guvenlik', label: 'Güvenlik' },
  { value: 'temizlik', label: 'Temizlik' },
  { value: 'gurultu', label: 'Gürültü' },
  { value: 'park', label: 'Otopark' },
  { value: 'diger', label: 'Diğer' },
] as const

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export function ResidentPortal() {
  // P4: Oturum sessionStorage'da tutulur — sayfa yenilenince düşmez,
  // sekme kapatılınca temizlenir (güvenlik + kullanışlılık dengesi).
  const [session, setSession] = useState<string | null>(null)
  const [resident, setResident] = useState<{ name: string; phone: string; apartment: any } | null>(null)
  const [loginForm, setLoginForm] = useState({ phone: '', password: '' })
  const [loggingIn, setLoggingIn] = useState(false)

  useEffect(() => {
    const s = sessionStorage.getItem(SESSION_KEY)
    const r = sessionStorage.getItem(RESIDENT_KEY)
    if (s && r) {
      try {
        setSession(s)
        setResident(JSON.parse(r))
      } catch {
        sessionStorage.removeItem(SESSION_KEY)
        sessionStorage.removeItem(RESIDENT_KEY)
      }
    }
  }, [])

  const handleLogin = async () => {
    setLoggingIn(true)
    try {
      const res = await apiPost<{ sessionId: string; resident: any }>('/api/resident-auth', loginForm, { skipAuthHandling: true })
      setSession(res.sessionId)
      setResident(res.resident)
      sessionStorage.setItem(SESSION_KEY, res.sessionId)
      sessionStorage.setItem(RESIDENT_KEY, JSON.stringify(res.resident))
      toast.success(`Hoş geldiniz, ${res.resident.name}`)
    } catch (e: any) {
      toast.error(e.message || 'Giriş başarısız')
    } finally {
      setLoggingIn(false)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(RESIDENT_KEY)
    setSession(null)
    setResident(null)
    toast.success('Çıkış yapıldı')
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
              <p className="text-sm text-muted-foreground mt-1">Aidat, duyuru ve şikayetlerinizi görüntüleyin</p>
            </div>
            <div className="space-y-3">
              <div><Label className="text-xs">Telefon</Label><Input value={loginForm.phone} onChange={e => setLoginForm({ ...loginForm, phone: e.target.value })} placeholder="+90 5xx xxx xx xx" /></div>
              <div><Label className="text-xs">Şifre</Label><Input type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="••••" onKeyDown={e => e.key === 'Enter' && handleLogin()} /></div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleLogin} disabled={loggingIn || !loginForm.phone || !loginForm.password}>
                {loggingIn ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                Şifrenizi yöneticiden alabilirsiniz · Sakin bilgisi olmayan daireler için yönetimle iletişime geçin
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <ResidentDashboard session={session} resident={resident} onLogout={handleLogout} />
}

function ResidentDashboard({ session, resident, onLogout }: { session: string; resident: any; onLogout: () => void }) {
  const qc = useQueryClient()
  const headers = { 'x-resident-session': session }
  const [complaintOpen, setComplaintOpen] = useState(false)
  const [complaintForm, setComplaintForm] = useState({ title: '', description: '', category: 'diger' })
  const [submitting, setSubmitting] = useState(false)

  const { data: duesData } = useQuery({
    queryKey: ['resident-dues', session],
    queryFn: () => apiGet<{ items: any[]; stats: { totalDebt: number; totalPaid: number } }>('/api/resident-portal/dues', { headers, skipAuthHandling: true }),
  })

  const { data: announcements = [] } = useQuery({
    queryKey: ['resident-announcements', session],
    queryFn: () => apiGet<any[]>('/api/resident-portal/announcements', { headers, skipAuthHandling: true }),
  })

  const { data: complaints = [] } = useQuery({
    queryKey: ['resident-complaints', session],
    queryFn: () => apiGet<any[]>('/api/resident-portal/complaints', { headers, skipAuthHandling: true }),
  })

  const dues = duesData?.items ?? []
  const totalDebt = duesData?.stats?.totalDebt ?? 0

  const submitComplaint = async () => {
    if (!complaintForm.title.trim() || !complaintForm.description.trim()) {
      toast.error('Başlık ve açıklama gerekli')
      return
    }
    setSubmitting(true)
    try {
      await apiPost('/api/resident-portal/complaints', complaintForm, { headers, skipAuthHandling: true })
      qc.invalidateQueries({ queryKey: ['resident-complaints', session] })
      setComplaintOpen(false)
      setComplaintForm({ title: '', description: '', category: 'diger' })
      toast.success('Şikayetiniz iletildi — yönetim en kısa sürede inceleyecek')
    } catch (e: any) {
      toast.error(e.message || 'Şikayet gönderilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Merhaba, {resident.name} 👋</h2>
          <p className="text-sm text-muted-foreground">
            {resident.apartment ? `${resident.apartment.block} ${resident.apartment.number}` : 'Daire bilgisi yok'} · {resident.apartment?.site?.name}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onLogout}>
          <LogOut className="w-4 h-4 mr-1" /> Çıkış
        </Button>
      </div>

      {/* Borç durumu — gecikme zammı dahil (P2) */}
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
            {totalDebt > 0 && (
              <p className="text-[11px] text-muted-foreground mt-0.5">Gecikmiş aidatlar gecikme zammı dahildir</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="dues">
        <TabsList>
          <TabsTrigger value="dues" className="text-xs">Aidatlarım</TabsTrigger>
          <TabsTrigger value="announcements" className="text-xs">Duyurular</TabsTrigger>
          <TabsTrigger value="complaints" className="text-xs">Şikayetlerim</TabsTrigger>
        </TabsList>

        {/* Aidatlar — gecikme zammı satırı gösterilir */}
        <TabsContent value="dues" className="mt-4 space-y-2">
          {dues.length === 0 ? (
            <Card><CardContent className="py-8 text-center"><p className="text-sm text-muted-foreground">Aidat kaydı yok</p></CardContent></Card>
          ) : (
            dues.map((d: any) => (
              <Card key={d.id}><CardContent className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{MONTHS_TR[(d.month - 1 + 12) % 12] ?? d.month}/{d.year} Aidatı</div>
                  <div className="text-xs text-muted-foreground">Son tarih: {formatDate(d.dueDate)}</div>
                  {d.status === 'gecikti' && (d.lateFee ?? 0) > 0 && (
                    <div className="text-[11px] text-red-600 mt-0.5">
                      + {formatCurrency(d.lateFee, d.currency)} gecikme zammı
                      {(d.paidAmount ?? 0) > 0 && ` · ${formatCurrency(d.paidAmount, d.currency)} ödenmiş`}
                    </div>
                  )}
                  {d.status === 'odenmedi' && (d.paidAmount ?? 0) > 0 && (
                    <div className="text-[11px] text-amber-600 mt-0.5">{formatCurrency(d.paidAmount, d.currency)} kısmi öme yapıldı</div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(
                      d.status === 'odendi'
                        ? (d.paidAmount || d.amount)
                        : d.amount + (d.lateFee || 0) - (d.paidAmount || 0),
                      d.currency,
                    )}
                  </span>
                  <Badge variant="outline" className={cn('text-[10px]',
                    d.status === 'odendi' ? 'text-emerald-600 bg-emerald-50'
                      : d.status === 'gecikti' ? 'text-red-600 bg-red-50'
                      : 'text-amber-600 bg-amber-50')}>
                    {d.status === 'odendi' ? 'Ödendi' : d.status === 'gecikti' ? 'Gecikti' : 'Ödenmedi'}
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
                  {a.isPinned && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">📌 Sabit</Badge>}
                  <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                  <span className="font-medium text-sm">{a.title}</span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>
                <div className="text-xs text-muted-foreground mt-1">{formatDate(a.publishDate)}</div>
              </CardContent></Card>
            ))
          )}
        </TabsContent>

        {/* Şikayetler — sakin artık kendisi şikayet açabilir (P3) */}
        <TabsContent value="complaints" className="mt-4 space-y-2">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setComplaintOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Yeni Şikayet
            </Button>
          </div>
          {complaints.length === 0 ? (
            <Card><CardContent className="py-8 text-center"><AlertTriangle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">Henüz şikayetiniz yok</p></CardContent></Card>
          ) : (
            complaints.map((c: any) => (
              <Card key={c.id}><CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={cn('text-[10px]',
                    c.status === 'cozuldu' ? 'text-emerald-600 bg-emerald-50'
                      : c.status === 'inceleniyor' ? 'text-sky-600 bg-sky-50'
                      : c.status === 'reddedildi' ? 'text-gray-600 bg-gray-50'
                      : 'text-amber-600 bg-amber-50')}>
                    {c.status === 'acik' ? 'Açık' : c.status === 'inceleniyor' ? 'İnceleniyor' : c.status === 'cozuldu' ? 'Çözüldü' : c.status === 'reddedildi' ? 'Reddedildi' : c.status}
                  </Badge>
                  <span className="font-medium text-sm">{c.title}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{formatDate(c.createdAt)}</span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{c.description}</p>
                {c.response && <div className="mt-2 p-2 rounded-lg bg-muted/30 text-xs"><strong>Yönetim cevabı:</strong> {c.response}</div>}
              </CardContent></Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Yeni şikayet diyaloğu */}
      <Dialog open={complaintOpen} onOpenChange={setComplaintOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Şikayet</DialogTitle>
            <DialogDescription>Şikayetiniz site yönetimine iletilir; durumunu bu sayfadan takip edebilirsiniz.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Konu</Label>
              <Input
                value={complaintForm.title}
                onChange={(e) => setComplaintForm({ ...complaintForm, title: e.target.value })}
                placeholder="Örn: Asansör tuşu arızalı"
                maxLength={200}
              />
            </div>
            <div>
              <Label className="text-xs">Kategori</Label>
              <Select value={complaintForm.category} onValueChange={(v) => setComplaintForm({ ...complaintForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMPLAINT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Açıklama</Label>
              <Textarea
                value={complaintForm.description}
                onChange={(e) => setComplaintForm({ ...complaintForm, description: e.target.value })}
                placeholder="Sorunu detaylı açıklayın..."
                rows={4}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComplaintOpen(false)}>İptal</Button>
            <Button onClick={submitComplaint} disabled={submitting || !complaintForm.title.trim() || !complaintForm.description.trim()}>
              {submitting ? 'Gönderiliyor...' : 'Gönder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
