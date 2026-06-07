/**
 * Standalone system card preview — no auth, no DB.
 * Seeded with James Hardie Axon™ Cladding data from CSV exports.
 * Use this page to iterate on the system card design.
 */

import { SystemCard, type SystemCardData } from '@/components/system-card/SystemCard'

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
  source_url: null,
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
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack', sort_order: null,
    },
    {
      sku: '305520',
      name: 'Hardie™ 9mm Aluminium Internal Corner 3,000mm',
      description: 'Ready-to-paint aluminium extrusion used at internal corner junctions to conceal the board edge.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack', sort_order: null,
    },
    {
      sku: '305513',
      name: 'Hardie™ Aluminium Snap On Corner 2 piece 3,000mm',
      description: 'Ready-to-paint aluminium extrusion set for internal and external corner junctions; conceals board edge.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'sets per pack', sort_order: null,
    },
    {
      sku: '306190',
      name: 'Hardie™ 9mm Aluminium Recessed Horizontal Jointer',
      description: 'Recessed horizontal jointer that creates a 6mm horizontal shadow line.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack', sort_order: null,
    },
    {
      sku: '306191',
      name: 'Hardie™ 9mm Aluminium Recessed Horizontal Jointer Connector',
      description: 'Connector piece for the recessed horizontal jointer (paired with 306190).',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack', sort_order: null,
    },
    {
      sku: '304560',
      name: 'Hardie™ 50mm Foam Back Sealing Tape 25m roll',
      description: 'Foam-backed sealing tape for panel joints.',
      category: 'Axon accessory', uom: 'each',
      supplier_pack_qty: 1, supplier_pack_uom: 'each', sort_order: null,
    },
    {
      sku: '305515',
      name: 'Hardie™ 9mm Aluminium Base Trim 3,000mm',
      description: 'Aluminium base trim for bottom of panel installation.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack', sort_order: null,
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
  hero_image_url: null,
  bal_rating: null,
  fire_rating: null,
  moisture_resistant: null,
  acoustic_rating: null,
  structural_grade: null,
  australian_made: null,
  source_url: null,
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
      supplier_pack_qty: null, supplier_pack_uom: null, sort_order: null,
    },
    {
      sku: null,
      name: 'Stainless steel adjustable striker plate',
      description: 'Striker plate with adjustable tongue. Placed at 1000mm AFL to centre or as required.',
      category: 'Doorframe hardware', uom: 'each',
      supplier_pack_qty: null, supplier_pack_uom: null, sort_order: null,
    },
    {
      sku: null,
      name: 'Rubber buffers',
      description: 'Rubber buffers to protect the door and reduce noise.',
      category: 'Doorframe hardware', uom: 'set',
      supplier_pack_qty: null, supplier_pack_uom: null, sort_order: null,
    },
    {
      sku: null,
      name: 'Brick ties',
      description: 'Welded frames are supplied with brick ties upon delivery.',
      category: 'Doorframe fixing', uom: 'set',
      supplier_pack_qty: null, supplier_pack_uom: null, sort_order: null,
    },
  ],

  colours: [],
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const CARDS = [
  { label: 'James Hardie — Axon™ Cladding', data: AXON_CLADDING },
  { label: 'JDS Metal Doorframes — RegalFrame', data: JDS_REGALFRAME },
]

export default function SystemCardPreviewPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-page-bg)' }}>
      {/* Banner */}
      <div style={{
        background: 'var(--ds-navy)',
        color: '#fff',
        padding: '0.6rem 1rem',
        fontSize: '0.8rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700 }}>BuildQuote</span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span style={{ opacity: 0.8 }}>System cards</span>
        <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: '0.7rem' }}>
          Preview · Static data
        </span>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.25rem 1rem 4rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ds-navy)', margin: '0 0 0.2rem' }}>
            System cards
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)', margin: 0 }}>
            {CARDS.length} systems · tap a card to explore profiles and accessories
          </p>
        </div>

        <div className="sc-card-grid">
          {CARDS.map(({ label, data }) => (
            <div key={label}>
              <SystemCard data={data} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
