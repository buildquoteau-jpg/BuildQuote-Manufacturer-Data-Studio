// Hybrid publishing (Library V7): assemble the renderer-ready snapshot for a
// single staged card.
//
// This is the shared "what exactly is being published" step used by both
// channels: publishCardLive (instant publish to the buildquote.com.au
// library) and, over time, the ZIP packager. Everything a published card
// needs is resolved here — SystemCardSystem JSON with durable public image
// URLs, embedded stockists, the sourced-card container (content_md /
// content_hash / sources_json) and the tile summary — so the consumers just
// persist it.
//
// FUTURE (manufacturer accounts): ownership/analytics attribution should hang
// off staged_systems.owner_account_id; this builder stays account-agnostic.

import { createHash } from 'crypto'
import sharp from 'sharp'
import type { createStudioServerClient } from '@/lib/supabase/server'
import { adaptStagedSystem } from '@/components/system-card-renderer/adaptStagedSystem'
import type { SystemCardSystem, SystemCardStockist } from '@/components/system-card-renderer/types'
import { getManufacturerVerificationData, type VerificationSystem, type ManufacturerInfo } from '@/lib/studio-manufacturer/workspace'
import { resolveCardSlug } from '@/lib/packages/readiness'
import { getManufacturerStockists, stockistsForCard } from '@/lib/data/getCardStockists'
import type { CardContainer } from '@/lib/packages/card-container'
import { getObjectFromR2, uploadObjectToR2 } from '@/lib/r2'

type SupabaseClient = ReturnType<typeof createStudioServerClient>

export type CardSnapshot = {
  cardId: string
  manufacturerId: string
  manufacturer: ManufacturerInfo
  stagedSystem: VerificationSystem
  slug: string
  mfrSlug: string
  title: string
  system: SystemCardSystem            // full card_json payload
  stockists: SystemCardStockist[]
  coverUrl: string | null
  ogImageUrl: string | null
  summary: Record<string, unknown>    // skinny tile payload for library grids
  container: CardContainer | null
  warnings: string[]
}

export type BuildSnapshotResult =
  | { ok: true; snapshot: CardSnapshot }
  | { ok: false; error: string }

function looksLikeJpeg(url: string | null | undefined): boolean {
  return !!url && /\.jpe?g(\?|#|$)/i.test(url)
}

// Asset-linked hero/gallery images are rewritten to the opaque
// /api/assets/<id> route (durableAssetUrl below), which has no file
// extension — looksLikeJpeg() can never match it even when the underlying
// file genuinely is a JPEG. For asset-linked images, check the real
// mime_type from manufacturer_assets instead of sniffing the URL string.
function isJpegMime(mimeType: string | null | undefined): boolean {
  return mimeType === 'image/jpeg' || mimeType === 'image/jpg'
}

// ── Durable image URLs ────────────────────────────────────────────────────────
// Published snapshots live forever, but asset URLs floating around the draft
// data are often presigned R2 links that EXPIRE AFTER AN HOUR (X-Amz-Expires).
// Every image reference must therefore be rewritten to the permanent public
// asset route (/api/assets/<id>, immutable-cached) before it is frozen into
// card_json. URLs that are already durable (manufacturer sites, R2 public
// domains) pass through untouched.

const STUDIO_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'

function durableAssetUrl(assetId: string): string {
  return `${STUDIO_ORIGIN.replace(/\/$/, '')}/api/assets/${assetId}`
}

function isEphemeralUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return /r2\.cloudflarestorage\.com|X-Amz-Signature=/i.test(url)
}

// ── Derived JPEG cover ────────────────────────────────────────────────────────
// Manufacturer uploads are optimized to WebP at upload time (see
// image-processing.ts), so the real hero/cover asset is almost never a true
// JPEG — leaving ogImageUrl null and share previews stuck on the branded
// fallback. Rather than require manufacturers to source a JPEG separately,
// generate one here at publish time: pull the source bytes (directly from R2
// when we know the storage key, otherwise via HTTP for external/manufacturer-
// site URLs), flatten + re-encode with sharp, and store the derivative as its
// own object so it gets a durable public URL. Fails soft — a derivation error
// just leaves the existing "no JPEG cover" warning in place.
async function deriveJpegCover(source: {
  assetId: string | null
  storageKey: string | null
  url: string | null
}): Promise<string | null> {
  if (!source.url) return null
  try {
    let bytes: Uint8Array
    if (source.storageKey) {
      const got = await getObjectFromR2(source.storageKey)
      if (!got.ok) throw new Error(got.error)
      bytes = got.bytes
    } else {
      const res = await fetch(source.url)
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
      bytes = new Uint8Array(await res.arrayBuffer())
    }

    const jpegBytes = await sharp(bytes, { failOn: 'none' })
      .flatten({ background: '#ffffff' }) // og:image is opaque — matte out any transparency
      .jpeg({ quality: 85 })
      .toBuffer()

    const idPart = source.assetId ?? createHash('sha1').update(source.url).digest('hex')
    const key = `derived-og/${idPart}.jpg`
    const uploaded = await uploadObjectToR2({ storageKey: key, body: jpegBytes, contentType: 'image/jpeg' })
    if (!uploaded.ok) throw new Error(uploaded.error)

    const base = process.env.CLOUDFLARE_R2_PUBLIC_URL
    if (!base) throw new Error('CLOUDFLARE_R2_PUBLIC_URL not configured.')
    return `${base.replace(/\/$/, '')}/${key}`
  } catch (err) {
    console.error('[buildCardSnapshot] JPEG cover derivation failed:', err)
    return null
  }
}

export async function buildCardSnapshot(
  supabase: SupabaseClient,
  stagedSystemId: string,
): Promise<BuildSnapshotResult> {
  // Card → manufacturer, then reuse the same loader every other card surface
  // uses so the published card matches the preview exactly.
  const { data: cardRow, error: cardErr } = await supabase
    .from('staged_systems')
    .select('id, manufacturer_id')
    .eq('id', stagedSystemId)
    .single()
  if (cardErr || !cardRow) return { ok: false, error: 'Card not found.' }
  const manufacturerId = (cardRow as { manufacturer_id: string }).manufacturer_id

  const verification = await getManufacturerVerificationData(manufacturerId)
  if (!verification.ok) return { ok: false, error: verification.error }

  const stagedSystem = verification.systems.find((s) => s.id === stagedSystemId)
  if (!stagedSystem) return { ok: false, error: 'Card not found in this workspace.' }

  const warnings: string[] = []
  const system = adaptStagedSystem(stagedSystem, verification.manufacturer)
  const slug = resolveCardSlug(stagedSystem)

  // ── Look up real mime types for every asset-linked image, so the JPEG
  // cover check below can trust actual file type instead of guessing from
  // a URL that (after the durable rewrite) never carries a file extension.
  const assetIds = [
    stagedSystem.hero_image_asset_id,
    ...(system.gallery_images ?? []).map((img) => img.asset_id),
  ].filter((id): id is string => !!id)
  const assetInfoById = new Map<string, { mimeType: string | null; storageKey: string | null }>()
  if (assetIds.length) {
    const { data: assetRows } = await supabase
      .from('manufacturer_assets')
      .select('id, mime_type, storage_key')
      .in('id', assetIds)
    for (const row of (assetRows ?? []) as { id: string; mime_type: string | null; storage_key: string | null }[]) {
      assetInfoById.set(row.id, { mimeType: row.mime_type, storageKey: row.storage_key })
    }
  }
  const heroIsJpeg = stagedSystem.hero_image_asset_id
    ? isJpegMime(assetInfoById.get(stagedSystem.hero_image_asset_id)?.mimeType)
    : looksLikeJpeg(system.hero_image_url)

  // ── Rewrite every image to a durable URL before freezing the snapshot ──
  system.gallery_images = (system.gallery_images ?? [])
    .map((img) => {
      const url = img.asset_id
        ? durableAssetUrl(img.asset_id)
        : isEphemeralUrl(img.url) ? null : img.url
      if (!url) {
        warnings.push(`Gallery image "${img.alt}" skipped — its URL is temporary and not linked to an Asset.`)
        return null
      }
      return {
        ...img,
        url,
        og_jpg_url: isEphemeralUrl(img.og_jpg_url) ? null : img.og_jpg_url ?? null,
      }
    })
    .filter((img): img is NonNullable<typeof img> => img !== null)

  if (stagedSystem.hero_image_asset_id) {
    system.hero_image_url = durableAssetUrl(stagedSystem.hero_image_asset_id)
  } else if (isEphemeralUrl(system.hero_image_url)) {
    warnings.push('Hero image skipped — its URL is temporary and not linked to an Asset.')
    system.hero_image_url = null
  }

  // ── Stockists (embedded with the version; the live page also refreshes
  // them from the production DB, so this is a fallback copy) ──
  let stockists: SystemCardStockist[] = []
  try {
    const stockistData = await getManufacturerStockists(supabase, manufacturerId)
    stockists = stockistsForCard(stockistData.rows, stockistData.linkedCardIds, stagedSystemId)
  } catch (err) {
    warnings.push(`Stockists unavailable (${err instanceof Error ? err.message : 'error'}).`)
  }

  // ── Sourced-card container (content_md / hash / provenance). Fails soft. ──
  let container: CardContainer | null = null
  try {
    const { buildCardContainers } = await import('@/lib/packages/card-container')
    const containers = await buildCardContainers(supabase, [{ cardId: stagedSystemId, system }])
    container = containers.get(stagedSystemId) ?? null
  } catch {
    container = null
  }

  // ── Cover + og:image. Cover is the hero image when set (fallback:
  // gallery[0]) — the hero is the fixed, croppable "front of card" image;
  // the gallery is the extra photos after it. The og:image must be
  // crawler-safe, so prefer the stored jpg sibling. ──
  const gallery = system.gallery_images ?? []
  const cover = gallery[0] ?? null
  const coverIsJpeg = cover?.asset_id
    ? isJpegMime(assetInfoById.get(cover.asset_id)?.mimeType)
    : looksLikeJpeg(cover?.url)
  const coverUrl = system.hero_image_url ?? cover?.url ?? null
  let ogImageUrl =
    (heroIsJpeg ? system.hero_image_url : null) ??
    cover?.og_jpg_url ??
    (coverIsJpeg ? cover!.url : null)

  if (!ogImageUrl && coverUrl) {
    const usingHero = system.hero_image_url === coverUrl
    const sourceAssetId = usingHero ? stagedSystem.hero_image_asset_id : (cover?.asset_id ?? null)
    const sourceStorageKey = sourceAssetId ? assetInfoById.get(sourceAssetId)?.storageKey ?? null : null
    ogImageUrl = await deriveJpegCover({ assetId: sourceAssetId, storageKey: sourceStorageKey, url: coverUrl })
  }

  if (coverUrl && !ogImageUrl) {
    warnings.push('No JPEG cover available — share previews will use the branded fallback image.')
  }

  const summary = {
    category: system.category,
    subcategory: system.subcategory,
    description: system.description,
    profile_count: system.system_profiles.length,
    component_count: system.system_components.length,
    hero_image_position_x: system.hero_image_position_x,
    hero_image_position_y: system.hero_image_position_y,
    australian_made: system.australian_made,
    bal_rating: system.bal_rating,
    fire_rating: system.fire_rating,
  }

  return {
    ok: true,
    snapshot: {
      cardId: stagedSystemId,
      manufacturerId,
      manufacturer: verification.manufacturer,
      stagedSystem,
      slug,
      mfrSlug: verification.manufacturer.slug,
      title: system.name,
      system,
      stockists,
      coverUrl,
      ogImageUrl,
      summary,
      container,
      warnings,
    },
  }
}
