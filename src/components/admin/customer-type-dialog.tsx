'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiPatch, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Check, RefreshCw } from 'lucide-react'
import {
  CUSTOMER_TYPES, getCustomerTypeMeta, type CustomerTypeKey,
} from './customer-type-badge'
import type { Customer } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  customer: Customer | null
  onUpdated?: (updated: Customer) => void
}

export function CustomerTypeDialog({ open, onOpenChange, customer, onUpdated }: Props) {
  const qc = useQueryClient()
  // Lazy initial state — parent key prop ile remount eder, böylece
  // customer değişince selected otomatik sıfırlanır.
  const [selected, setSelected] = useState<CustomerTypeKey>(
    () => CUSTOMER_TYPES.find((t) => t.value === customer?.customerType)?.value ?? 'musteri',
  )

  const mut = useMutation({
    mutationFn: async (vars: { id: string; type: CustomerTypeKey }) =>
      apiPatch<Customer>(`/api/customers/${vars.id}`, { customerType: vars.type }),
    onSuccess: (updated) => {
      toast.success('Müşteri türü güncellendi', {
        description: `${updated.name} → ${getCustomerTypeMeta(updated.customerType).label}`,
      })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer', customer?.id] })
      qc.invalidateQueries({ queryKey: ['admin-overview'] })
      onUpdated?.(updated)
      onOpenChange(false)
    },
    onError: (e: ApiError) => toast.error('Hata', { description: e.message }),
  })

  const handleSubmit = () => {
    if (!customer) return
    if (selected === (customer.customerType as CustomerTypeKey)) {
      toast.info('Müşteri zaten bu türde')
      onOpenChange(false)
      return
    }
    mut.mutate({ id: customer.id, type: selected })
  }

  const currentType = customer ? getCustomerTypeMeta(customer.customerType) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Müşteri Türü Değiştir</DialogTitle>
          <DialogDescription>
            {customer ? (
              <>
                <span className="font-medium text-foreground">{customer.name}</span> için yeni
                müşteri türü seçin.
              </>
            ) : (
              'Müşteri seçilmedi.'
            )}
          </DialogDescription>
        </DialogHeader>

        {currentType && (
          <div className="rounded-lg border border-dashed bg-muted/30 p-2.5 text-xs flex items-center gap-2">
            <span className="text-muted-foreground">Mevcut tür:</span>
            <span className="font-medium">
              {currentType.emoji} {currentType.label}
            </span>
          </div>
        )}

        <ScrollArea className="max-h-[55vh]">
          <div className="space-y-2 pr-1">
            {CUSTOMER_TYPES.map((t) => {
              const Icon = t.icon
              const isSelected = selected === t.value
              const isCurrent = customer?.customerType === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setSelected(t.value)}
                  className={cn(
                    'w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all',
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20'
                      : 'border-border hover:border-emerald-300 hover:bg-muted/40',
                  )}
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-lg',
                      t.color,
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{t.emoji} {t.label}</span>
                      {isCurrent && (
                        <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                          mevcut
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            İptal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mut.isPending || !customer}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {mut.isPending ? (
              <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-1.5" />
            )}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
