// ============================================================
// İstemci tarafı görsel küçültme (canvas → data URL)
// Vitrin fotoğrafları portföy/webp olarak küçültülüp base64
// saklanır — API sınırı 2.000.000 karakter (≈1,5 MB ikili).
// Saf fonksiyon — yalnız tarayıcıda çağrılır ('use client'
// gerektirmez; dosya okuyan bileşenler zaten client).
// ============================================================

export interface ResizedImage {
  dataUrl: string
  width: number
  height: number
}

const FRIENDLY_ERROR = 'Görsel okunamadı — JPEG/PNG/WebP deneyin'

type ImageSource = ImageBitmap | HTMLImageElement

function srcSize(src: ImageSource): { w: number; h: number } {
  if (src instanceof HTMLImageElement) {
    return { w: src.naturalWidth, h: src.naturalHeight }
  }
  return { w: src.width, h: src.height }
}

/** Dosyayı çizilebilir bir kaynağa yükle — createImageBitmap
 *  (EXIF yönelimi korunur) yoksa <img> + object URL fallback */
async function loadImage(file: File): Promise<{ src: ImageSource; revoke: () => void }> {
  // ① Modern yol — EXIF döndürmeyi kendisi uygular
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { src: bitmap, revoke: () => bitmap.close() }
    } catch {
      // düş: formatı createImageBitmap desteklemiyorsa <img> deneriz
    }
  }
  // ② Eski tarayıcı fallback (EXIF davranışı tarayıcıya kalmış)
  const objectUrl = URL.createObjectURL(file)
  const img = new Image()
  img.decoding = 'async'
  img.src = objectUrl
  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(objectUrl)
    throw new Error(FRIENDLY_ERROR)
  }
  return { src: img, revoke: () => URL.revokeObjectURL(objectUrl) }
}

/**
 * Dosyayı en uzun kenarı `maxDim` px'i geçmeyecek şekilde orantılı
 * küçültür (zaten küçükse ölçeklemez) ve WebP data URL döndürür.
 * Tarayıcı WebP üretmezse (eski Safari) JPEG'e düşer.
 */
export async function fileToResizedDataUrl(
  file: File,
  maxDim = 1280,
  quality = 0.82,
): Promise<ResizedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error(FRIENDLY_ERROR)
  }

  const { src, revoke } = await loadImage(file)
  try {
    const { w, h } = srcSize(src)
    if (!w || !h) throw new Error(FRIENDLY_ERROR)

    const scale = Math.min(1, maxDim / Math.max(w, h))
    const width = Math.max(1, Math.round(w * scale))
    const height = Math.max(1, Math.round(h * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error(FRIENDLY_ERROR)
    ctx.drawImage(src, 0, 0, width, height)

    let dataUrl = canvas.toDataURL('image/webp', quality)
    if (!dataUrl.startsWith('data:image/webp')) {
      // toDataURL webp DÖNDÜRMEDİ (eski tarayıcı) → JPEG fallback
      dataUrl = canvas.toDataURL('image/jpeg', quality)
    }
    return { dataUrl, width, height }
  } finally {
    revoke()
  }
}

/** Ekip/avtar fotoğrafları için küçük boyut (640px, kalite 0.8) */
export async function fileToThumbDataUrl(file: File): Promise<ResizedImage> {
  return fileToResizedDataUrl(file, 640, 0.8)
}
