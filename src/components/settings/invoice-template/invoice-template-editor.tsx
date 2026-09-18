'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Image as ImageIcon, Palette, FileText, Building2, Save, Loader2,
  Eye, RefreshCw, Upload, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface InvoiceTemplateData {
  id: string
  logoUrl: string | null
  logoPosition: string
  primaryColor: string
  accentColor: string
  textColor: string
  fontFamily: string
  fontSize: number
  headerText: string | null
  footerText: string | null
  companyName: string | null
  companyAddress: string | null
  companyPhone: string | null
  companyEmail: string | null
  companyWeb: string | null
  taxNumber: string | null
  taxOffice: string | null
  showBankInfo: boolean
  bankInfo: { bankName: string; iban: string; accountHolder: string }[] | null
  showSignature: boolean
  signatureText: string | null
  pageSize: string
  marginMm: number
  notes: string | null
}

export function InvoiceTemplateEditor() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['invoice-template'],
    queryFn: () => apiGet<InvoiceTemplateData>('/api/settings/invoice-template'),
  })

  const [form, setForm] = useState<InvoiceTemplateData | null>(null)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const mutation = useMutation({
    mutationFn: async (payload: Partial<InvoiceTemplateData>) => {
      // apiPatch için /api/settings/invoice-template PUT
      const res = await fetch('/api/settings/invoice-template', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-gnc-session': useAppStore.getState().sessionId || '',
        },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Kayıt başarısız')
      return result
    },
    onSuccess: () => {
      toast.success('Fatura şablonu kaydedildi', {
        description: 'Tüm yeni faturalar/irsaliyeler/çeki listeleri bu şablonu kullanır',
      })
      qc.invalidateQueries({ queryKey: ['invoice-template'] })
    },
    onError: (e: Error) => toast.error('Kayıt başarısız', { description: e.message }),
  })

  function handleSave() {
    if (!form) return
    // bankInfo'yu düzelt
    const payload = { ...form, bankInfo: form.bankInfo ?? [] }
    mutation.mutate(payload)
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500_000) {
      toast.error('Logo çok büyük', { description: 'Maksimum 500KB olmalı' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setForm((f) => f ? { ...f, logoUrl: base64 } : f)
      toast.success('Logo yüklendi', { description: '"Kaydet" ile sabitleyin' })
    }
    reader.readAsDataURL(file)
  }

  if (isLoading || !form) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Sol: Form */}
      <div className="space-y-4">
        {/* Logo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ImageIcon className="w-4 h-4 text-emerald-600" />
              Şirket Logosu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {form.logoUrl ? (
              <div className="flex items-center gap-3">
                <img src={form.logoUrl} alt="Logo" className="w-20 h-20 object-contain border rounded-lg" />
                <Button size="sm" variant="outline" onClick={() => setForm({ ...form, logoUrl: null })}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Kaldır
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-accent/50 transition-colors">
                <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                <span className="text-xs text-muted-foreground">Logo yükle (PNG/JPG, max 500KB)</span>
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoUpload} />
              </label>
            )}
            <div>
              <Label className="text-xs">Logo Konumu</Label>
              <Select value={form.logoPosition} onValueChange={(v) => setForm({ ...form, logoPosition: v })}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="top-left">Sol Üst</SelectItem>
                  <SelectItem value="top-right">Sağ Üst</SelectItem>
                  <SelectItem value="top-center">Üst Orta</SelectItem>
                  <SelectItem value="none">Logo Yok</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Renkler */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Palette className="w-4 h-4 text-emerald-600" />
              Renkler
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ColorPicker label="Ana Renk (başlık, vurgular)" value={form.primaryColor} onChange={(v) => setForm({ ...form, primaryColor: v })} />
            <ColorPicker label="İkincil Renk (tablo başlık)" value={form.accentColor} onChange={(v) => setForm({ ...form, accentColor: v })} />
            <ColorPicker label="Metin Rengi" value={form.textColor} onChange={(v) => setForm({ ...form, textColor: v })} />
            <div>
              <Label className="text-xs">Font</Label>
              <Select value={form.fontFamily} onValueChange={(v) => setForm({ ...form, fontFamily: v })}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                  <SelectItem value="'Times New Roman', serif">Times New Roman</SelectItem>
                  <SelectItem value="'Courier New', monospace">Courier New</SelectItem>
                  <SelectItem value="Georgia, serif">Georgia</SelectItem>
                  <SelectItem value="'Trebuchet MS', sans-serif">Trebuchet MS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Font Boyutu: {form.fontSize}px</Label>
              <input
                type="range" min={9} max={16} value={form.fontSize}
                onChange={(e) => setForm({ ...form, fontSize: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>

        {/* Şirket Bilgileri */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-emerald-600" />
              Şirket Bilgileri (footer'da görünür)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Field label="Şirket Adı" value={form.companyName || ''} onChange={(v) => setForm({ ...form, companyName: v })} placeholder="Anadolu Satış A.Ş." />
            <Field label="Adres" value={form.companyAddress || ''} onChange={(v) => setForm({ ...form, companyAddress: v })} placeholder="Merkez Mah. İş Cad. No:1 İstanbul" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Telefon" value={form.companyPhone || ''} onChange={(v) => setForm({ ...form, companyPhone: v })} placeholder="+90 212 123 45 67" />
              <Field label="E-posta" value={form.companyEmail || ''} onChange={(v) => setForm({ ...form, companyEmail: v })} placeholder="info@sirket.com" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Web" value={form.companyWeb || ''} onChange={(v) => setForm({ ...form, companyWeb: v })} placeholder="www.sirket.com" />
              <Field label="VKN/TCKN" value={form.taxNumber || ''} onChange={(v) => setForm({ ...form, taxNumber: v })} placeholder="1234567890" />
            </div>
            <Field label="Vergi Dairesi" value={form.taxOffice || ''} onChange={(v) => setForm({ ...form, taxOffice: v })} placeholder="Mecidiyeköy V.D." />
          </CardContent>
        </Card>

        {/* İçerik */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-emerald-600" />
              Metinler
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <Label className="text-xs">Üst Bilgi Notu</Label>
              <Textarea
                value={form.headerText || ''}
                onChange={(e) => setForm({ ...form, headerText: e.target.value })}
                placeholder="Bu fatura elektronik olarak düzenlenmiştir"
                rows={2}
                className="text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Alt Bilgi Notu</Label>
              <Textarea
                value={form.footerText || ''}
                onChange={(e) => setForm({ ...form, footerText: e.target.value })}
                placeholder="Ödeme 30 gün içinde yapılmalıdır. Geç ödemeler için faiz işletilir."
                rows={2}
                className="text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Banka Bilgileri */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Banka Bilgileri</CardTitle>
              <Switch
                checked={form.showBankInfo}
                onCheckedChange={(v) => setForm({ ...form, showBankInfo: v })}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {form.showBankInfo && (form.bankInfo ?? []).map((bank, i) => (
              <div key={i} className="border rounded-lg p-2 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px]">Banka {i + 1}</Badge>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => {
                      const newBanks = (form.bankInfo ?? []).filter((_, idx) => idx !== i)
                      setForm({ ...form, bankInfo: newBanks })
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <Field label="Banka Adı" value={bank.bankName} onChange={(v) => {
                  const newBanks = [...(form.bankInfo ?? [])]
                  newBanks[i] = { ...newBanks[i], bankName: v }
                  setForm({ ...form, bankInfo: newBanks })
                }} placeholder="İş Bankası" />
                <Field label="IBAN" value={bank.iban} onChange={(v) => {
                  const newBanks = [...(form.bankInfo ?? [])]
                  newBanks[i] = { ...newBanks[i], iban: v }
                  setForm({ ...form, bankInfo: newBanks })
                }} placeholder="TR12 0001 0002 0003 0004 0005 06" mono />
                <Field label="Hesap Sahibi" value={bank.accountHolder} onChange={(v) => {
                  const newBanks = [...(form.bankInfo ?? [])]
                  newBanks[i] = { ...newBanks[i], accountHolder: v }
                  setForm({ ...form, bankInfo: newBanks })
                }} placeholder="Anadolu Satış A.Ş." />
              </div>
            ))}
            {form.showBankInfo && (
              <Button
                size="sm" variant="outline" className="w-full text-xs"
                onClick={() => setForm({
                  ...form,
                  bankInfo: [...(form.bankInfo ?? []), { bankName: '', iban: '', accountHolder: '' }],
                })}
              >
                + Banka Ekle
              </Button>
            )}
          </CardContent>
        </Card>

        {/* İmza */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">İmza Alanı</CardTitle>
              <Switch
                checked={form.showSignature}
                onCheckedChange={(v) => setForm({ ...form, showSignature: v })}
              />
            </div>
          </CardHeader>
          <CardContent>
            {form.showSignature && (
              <Field
                label="İmza Etiketi"
                value={form.signatureText || ''}
                onChange={(v) => setForm({ ...form, signatureText: v })}
                placeholder="Yetkili İmza"
              />
            )}
          </CardContent>
        </Card>

        {/* Sayfa */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Sayfa Ayarları</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div>
              <Label className="text-xs">Sayfa Boyutu</Label>
              <Select value={form.pageSize} onValueChange={(v) => setForm({ ...form, pageSize: v })}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4 (210×297mm)</SelectItem>
                  <SelectItem value="Letter">Letter (216×279mm)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Kenar Boşluğu: {form.marginMm}mm</Label>
              <input
                type="range" min={5} max={30} value={form.marginMm}
                onChange={(e) => setForm({ ...form, marginMm: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2 sticky bottom-0 bg-background/95 backdrop-blur py-2 -mx-2 px-2 border-t">
          <Button onClick={handleSave} disabled={mutation.isPending} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            {mutation.isPending ? 'Kaydediliyor...' : 'Şablonu Kaydet'}
          </Button>
          <Button variant="outline" onClick={() => data && setForm(data)}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Sıfırla
          </Button>
        </div>
      </div>

      {/* Sağ: Canlı Önizleme */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2 bg-muted/30">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Eye className="w-4 h-4 text-emerald-600" />
              Canlı Önizleme
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div
              className="a4-page print-content"
              style={{
                padding: `${form.marginMm}mm`,
                fontFamily: form.fontFamily,
                fontSize: form.fontSize,
                color: form.textColor,
                background: 'white',
                width: '210mm',
                minHeight: '297mm',
                margin: '0 auto',
              }}
            >
              {/* Header — logo + başlık */}
              <div className="flex items-start justify-between mb-6 pb-4 border-b-2" style={{ borderColor: form.primaryColor }}>
                <div>
                  {form.logoUrl && form.logoPosition !== 'none' && form.logoPosition !== 'top-right' && form.logoPosition !== 'top-center' && (
                    <img src={form.logoUrl} alt="Logo" className="h-16 object-contain mb-2" />
                  )}
                  <div style={{ color: form.primaryColor }} className="font-bold text-xl">{form.companyName || 'Şirket Adınız'}</div>
                  {form.headerText && <div className="text-xs text-gray-500 mt-1">{form.headerText}</div>}
                </div>
                <div className="text-right">
                  <div style={{ color: form.accentColor }} className="text-2xl font-bold">FATURA</div>
                  <div className="text-xs text-gray-600 mt-1 font-mono">FAT-2026-001</div>
                  <div className="text-xs text-gray-500">Tarih: 15.09.2026</div>
                </div>
              </div>

              {/* Müşteri */}
              <div className="mb-4">
                <div className="text-xs text-gray-500 mb-1">Sayın</div>
                <div className="font-semibold">Müşteri Adı Soyadı</div>
              </div>

              {/* Tablo */}
              <table className="w-full text-sm mb-4" style={{ fontSize: form.fontSize }}>
                <thead>
                  <tr style={{ background: form.accentColor, color: 'white' }}>
                    <th className="text-left py-2 px-3">Açıklama</th>
                    <th className="text-right py-2 px-3">Miktar</th>
                    <th className="text-right py-2 px-3">Birim Fiyat</th>
                    <th className="text-right py-2 px-3">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-3">Örnek Ürün — Kırmızı, 25 kg</td>
                    <td className="text-right py-2 px-3">2</td>
                    <td className="text-right py-2 px-3">₺500,00</td>
                    <td className="text-right py-2 px-3 font-medium">₺1.000,00</td>
                  </tr>
                </tbody>
              </table>

              {/* Toplam */}
              <div className="ml-auto w-full max-w-xs space-y-1 mb-6">
                <div className="flex justify-between text-sm">
                  <span>Ara Toplam:</span><span className="tabular-nums">₺1.000,00</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>KDV:</span><span className="tabular-nums">₺200,00</span>
                </div>
                <div className="flex justify-between font-bold pt-2 border-t-2" style={{ borderColor: form.primaryColor }}>
                  <span>Genel Toplam:</span>
                  <span className="tabular-nums" style={{ color: form.primaryColor }}>₺1.200,00</span>
                </div>
              </div>

              {/* Footer — şirket bilgileri */}
              <div className="mt-8 pt-4 border-t" style={{ borderColor: form.accentColor }}>
                {form.footerText && (
                  <p className="text-xs text-gray-600 text-center mb-3">{form.footerText}</p>
                )}
                <div className="text-[10px] text-gray-500 grid grid-cols-2 gap-2">
                  <div>
                    {form.companyName && <div className="font-semibold">{form.companyName}</div>}
                    {form.companyAddress && <div>{form.companyAddress}</div>}
                    {form.companyPhone && <div>Tel: {form.companyPhone}</div>}
                  </div>
                  <div className="text-right">
                    {form.companyEmail && <div>{form.companyEmail}</div>}
                    {form.companyWeb && <div>{form.companyWeb}</div>}
                    {form.taxOffice && form.taxNumber && (
                      <div>{form.taxOffice} VKN: {form.taxNumber}</div>
                    )}
                  </div>
                </div>
                {form.showBankInfo && (form.bankInfo ?? []).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 text-[10px]">
                    <div className="font-semibold mb-1">Banka Bilgileri:</div>
                    {(form.bankInfo ?? []).map((b, i) => (
                      <div key={i} className="flex justify-between">
                        <span>{b.bankName || 'Banka'}:</span>
                        <span className="font-mono">{b.iban || 'IBAN'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {form.showSignature && (
                  <div className="mt-4 text-right text-[10px]">
                    <div className="border-t border-gray-400 inline-block pt-1 px-8">
                      {form.signatureText || 'Yetkili İmza'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer border"
      />
      <div className="flex-1">
        <Label className="text-xs">{label}</Label>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
        />
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, mono }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn('text-xs', mono && 'font-mono')}
      />
    </div>
  )
}

// useAppStore import — lazy
import { useAppStore } from '@/store/app-store'
