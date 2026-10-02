'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, KeyRound, ExternalLink, Info, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react'
import { apiPost } from '@/lib/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { PlatformKey } from '@/lib/social/platforms'
import { PLATFORMS } from '@/lib/social/platforms'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  platform: PlatformKey
}

interface FieldDef {
  key: string
  label: string
  placeholder: string
  type: 'text' | 'password' | 'textarea'
  required: boolean
  help?: string
}

// Platform'a göre form alanları
const PLATFORM_FIELDS: Record<PlatformKey, FieldDef[]> = {
  twitter: [
    { key: 'accessToken', label: 'Access Token (OAuth 2.0 PKCE)', placeholder: 'bF9xQ...token', type: 'password', required: true, help: 'Twitter Developer Portal → App → OAuth 2.0 PKCE → User token' },
  ],
  facebook: [
    { key: 'accessToken', label: 'User Access Token', placeholder: 'EAAG...', type: 'password', required: true, help: 'Graph API Explorer ile alın (pages_manage_posts yetkisi gerekir)' },
  ],
  instagram: [
    { key: 'accessToken', label: 'Facebook User Access Token', placeholder: 'EAAG...', type: 'password', required: true, help: 'IG Business hesabı için FB token (instagram_content_publish yetkisi)' },
  ],
  linkedin: [
    { key: 'accessToken', label: 'Access Token (OAuth 2.0)', placeholder: 'AQXW...', type: 'password', required: true, help: 'LinkedIn Developer → App → w_member_social yetkisi' },
  ],
  telegram: [
    { key: 'apiSecret', label: 'Bot Token', placeholder: '7812345678:AAH...your-bot-token', type: 'password', required: true, help: '@BotFather ile /newbot komutu ile alın' },
    { key: 'handle', label: 'Kanal @username', placeholder: '@benimkanalim', type: 'text', required: true, help: 'Bot\'u kanala admin olarak ekleyin' },
  ],
  reddit: [
    { key: 'apiKey', label: 'Client ID', placeholder: 'your-app-client-id', type: 'text', required: true, help: 'reddit.com/prefs/apps → script app' },
    { key: 'apiSecret', label: 'Client Secret', placeholder: 'your-app-secret', type: 'password', required: true },
    { key: 'accessToken', label: 'Access Token', placeholder: 'bearer token', type: 'password', required: true, help: 'OAuth ile alın' },
    { key: 'username', label: 'Subreddit', placeholder: 'gncCRM (r/ öneksiz)', type: 'text', required: true },
  ],
  bluesky: [
    { key: 'apiKey', label: 'Bluesky Handle', placeholder: 'kullanici.bsky.social', type: 'text', required: true, help: 'Kullanıcı adınız (handle)' },
    { key: 'apiSecret', label: 'App Password', placeholder: 'app password (şifre değil!)', type: 'password', required: true, help: 'bsky.app/settings/app-passwords → yeni şifre oluştur' },
  ],
  // Henüz gerçek API yok — mock kullan
  youtube: [
    { key: 'accessToken', label: 'OAuth 2.0 Access Token (Google)', placeholder: 'ya29...', type: 'password', required: true, help: 'Google Cloud Console → YouTube Data API v3 → youtube.upload yetkisi' },
  ],
  tiktok: [
    { key: 'accessToken', label: 'Access Token', placeholder: 'tiktok-access-token', type: 'password', required: true, help: 'TikTok for Developers → Login Kit + Content Posting API' },
  ],
  whatsapp: [
    { key: 'apiKey', label: 'Phone Number ID', placeholder: 'phone-number-id', type: 'text', required: true, help: 'WhatsApp Business API — Meta Business Suite' },
    { key: 'apiSecret', label: 'Access Token', placeholder: 'EAAG...', type: 'password', required: true },
  ],
  pinterest: [
    { key: 'accessToken', label: 'Pinterest Access Token', placeholder: 'pinr-access-token', type: 'password', required: true, help: 'developers.pinterest.com → app → boards:write yetkisi' },
  ],
}

// Platform için yardım/doküman linki
const PLATFORM_HELP_LINK: Partial<Record<PlatformKey, { label: string; url: string }>> = {
  twitter: { label: 'Twitter Developer Portal', url: 'https://developer.twitter.com/' },
  facebook: { label: 'Facebook Developers', url: 'https://developers.facebook.com/tools/explorer/' },
  instagram: { label: 'Instagram API docs', url: 'https://developers.facebook.com/docs/instagram-api' },
  linkedin: { label: 'LinkedIn Developers', url: 'https://www.linkedin.com/developers/apps' },
  telegram: { label: 'Talk to BotFather', url: 'https://t.me/BotFather' },
  reddit: { label: 'Reddit Apps', url: 'https://www.reddit.com/prefs/apps' },
  bluesky: { label: 'Bluesky App Passwords', url: 'https://bsky.app/settings/app-passwords' },
  youtube: { label: 'Google Cloud Console', url: 'https://console.cloud.google.com/' },
  tiktok: { label: 'TikTok for Developers', url: 'https://developers.tiktok.com/' },
  whatsapp: { label: 'WhatsApp Business API', url: 'https://www.facebook.com/business/whatsapp' },
  pinterest: { label: 'Pinterest Developers', url: 'https://developers.pinterest.com/' },
}

export function AccountCredentialsDialog({ open, onOpenChange, platform }: Props) {
  const qc = useQueryClient()
  const def = PLATFORMS[platform]
  const fields = PLATFORM_FIELDS[platform] ?? []
  const helpLink = PLATFORM_HELP_LINK[platform]
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setValues({})
    setSubmitting(false)
  }

  async function handleSubmit() {
    // Required fields kontrolü
    const missing = fields.filter((f) => f.required && !values[f.key]?.trim())
    if (missing.length > 0) {
      toast.error(`${missing[0].label} gerekli`)
      return
    }

    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        platform,
        authMethod: 'manual_token',
        verify: true, // Verify et — gerçek hesap mı?
      }
      for (const f of fields) {
        if (values[f.key]) payload[f.key] = values[f.key]
      }
      // Default handle — kullanıcı adını kullan
      if (!payload.handle && !payload.username) {
        payload.handle = values.handle || values.username || values.apiKey || `connected-${platform}`
        payload.displayName = values.handle || values.username || values.apiKey
      } else if (payload.username) {
        payload.handle = String(payload.username)
      }

      const res = await apiPost<{ id: string; handle: string; hasAccessToken: boolean }>(
        '/api/social/accounts',
        payload,
      )

      toast.success('Hesap bağlandı!', {
        description: `${def.label} → ${res.handle}`,
      })

      qc.invalidateQueries({ queryKey: ['social-accounts'] })
      reset()
      onOpenChange(false)
    } catch (e) {
      toast.error('Bağlantı başarısız', {
        description: e instanceof Error ? e.message : 'Bilinmeyen hata',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center ${def.gradient}`}>
              <span className="text-white text-sm font-bold">{def.emoji}</span>
            </div>
            {def.label} — Gerçek Hesap Bağla
          </DialogTitle>
          <DialogDescription>
            Kendi API anahtarınızı girin. Token'ınız şifrelenmiş şekilde saklanır ve gerçek {def.label} hesabınıza yayın yapılır.
          </DialogDescription>
        </DialogHeader>

        {/* Help banner */}
        <Alert className="border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20">
          <Info className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-xs">
            <div className="font-medium text-blue-900 dark:text-blue-200 mb-1">API Anahtarı Nasıl Alınır?</div>
            {helpLink ? (
              <a href={helpLink.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300 hover:underline">
                {helpLink.label} <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span>Bu platform için gerçek API henüz desteklenmiyor — yalnızca mock publisher çalışır.</span>
            )}
          </AlertDescription>
        </Alert>

        {/* Form fields */}
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key} className="text-xs font-medium flex items-center gap-1">
                {field.label}
                {field.required && <span className="text-red-500">*</span>}
              </Label>
              {field.type === 'textarea' ? (
                <Textarea
                  id={field.key}
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  rows={3}
                  className="text-xs font-mono"
                />
              ) : (
                <Input
                  id={field.key}
                  type={field.type === 'password' ? 'password' : 'text'}
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  className="text-xs font-mono"
                />
              )}
              {field.help && (
                <p className="text-[10px] text-muted-foreground leading-tight">{field.help}</p>
              )}
            </div>
          ))}

          {fields.length === 0 && (
            <Alert className="border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <AlertDescription className="text-xs">
                Bu platform için gerçek API entegrasyonu henüz eklenmedi. Şu anda yalnızca <strong>mock publisher</strong> ile test edebilirsiniz.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Required permissions */}
        <div className="rounded-lg bg-muted/30 p-3 border border-border">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
            <KeyRound className="w-3 h-3" /> Gereken İzinler
          </div>
          <div className="flex flex-wrap gap-1">
            {PERMISSIONS[platform]?.map((p) => (
              <Badge key={p} variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono">
                {p}
              </Badge>
            )) || <span className="text-xs text-muted-foreground">Bilinmiyor</span>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            İptal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || fields.length === 0}>
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
            {submitting ? 'Bağlanıyor...' : 'Bağla ve Doğrula'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Her platform için gerekli izinler
const PERMISSIONS: Partial<Record<PlatformKey, string[]>> = {
  twitter: ['tweet.read', 'tweet.write', 'users.read', 'tweet.moderate.write'],
  facebook: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
  instagram: ['instagram_basic', 'instagram_content_publish', 'pages_show_list'],
  linkedin: ['w_member_social', 'r_organization_social', 'rw_organization_admin'],
  telegram: [], // Bot token yeterli
  reddit: ['identity', 'submit', 'read', 'history'],
  bluesky: [], // App password yeterli
  youtube: ['youtube.upload', 'youtube.readonly'],
  tiktok: ['user.info.basic', 'video.publish', 'video.upload'],
  whatsapp: ['whatsapp_business_messaging'],
  pinterest: ['boards:write', 'pins:write', 'boards:read'],
}
