'use client'

import { useState } from 'react'
import { apiPost } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function PasswordChangeDialog({ open, onOpenChange }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShow(false)
  }

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword) {
      toast.error('Tüm alanları doldurun')
      return
    }
    if (newPassword.length < 4) {
      toast.error('Yeni şifre en az 4 karakter olmalı')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Yeni şifreler eşleşmiyor')
      return
    }
    try {
      setSaving(true)
      await apiPost('/api/auth/password', { currentPassword, newPassword })
      toast.success('Şifreniz güncellendi', {
        description: 'Diğer cihazlardaki oturumlarınız kapatıldı.',
      })
      reset()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Şifre değiştirilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-emerald-600" />
            Şifre Değiştir
          </DialogTitle>
          <DialogDescription>
            Güvenliğiniz için varsayılan şifreyi kullanmaktan kaçının.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="pw-current" className="text-xs">Mevcut Şifre</Label>
            <div className="relative">
              <Input
                id="pw-current"
                type={show ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-new" className="text-xs">Yeni Şifre</Label>
            <Input
              id="pw-new"
              type={show ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm" className="text-xs">Yeni Şifre (Tekrar)</Label>
            <Input
              id="pw-confirm"
              type={show ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <div className="text-xs text-red-600">Yeni şifreler eşleşmiyor</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>
            İptal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !currentPassword || !newPassword || newPassword !== confirmPassword}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Şifreyi Güncelle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
