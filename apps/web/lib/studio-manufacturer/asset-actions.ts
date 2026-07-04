'use server'

// Mutations for the manufacturer asset library (manufacturer_assets, migration 046).
// Read helpers live in assets.ts. Follows brand-actions.ts / document-actions.ts
// conventions: assertManufacturerAccess gate + result envelopes, session client
// so RLS stays in force.

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createPresignedUploadUrl, createPresignedDownloadUrl, uploadObjectToR2 } from '@/lib/r2'
import { ASSET_TYPES } from './asset-types'

// ─── Auth gate ────────────────────────────────────────────────────────────────

async function assertManufacturerAccess(
  manufacturerId: string,
): Promise<{ allowed: true; userId: string } | { allowed: false; error: string }> {
  const session = await getStudioSession()
  if (!session.profile) return { allowed: false, error: 'Not authenticated.' }
  if (session.globalRole === 'buildquote_admin') return { allowed: true, userId: session.user!.id }
  if (session.globalRole !== 'manufacturer_user') return { allowed: false, error: 'Access denied.' }
  const hasMembership = session.memberships.some(
    (m) => m.manufacturerId === manufacturerId && m.status === 'active',
  )
  if (!hasMembership) return { allowed: false, error: 'Not a member of this workspace.' }
  return { allowed: true, userId: session.user!.id }
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

// Assets are images only — documents (PDF/CSV/XLSX) belong in Documents.
const IMAGE_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

const MAX_ASSET_BYTES = 25 * 1024 * 1024

export type AssetActionResult = { ok: true } | { ok: false; error: string }

function makeClient() {
  try {
    return { ok: true as const, supabase: createStudioServerClient() }
  } catch {
    return { ok: false as const, error: 'Supabase client not configured.' }
  }
}

function clampFocal(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 50
  return Math.min(100, Math.max(0, Math.round(value)))
}

function friendlyDbError(message: string): string {
  if (/does not exist/i.test(message)) {
    return 'The asset library tables are not set up yet (migration 046 has not been applied).'
  }
  return message
}

// ─── requestAssetUploadUrl ────────────────────────────────────────────────────
// Presigned PUT so the browser uploads straight to R2 — same flow as documents.

export type RequestAssetUploadResult =
  | { ok: true; uploadUrl: string; storageKey: string }
  | { ok: false; error: string }

export async function requestAssetUploadUrl(input: {
  manufacturerId: string
  contentType: string
  fileSizeBytes: number
}): Promise<RequestAssetUploadResult> {
  const auth = await assertManufacturerAccess(input.manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const normalizedMime = input.contentType.split(';')[0].trim()
  const ext = IMAGE_MIME_EXT[normalizedMime]
  if (!ext) return { ok: false, error: `Not an accepted image type: ${normalizedMime}` }
  if (input.fileSizeBytes > MAX_ASSET_BYTES) {
    return { ok: false, error: 'Image exceeds 25 MB limit.' }
  }

  const storageKey = `manufacturer-assets/${input.manufacturerId}/${randomUUID()}.${ext}`
  return createPresignedUploadUrl({
    storageKey,
    contentType: normalizedMime,
    fileSizeBytes: input.fileSizeBytes,
  })
}

// ─── recordAssetUpload ────────────────────────────────────────────────────────
// Called after a successful browser PUT to R2. Inserts the asset row.

export type RecordAssetUploadInput = {
  manufacturerId: string
  assetType: string
  storageKey: string
  contentType: string
  fileSizeBytes: number
  title: string | null
  altText: string | null
  width: number | null
  height: number | null
}

export type RecordAssetResult =
  | {
      ok: true
      assetId: string
      /** Durable public URL when the R2 bucket exposes one, else null. */
      publicUrl: string | null
      /** Browser-viewable URL for immediate preview (public or presigned). */
      displayUrl: string | null
    }
  | { ok: false; error: string }

async function resolveAssetDisplayUrl(
  publicUrl: string | null,
  storageKey: string,
): Promise<string | null> {
  if (publicUrl) return publicUrl
  const presigned = await createPresignedDownloadUrl({ storageKey, expiresInSeconds: 3600 })
  return presigned.ok ? presigned.downloadUrl : null
}

export async function recordAssetUpload(
  input: RecordAssetUploadInput,
): Promise<RecordAssetResult> {
  const auth = await assertManufacturerAccess(input.manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  if (!ASSET_TYPES.includes(input.assetType)) {
    return { ok: false, error: `Unknown asset type: ${input.assetType}` }
  }

  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL
  const publicUrl = publicUrlBase
    ? `${publicUrlBase.replace(/\/$/, '')}/${input.storageKey}`
    : null

  const { data, error } = await c.supabase
    .from('manufacturer_assets')
    .insert({
      manufacturer_id: input.manufacturerId,
      asset_type: input.assetType,
      title: input.title?.trim() || null,
      alt_text: input.altText?.trim() || null,
      storage_key: input.storageKey,
      public_url: publicUrl,
      mime_type: input.contentType.split(';')[0].trim(),
      file_size_bytes: input.fileSizeBytes,
      width: input.width,
      height: input.height,
      created_by: auth.userId,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: friendlyDbError(error?.message ?? 'Failed to record asset.') }
  }

  revalidatePath('/manufacturer/assets')
  return {
    ok: true,
    assetId: (data as { id: string }).id,
    publicUrl,
    displayUrl: await resolveAssetDisplayUrl(publicUrl, input.storageKey),
  }
}

// ─── importAssetFromUrl ───────────────────────────────────────────────────────
// Server fetches the image (manufacturer site / Wix / Supabase bucket etc.),
// stores the bytes in R2 and records the asset with source_url kept for
// provenance. Published packages then use the local copy, never the origin URL.

export type ImportAssetInput = {
  manufacturerId: string
  url: string
  assetType: string
  title: string | null
  altText: string | null
}

export async function importAssetFromUrl(
  input: ImportAssetInput,
): Promise<RecordAssetResult> {
  const auth = await assertManufacturerAccess(input.manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  if (!ASSET_TYPES.includes(input.assetType)) {
    return { ok: false, error: `Unknown asset type: ${input.assetType}` }
  }

  let url: URL
  try {
    url = new URL(input.url.trim())
  } catch {
    return { ok: false, error: 'That is not a valid URL.' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Only http(s) URLs can be imported.' }
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'BuildQuote-DataStudio/1.0 (asset import)' },
    })
  } catch (err) {
    return { ok: false, error: `Could not fetch the URL: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!response.ok) {
    return { ok: false, error: `The URL returned ${response.status} ${response.statusText}.` }
  }

  let contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!IMAGE_MIME_EXT[contentType]) {
    // Some hosts serve images as octet-stream — fall back to the URL extension.
    const extMatch = url.pathname.toLowerCase().match(/\.(png|jpe?g|webp|svg|gif|avif)$/)
    const extToMime: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
      svg: 'image/svg+xml', gif: 'image/gif', avif: 'image/avif',
    }
    contentType = extMatch ? extToMime[extMatch[1]] : ''
  }
  if (!IMAGE_MIME_EXT[contentType]) {
    return { ok: false, error: 'The URL does not point to a supported image (PNG, JPG, WEBP, SVG, GIF, AVIF).' }
  }

  const buffer = new Uint8Array(await response.arrayBuffer())
  if (buffer.byteLength === 0) return { ok: false, error: 'The URL returned an empty file.' }
  if (buffer.byteLength > MAX_ASSET_BYTES) {
    return { ok: false, error: 'Image exceeds 25 MB limit.' }
  }

  const storageKey = `manufacturer-assets/${input.manufacturerId}/${randomUUID()}.${IMAGE_MIME_EXT[contentType]}`
  const upload = await uploadObjectToR2({ storageKey, body: buffer, contentType })
  if (!upload.ok) return { ok: false, error: `Storage upload failed: ${upload.error}` }

  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL
  const publicUrl = publicUrlBase
    ? `${publicUrlBase.replace(/\/$/, '')}/${storageKey}`
    : null

  const { data, error } = await c.supabase
    .from('manufacturer_assets')
    .insert({
      manufacturer_id: input.manufacturerId,
      asset_type: input.assetType,
      title: input.title?.trim() || null,
      alt_text: input.altText?.trim() || null,
      storage_key: storageKey,
      source_url: url.toString(),
      public_url: publicUrl,
      mime_type: contentType,
      file_size_bytes: buffer.byteLength,
      created_by: auth.userId,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: friendlyDbError(error?.message ?? 'Failed to record asset.') }
  }

  revalidatePath('/manufacturer/assets')
  return {
    ok: true,
    assetId: (data as { id: string }).id,
    publicUrl,
    displayUrl: await resolveAssetDisplayUrl(publicUrl, storageKey),
  }
}

// ─── updateAssetMeta ──────────────────────────────────────────────────────────

export type UpdateAssetMetaInput = {
  assetId: string
  manufacturerId: string
  title: string | null
  altText: string | null
  caption: string | null
  assetType: string
  focalX: number
  focalY: number
  approvedForPublication: boolean
}

export async function updateAssetMeta(
  input: UpdateAssetMetaInput,
): Promise<AssetActionResult> {
  const auth = await assertManufacturerAccess(input.manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  if (!ASSET_TYPES.includes(input.assetType)) {
    return { ok: false, error: `Unknown asset type: ${input.assetType}` }
  }

  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const { error } = await c.supabase
    .from('manufacturer_assets')
    .update({
      title: input.title?.trim() || null,
      alt_text: input.altText?.trim() || null,
      caption: input.caption?.trim() || null,
      asset_type: input.assetType,
      focal_x: clampFocal(input.focalX),
      focal_y: clampFocal(input.focalY),
      approved_for_publication: input.approvedForPublication,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.assetId)
    .eq('manufacturer_id', input.manufacturerId)

  if (error) return { ok: false, error: friendlyDbError(error.message) }

  revalidatePath('/manufacturer/assets')
  return { ok: true }
}

// ─── archiveAsset ─────────────────────────────────────────────────────────────
// Assets are archived rather than deleted so generated packages keep valid
// references. Restore is the same call with archived = false.

export async function setAssetArchived(
  assetId: string,
  manufacturerId: string,
  archived: boolean,
): Promise<AssetActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const { error } = await c.supabase
    .from('manufacturer_assets')
    .update({ archived, updated_at: new Date().toISOString() })
    .eq('id', assetId)
    .eq('manufacturer_id', manufacturerId)

  if (error) return { ok: false, error: friendlyDbError(error.message) }

  revalidatePath('/manufacturer/assets')
  return { ok: true }
}
