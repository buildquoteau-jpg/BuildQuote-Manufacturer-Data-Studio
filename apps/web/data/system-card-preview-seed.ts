// Static seed data for the no-auth /system-card-preview demo page AND the
// package-generator fixture (scripts/build-package-fixture.ts). Lives outside
// the page file because App Router pages may only export route-level symbols.
//
// Seeded with James Hardie Axon™ Cladding (from CSV exports) plus JDS
// RegalFrame as a second card so both profile-grouping shapes stay covered.

import type {
  SystemCardSystem,
  SystemCardManufacturerPage,
} from '@/components/system-card-renderer/types'

// Old flat seed shape (kept as-is; converted to renderer props at the end)
type SystemCardData = {
  name: string
  manufacturer_name: string
  category: string | null
  subcategory: string | null
  description: string | null
  hero_image_url: string | null
  hero_image_position_x?: number | null
  hero_image_position_y?: number | null
  hero_image_zoom?: number | null
  bal_rating: string | null
  fire_rating: string | null
  moisture_resistant: boolean | null
  acoustic_rating: string | null
  structural_grade: string | null
  australian_made: boolean | null
  notes: string | null
  source_url: string | null
  install_guide_urls: { label: string; url: string }[] | null
  design_guide_url: string | null
  tech_data_url: string | null
  custom_document_links: { label: string; url: string }[] | null
  profiles: {
    product_code: string | null
    profile_name: string
    dimensions: string | null
    length_mm: number | null
    height_mm: number | null
    width_mm: number | null
    thickness_mm: number | null
    uom: string | null
    supplier_pack_qty: number | null
    supplier_pack_uom: string | null
    sort_order: number | null
  }[]
  components: {
    sku: string | null
    name: string
    description: string | null
    category: string | null
    uom: string | null
    supplier_pack_qty: number | null
    supplier_pack_uom: string | null
    sort_order: number | null
    procurement_route: 'specialist_supplier' | 'trade_merchant' | null
  }[]
  colours: { colour_name: string; sku_suffix: string | null; is_stocked: boolean | null }[]
}

// ─── Seed data: James Hardie Axon™ Cladding ──────────────────────────────────
// Source: james_hardie_axon_system_card_csv.zip (01–06 CSVs)

const AXON_CLADDING: SystemCardData = {
  name: 'Axon™ Cladding',
  manufacturer_name: 'James Hardie®',
  category: 'Exterior cladding',
  subcategory: 'Vertically grooved fibre cement panel',
  description:
    'Axon™ Cladding is a vertically grooved fibre cement panel system that brings the look of painted vertical joint timber with the durability and efficiency of large-format Hardie™ fibre cement panels. The stepped shiplap long edge supports easy installation, and the range includes 133mm Smooth, 133mm Grained, and 400mm Smooth groove-spacing options.',
  hero_image_url: null,
  bal_rating: null,
  fire_rating: null,
  moisture_resistant: null,
  acoustic_rating: null,
  structural_grade: null,
  australian_made: null,
  // Demo links so the primary-resource buttons beneath the hero gallery
  // (Library V7 layout) are visible on the no-auth preview page.
  source_url: 'https://www.jameshardie.com.au/',
  install_guide_urls: [{ label: 'Axon Cladding', url: 'https://www.jameshardie.com.au/axon-install-guide' }],
  design_guide_url: null,
  tech_data_url: null,
  // Demo extra documents so the named-button feature is visible on the preview.
  custom_document_links: [
    { label: 'Energy rating', url: 'https://www.jameshardie.com.au/axon-energy-rating' },
    { label: 'Sustainability report', url: 'https://www.jameshardie.com.au/sustainability' },
  ],
  notes: 'Pre-primed/site-painted — no stocked colours.',

  profiles: [
    {
      product_code: '403931',
      profile_name: 'Axon™ Cladding 133mm Smooth — 2450mm',
      dimensions: 'Smooth; groove spacing 133mm; 2450mm × 1200mm × 9mm',
      length_mm: 2450, height_mm: null, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 1,
    },
    {
      product_code: '404417',
      profile_name: 'Axon™ Cladding 400mm Smooth — 2450mm',
      dimensions: 'Smooth; groove spacing 400mm; 2450mm × 1200mm × 9mm',
      length_mm: 2450, height_mm: null, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 2,
    },
    {
      product_code: '403932',
      profile_name: 'Axon™ Cladding 133mm Smooth — 2750mm',
      dimensions: 'Smooth; groove spacing 133mm; 2750mm × 1200mm × 9mm',
      length_mm: 2750, height_mm: null, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 3,
    },
    {
      product_code: '404418',
      profile_name: 'Axon™ Cladding 400mm Smooth — 2750mm',
      dimensions: 'Smooth; groove spacing 400mm; 2750mm × 1200mm × 9mm',
      length_mm: 2750, height_mm: null, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 4,
    },
    {
      product_code: '403933',
      profile_name: 'Axon™ Cladding 133mm Smooth — 3000mm',
      dimensions: 'Smooth; groove spacing 133mm; 3000mm × 1200mm × 9mm',
      length_mm: 3000, height_mm: null, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 5,
    },
    {
      product_code: '404419',
      profile_name: 'Axon™ Cladding 400mm Smooth — 3000mm',
      dimensions: 'Smooth; groove spacing 400mm; 3000mm × 1200mm × 9mm',
      length_mm: 3000, height_mm: null, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 6,
    },
    {
      product_code: '404512',
      profile_name: 'Axon™ Cladding 133mm Grained — 3000mm',
      dimensions: 'Grained; groove spacing 133mm; 3000mm × 1200mm × 9mm',
      length_mm: 3000, height_mm: null, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 7,
    },
    {
      product_code: '403934',
      profile_name: 'Axon™ Cladding 133mm Smooth — 3600mm',
      dimensions: 'Smooth; groove spacing 133mm; 3600mm × 1200mm × 9mm',
      length_mm: 3600, height_mm: null, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 8,
    },
    {
      product_code: '404420',
      profile_name: 'Axon™ Cladding 400mm Smooth — 3600mm',
      dimensions: 'Smooth; groove spacing 400mm; 3600mm × 1200mm × 9mm',
      length_mm: 3600, height_mm: null, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 9,
    },
  ],

  components: [
    {
      sku: '306100',
      name: 'Hardie™ 9mm Aluminium External Square Corner 3,000mm',
      description: 'Aluminium extrusion that creates a square edge in external corner.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack', sort_order: null, procurement_route: null,
    },
    {
      sku: '305520',
      name: 'Hardie™ 9mm Aluminium Internal Corner 3,000mm',
      description: 'Ready-to-paint aluminium extrusion used at internal corner junctions to conceal the board edge.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack', sort_order: null, procurement_route: null,
    },
    {
      sku: '305513',
      name: 'Hardie™ Aluminium Snap On Corner 2 piece 3,000mm',
      description: 'Ready-to-paint aluminium extrusion set for internal and external corner junctions; conceals board edge.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'sets per pack', sort_order: null, procurement_route: null,
    },
    {
      sku: '306190',
      name: 'Hardie™ 9mm Aluminium Recessed Horizontal Jointer',
      description: 'Recessed horizontal jointer that creates a 6mm horizontal shadow line.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack', sort_order: null, procurement_route: null,
    },
    {
      sku: '306191',
      name: 'Hardie™ 9mm Aluminium Recessed Horizontal Jointer Connector',
      description: 'Connector piece for the recessed horizontal jointer (paired with 306190).',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack', sort_order: null, procurement_route: null,
    },
    {
      sku: '304560',
      name: 'Hardie™ 50mm Foam Back Sealing Tape 25m roll',
      description: 'Foam-backed sealing tape for panel joints.',
      category: 'Axon accessory', uom: 'each',
      supplier_pack_qty: 1, supplier_pack_uom: 'each', sort_order: null, procurement_route: null,
    },
    {
      sku: '305515',
      name: 'Hardie™ 9mm Aluminium Base Trim 3,000mm',
      description: 'Aluminium base trim for bottom of panel installation.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack', sort_order: null, procurement_route: null,
    },
  ],

  colours: [],
}

// ─── Second card: JDS RegalFrame (for comparison) ─────────────────────────────

const JDS_REGALFRAME: SystemCardData = {
  name: 'RegalFrame Metal Doorframes',
  manufacturer_name: 'JDS Metal Doorframes',
  category: 'Metal doorframes',
  subcategory: 'Brick construction',
  description:
    'RegalFrame is a welded metal doorframe with a built-in architrave, designed to give a timber-look doorframe with the strength and durability of metal. Made from 1.05mm Zincanneal. Available in 95mm or 114mm back opening.',
  // Demo hero with zoom (Library V7 crop+zoom) so the single-hero zoom path
  // is exercisable on the no-auth preview page.
  hero_image_url: 'https://picsum.photos/seed/bq-regalframe/1200/700',
  hero_image_position_x: 50,
  hero_image_position_y: 40,
  hero_image_zoom: 1.6,
  bal_rating: null,
  fire_rating: null,
  moisture_resistant: null,
  acoustic_rating: null,
  structural_grade: null,
  australian_made: null,
  source_url: null,
  install_guide_urls: null,
  design_guide_url: null,
  tech_data_url: null,
  custom_document_links: null,
  notes: null,

  profiles: [
    {
      product_code: null,
      profile_name: 'Standard frame — 95mm back opening',
      dimensions: 'Back opening 95mm; A 29.5mm; profile overall 154mm × 50mm',
      length_mm: null, height_mm: null, width_mm: 154, thickness_mm: 1.05,
      uom: 'each', supplier_pack_qty: null, supplier_pack_uom: null, sort_order: 1,
    },
    {
      product_code: null,
      profile_name: 'Standard frame — 114mm back opening',
      dimensions: 'Back opening 114mm; A 20mm; profile overall 154mm × 50mm',
      length_mm: null, height_mm: null, width_mm: 154, thickness_mm: 1.05,
      uom: 'each', supplier_pack_qty: null, supplier_pack_uom: null, sort_order: 2,
    },
    {
      product_code: null,
      profile_name: 'Slider frame — 95mm back opening',
      dimensions: 'Back opening 95mm; A 29.5mm; profile overall 154mm × 50mm',
      length_mm: null, height_mm: null, width_mm: 154, thickness_mm: 1.05,
      uom: 'each', supplier_pack_qty: null, supplier_pack_uom: null, sort_order: 3,
    },
    {
      product_code: null,
      profile_name: 'Slider frame — 114mm back opening',
      dimensions: 'Back opening 114mm; A 20mm; profile overall 154mm × 50mm',
      length_mm: null, height_mm: null, width_mm: 154, thickness_mm: 1.05,
      uom: 'each', supplier_pack_qty: null, supplier_pack_uom: null, sort_order: 4,
    },
  ],

  components: [
    {
      sku: null,
      name: 'Standard welded zinc-plated hinge',
      description: 'Standard welded 1.6 zinc-plated 100 × 75 hinge used on frames.',
      category: 'Doorframe hardware', uom: 'each',
      supplier_pack_qty: null, supplier_pack_uom: null, sort_order: null, procurement_route: null,
    },
    {
      sku: null,
      name: 'Stainless steel adjustable striker plate',
      description: 'Striker plate with adjustable tongue. Placed at 1000mm AFL to centre or as required.',
      category: 'Doorframe hardware', uom: 'each',
      supplier_pack_qty: null, supplier_pack_uom: null, sort_order: null, procurement_route: null,
    },
    {
      sku: null,
      name: 'Rubber buffers',
      description: 'Rubber buffers to protect the door and reduce noise.',
      category: 'Doorframe hardware', uom: 'set',
      supplier_pack_qty: null, supplier_pack_uom: null, sort_order: null, procurement_route: null,
    },
    {
      sku: null,
      name: 'Brick ties',
      description: 'Welded frames are supplied with brick ties upon delivery.',
      category: 'Doorframe fixing', uom: 'set',
      supplier_pack_qty: null, supplier_pack_uom: null, sort_order: null, procurement_route: null,
    },
  ],

  colours: [],
}

// ─── Convert seed data to master renderer props ───────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function toRendererSystem(data: SystemCardData, id: string): SystemCardSystem {
  return {
    id,
    name: data.name,
    product_code: null,
    slug: slugify(data.name),
    category: data.category,
    subcategory: data.subcategory,
    description: data.description,
    hero_image_url: data.hero_image_url,
    hero_image_position_x: data.hero_image_position_x ?? null,
    hero_image_position_y: data.hero_image_position_y ?? null,
    hero_image_zoom: data.hero_image_zoom ?? null,
    australian_made: data.australian_made,
    bal_rating: data.bal_rating,
    fire_rating: data.fire_rating,
    moisture_resistant: data.moisture_resistant,
    acoustic_rating: data.acoustic_rating,
    structural_grade: data.structural_grade,
    notes: data.notes,
    website_url: data.source_url,
    install_guide_urls: data.install_guide_urls,
    design_guide_url: data.design_guide_url,
    tech_data_url: data.tech_data_url,
    custom_document_links: data.custom_document_links,
    manufacturer: {
      name: data.manufacturer_name,
      slug: slugify(data.manufacturer_name),
      logo_url: null,
    },
    system_colours: data.colours.map((c, i) => ({
      colour_name: c.colour_name,
      image_url: null,
      sort_order: i,
      is_stocked: c.is_stocked ?? true,
    })),
    system_profiles: data.profiles.map((p, i) => ({
      id: `${id}-profile-${i}`,
      profile_name: p.profile_name,
      name: null,
      product_code: p.product_code,
      dimensions: p.dimensions,
      length_mm: p.length_mm,
      width_mm: p.width_mm,
      height_mm: p.height_mm,
      thickness_mm: p.thickness_mm,
      uom: p.uom,
      supplier_pack_qty: p.supplier_pack_qty,
      supplier_pack_uom: p.supplier_pack_uom,
      sort_order: p.sort_order ?? i,
    })),
    system_components: data.components.map((c, i) => ({
      id: `${id}-comp-${i}`,
      role: c.category ?? 'Component',
      notes: null,
      sort_order: c.sort_order ?? i,
      components: {
        name: c.name,
        sku: c.sku,
        description: c.description,
        category: c.category,
        uom: c.uom,
        procurement_route: c.procurement_route,
      },
    })),
  }
}

// ─── Exported seed ────────────────────────────────────────────────────────────

// Demo landing page uses James Hardie as the manufacturer; the JDS card is kept
// as a second system so both profile-grouping shapes stay easy to iterate on.
export const DEMO_MANUFACTURER: SystemCardManufacturerPage = {
  name: 'James Hardie®',
  slug: 'james-hardie',
  description:
    'Static demo data. This page renders the master System Card experience — manufacturer landing page, system tiles, full cards, shopping list and sharing — with no auth and no database.',
  website_url: null,
  logo_url: null,
  hero_image_url: null,
}

// Demo gallery (Library V7 hero gallery) — placeholder images so the
// swipeable gallery, count pill, dots and fullscreen lightbox are all
// exercisable on this no-auth preview page.
const DEMO_GALLERY = [1, 2, 3, 4, 5, 6].map(n => ({
  url: `https://picsum.photos/seed/bq-axon-${n}/1200/700`,
  og_jpg_url: null,
  alt: `Axon Cladding demo image ${n}`,
  caption: n === 1 ? 'Installed project — demo image' : null,
}))

export const DEMO_SYSTEMS: SystemCardSystem[] = [
  { ...toRendererSystem(AXON_CLADDING, 'demo-axon'), gallery_images: DEMO_GALLERY },
  toRendererSystem(JDS_REGALFRAME, 'demo-regalframe'),
]
