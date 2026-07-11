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

import type { createStudioServerClient } from '@/lib/supabase/server'
import { adaptStagedSystem } from '@/components/system-card-renderer/adaptStagedSystem'
import type { SystemCardSystem, SystemCardStockist } from '@/components/system-card-renderer/types'
import { getManufacturerVerificationData, type VerificationSystem, type ManufacturerInfo } from '@/lib/studio-manufacturer/workspace'
import { resolveCardSlug } from '@/lib/packages/readiness'
import { getManufacturerStockists, stockistsForCard } from '@/lib/data/getCardStockists'
import type { CardContainer } from '@/lib/packages/card-container'

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

  // ── Cover + og:image. Cover is gallery[0] (fallback: single hero). The
  // og:image must be crawler-safe, so prefer the stored jpg sibling. ──
  const gallery = system.gallery_images ?? []
  const cover = gallery[0] ?? null
  const coverUrl = cover?.url ?? system.hero_image_url ?? null
  const ogImageUrl =
    cover?.og_jpg_url ??
    (looksLikeJpeg(cover?.url) ? cover!.url : null) ??
    (looksLikeJpeg(system.hero_image_url) ? system.hero_image_url : null)
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
