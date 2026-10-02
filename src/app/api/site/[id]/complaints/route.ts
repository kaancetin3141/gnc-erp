import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// GET — şikayetler
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const { id } = await params
  const url = new URL(req.url)
  const status = url.searchParams.get('status') || ''
  const where: Record<string, unknown> = { siteId: id }
  if (status) where.status = status
  const complaints = await db.complaint.findMany({
    where,
    include: {
      resident: { select: { name: true, phone: true } },
      assignedStaff: { select: { id: true, name: true, role: true, phone: true } },
    },
    orderBy: [
      { priority: 'asc' }, // acil önce (alfabetik: acil < dusuk < inceleniyor... ama enum string) — aşağıda JS ile sıralanıyor
      { createdAt: 'desc' },
    ],
  })
  // Öncelik sırası: acil > yuksek > normal > dusuk; sonra tarih
  const prioRank: Record<string, number> = { acil: 0, yuksek: 1, normal: 2, dusuk: 3 }
  complaints.sort((a, b) => (prioRank[a.priority] ?? 2) - (prioRank[b.priority] ?? 2))
  return ok(complaints)
}

// POST — şikayet ekle
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const { id } = await params
  const body = await req.json()
  if (!body.title || !body.description) return err('Başlık ve açıklama gerekli', 400)
  const complaint = await db.complaint.create({
    data: {
      siteId: id,
      residentId: body.residentId || null,
      title: body.title,
      description: body.description,
      category: body.category || 'diger',
      priority: body.priority || 'normal',
      estimatedCost: body.estimatedCost != null && Number(body.estimatedCost) > 0 ? Number(body.estimatedCost) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      assignedStaffId: body.assignedStaffId || null,
    },
    include: {
      resident: { select: { name: true, phone: true } },
      assignedStaff: { select: { id: true, name: true, role: true, phone: true } },
    },
  })
  return ok(complaint)
}
