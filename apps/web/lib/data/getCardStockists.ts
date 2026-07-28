// Shared stockist lookup for System Cards. Used by:
//   * /api/cards/[slug]/stockists.json (public refresh for travelling cards)
//   * package generation (embed at build time)
//   * the workspace preview page
//
// Returns stockists in the renderer's SystemCardStockist shape, filtered to
// the given card (all_cards stockists + explicitly linked ones), unarchived,
// ordered state → business name. Degrades to [] when migration 048 is not
// applied (42P01 house pattern).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SystemCardStockist } from '@/components/system-card-renderer/types'
import { isMissingSchemaError } from '@/lib/supabase/helpers'

type StockistRow = {
  id: string
  business_name: string
  suburb: string | null
  state: string | null
  phone: string | null
  website_url: string | null
  trade_desk_email: string | null
  all_cards: boolean
  confirm_status: string
  confirmed_at: string | null
}

export function stockistRowToCardStockist(row: StockistRow): SystemCardStockist {
  return {
    id: row.id,
    name: row.business_name,
    suburb: row.suburb,
    state: row.state,
    region: null,
    phone: row.phone,
    website_url: row.website_url,
    google_maps_url: null,
    opening_hours: null,
    delivery_info: null,
    service_postcodes: [],
    trade_desk_email: row.trade_desk_email,
    confirmed_at: row.confirm_status === 'confirmed' ? row.confirmed_at : null,
  }
}

/**
 * All active stockists for a manufacturer, plus the card-link sets needed to
 * filter per card. One query pair — callers building many cards reuse it.
 */
export async function getManufacturerStockists(
  supabase: SupabaseClient,
  manufacturerId: string,
): Promise<{ rows: StockistRow[]; linkedCardIds: Map<string, Set<string>> }> {
  const { data, error } = await supabase
    .from('manufacturer_stockists')
    .select('id, business_name, suburb, state, phone, website_url, trade_desk_email, all_cards, confirm_status, confirmed_at')
    .eq('manufacturer_id', manufacturerId)
    .eq('archived', false)
    .order('state', { ascending: true })
    .order('business_name', { ascending: true })

  if (error) {
    if (isMissingSchemaError(error)) return { rows: [], linkedCardIds: new Map() }
    throw new Error(error.message)
  }

  const rows = (data ?? []) as StockistRow[]
  const overrideIds = rows.filter((r) => !r.all_cards).map((r) => r.id)
  const linkedCardIds = new Map<string, Set<string>>()

  if (overrideIds.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from('manufacturer_stockist_cards')
      .select('stockist_id, card_id')
      .in('stockist_id', overrideIds)
    if (linksError && !isMissingSchemaError(linksError)) throw new Error(linksError.message)
    for (const l of (links ?? []) as { stockist_id: string; card_id: string }[]) {
      if (!linkedCardIds.has(l.stockist_id)) linkedCardIds.set(l.stockist_id, new Set())
      linkedCardIds.get(l.stockist_id)!.add(l.card_id)
    }
  }

  return { rows, linkedCardIds }
}

/** Filter a manufacturer's stockists down to one card. */
export function stockistsForCard(
  rows: StockistRow[],
  linkedCardIds: Map<string, Set<string>>,
  cardId: string,
): SystemCardStockist[] {
  return rows
    .filter((r) => r.all_cards || linkedCardIds.get(r.id)?.has(cardId))
    .map(stockistRowToCardStockist)
}
