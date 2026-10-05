import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// POST /api/hr/demo — modülü örnek verilerle doldur (hr.manage)
// Tenant'ta personel YOKSA çalışır; varsa 409 döner (çift veri engeli)
// ============================================================

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'hr.manage')
  if (permErr) return permErr

  const existing = await db.hrEmployee.count({ where: { tenantId: user!.tenantId } })
  if (existing > 0) {
    return err('Personel kayıtları mevcut — örnek veri yüklenmedi', 409)
  }

  const now = new Date()
  const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86_400_000)

  const employees = await Promise.all([
    db.hrEmployee.create({
      data: {
        tenantId: user!.tenantId, name: 'Ayşe Yılmaz', position: 'Satış Uzmanı',
        department: 'Satış', phone: '+905321112233', email: 'ayse@ornek.com',
        hireDate: new Date(now.getFullYear() - 2, 2, 15), monthlySalary: 42000,
      },
    }),
    db.hrEmployee.create({
      data: {
        tenantId: user!.tenantId, name: 'Mehmet Demir', position: 'Depo Görevlisi',
        department: 'Operasyon', phone: '+905332223344',
        hireDate: new Date(now.getFullYear() - 1, 6, 1), monthlySalary: 31000,
      },
    }),
    db.hrEmployee.create({
      data: {
        tenantId: user!.tenantId, name: 'Zeynep Kaya', position: 'Muhasebe Sorumlusu',
        department: 'Finans', phone: '+905343334455', email: 'zeynep@ornek.com',
        hireDate: new Date(now.getFullYear() - 3, 9, 20), monthlySalary: 48000,
      },
    }),
  ])

  await Promise.all([
    db.hrLeaveRequest.create({
      data: {
        tenantId: user!.tenantId, employeeId: employees[0].id, type: 'yillik',
        startDate: d(7), endDate: d(11), days: 5, reason: 'Yıllık izin',
        status: 'pending',
      },
    }),
    db.hrLeaveRequest.create({
      data: {
        tenantId: user!.tenantId, employeeId: employees[1].id, type: 'mazeret',
        startDate: d(-3), endDate: d(-3), days: 1, reason: 'Doktor randevusu',
        status: 'approved', decidedById: user!.id, decidedAt: new Date(),
        decisionNote: 'Onaylandı — iyi günler',
      },
    }),
    db.hrLeaveRequest.create({
      data: {
        tenantId: user!.tenantId, employeeId: employees[2].id, type: 'hastalik',
        startDate: d(2), endDate: d(4), days: 3, reason: 'Raporlu',
        status: 'pending',
      },
    }),
  ])

  // Bu haftanın vardiyaları — Pazartesi'den itibaren 5 gün
  const monday = new Date(now)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  monday.setHours(9, 0, 0, 0)
  const shiftPatterns = [
    { start: '09:00', end: '18:00' },
    { start: '09:00', end: '18:00' },
    { start: '12:00', end: '21:00' },
    { start: '09:00', end: '18:00' },
    { start: '09:00', end: '15:00' },
  ]
  await Promise.all(
    employees.flatMap((emp, i) =>
      shiftPatterns.map((p, day) =>
        db.hrShift.create({
          data: {
            tenantId: user!.tenantId,
            employeeId: emp.id,
            date: new Date(monday.getTime() + day * 86_400_000),
            startTime: p.start,
            endTime: day === 4 && i === 0 ? '15:00' : p.end,
            note: null,
          },
        }),
      ),
    ),
  )

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'hr_demo_data',
    entityId: 'demo',
    after: { employees: employees.length },
  })

  return ok({ success: true, employees: employees.length, message: 'Örnek İK verileri yüklendi' })
}
