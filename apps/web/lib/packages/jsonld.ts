// schema.org JSON-LD for System Cards. Pure module (no Supabase, no server
// imports) so both the static package generator and the hosted card pages can
// share it.

import type { SystemCardSystem } from '@/components/system-card-renderer/types'

/** Build a schema.org Product object for a card. `url` is the canonical card
 *  URL (or the card's public URL inside a static package). `image` should be
 *  an absolute URL when known — relative package paths are omitted. */
export function buildCardJsonLd(system: SystemCardSystem, url: string | null): Record<string, unknown> {
  const additionalProperty: Record<string, unknown>[] = []
  const addProp = (name: string, value: string | boolean | null | undefined) => {
    if (value === null || value === undefined || value === '') return
    additionalProperty.push({ '@type': 'PropertyValue', name, value })
  }
  addProp('Fire rating', system.fire_rating)
  addProp('Acoustic rating', system.acoustic_rating)
  addProp('BAL rating', system.bal_rating)
  addProp('Structural grade', system.structural_grade)
  addProp('Moisture resistant', system.moisture_resistant ?? undefined)
  addProp('Australian made', system.australian_made ?? undefined)

  // Components on the card are related products (fixings, accessories,
  // consumables that belong to the system).
  const isRelatedTo = system.system_components
    .map((entry) => entry.components)
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => ({
      '@type': 'Product',
      name: c.name,
      ...(c.sku ? { sku: c.sku } : {}),
      ...(c.description ? { description: c.description } : {}),
      ...(c.category ? { category: c.category } : {}),
    }))

  const image = system.hero_image_url && /^https?:\/\//i.test(system.hero_image_url)
    ? system.hero_image_url
    : undefined

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: system.name,
    ...(system.description ? { description: system.description } : {}),
    ...(system.product_code ? { sku: system.product_code } : {}),
    ...(system.category ? { category: [system.category, system.subcategory].filter(Boolean).join(' > ') } : {}),
    ...(system.manufacturer ? {
      brand: { '@type': 'Brand', name: system.manufacturer.name },
      manufacturer: { '@type': 'Organization', name: system.manufacturer.name },
    } : {}),
    ...(url ? { url } : {}),
    ...(image ? { image } : {}),
    ...(additionalProperty.length > 0 ? { additionalProperty } : {}),
    ...(isRelatedTo.length > 0 ? { isRelatedTo } : {}),
  }
}
