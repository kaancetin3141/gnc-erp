// ============================================================
// GERÇEK E-POSTA GÖNDERİMİ — nodemailer
// SMTP ayarları TenantSetting tablosundan okunur:
//   key = 'smtp', value = JSON {host, port, secure, user, pass, from}
// Ayar yoksa getSmtpConfig null döner → üst katman mailto fallback'i
// kullanır (bu bir hata değil, tasarlanmış davranıştır).
// ============================================================

import nodemailer from 'nodemailer'
import { db } from '@/lib/db'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from?: string
}

export interface SendMailInput {
  tenantId: string
  to: string
  subject: string
  html: string
  text?: string
  attachments?: { filename: string; content: Buffer }[]
}

export interface SendMailResult {
  messageId: string
  accepted: string[]
}

/** Tenant'ın SMTP ayarını oku — yoksa / bozuksa null döner */
export async function getSmtpConfig(tenantId: string): Promise<SmtpConfig | null> {
  const row = await db.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId, key: 'smtp' } },
  })
  if (!row?.value) return null

  try {
    const raw = JSON.parse(row.value) as Partial<SmtpConfig>
    if (!raw.host || !raw.user || !raw.pass) return null
    return {
      host: String(raw.host),
      port: Number.isFinite(raw.port) ? Number(raw.port) : 587,
      secure: !!raw.secure,
      user: String(raw.user),
      pass: String(raw.pass),
      from: raw.from ? String(raw.from) : undefined,
    }
  } catch {
    return null
  }
}

/** SMTP üzerinden gerçek e-posta gönder — hata olursa Türkçe mesajla throw eder */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const cfg = await getSmtpConfig(input.tenantId)
  if (!cfg) {
    throw new Error('SMTP ayarlı değil — Ayarlar > SMTP bölümünden sunucu bilgilerini girin')
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })

  const from = cfg.from || cfg.user

  try {
    const info = await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: 'application/pdf',
      })),
    })
    return {
      messageId: info.messageId ?? '',
      accepted: (info.accepted ?? []).map((a) => (typeof a === 'string' ? a : a.address)),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/auth|login|535|530/i.test(msg)) {
      throw new Error('SMTP kimlik doğrulaması başarısız — kullanıcı adı / şifreyi kontrol edin')
    }
    if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(msg)) {
      throw new Error('SMTP sunucusuna ulaşılamadı — host/port ayarlarını kontrol edin')
    }
    throw new Error(`E-posta gönderilemedi: ${msg}`)
  }
}

// ------------------------------------------------------------
// Kurumsal belge e-postası HTML şablonu
// ------------------------------------------------------------
export function buildDocEmailHtml(opts: {
  title: string
  docNumber: string
  customerName: string
  totalFormatted: string
  dueOrValidLine?: string | null
  company?: string | null
  shareUrl?: string | null
  hasPdfAttachment?: boolean
  extraMessage?: string | null
}): string {
  const originNote = opts.shareUrl
    ? `<a href="${escapeHtml(opts.shareUrl)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold;font-size:14px;margin:6px 0 4px;">📄 Belgeyi Online Görüntüle</a><br/>`
    : ''

  return `<!DOCTYPE html>
<html lang="tr">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#059669;padding:18px 24px;">
          <span style="color:#ffffff;font-size:17px;font-weight:bold;">${escapeHtml(opts.company || 'GNC CRM')}</span>
        </td></tr>
        <tr><td style="padding:26px 24px 8px;">
          <div style="font-size:18px;font-weight:bold;color:#111827;">${escapeHtml(opts.title)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px;">Sayın ${escapeHtml(opts.customerName)},</div>
          <div style="font-size:13px;color:#374151;line-height:1.7;margin-top:12px;">
            ${escapeHtml(opts.docNumber)} numaralı belgeniz aşağıda özetlenmiştir.
          </div>
        </td></tr>
        <tr><td style="padding:10px 24px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
            <tr><td style="padding:14px 16px;font-size:13px;color:#374151;line-height:2;">
              <b>Belge No:</b> ${escapeHtml(opts.docNumber)}<br/>
              ${opts.dueOrValidLine ? `${escapeHtml(opts.dueOrValidLine)}<br/>` : ''}
              <b>Genel Toplam:</b> <span style="font-size:15px;color:#047857;font-weight:bold;">${escapeHtml(opts.totalFormatted)}</span>
            </td></tr>
          </table>
        </td></tr>
        ${opts.extraMessage ? `<tr><td style="padding:8px 24px;"><div style="font-size:13px;color:#374151;line-height:1.7;border-left:3px solid #059669;padding-left:10px;white-space:pre-wrap;">${escapeHtml(opts.extraMessage)}</div></td></tr>` : ''}
        <tr><td align="center" style="padding:16px 24px 6px;">
          ${originNote}
          ${opts.hasPdfAttachment ? '<div style="font-size:12px;color:#6b7280;">Belgenin PDF kopyası bu e-postaya eklenmiştir.</div>' : ''}
        </td></tr>
        <tr><td style="padding:14px 24px 26px;border-top:1px solid #f3f4f6;margin-top:12px;">
          <div style="font-size:11px;color:#9ca3af;line-height:1.6;">
            Bu e-posta ${escapeHtml(opts.company || 'GNC CRM')} tarafından GNC CRM ile gönderilmiştir.
            Sorularınız için bize ulaşabilirsiniz.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
