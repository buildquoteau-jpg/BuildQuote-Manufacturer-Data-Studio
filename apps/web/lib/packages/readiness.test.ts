import { describe, it, expect } from 'vitest'
import {
  slugifyName,
  resolveCardSlug,
  isPublicGuideUrl,
  evaluateCardReadiness,
  evaluateManufacturerReadiness,
  summarisePackageReadiness,
  type CardAssetInfo,
  type CardReadiness,
} from './readiness'
import type { ManufacturerInfo, VerificationSystem } from '@/lib/studio-manufacturer/workspace'

// ============================================================
// Fixtures — a card that is ready to package, mutated per test.
// ============================================================

function card(over: Partial<VerificationSystem> = {}): VerificationSystem {
  return {
    id: 'card-1',
    name: 'Avenue Decking',
    slug: 'avenue-decking',
    product_code: 'NTW-AVE',
    category: 'Decking',
    subcategory: null,
    description: null,
    hero_image_url: null,
    hero_image_asset_id: 'asset-1',
    hero_image_position_x: null,
    hero_image_position_y: null,
    hero_image_zoom: null,
    gallery_images: null,
    australian_made: null,
    bal_rating: null,
    fire_rating: null,
    acoustic_rating: null,
    moisture_resistant: null,
    structural_grade: null,
    website_url: null,
    source_url: null,
    source_document_id: null,
    install_guide_urls: [{ label: 'Install guide', url: 'https://newtechwood.com/install.pdf' }],
    design_guide_url: null,
    tech_data_url: null,
    notes: null,
    verification_status: 'manufacturer_verified',
    reviewer_notes: null,
    verified_at: null,
    production_system_id: 'prod-1',
    last_published_at: null,
    publish_status: null,
    published_version: null,
    updated_at: '2026-01-01T00:00:00Z',
    last_submitted_at: null,
    profiles: [{ id: 'p1' } as VerificationSystem['profiles'][number]],
    components: [],
    colours: [],
    ...over,
  }
}

const READY_ASSET: CardAssetInfo = { heroImageAssetId: 'asset-1', heroAssetReady: true }

function manufacturer(over: Partial<ManufacturerInfo> = {}): ManufacturerInfo {
  return {
    id: 'mfr-1',
    name: 'NewTechWood',
    slug: 'newtechwood',
    status: 'active',
    description: 'Composite decking and cladding.',
    websiteUrl: 'https://newtechwood.com.au',
    heroImageUrl: null,
    ...over,
  }
}

// ============================================================
// slugifyName / resolveCardSlug
// ============================================================

describe('slugifyName', () => {
  it.each([
    ['Avenue Decking', 'avenue-decking'],
    ['Cladding & Trims', 'cladding-and-trims'],
    ['  Linea® 180  ', 'linea-180'],
    ['---weird---', 'weird'],
    ['UPPER_CASE_v2', 'upper-case-v2'],
  ])('slugifies %p to %p', (input, expected) => {
    expect(slugifyName(input)).toBe(expected)
  })

  it('falls back to "card" when nothing survives slugification', () => {
    expect(slugifyName('!!!')).toBe('card')
    expect(slugifyName('')).toBe('card')
  })

  it('caps the slug at 80 characters', () => {
    expect(slugifyName('a'.repeat(200))).toHaveLength(80)
  })
})

describe('resolveCardSlug', () => {
  it('prefers the stored slug', () => {
    expect(resolveCardSlug({ slug: 'stored-slug', name: 'Avenue Decking' })).toBe('stored-slug')
  })

  it.each([null, undefined, '', '   '])('falls back to the name when the slug is %p', (slug) => {
    expect(resolveCardSlug({ slug, name: 'Avenue Decking' })).toBe('avenue-decking')
  })
})

// ============================================================
// isPublicGuideUrl
// ============================================================

describe('isPublicGuideUrl', () => {
  it.each([
    'https://newtechwood.com.au/install.pdf',
    'http://example.com/guide',
    'HTTPS://Example.com/Guide',
  ])('accepts the public URL %p', (url) => {
    expect(isPublicGuideUrl(url)).toBe(true)
  })

  it.each([
    'https://ovndokzwkxpfjfobewaq.supabase.co/storage/guide.pdf',
    'https://bucket.r2.cloudflarestorage.com/guide.pdf',
    'https://pub-123.r2.dev/guide.pdf',
    'http://localhost:3000/guide.pdf',
    'http://127.0.0.1:3000/guide.pdf',
    'https://studio-preview.vercel.app/guide.pdf',
  ])('rejects the Studio/draft URL %p', (url) => {
    expect(isPublicGuideUrl(url)).toBe(false)
  })

  it.each(['newtechwood.com/guide.pdf', '/docs/guide.pdf', 'ftp://example.com/guide.pdf', ''])(
    'rejects the non-http(s) value %p',
    (url) => {
      expect(isPublicGuideUrl(url)).toBe(false)
    },
  )
})

// ============================================================
// evaluateCardReadiness
// ============================================================

describe('evaluateCardReadiness', () => {
  it('reports a fully prepared card as ready', () => {
    expect(evaluateCardReadiness(card(), READY_ASSET)).toEqual({
      cardId: 'card-1',
      name: 'Avenue Decking',
      slug: 'avenue-decking',
      status: 'ready',
      blockers: [],
      warnings: [],
    })
  })

  it.each([
    ['title', { name: '   ' }],
    ['category', { category: null }],
  ])('blocks on a missing %s', (_label, over) => {
    const result = evaluateCardReadiness(card(over), READY_ASSET)
    expect(result.status).toBe('missing_data')
    expect(result.blockers).toHaveLength(1)
  })

  it('blocks a card with no profiles and no components', () => {
    const result = evaluateCardReadiness(card({ profiles: [], components: [] }), READY_ASSET)
    expect(result.status).toBe('missing_data')
    expect(result.blockers).toContain('Card has no selectable line items (no profiles or components).')
  })

  it('accepts components as the only line items', () => {
    const result = evaluateCardReadiness(
      card({ profiles: [], components: [{ id: 'c1' } as VerificationSystem['components'][number]] }),
      READY_ASSET,
    )
    expect(result.status).toBe('ready')
  })

  it.each([
    ['not manufacturer verified', { verification_status: 'pending_review' }],
    ['not BuildQuote approved', { production_system_id: null }],
  ])('blocks a card that is %s', (_label, over) => {
    const result = evaluateCardReadiness(card(over), READY_ASSET)
    expect(result.status).toBe('needs_approval')
    expect(result.blockers).toHaveLength(1)
  })

  it('blocks when the linked hero asset is archived or unapproved', () => {
    const result = evaluateCardReadiness(card(), { heroImageAssetId: 'asset-1', heroAssetReady: false })
    expect(result.status).toBe('needs_asset_import')
  })

  it('blocks a URL-only hero image so packages bundle a local copy', () => {
    const result = evaluateCardReadiness(
      card({ hero_image_asset_id: null, hero_image_url: 'https://newtechwood.com/hero.jpg' }),
      { heroImageAssetId: null, heroAssetReady: false },
    )
    expect(result.status).toBe('needs_asset_import')
    expect(result.blockers[0]).toMatch(/import it into Assets/)
  })

  it('only warns when there is no hero image at all', () => {
    const result = evaluateCardReadiness(card({ hero_image_asset_id: null }), undefined)
    expect(result.status).toBe('ready')
    expect(result.warnings).toContain('No hero image set (card will render without one).')
  })

  it('blocks on a draft guide link and names the guide', () => {
    const result = evaluateCardReadiness(
      card({ install_guide_urls: [{ label: 'Install guide', url: 'https://pub-1.r2.dev/i.pdf' }] }),
      READY_ASSET,
    )
    expect(result.status).toBe('needs_guide_url')
    expect(result.blockers[0]).toContain('"Install guide"')
  })

  it('checks design, technical and custom document links too', () => {
    const result = evaluateCardReadiness(
      card({
        install_guide_urls: null,
        design_guide_url: 'https://x.supabase.co/design.pdf',
        tech_data_url: 'https://newtechwood.com/tech.pdf',
        custom_document_links: [{ label: 'Energy rating', url: 'http://localhost:3000/e.pdf' }],
      }),
      READY_ASSET,
    )
    expect(result.status).toBe('needs_guide_url')
    expect(result.blockers).toHaveLength(2)
  })

  it('warns when a card has no guide links at all', () => {
    const result = evaluateCardReadiness(card({ install_guide_urls: null }), READY_ASSET)
    expect(result.status).toBe('ready')
    expect(result.warnings[0]).toMatch(/No install\/design guide links/)
  })

  it('reports the worst status when several checks fail', () => {
    const result = evaluateCardReadiness(
      card({
        category: null,
        verification_status: 'pending_review',
        hero_image_asset_id: null,
        hero_image_url: 'https://newtechwood.com/hero.jpg',
        install_guide_urls: [{ label: 'Install guide', url: 'http://localhost/i.pdf' }],
      }),
      { heroImageAssetId: null, heroAssetReady: false },
    )
    expect(result.status).toBe('missing_data')
    expect(result.blockers).toHaveLength(4)
  })

  it('derives the slug from the name when the card has none', () => {
    const result = evaluateCardReadiness(card({ slug: null }), READY_ASSET)
    expect(result.slug).toBe('avenue-decking')
  })
})

// ============================================================
// evaluateManufacturerReadiness
// ============================================================

describe('evaluateManufacturerReadiness', () => {
  it('passes a complete manufacturer with a logo', () => {
    expect(evaluateManufacturerReadiness(manufacturer(), { hasLogoAsset: true })).toEqual({
      blockers: [],
      warnings: [],
    })
  })

  it.each([
    ['name', { name: '' }],
    ['slug', { slug: '  ' }],
    ['websiteUrl', { websiteUrl: null }],
  ])('blocks on a missing %s', (_label, over) => {
    const result = evaluateManufacturerReadiness(manufacturer(over), { hasLogoAsset: true })
    expect(result.blockers).toHaveLength(1)
  })

  it('warns (not blocks) on a missing description or logo', () => {
    const result = evaluateManufacturerReadiness(manufacturer({ description: null }), {
      hasLogoAsset: false,
    })
    expect(result.blockers).toEqual([])
    expect(result.warnings).toHaveLength(2)
  })
})

// ============================================================
// summarisePackageReadiness
// ============================================================

describe('summarisePackageReadiness', () => {
  const readyCard = { status: 'ready' } as CardReadiness
  const blockedCard = { status: 'needs_approval' } as CardReadiness

  it('counts ready and blocked cards', () => {
    const summary = summarisePackageReadiness({ blockers: [], warnings: [] }, [readyCard, blockedCard])
    expect(summary).toMatchObject({ readyCount: 1, blockedCount: 1, canGenerate: true })
  })

  it('cannot generate when no card is ready', () => {
    const summary = summarisePackageReadiness({ blockers: [], warnings: [] }, [blockedCard])
    expect(summary.canGenerate).toBe(false)
  })

  it('cannot generate when the manufacturer itself is blocked', () => {
    const summary = summarisePackageReadiness({ blockers: ['No website URL'], warnings: [] }, [readyCard])
    expect(summary.canGenerate).toBe(false)
  })

  it('cannot generate with no cards at all', () => {
    const summary = summarisePackageReadiness({ blockers: [], warnings: [] }, [])
    expect(summary).toMatchObject({ readyCount: 0, blockedCount: 0, canGenerate: false })
  })
})
