'use server'

import { createStudioServerClient } from '@/lib/supabase/server'
import { publishManufacturerProfile } from '@/lib/studio-admin/publish'
import { assertManufacturerAccess } from './access'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BrandProfileFields = {
  description: string | null
  website_url: string | null
  hero_image_url: string | null
  hero_image_position_y: number
  hero_wide_image_url: string | null
  hero_wide_image_position_y: number
  logo_url: string | null
  phone: string | null
  abn: string | null
  // Asset-library links (migration 046). Saved alongside the *_url columns —
  // the URLs keep working for everything that reads them today, while the
  // package generator uses the asset ids to bundle local files.
  logo_asset_id?: string | null
  hero_image_asset_id?: string | null
  hero_wide_image_asset_id?: string | null
}

// productionSynced is best-effort/informational only — the Data Studio save
// itself always succeeds (or fails) independently of whether the production
// push worked. false means the profile saved fine here but the live
// buildquote.com.au/search.buildquote.com.au card may still show stale
// branding until the next successful sync.
export type BrandActionResult = { ok: true; productionSynced: boolean } | { ok: false; error: string }

async function syncToProduction(manufacturerId: string): Promise<boolean> {
  try {
    const result = await publishManufacturerProfile(manufacturerId)
    return result.ok
  } catch {
    return false
  }
}

// Clamp the hero vertical-position percentage to the DB-enforced 0–100 range.
function clampPositionY(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.min(100, Math.max(0, Math.round(value)))
}

// ─── saveBrandProfile ─────────────────────────────────────────────────────────
// Updates the data_studio_manufacturers record with brand profile fields.
// Manufacturer users may only update their own workspace.

export async function saveBrandProfile(
  manufacturerId: string,
  fields: BrandProfileFields,
): Promise<BrandActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const payload = {
    description:    fields.description?.trim()    || null,
    website_url:    fields.website_url?.trim()    || null,
    hero_image_url: fields.hero_image_url?.trim() || null,
    hero_image_position_y: clampPositionY(fields.hero_image_position_y),
    hero_wide_image_url: fields.hero_wide_image_url?.trim() || null,
    hero_wide_image_position_y: clampPositionY(fields.hero_wide_image_position_y),
    logo_url:       fields.logo_url?.trim()       || null,
    phone:          fields.phone?.trim()           || null,
    abn:            fields.abn?.trim()             || null,
    logo_asset_id:            fields.logo_asset_id ?? null,
    hero_image_asset_id:      fields.hero_image_asset_id ?? null,
    hero_wide_image_asset_id: fields.hero_wide_image_asset_id ?? null,
    updated_at:     new Date().toISOString(),
  }

  const { error } = await supabase
    .from('data_studio_manufacturers')
    .update(payload)
    .eq('id', manufacturerId)

  if (!error) return { ok: true, productionSynced: await syncToProduction(manufacturerId) }

  // Migration 046 may not be applied yet — retry without the asset-id columns.
  if (error.code === '42703' || /_asset_id/.test(error.message ?? '')) {
    const {
      logo_asset_id: _a1,
      hero_image_asset_id: _a2,
      hero_wide_image_asset_id: _a3,
      ...payloadNoAssets
    } = payload
    const { error: retry046Err } = await supabase
      .from('data_studio_manufacturers')
      .update(payloadNoAssets)
      .eq('id', manufacturerId)
    if (!retry046Err) return { ok: true, productionSynced: await syncToProduction(manufacturerId) }

    // Migrations 031/034 may not be applied yet either — retry again without
    // whichever hero-position / wide-image columns the live schema is missing.
    if (retry046Err.code === '42703' || /hero_(image|wide_image)/.test(retry046Err.message ?? '')) {
      const {
        hero_image_position_y: _p1,
        hero_wide_image_url: _w1,
        hero_wide_image_position_y: _w2,
        ...payloadMinimal
      } = payloadNoAssets
      const { error: retryErr } = await supabase
        .from('data_studio_manufacturers')
        .update(payloadMinimal)
        .eq('id', manufacturerId)
      if (!retryErr) return { ok: true, productionSynced: await syncToProduction(manufacturerId) }
      return { ok: false, error: retryErr.message }
    }
    return { ok: false, error: retry046Err.message }
  }

  return { ok: false, error: error.message }
}
