// Data loader for the public hosted card pages (/cards/[mfr]/[slug] and
// versioned URLs). Service client — public pages, no session. Reads
// card_versions snapshots (immutable history, migration 049); returns null
// when the card has never been published to a package or the tables are
// missing.

import { unstable_noStore as noStore } from 'next/cache'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { getManufacturerStockists, stockistsForCard } from '@/lib/data/getCardStockists'
import type {
  SystemCardSystem,
  SystemCardStockist,
  SystemCardValidation,
} from '@/components/system-card-renderer/types'

export type HostedCardData = {
  system: SystemCardSystem
  stockists: SystemCardStockist[]
  validation: SystemCardValidation
  manufacturerName: string
  manufacturerSlug: string
  cardSlug: string
  version: number
  latestVersion: number
  cardId: string
}

type VersionRow = {
  card_id: string
  version: number
  slug: string
  name: string
  card_json: SystemCardSystem
  stockists_json: SystemCardStockist[] | null
  validated_by: string | null
  validated_at: string | null
}

export async function getHostedCard(
  manufacturerSlug: string,
  cardSlug: string,
  requestedVersion?: number,
): Promise<HostedCardData | null> {
  // The route segments call this force-dynamic, but that alone wasn't
  // enough to stop a stale response from being served after a republish —
  // confirmed the same byte-identical (including the R2 signature) response
  // came back across many fresh, uncached HTTP requests spanning several
  // minutes, well past the point where a new card_versions row existed with
  // correct data. noStore() unconditionally opts this function's own
  // Supabase fetches out of Next's Data Cache, regardless of how the route
  // that calls it is configured.
  noStore()
  try {
    const supabase = createStudioServiceClient()

    const { data: manufacturer } = await supabase
      .from('data_studio_manufacturers')
      .select('id, name, slug')
      .eq('slug', manufacturerSlug)
      .single()
    if (!manufacturer) return null

    // All versions of this slug for this manufacturer, newest first. Slug is
    // stored per version so renamed cards keep old URLs working at their
    // versioned URLs.
    const { data: versions, error } = await supabase
      .from('card_versions')
      .select('card_id, version, slug, name, card_json, stockists_json, validated_by, validated_at')
      .eq('manufacturer_id', manufacturer.id)
      .eq('slug', cardSlug)
      .order('version', { ascending: false })
    if (error || !versions || versions.length === 0) return null

    const rows = versions as VersionRow[]
    const latest = rows[0]
    const row = requestedVersion != null
      ? rows.find((r) => r.version === requestedVersion)
      : latest
    if (!row) return null

    // Stockists: CURRENT list for the current version (travelling-card
    // behaviour); the snapshot list for superseded versions (immutable record).
    let stockists: SystemCardStockist[] = row.stockists_json ?? []
    if (row.version === latest.version) {
      try {
        const { rows: stockistRows, linkedCardIds } = await getManufacturerStockists(supabase, manufacturer.id)
        stockists = stockistsForCard(stockistRows, linkedCardIds, row.card_id)
      } catch {
        // keep snapshot list
      }
    }

    return {
      system: row.card_json,
      stockists,
      validation: {
        validated_by: manufacturer.name,
        validated_at: row.validated_at,
        version: row.version,
      },
      manufacturerName: manufacturer.name,
      manufacturerSlug: manufacturer.slug,
      cardSlug,
      version: row.version,
      latestVersion: latest.version,
      cardId: row.card_id,
    }
  } catch {
    // Missing env/tables — the page 404s rather than crashing.
    return null
  }
}
