import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { loadDoc, renderDocPdf } from '@/lib/pdf/doc-loaders'
import { buildSharePath } from '@/lib/pdf/share-token'
import { getSmtpConfig, sendMail, buildDocEmailHtml } from '@/lib/mailer'
import type { DocType } from '@/lib/pdf/generate-doc'

// ============================================================
// POST /api/documents/send — belge gönderim (GERÇEK e-posta + PDF eki)
// Body: {
//   docType: 'invoice'|'quote'|'proforma',
//   docId: string,
//   channel: 'email',
//   to?: string, subject?: string, body?: string,
//   attachPdf?: boolean (default true),
//   includeShareLink?: boolean (default false)
// }
// SMTP ayarlıysa GERÇEK gönderim → { mode:'smtp', messageId, to }
// SMTP ayarlı DEĞİLSE → { mode:'mailto', mailto, to } — FALLBACK, hata değil.
//   Client mailto linkini açar; SMTP kurulunca ekli gönderim otomatik çalışır.
// ============================================================
const VALID_TYPES: DocType[] = ['invoice', 'quote', 'proforma']

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

function docTitle(type: DocType): string {
  return type === 'invoice' ? 'Fatura' : type === 'proforma' ? 'Proforma Fatura' : 'Teklif'
}

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  if (!user) return NextResponse.json({ error: 'Oturum açmanız gerekli' }, { status: 401 })

  let body: {
    docType?: string
    docId?: string
    channel?: string
    to?: string
    subject?: string
    body?: string
    attachPdf?: boolean
    includeShareLink?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 })
  }

  const docType = body.docType as DocType
  const docId = body.docId
  if (!docType || !VALID_TYPES.includes(docType)) {
    return NextResponse.json({ error: "docType 'invoice', 'quote' veya 'proforma' olmalı" }, { status: 400 })
  }
  if (!docId) return NextResponse.json({ error: 'docId zorunlu' }, { status: 400 })
  if (body.channel && body.channel !== 'email') {
    return NextResponse.json({ error: "Bu uç nokta yalnızca channel:'email' destekler" }, { status: 400 })
  }

  const loaded = await loadDoc(docType, docId)
  if (!loaded) return NextResponse.json({ error: 'Belge bulunamadı' }, { status: 404 })
  if (loaded.tenantId !== user.tenantId) {
    return NextResponse.json({ error: 'Erişim reddedildi' }, { status: 403 })
  }

  const d = loaded.data
  const to = (body.to || d.customer?.email || '').trim()
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: 'Geçerli bir alıcı e-postası gerekli — müşteri e-postası eksik' }, { status: 400 })
  }

  // Paylaşım linki (opsiyonel) — hem e-posta gövdesinde hem mailto metninde kullanılır
  const share = body.includeShareLink ? buildSharePath(docType, docId) : null
  const shareUrl = share ? new URL(share.path, req.nextUrl.origin).toString() : null

  const amountStr = `${fmtMoney(d.total)} ${d.currency}`
  const dueOrValid = docType === 'invoice'
    ? (d.dueDate ? `Vade Tarihi: ${new Date(d.dueDate).toLocaleDateString('tr-TR')}` : null)
    : (d.validUntil ? `Geçerlilik: ${new Date(d.validUntil).toLocaleDateString('tr-TR')}` : null)

  const subject = (body.subject || `${docTitle(docType)} — ${d.number}`).trim()
  const customerMessage = (body.body || '').trim()

  const attachPdf = body.attachPdf !== false
  const html = buildDocEmailHtml({
    title: docTitle(docType),
    docNumber: d.number,
    customerName: d.customer?.name || 'Müşterimiz',
    totalFormatted: amountStr,
    dueOrValidLine: dueOrValid,
    company: d.company?.name || null,
    shareUrl,
    hasPdfAttachment: attachPdf,
    extraMessage: customerMessage || null,
  })

  // ---- SMTP YOK → mailto fallback (hata değil) ----
  const smtp = await getSmtpConfig(user.tenantId)
  if (!smtp) {
    const mailtoBody = [
      customerMessage || `Sayın ${d.customer?.name || ''},`,
      '',
      `${d.number} numaralı ${docTitle(docType).toLowerCase()} bilginiz: Tutar ${amountStr}${dueOrValid ? ` · ${dueOrValid}` : ''}.`,
      shareUrl ? `\nBelgeyi online görüntülemek için: ${shareUrl}` : '',
      '',
      'İyi çalışmalar.',
    ].join('\n')
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailtoBody)}`
    return NextResponse.json({
      mode: 'mailto' as const,
      mailto,
      to,
      shareUrl,
      note: 'SMTP ayarlı değil — e-posta uygulamanız açılacak. PDF eki için Ayarlar > SMTP bölümünü doldurun.',
    })
  }

  // ---- SMTP VAR → GERÇEK gönderim ----
  let pdfBuffer: Buffer | null = null
  let fileName = loaded.fileName
  if (attachPdf) {
    const rendered = await renderDocPdf(docType, docId, shareUrl)
    if (rendered) {
      pdfBuffer = rendered.buffer
      fileName = rendered.loaded.fileName
    }
  }

  try {
    const result = await sendMail({
      tenantId: user.tenantId,
      to,
      subject,
      html,
      text: [
        customerMessage || `Sayın ${d.customer?.name || ''},`,
        `${d.number} numaralı ${docTitle(docType).toLowerCase()} — Tutar: ${amountStr}.`,
        dueOrValid ?? '',
        shareUrl ? `Online görüntüleme: ${shareUrl}` : '',
        attachPdf ? 'PDF ekte.' : '',
      ].filter(Boolean).join('\n'),
      attachments: pdfBuffer ? [{ filename: fileName, content: pdfBuffer }] : undefined,
    })

    // ---- Müşteri 360 aktivite + audit ----
    try {
      if (d.customer) {
        const now = new Date()
        await db.activity.create({
          data: {
            tenantId: user.tenantId,
            customerId: d.customer.id,
            type: 'email',
            subject: `${docTitle(docType)} gönderildi: ${d.number}`,
            detail: `${amountStr} · Alıcı: ${to}${pdfBuffer ? ' · PDF eklendi' : ''}${shareUrl ? ' · Online link dahil' : ''}`,
            outcome: 'basarili',
            userId: user.id,
            date: now,
          },
        })
        await db.customer.update({
          where: { id: d.customer.id },
          data: { lastActivityAt: now },
        })
      }
    } catch { /* aktivite kaydı akışı etkilemesin */ }

    await writeAuditLog({
      tenantId: user.tenantId,
      actorId: user.id,
      action: 'send',
      entity: 'document_email',
      entityId: docId,
      after: { docType, docId, to, subject, attachPdf: !!pdfBuffer, shareUrl, messageId: result.messageId },
    })

    return NextResponse.json({
      mode: 'smtp' as const,
      messageId: result.messageId,
      accepted: result.accepted,
      to,
      subject,
      attachment: pdfBuffer ? fileName : null,
      shareUrl,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'E-posta gönderilemedi' },
      { status: 502 },
    )
  }
}
