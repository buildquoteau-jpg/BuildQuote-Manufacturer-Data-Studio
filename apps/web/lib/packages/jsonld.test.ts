import { describe, it, expect } from 'vitest'
import { buildCardJsonLd } from './jsonld'
import type { SystemCardSystem } from '@/components/system-card-renderer/types'

function system(over: Partial<SystemCardSystem> = {}): SystemCardSystem {
  return {
    id: 'card-1',
    name: 'Avenue Decking',
    product_code: null,
    slug: 'avenue-decking',
    category: null,
    subcategory: null,
    description: null,
    hero_image_url: null,
    hero_image_position_x: null,
    hero_image_position_y: null,
    australian_made: null,
    bal_rating: null,
    fire_rating: null,
    moisture_resistant: null,
    acoustic_rating: null,
    structural_grade: null,
    notes: null,
    website_url: null,
    install_guide_urls: null,
    design_guide_url: null,
    tech_data_url: null,
    manufacturer: null,
    system_colours: [],
    system_profiles: [],
    system_components: [],
    ...over,
  }
}

function componentEntry(
  components: SystemCardSystem['system_components'][number]['components'],
): SystemCardSystem['system_components'][number] {
  return { id: 'link-1', role: 'required', notes: null, sort_order: 0, components }
}

describe('buildCardJsonLd', () => {
  it('emits a minimal schema.org Product for a bare card', () => {
    expect(buildCardJsonLd(system(), null)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Avenue Decking',
    })
  })

  it('includes the canonical url when one is supplied', () => {
    const jsonLd = buildCardJsonLd(system(), 'https://buildquote.com.au/cards/avenue-decking')
    expect(jsonLd.url).toBe('https://buildquote.com.au/cards/avenue-decking')
  })

  it('maps product_code to sku and joins category with subcategory', () => {
    const jsonLd = buildCardJsonLd(
      system({ product_code: 'NTW-AVE', category: 'Cladding', subcategory: 'Composite' }),
      null,
    )
    expect(jsonLd).toMatchObject({ sku: 'NTW-AVE', category: 'Cladding > Composite' })
  })

  it('omits the subcategory separator when there is no subcategory', () => {
    expect(buildCardJsonLd(system({ category: 'Cladding' }), null).category).toBe('Cladding')
  })

  it('omits category entirely when the card has none', () => {
    expect(buildCardJsonLd(system({ subcategory: 'Composite' }), null)).not.toHaveProperty('category')
  })

  it('maps the manufacturer to both brand and manufacturer', () => {
    const jsonLd = buildCardJsonLd(
      system({ manufacturer: { name: 'NewTechWood', slug: 'newtechwood', logo_url: null } }),
      null,
    )
    expect(jsonLd).toMatchObject({
      brand: { '@type': 'Brand', name: 'NewTechWood' },
      manufacturer: { '@type': 'Organization', name: 'NewTechWood' },
    })
  })

  it('only includes absolute image URLs', () => {
    expect(buildCardJsonLd(system({ hero_image_url: 'https://cdn.example.com/h.jpg' }), null).image).toBe(
      'https://cdn.example.com/h.jpg',
    )
    // Relative package paths are meaningless to a crawler.
    expect(buildCardJsonLd(system({ hero_image_url: 'images/hero.jpg' }), null)).not.toHaveProperty(
      'image',
    )
  })

  it('emits additionalProperty entries for the ratings that are set', () => {
    const jsonLd = buildCardJsonLd(
      system({
        fire_rating: 'Group 1',
        acoustic_rating: null,
        bal_rating: 'BAL-29',
        structural_grade: '',
        moisture_resistant: true,
        australian_made: false,
      }),
      null,
    )
    expect(jsonLd.additionalProperty).toEqual([
      { '@type': 'PropertyValue', name: 'Fire rating', value: 'Group 1' },
      { '@type': 'PropertyValue', name: 'BAL rating', value: 'BAL-29' },
      { '@type': 'PropertyValue', name: 'Moisture resistant', value: true },
      { '@type': 'PropertyValue', name: 'Australian made', value: false },
    ])
  })

  it('omits additionalProperty when no spec facts are set', () => {
    expect(buildCardJsonLd(system(), null)).not.toHaveProperty('additionalProperty')
  })

  it('maps components to isRelatedTo products and skips empty link rows', () => {
    const jsonLd = buildCardJsonLd(
      system({
        system_components: [
          componentEntry({
            name: 'Hidden Fix Clip',
            sku: 'CLIP-1',
            description: 'Stainless clip',
            category: 'Fixings',
            uom: 'ea',
            procurement_route: null,
          }),
          componentEntry(null),
          componentEntry({
            name: 'End Cap',
            sku: null,
            description: null,
            category: null,
            uom: null,
            procurement_route: null,
          }),
        ],
      }),
      null,
    )
    expect(jsonLd.isRelatedTo).toEqual([
      {
        '@type': 'Product',
        name: 'Hidden Fix Clip',
        sku: 'CLIP-1',
        description: 'Stainless clip',
        category: 'Fixings',
      },
      { '@type': 'Product', name: 'End Cap' },
    ])
  })

  it('omits isRelatedTo when every component link is empty', () => {
    const jsonLd = buildCardJsonLd(system({ system_components: [componentEntry(null)] }), null)
    expect(jsonLd).not.toHaveProperty('isRelatedTo')
  })
})
