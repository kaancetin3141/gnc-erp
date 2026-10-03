// ============================================================
// GNC CRM — Chat Service (socket.io, mini-servis)
// ============================================================
// - PORT KESİN 3003 (sabit — env'den okuma YOK; Caddy XTransformPort kuralı)
// - Socket.io path '/' DEĞİŞMEZ (Caddy forwarding kuralı)
// - Sadece YAYINCI: mesajlar REST (/api/messages) üzerinden yazılır,
//   Next.js API route'u POST /internal/emit ile bu servise bildirir.
// - Kimlik doğrulama: socket.auth = { token } → Session tablosu,
//   bulunamazsa geçici uyumluluk: token = user id (eski demo oturumlar).
// ============================================================

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'

const PORT = 3003 // SABİT — değiştirme
const INTERNAL_SECRET = 'gnc-internal-chat-2026'

const prisma = new PrismaClient()

const httpServer = createServer()

const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ─── Presence durumu ─────────────────────────────────────────
const onlineSockets = new Map<string, Set<string>>() // userId -> socketId seti
const userTenant = new Map<string, string>() // userId -> tenantId

function tenantOnlineIds(tenantId: string): string[] {
  const ids: string[] = []
  for (const uid of onlineSockets.keys()) {
    if (userTenant.get(uid) === tenantId) ids.push(uid)
  }
  return ids
}

function broadcastPresence(tenantId: string) {
  const ids = tenantOnlineIds(tenantId)
  for (const uid of ids) {
    io.to(`user:${uid}`).emit('presence:sync', { online: ids })
  }
  console.log(`[${ts()}] presence:sync → tenant=${tenantId} online=${ids.length}`)
}

function ts(): string {
  return new Date().toISOString()
}

// ─── Auth middleware ─────────────────────────────────────────
interface HandshakeUser {
  id: string
  name: string
  tenantId: string
}

io.use(async (socket, next) => {
  try {
    const token = (socket.handshake.auth?.token as string | undefined) ?? null
    if (!token || typeof token !== 'string') {
      return next(new Error('Oturum token\'ı gerekli'))
    }

    let authUser: HandshakeUser | null = null

    // 1) Gerçek Session tablosu
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    })
    if (
      session &&
      session.expiresAt > new Date() &&
      session.user.status === 'active'
    ) {
      authUser = {
        id: session.user.id,
        name: session.user.name,
        tenantId: session.user.tenantId,
      }
    }

    // 2) Geçici uyumluluk: eski demo oturumlar — token = user id
    if (!authUser) {
      const user = await prisma.user.findUnique({ where: { id: token } })
      if (user && user.status === 'active') {
        authUser = { id: user.id, name: user.name, tenantId: user.tenantId }
      }
    }

    if (!authUser) return next(new Error('Yetkisiz bağlantı'))

    socket.data.userId = authUser.id
    socket.data.userName = authUser.name
    socket.data.tenantId = authUser.tenantId
    next()
  } catch (e) {
    console.error(`[${ts()}] auth hatası:`, e)
    next(new Error('Kimlik doğrulanamadı'))
  }
})

// ─── Bağlantı yaşam döngüsü ──────────────────────────────────
io.on('connection', (socket) => {
  const userId = socket.data.userId as string
  const userName = socket.data.userName as string
  const tenantId = socket.data.tenantId as string

  socket.join(`user:${userId}`)

  const firstSocket = !onlineSockets.has(userId)
  if (firstSocket) onlineSockets.set(userId, new Set())
  onlineSockets.get(userId)!.add(socket.id)
  userTenant.set(userId, tenantId)

  socket.emit('presence:sync', { online: tenantOnlineIds(tenantId) })
  if (firstSocket) broadcastPresence(tenantId)
  console.log(`[${ts()}] bağlandı: ${userName} (${userId}) socket=${socket.id}`)

  // Tenant bazlı online kullanıcı listesi (client isteği)
  socket.on('presence:list', () => {
    socket.emit('presence:list', { online: tenantOnlineIds(tenantId) })
  })

  // Yazıyor göstergesi: client emit eder → karşı odaya yayınlanır
  socket.on('chat:typing', (data: { toUserId?: string } | undefined) => {
    const toUserId = data?.toUserId
    if (!toUserId || typeof toUserId !== 'string') return
    io.to(`user:${toUserId}`).emit('chat:typing', {
      fromUserId: userId,
      fromName: userName,
      toUserId,
    })
  })

  // Görüldü bilgisi: okuyan → mesajın sahibine yayınlanır
  socket.on('chat:read', (data: { senderId?: string } | undefined) => {
    const senderId = data?.senderId
    if (!senderId || typeof senderId !== 'string') return
    io.to(`user:${senderId}`).emit('chat:read', { readerId: userId, senderId })
  })

  socket.on('disconnect', () => {
    const set = onlineSockets.get(userId)
    if (set) {
      set.delete(socket.id)
      if (set.size === 0) {
        onlineSockets.delete(userId)
        userTenant.delete(userId)
        broadcastPresence(tenantId)
      }
    }
    console.log(`[${ts()}] ayrıldı: ${userName} (${userId}) socket=${socket.id}`)
  })

  socket.on('error', (error) => {
    console.error(`[${ts()}] socket hatası (${socket.id}):`, error)
  })
})

// ─── Internal REST: POST /internal/emit ──────────────────────
// Socket.io path '/' tüm istekleri yakaladığı için aynı http server
// üzerindeki bu ucu engine.handleRequest'ten ÖNCE kesiştiriyoruz.
interface InternalEmitBody {
  secret?: string
  event?: 'message' | 'read'
  receiverId?: string | null
  senderId?: string | null
  readerId?: string | null
  message?: unknown
}

function readJsonBody(req: IncomingMessage): Promise<InternalEmitBody> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8')
      if (body.length > 1_000_000) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}') as InternalEmitBody)
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

function respondJson(res: ServerResponse, status: number, payload: unknown) {
  if (res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

async function handleInternalEmit(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    respondJson(res, 405, { error: 'method not allowed' })
    return
  }
  try {
    const body = await readJsonBody(req)
    if (body.secret !== INTERNAL_SECRET) {
      respondJson(res, 401, { error: 'invalid secret' })
      return
    }

    if (body.event === 'read') {
      const { senderId, readerId } = body
      if (senderId && readerId) {
        io.to(`user:${senderId}`).emit('chat:read', { readerId, senderId })
      }
    } else {
      // Yeni mesaj: alıcı odası + gönderen odası (kendi diğer sekmeleri)
      const { receiverId, senderId, message } = body
      if (receiverId && message) {
        io.to(`user:${receiverId}`).emit('chat:message', message)
      }
      if (senderId && message) {
        io.to(`user:${senderId}`).emit('chat:message', message)
      }
      console.log(
        `[${ts()}] chat:message → receiver=${receiverId ?? '-'} sender=${senderId ?? '-'}`,
      )
    }

    respondJson(res, 200, { ok: true })
  } catch (e) {
    console.error(`[${ts()}] internal/emit hatası:`, e)
    respondJson(res, 400, { error: 'bad request' })
  }
}

type EngineWithHooks = {
  handleRequest: (req: IncomingMessage, res: ServerResponse) => void
}
const engine = io.engine as unknown as EngineWithHooks
const originalHandleRequest = engine.handleRequest.bind(engine)
engine.handleRequest = (req: IncomingMessage, res: ServerResponse) => {
  const url = (req.url ?? '').split('?')[0]
  if (url === '/internal/emit') {
    void handleInternalEmit(req, res)
    return
  }
  originalHandleRequest(req, res)
}

// ─── Başlat ──────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[${ts()}] GNC Chat Service (socket.io) http://127.0.0.1:${PORT} üzerinde çalışıyor`)
})

process.on('SIGTERM', () => {
  console.log(`[${ts()}] SIGTERM — kapanılıyor…`)
  httpServer.close(() => {
    void prisma.$disconnect()
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log(`[${ts()}] SIGINT — kapanılıyor…`)
  httpServer.close(() => {
    void prisma.$disconnect()
    process.exit(0)
  })
})
