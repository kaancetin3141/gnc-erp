// ============================================================
// Excel dışa aktarma yardımcıları — tüm listeler için ortak
// xlsx üretimi (otomatik kolon genişliği + TR karakter uyumlu)
// ============================================================

import * as XLSX from 'xlsx'
import { toast } from 'sonner'

export function exportRowsToExcel(
  rows: Record<string, string | number | null | undefined>[],
  opts: {
    filename: string
    sheetName?: string
    successMessage?: string
    emptyMessage?: string
  },
): boolean {
  if (rows.length === 0) {
    toast.error(opts.emptyMessage ?? 'Dışa aktarılacak kayıt yok')
    return false
  }

  const ws = XLSX.utils.json_to_sheet(rows)
  // Otomatik kolon genişliği: başlık ve hücre uzunluklarının maksimumu
  ws['!cols'] = Object.keys(rows[0]).map((k) => ({
    wch: Math.max(
      k.length + 2,
      Math.min(
        24,
        ...rows.map((r) => String((r as Record<string, unknown>)[k] ?? '').length + 2),
      ),
    ),
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName ?? 'Liste')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${opts.filename}-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success(opts.successMessage ?? `${rows.length} kayıt Excel olarak indirildi`)
  return true
}
