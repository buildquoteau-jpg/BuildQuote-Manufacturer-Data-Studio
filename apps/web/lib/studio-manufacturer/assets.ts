// Server-only read helpers for the manufacturer asset library.
// Mutations live in asset-actions.ts. Table: manufacturer_assets (migration 046).
//
// Assets are the public visual files that ship inside the static System Card
// website package. Studio references them by ID; clean public file names are
// generated only at package time.

import { createStudioServerClient } from '@/lib/supabase/server'
import { createPresignedDownloadUrl } from '@/lib/r2'
import {
  isMissingSchemaError,
  makeStudioClient,
} from '@/lib/supabase/helpers'

export { ASSET_TYPE_LABELS, ASSET_TYPES, assetTypeLabel } from './asset-types'

export type ManufacturerAsset = {
  id: string
  assetType: string
  title: string | null
  altText: string | null
  caption: string | null
  storageKey: string | null
  sourceUrl: string | null
  publicUrl: string | null
  mimeType: string | null
  fileSizeBytes: number | null
  width: number | null
  height: number | null
  focalX: number
  focalY: number
  approvedForPublication: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
  /** Browser-viewable URL: public_url if configured, else a presigned GET. */
  displayUrl: string | null
  /** Human-readable list of places this asset is referenced. */
  usedBy: string[]
}

export type ManufacturerAssetsResult =
  | { ok: true; assets: ManufacturerAsset[] }
  | { ok: false; error: string; migrationMissing?: boolean }

type AssetRow = {
  id: string
  asset_type: string
  title: string | null
  alt_text: string | null
  caption: string | null
  storage_key: string | null
  source_url: string | null
  public_url: string | null
  mime_type: string | null
  file_size_bytes: number | null
  width: number | null
  height: number | null
  focal_x: number
  focal_y: number
  approved_for_publication: boolean
  archived: boolean
  created_at: string
  updated_at: string
}

export async function getManufacturerAssets(
  manufacturerId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<ManufacturerAssetsResult> {
  const clientResult = makeStudioClient()
  if (!clientResult.ok) return { ok: false, error: clientResult.error }
  const supabase = clientResult.supabase

  let query = supabase
    .from('manufacturer_assets')
    .select(
      'id, asset_type, title, alt_text, caption, storage_key, source_url, public_url, ' +
      'mime_type, file_size_bytes, width, height, focal_x, focal_y, ' +
      'approved_for_publication, archived, created_at, updated_at',
    )
    .eq('manufacturer_id', manufacturerId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (!opts.includeArchived) query = query.eq('archived', false)

  const { data, error } = await query

  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        ok: false,
        migrationMissing: true,
        error: 'The asset library tables are not set up yet (migration 046 has not been applied to this Supabase project).',
      }
    }
    return { ok: false, error: `Failed to load assets: ${error.message}` }
  }

  const rows = (data ?? []) as unknown as AssetRow[]
  const usageMap = await resolveAssetUsage(supabase, manufacturerId, rows.map((r) => r.id))

  const assets: ManufacturerAsset[] = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      assetType: r.asset_type,
      title: r.title,
      altText: r.alt_text,
      caption: r.caption,
      storageKey: r.storage_key,
      sourceUrl: r.source_url,
      publicUrl: r.public_url,
      mimeType: r.mime_type,
      fileSizeBytes: r.file_size_bytes,
      width: r.width,
      height: r.height,
      focalX: r.focal_x,
      focalY: r.focal_y,
      approvedForPublication: r.approved_for_publication,
      archived: r.archived,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      displayUrl: await resolveDisplayUrl(r),
      usedBy: usageMap.get(r.id) ?? [],
    })),
  )

  return { ok: true, assets }
}

async function resolveDisplayUrl(row: AssetRow): Promise<string | null> {
  if (row.public_url) return row.public_url
  if (!row.storage_key) return null
  const presigned = await createPresignedDownloadUrl({
    storageKey: row.storage_key,
    expiresInSeconds: 3600,
  })
  return presigned.ok ? presigned.downloadUrl : null
}

// "Used by" lookup: brand profile slots on data_studio_manufacturers and
// card heroes on staged_systems (asset-id columns added in migration 046).
// Silently returns empty usage if those columns don't exist yet.
async function resolveAssetUsage(
  supabase: ReturnType<typeof createStudioServerClient>,
  manufacturerId: string,
  assetIds: string[],
): Promise<Map<string, string[]>> {
  const usage = new Map<string, string[]>()
  if (!assetIds.length) return usage

  const add = (assetId: string | null, label: string) => {
    if (!assetId || !assetIds.includes(assetId)) return
    const list = usage.get(assetId) ?? []
    list.push(label)
    usage.set(assetId, list)
  }

  const [brandResult, cardsResult] = await Promise.all([
    supabase
      .from('data_studio_manufacturers')
      .select('logo_asset_id, hero_image_asset_id, hero_wide_image_asset_id')
      .eq('id', manufacturerId)
      .single(),
    supabase
      .from('staged_systems')
      .select('id, name, hero_image_asset_id')
      .eq('manufacturer_id', manufacturerId)
      .not('hero_image_asset_id', 'is', null),
  ])

  if (!brandResult.error && brandResult.data) {
    const b = brandResult.data as {
      logo_asset_id: string | null
      hero_image_asset_id: string | null
      hero_wide_image_asset_id: string | null
    }
    add(b.logo_asset_id, 'Brand profile — logo')
    add(b.hero_image_asset_id, 'Brand profile — hero image')
    add(b.hero_wide_image_asset_id, 'Brand profile — full-width banner')
  }

  if (!cardsResult.error && cardsResult.data) {
    for (const row of cardsResult.data as Array<{ id: string; name: string; hero_image_asset_id: string | null }>) {
      add(row.hero_image_asset_id, `Card — ${row.name}`)
    }
  }

  return usage
}
