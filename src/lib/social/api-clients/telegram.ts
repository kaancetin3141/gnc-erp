// ============================================================
// TELEGRAM BOT API — Kanala/Kenala mesaj gönderme
//
// En kolay entegrasyon — BotFather'dan bot token alınır.
// Bot kanalınıza eklenir, admin yapılır.
//
// Gereksinimler:
//   1. @BotFather → /newbot → bot token al
//   2. Bot'u kanala/gruba ekle, admin yap
//   3. Token'ı buraya gir
//   4. handle = kanal @username (örn: @benimkanalim)
//
// Doküman: https://core.telegram.org/bots/api
// ============================================================

import type { PublishParams, PublishResult, VerifyResult } from './types'

const TG_API = 'https://api.telegram.org'

export async function verifyTelegramToken(accessToken: string, channelHandle?: string): Promise<VerifyResult> {
  try {
    // Bot bilgisini al
    const res = await fetch(`${TG_API}/bot${accessToken}/getMe`)
    const data = await res.json()
    if (!res.ok || !data.ok) {
      return { success: false, errorMessage: data.description || 'Telegram bot token geçersiz' }
    }

    const botUsername = data.result.username

    // Kanala erişebildiğini doğrula (eğer handle varsa)
    if (channelHandle) {
      const chatId = channelHandle.startsWith('@') ? channelHandle : `@${channelHandle}`
      const chatRes = await fetch(`${TG_API}/bot${accessToken}/getChat?chat_id=${chatId}`)
      const chatData = await chatRes.json()
      if (!chatData.ok) {
        return { success: false, errorMessage: `Kanala erişilemedi: ${chatData.description}. Bot'u kanala admin olarak ekleyin.` }
      }
      const chat = chatData.result
      return {
        success: true,
        handle: chat.username ? `@${chat.username}` : chat.title,
        displayName: chat.title || chat.username,
        followerCount: chat.members_count,
      }
    }

    return {
      success: true,
      handle: `@${botUsername}`,
      displayName: data.result.first_name,
      isVerified: false,
    }
  } catch (e) {
    return { success: false, errorMessage: e instanceof Error ? e.message : String(e) }
  }
}

export async function publishToTelegram(params: PublishParams): Promise<PublishResult> {
  const { accessToken, content, mediaUrls = [], username } = params

  if (!accessToken) {
    return { success: false, externalId: null, externalUrl: null, errorMessage: 'Bot token gerekli' }
  }
  if (!username) {
    return { success: false, externalId: null, externalUrl: null, errorMessage: 'Kanal @username gerekli' }
  }

  const chatId = username.startsWith('@') ? username : `@${username}`

  try {
    // Tek görsel varsa — sendPhoto
    if (mediaUrls.length === 1 && mediaUrls[0].match(/\.(jpg|jpeg|png|gif|webp)/i)) {
      const res = await fetch(`${TG_API}/bot${accessToken}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: mediaUrls[0],
          caption: content,
          parse_mode: 'HTML',
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        return { success: false, externalId: null, externalUrl: null, errorMessage: data.description }
      }
      const messageId = data.result.message_id
      const chatUsername = data.result.chat?.username
      return {
        success: true,
        externalId: String(messageId),
        externalUrl: chatUsername ? `https://t.me/${chatUsername}/${messageId}` : null,
        errorMessage: null,
      }
    }

    // Video varsa — sendVideo
    if (mediaUrls.length === 1 && mediaUrls[0].match(/\.(mp4|webm|mov)/i)) {
      const res = await fetch(`${TG_API}/bot${accessToken}/sendVideo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          video: mediaUrls[0],
          caption: content,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        return { success: false, externalId: null, externalUrl: null, errorMessage: data.description }
      }
      const messageId = data.result.message_id
      return {
        success: true,
        externalId: String(messageId),
        externalUrl: data.result.chat?.username ? `https://t.me/${data.result.chat.username}/${messageId}` : null,
        errorMessage: null,
      }
    }

    // Sadece metin — sendMessage
    const res = await fetch(`${TG_API}/bot${accessToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: content,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.ok) {
      return { success: false, externalId: null, externalUrl: null, errorMessage: data.description }
    }
    const messageId = data.result.message_id
    return {
      success: true,
      externalId: String(messageId),
      externalUrl: data.result.chat?.username ? `https://t.me/${data.result.chat.username}/${messageId}` : null,
      errorMessage: null,
    }
  } catch (e) {
    return {
      success: false,
      externalId: null,
      externalUrl: null,
      errorMessage: e instanceof Error ? e.message : String(e),
    }
  }
}
