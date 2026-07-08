// Server-side image optimization for manufacturer assets.
//
// WHY THIS EXISTS: static system-card packages are self-contained HTML/JS a
// manufacturer downloads and hosts on their own site — there is no server in
// the loop when a visitor views one, so Next.js's usual on-request image
// optimization can never apply there. For a static package, whatever bytes we
// store at upload time are what ships, forever. So optimization has to happen
// once, here, rather than on every request.
//
// Resizes down to a sensible max width and re-encodes to WebP. SVG and GIF are
// passed through untouched — SVG is already vector (rasterizing a logo would
// be a regression, not an optimization) and GIF may be animated (sharp reads
// only the first frame, so converting would silently kill the animation).
//
// Fails soft: any processing error falls back to the original bytes/mime
// unchanged, so a sharp edge case (corrupt file, unusual colour profile) never
// blocks an upload — the manufacturer still gets *an* image, just unoptimized.

import sharp from 'sharp'

const MAX_WIDTH = 2400
const WEBP_QUALITY = 82

const PASSTHROUGH_MIME_TYPES = new Set(['image/svg+xml', 'image/gif'])

export type ProcessedImage = {
  bytes: Uint8Array
  mimeType: string
  width: number | null
  height: number | null
  /** False when the image was passed through unchanged (SVG/GIF) or processing failed. */
  wasProcessed: boolean
}

export async function processAssetImage(
  bytes: Uint8Array,
  mimeType: string,
): Promise<ProcessedImage> {
  if (PASSTHROUGH_MIME_TYPES.has(mimeType)) {
    const dims = await readDimensionsSafely(bytes)
    return { bytes, mimeType, width: dims?.width ?? null, height: dims?.height ?? null, wasProcessed: false }
  }

  try {
    const image = sharp(bytes, { failOn: 'none' })
    const metadata = await image.metadata()

    let pipeline = image
    if (metadata.width && metadata.width > MAX_WIDTH) {
      // Only downscale — never upscale a smaller source image.
      pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true })
    }

    const output = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer({ resolveWithObject: true })
    return {
      bytes: output.data,
      mimeType: 'image/webp',
      width: output.info.width ?? null,
      height: output.info.height ?? null,
      wasProcessed: true,
    }
  } catch (err) {
    console.error('[processAssetImage] falling back to original bytes:', err)
    const dims = await readDimensionsSafely(bytes)
    return { bytes, mimeType, width: dims?.width ?? null, height: dims?.height ?? null, wasProcessed: false }
  }
}

async function readDimensionsSafely(bytes: Uint8Array): Promise<{ width: number; height: number } | null> {
  try {
    const metadata = await sharp(bytes, { failOn: 'none' }).metadata()
    if (!metadata.width || !metadata.height) return null
    return { width: metadata.width, height: metadata.height }
  } catch {
    return null
  }
}

/** File extension to use for the given (possibly re-encoded) mime type. */
export function extensionForMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/webp': 'webp',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/svg+xml': 'svg',
    'image/gif': 'gif',
    'image/avif': 'avif',
  }
  return map[mimeType] ?? 'bin'
}
