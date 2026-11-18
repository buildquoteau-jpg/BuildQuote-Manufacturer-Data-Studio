// Standard deck attributes. These are LABELS for the existing free-form
// `custom_technical_attributes` ({label, value}[]) — no schema change — so every deck card
// uses the same wording and boards from different brands can be compared like for like.
// Values are always what the manufacturer's own document says (never inferred), and are
// verified by a human like any other field.

import type { DeckType } from './deckTypes'

export type DeckAttributePreset = {
  label: string        // exact label stored on the card
  hint: string         // what to put in the value, shown as placeholder
  appliesTo: DeckType[] | 'all'
}

const BOARDS: DeckType[] = ['composite', 'hardwood', 'fibre-cement', 'tiles', 'modified']

export const DECK_ATTRIBUTE_PRESETS: DeckAttributePreset[] = [
  // — Boards —
  { label: 'Board profile', hint: 'e.g. Grooved, reversible, 137 x 23 mm', appliesTo: BOARDS },
  { label: 'Slip resistance', hint: 'Rating and test standard, e.g. P4 (AS 4586) — exactly as stated', appliesTo: BOARDS },
  { label: 'Fixing method', hint: 'e.g. Hidden clips, face screws, interlocking', appliesTo: BOARDS },
  { label: 'Maximum joist spacing', hint: 'e.g. 450 mm centres (residential)', appliesTo: BOARDS },
  { label: 'Durability class', hint: 'e.g. Class 1 above ground (timber) — as stated', appliesTo: ['hardwood', 'modified'] },
  { label: 'Coastal / marine suitability', hint: 'Manufacturer statement on salt-air or pool use', appliesTo: BOARDS },
  { label: 'Termite resistance', hint: 'Manufacturer statement', appliesTo: BOARDS },
  { label: 'Surface heat', hint: 'Any guidance on dark colours in full sun', appliesTo: ['composite', 'fibre-cement', 'tiles'] },
  { label: 'Fade / weathering', hint: 'Warranty or stated fade behaviour', appliesTo: ['composite', 'fibre-cement', 'modified'] },
  { label: 'Tannin bleed', hint: 'Stated behaviour on new timber', appliesTo: ['hardwood', 'modified'] },
  { label: 'Over a slab or existing surface', hint: 'Yes/No and any drainage notes', appliesTo: ['tiles', 'composite', 'fibre-cement'] },
  { label: 'Recycled content', hint: 'e.g. 60% recycled wood fibre and plastics', appliesTo: ['composite'] },
  // — Care —
  { label: 'Recommended finish', hint: 'e.g. Penetrating oil, water-based sealer', appliesTo: ['hardwood', 'modified', 'care'] },
  { label: 'Re-coat interval', hint: 'e.g. Every 6–12 months (per label)', appliesTo: ['hardwood', 'modified', 'care'] },
  { label: 'Coverage', hint: 'e.g. 8–10 m² per litre', appliesTo: ['care'] },
  { label: 'Cleaning routine', hint: 'Frequency and product', appliesTo: [...BOARDS, 'care'] },
  // — Subfloor —
  { label: 'Maximum span', hint: 'Bearer/joist span and conditions', appliesTo: ['subfloor'] },
  { label: 'Frame material', hint: 'e.g. H3 pine, galvanised steel, aluminium', appliesTo: ['subfloor'] },
  { label: 'Height range', hint: 'e.g. 40–550 mm adjustable', appliesTo: ['subfloor'] },
  // — Outdoor living —
  { label: 'Maximum area / span', hint: 'Largest size per the manufacturer', appliesTo: ['outdoor'] },
  { label: 'Roof / shade type', hint: 'e.g. Open timber frame, insulated panel, shade sail', appliesTo: ['outdoor'] },
  // — Everything —
  { label: 'Warranty', hint: 'Length and what it covers', appliesTo: 'all' },
  { label: 'Bushfire (BAL) suitability', hint: 'Highest BAL the product is rated for, if stated', appliesTo: 'all' },
]

/** Presets that make sense for a deck type (all types if none chosen yet), minus labels already on the card. */
export function presetsFor(type: DeckType | null, existingLabels: string[] = []): DeckAttributePreset[] {
  const have = new Set(existingLabels.map((l) => l.trim().toLowerCase()))
  return DECK_ATTRIBUTE_PRESETS.filter((p) =>
    !have.has(p.label.toLowerCase()) &&
    (type === null || p.appliesTo === 'all' || p.appliesTo.includes(type)))
}
