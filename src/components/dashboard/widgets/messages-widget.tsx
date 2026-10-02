'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { MessageCircle, Mail, ArrowRight } from 'lucide-react'
import { initials, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RecentMessageItem } from './types'

interface Props {
  data?: RecentMessageItem[]
  onOpenCustomer?: (id: string) => void
}

export function MessagesWidget({ data, onOpenCustomer }: Props) {
  if (!data) {
    return <Skeleton className="h-64 rounded-xl" />
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            Mesaj atan müşteriler
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            Son {data.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 max-h-72 overflow-y-auto custom-scroll">
        {data.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-sm text-muted-foreground">
            <MessageCircle className="w-8 h-8 mb-2 opacity-30" />
            <span>Son WhatsApp/e-posta kaydı yok</span>
          </div>
        ) : (
          data.map((msg) => {
            const isWhatsapp = msg.type === 'whatsapp'
            const Icon = isWhatsapp ? MessageCircle : Mail
            return (
              <button
                key={msg.id}
                onClick={() => msg.customerId && onOpenCustomer?.(msg.customerId)}
                disabled={!msg.customerId}
                className={cn(
                  'w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left',
                  msg.customerId
                    ? 'hover:bg-muted/60 cursor-pointer'
                    : 'cursor-default opacity-70',
                )}
              >
                <Avatar className="w-9 h-9 shrink-0">
                  <AvatarFallback
                    className={cn(
                      'text-xs font-semibold text-white',
                      isWhatsapp
                        ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                        : 'bg-gradient-to-br from-amber-500 to-orange-600',
                    )}
                  >
                    {initials(msg.customerName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{msg.customerName}</span>
                    <Icon
                      className={cn(
                        'w-3 h-3 shrink-0',
                        isWhatsapp ? 'text-emerald-600' : 'text-amber-600',
                      )}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {msg.subject}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {formatRelative(msg.time)}
                </div>
              </button>
            )
          })
        )}
        {data.length > 0 && (
          <div className="pt-1.5 mt-1 border-t">
            <button
              onClick={() => onOpenCustomer?.(data[0]?.customerId ?? '')}
              className="w-full text-xs text-emerald-600 hover:text-emerald-700 flex items-center justify-center gap-1 py-1.5"
            >
              Tüm müşteriler <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
