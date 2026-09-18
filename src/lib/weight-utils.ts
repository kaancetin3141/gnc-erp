// ============================================================
// F4-PRODUCT-WEIGHT-PALET — Ağırlık yardımcı fonksiyonları
// Tüm hesaplamalar dahili olarak kg cinsinden yapılır.
// ============================================================

export type WeightUnit = 'gr' | 'kg' | 'ton'

// Birim → kg çarpanı
const TO_KG: Record<WeightUnit, number> = {
  gr: 0.001,
  kg: 1,
  ton: 1000,
}

// kg → birim çarpanı
const FROM_KG: Record<WeightUnit, number> = {
  gr: 1000,
  kg: 1,
  ton: 0.001,
}

/**
 * Verilen değeri bir birimden diğerine çevirir.
 * Örn. 1500 gr → 1.5 kg
 */
export function convertWeight(
  value: number,
  from: WeightUnit,
  to: WeightUnit,
): number {
  if (!Number.isFinite(value)) return 0
  const kg = value * TO_KG[from]
  return kg * FROM_KG[to]
}

/**
 * Kullanıcıdan alınan ağırlık değerini kg'ya normalize eder (DB'de saklamak için).
 */
export function toKg(value: number, from: WeightUnit): number {
  if (!Number.isFinite(value)) return 0
  return value * TO_KG[from]
}

/**
 * kg cinsinden değeri istenen birime çevirip formatlar.
 */
export function fromKg(value: number | null | undefined, to: WeightUnit): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0
  return value * FROM_KG[to]
}

/**
 * Kalemlerin toplam net ağırlığını (kg) hesaplar.
 * weightPerUnit kg cinsinden olmalı (DB'den gelir).
 * Eğer hiç kalemde ağırlık yoksa null döner (gösterilmeyeceği anlamına gelir).
 */
export function calculateTotalWeight(
  lines: { qty: number; weightPerUnit?: number | null }[],
): number | null {
  let total = 0
  let hasAny = false
  for (const l of lines) {
    if (l.weightPerUnit != null && Number.isFinite(l.weightPerUnit) && l.weightPerUnit > 0) {
      hasAny = true
      total += (Number(l.qty) || 0) * l.weightPerUnit
    }
  }
  return hasAny ? Math.round(total * 1000) / 1000 : null
}

/**
 * Brüt ağırlık = net + ambalaj + palet ağırlığı.
 * Tüm değerler kg cinsinden.
 */
export function calculateGrossWeight(
  netWeight: number,
  packagingWeight: number,
  palletWeight: number,
): number {
  const sum = (Number(netWeight) || 0)
    + (Number(packagingWeight) || 0)
    + (Number(palletWeight) || 0)
  return Math.round(sum * 1000) / 1000
}

/**
 * Birim ağırlığı + miktar kullanarak kalem toplam ağırlığını hesapla.
 * weightPerUnit kg cinsinden.
 */
export function calculateLineWeight(
  qty: number,
  weightPerUnit?: number | null,
): number | null {
  if (weightPerUnit == null || !Number.isFinite(weightPerUnit) || weightPerUnit <= 0) {
    return null
  }
  const q = Number(qty) || 0
  if (q <= 0) return 0
  return Math.round(q * weightPerUnit * 1000) / 1000
}

/**
 * Ağırlığı insani-okunabilir metne çevirir.
 * 0 veya null/undefined ise boş string döner (UI'da gösterilmez).
 * Örn: (1.5, 'kg') → '1,5 kg', (1500, 'gr') → '1.500 g'
 */
export function formatWeight(
  value: number | null | undefined,
  unit: string,
): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return ''
  }
  // Değer kg cinsinden saklanır — kullanıcı birimine çevir
  const unitEnum = (unit as WeightUnit) || 'kg'
  const displayValue = fromKg(value, unitEnum)
  const symbol = unitEnum === 'gr' ? 'g' : unitEnum === 'ton' ? 't' : 'kg'

  // Ton için 3, kg için 3, gr için 0 ondalık
  const maxFrac = unitEnum === 'ton' ? 3 : unitEnum === 'kg' ? 3 : 0
  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  }).format(displayValue)
  return `${formatted} ${symbol}`
}

/**
 * Toplam net ağırlığı (kg) istenen birimde formatlar.
 */
export function formatTotalWeight(
  kgValue: number | null | undefined,
  unit: string = 'kg',
): string {
  if (kgValue === null || kgValue === undefined || !Number.isFinite(kgValue) || kgValue === 0) {
    return ''
  }
  return formatWeight(kgValue, unit)
}

/**
 * Verilen birimin geçerli bir WeightUnit olup olmadığını kontrol eder.
 */
export function isValidWeightUnit(unit: string): unit is WeightUnit {
  return unit === 'gr' || unit === 'kg' || unit === 'ton'
}
