// ============================================================
// WhatsApp Mesaj Merkezi — istemci yardımcıları
// Tüm giden WhatsApp mesajlarını merkezî kayda düşürür:
//  1) POST /api/whatsapp/messages  → kayıt (kuyrukta)
//  2) wa.me linkini yeni sekmede aç
//  3) popup açıldıysa PATCH status=gonderildi
// Popup engellenirse kayıt "kuyrukta" kalır → Mesaj Merkezi'nden
// tek tıkla yeniden açılabilir.
// ============================================================

import { apiPost, apiPatch } from './api-client'
import { whatsappLink } from './format'

export const WA_CONTEXT_TYPES = [
  { value: 'fatura_hatirlatma', label: 'Fatura Hatırlatma' },
  { value: 'fatura_gonderim', label: 'Fatura Gönderimi' },
  { value: 'teklif_gonderim', label: 'Teklif Gönderimi' },
  { value: 'proforma_gonderim', label: 'Proforma Gönderimi' },
  { value: 'randevu_onay', label: 'Randevu Onayı' },
  { value: 'aidat_hatirlatma', label: 'Aidat Hatırlatma' },
  { value: 'serbest', label: 'Serbest Mesaj' },
] as const

export type WhatsAppContextType = (typeof WA_CONTEXT_TYPES)[number]['value']

export function waContextLabel(type: string): string {
  return WA_CONTEXT_TYPES.find((t) => t.value === type)?.label ?? type
}

export interface TrackedWhatsAppInput {
  phone: string
  body: string
  title?: string
  contextType: WhatsAppContextType
  contextId?: string | null
  contextNo?: string | null
  customerId?: string | null
  customerName?: string | null
  amount?: number | null
  currency?: string | null
}

export interface TrackedWhatsAppResult {
  id: string
  popupOpened: boolean
}

// Mesajı kaydet + wa.me sekmesi aç + gönderildi işaretle.
// window.open null dönerse (popup engeli) kayıt kuyrukta kalır.
export async function sendWhatsAppTracked(input: TrackedWhatsAppInput): Promise<TrackedWhatsAppResult> {
  const link = whatsappLink(input.phone, input.body)
  if (link === '#') throw new Error('Geçersiz telefon numarası')

  // 1) Merkezî kayıt
  const created = await apiPost<{ id: string }>('/api/whatsapp/messages', {
    phone: input.phone,
    body: input.body,
    title: input.title,
    contextType: input.contextType,
    contextId: input.contextId ?? null,
    contextNo: input.contextNo ?? null,
    customerId: input.customerId ?? null,
    customerName: input.customerName ?? null,
    amount: input.amount ?? null,
    currency: input.currency ?? null,
  })

  // 2) wa.me sekmesi aç
  const popup = window.open(link, '_blank', 'noopener,noreferrer')

  // 3) Açıldıysa gönderildi işaretle (arka planda, akışı bekletmeden)
  if (popup) {
    try {
      await apiPatch(`/api/whatsapp/messages/${created.id}`, { status: 'gonderildi' })
    } catch { /* durum güncellemesi akışı etkilemez */ }
  }

  return { id: created.id, popupOpened: !!popup }
}

// Kuyruktaki bir mesajı Mesaj Merkezi'nden yeniden aç + gönderildi işaretle
export async function openQueuedWhatsApp(phone: string, body: string, messageId: string): Promise<boolean> {
  const link = whatsappLink(phone, body)
  if (link === '#') return false
  const popup = window.open(link, '_blank', 'noopener,noreferrer')
  if (popup) {
    try {
      await apiPatch(`/api/whatsapp/messages/${messageId}`, { status: 'gonderildi' })
    } catch { /* sessiz geç */ }
  }
  return !!popup
}
