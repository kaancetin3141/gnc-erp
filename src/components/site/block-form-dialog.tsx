'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiPost, apiPatch } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Building2, RefreshCw } from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

export interface Block {
  id: string
  name: string
  floors: number
  _count?: { apartments: number }
}

interface BlockForm {
  name: string
  floors: string
}

const EMPTY_FORM: BlockForm = {
  name: '',
  floors: '5',
}

// ============================================================
// Blok Ekleme/Düzenleme Dialog
// ============================================================

export function BlockFormDialog({
  open,
  onOpenChange,
  siteId,
  editBlock,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  siteId: string
  editBlock?: Block | null
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<BlockForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editBlock) {
      setForm({
        name: editBlock.name || '',
        floors: editBlock.floors != null ? String(editBlock.floors) : '5',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [open, editBlock])

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Blok adı gerekli')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        name: form.name.trim(),
        floors: parseInt(form.floors, 10) || 5,
      }
      if (editBlock) {
        await apiPatch(`/api/site/${siteId}/blocks/${editBlock.id}`, payload)
        toast.success('Blok güncellendi')
      } else {
        await apiPost(`/api/site/${siteId}/blocks`, payload)
        toast.success('Blok eklendi')
      }
      qc.invalidateQueries({ queryKey: ['blocks', siteId] })
      qc.invalidateQueries({ queryKey: ['site', siteId] })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            {editBlock ? 'Bloğu Düzenle' : 'Yeni Blok'}
          </DialogTitle>
          <DialogDescription>
            {editBlock
              ? 'Blok bilgilerini güncelleyin.'
              : 'Yeni blok ekleyin. Blok adı ve kat sayısını girin.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="blk-name" className="text-xs">Blok Adı *</Label>
            <Input
              id="blk-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Örn. A Blok, B Blok, Çelik Blok"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="blk-floors" className="text-xs">Kat Sayısı</Label>
            <Input
              id="blk-floors"
              type="number"
              min="1"
              max="50"
              step="1"
              value={form.floors}
              onChange={(e) => setForm({ ...form, floors: e.target.value })}
              placeholder="Örn. 5, 8, 12"
            />
            <p className="text-[10px] text-muted-foreground">
              Varsayılan: 5 kat
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            İptal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !form.name.trim()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            {editBlock ? 'Güncelle' : 'Blok Ekle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
