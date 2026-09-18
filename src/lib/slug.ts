// Slug yardımcıları — URL-friendly isim üretimi (Türkçe karakter desteği)

// Türkçe → ASCII eşlemesi
const TR_MAP: Record<string, string> = {
  'ç': 'c', 'Ç': 'c',
  'ğ': 'g', 'Ğ': 'g',
  'ı': 'i', 'İ': 'i',
  'ö': 'o', 'Ö': 'o',
  'ş': 's', 'Ş': 's',
  'ü': 'u', 'Ü': 'u',
}

function replaceTr(input: string): string {
  return input.replace(/[çğıİöşüÇĞÖŞÜ]/g, (ch) => TR_MAP[ch] ?? ch)
}

/**
 * İsim → URL slug'ine çevir
 * - Türkçe karakterleri ASCII'ye mapler (ş→s, ı→i, ...)
 * - Küçük harfe çevirir
 * - Boşluk ve özel karakterleri tireye (-) çevirir
 * - Çoklu tireleri tek tireye indirir
 * - Baştaki/sondaki tireleri kırpar
 * - Boşsa fallback döner
 *
 * Örnekler:
 *   "Şık Kuaför"      → "sik-kuafor"
 *   "Berber Ahmet!"   → "berber-ahmet"
 *   "Anadolu Diş"     → "anadolu-dis"
 */
export function slugify(input: string, fallback = 'isletme'): string {
  if (!input) return fallback
  const replaced = replaceTr(input)
  const lower = replaced.toLowerCase()
  const cleaned = lower
    .replace(/[^a-z0-9]+/g, '-')   // harf/rakam dışı her şey → tire
    .replace(/-+/g, '-')            // çoklu tire → tek
    .replace(/^-+|-+$/g, '')        // baş/son tire kırpar
  return cleaned.length > 0 ? cleaned : fallback
}

/**
 * Bir provider için benzersiz slug üret.
 * Eğer mevcut slug boşsa veya çakışıyorsa, "-2", "-3" ekleriyle benzersiz hale getirir.
 *
 * @param name Slug'laştırılacak isim
 * @param existsFn Verilen slug daha önce kullanılmış mı diye kontrol eden fonksiyon
 * @param currentId Güncelleme sırasında kendini exclude etmek için (opsiyonel)
 */
export async function ensureUniqueSlug(
  name: string,
  existsFn: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name)
  let candidate = base
  let n = 2
  // En fazla 50 deneme — uzun isimler için güvenlik
  while (await existsFn(candidate)) {
    candidate = `${base}-${n}`
    n++
    if (n > 50) {
      // Son çare: timestamp ekle
      candidate = `${base}-${Date.now().toString(36)}`
      break
    }
  }
  return candidate
}
