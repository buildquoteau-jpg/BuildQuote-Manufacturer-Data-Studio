// Deck-first taxonomy for Data Studio. Keep in sync with:
//   - supabase/migrations/069_deck_type.sql (CHECK constraint)
//   - the Decks WA library classifier (lib/deckingTypes.ts in the Decks-WA repo)

export const DECK_TYPES = [
  'composite', 'hardwood', 'fibre-cement', 'tiles', 'modified', 'subfloor', 'care', 'outdoor',
] as const

export type DeckType = (typeof DECK_TYPES)[number]

export const DECK_TYPE_LABELS: Record<DeckType, string> = {
  composite: 'Composite decking',
  hardwood: 'Hardwood decking',
  'fibre-cement': 'Fibre cement decking',
  tiles: 'Deck tiles & panels',
  modified: 'Modified timber decking',
  subfloor: 'Subfloor (frames, bearers, pedestals)',
  care: 'Care & maintenance (oils, cleaners, sealers)',
  outdoor: 'After your deck (pergolas, BBQs, outdoor living)',
}

/** Boards you walk on, vs. everything else that goes with a deck. */
export const DECK_BOARD_TYPES: DeckType[] = ['composite', 'hardwood', 'fibre-cement', 'tiles', 'modified']

export function isDeckType(v: unknown): v is DeckType {
  return typeof v === 'string' && (DECK_TYPES as readonly string[]).includes(v)
}

type Input = {
  name?: string | null
  category?: string | null
  subcategory?: string | null
  description?: string | null
  manufacturerName?: string | null
}

/**
 * Best-effort SUGGESTION only — a human confirms it in the review grid. Mirrors the rules the
 * Decks WA library uses today so the two agree, but returns null rather than guessing when nothing
 * matches. Order matters: "composite timber-look" must not read as hardwood.
 */
export function suggestDeckType(s: Input): DeckType | null {
  const head = `${s.name ?? ''} ${s.category ?? ''} ${s.subcategory ?? ''}`.toLowerCase()
  const brand = (s.manufacturerName ?? '').toLowerCase()
  const all = `${head} ${(s.description ?? '').toLowerCase()}`

  // Brand-level ranges that belong with a deck but aren't boards.
  if (/cutek|osmo|feast ?watson|sikkens/.test(brand)) return 'care'
  if (/pergola|gazebo|bbq|barbecue|outdoor kitchen|fire ?pit|timberlock|awning|shade ?sail/.test(`${head} ${brand}`)) return 'outdoor'

  if (/sub-?floor|sub-?frame|pedestal|\bbearers?\b|\bjoists?\b/.test(head) &&
      (/sub-?floor|sub-?frame|pedestal/.test(head) || /deck|outdoor|external|patio|balcony|pergola/.test(all))) return 'subfloor'
  if (/\b(oils?|cleaners?|cleaning|sealers?|sealants?|stains?|restorers?|brighteners?|wash|maintenance|care|protectors?)\b/.test(head) &&
      /deck|timber|composite|outdoor|surface/.test(all)) return 'care'

  // Boards only count when the product says it is decking.
  if (!/deck/.test(all)) return null
  if (/fib(re|er)[ -]?cement|hardiedeck/.test(all)) return 'fibre-cement'
  if (/accoya|acetylated|modified (timber|wood)/.test(all)) return 'modified'
  if (/\btiles?\b|interlocking|modular panel|deck panel/.test(all)) return 'tiles'
  if (/composite|wpc|co-extruded|capped|polymer|recycled/.test(all)) return 'composite'
  if (/hardwood|jarrah|karri|spotted gum|blackbutt|merbau|kwila|ironbark|timber/.test(all)) return 'hardwood'
  return null
}
