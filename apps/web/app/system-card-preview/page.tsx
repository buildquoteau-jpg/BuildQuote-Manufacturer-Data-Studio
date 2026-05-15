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
  hero_image_url: null, // replace with real URL once available
  bal_rating: null,
  notes: 'Pre-primed/site-painted — no stocked colours.',

  profiles: [
    {
      product_code: '403931',
      profile_name: 'Axon™ Cladding 133mm Smooth — 2450mm',
      dimensions: 'Smooth; groove spacing 133mm; 2450mm × 1200mm × 9mm',
      length_mm: 2450, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 1,
    },
    {
      product_code: '404417',
      profile_name: 'Axon™ Cladding 400mm Smooth — 2450mm',
      dimensions: 'Smooth; groove spacing 400mm; 2450mm × 1200mm × 9mm',
      length_mm: 2450, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 2,
    },
    {
      product_code: '403932',
      profile_name: 'Axon™ Cladding 133mm Smooth — 2750mm',
      dimensions: 'Smooth; groove spacing 133mm; 2750mm × 1200mm × 9mm',
      length_mm: 2750, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 3,
    },
    {
      product_code: '404418',
      profile_name: 'Axon™ Cladding 400mm Smooth — 2750mm',
      dimensions: 'Smooth; groove spacing 400mm; 2750mm × 1200mm × 9mm',
      length_mm: 2750, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 4,
    },
    {
      product_code: '403933',
      profile_name: 'Axon™ Cladding 133mm Smooth — 3000mm',
      dimensions: 'Smooth; groove spacing 133mm; 3000mm × 1200mm × 9mm',
      length_mm: 3000, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 5,
    },
    {
      product_code: '404419',
      profile_name: 'Axon™ Cladding 400mm Smooth — 3000mm',
      dimensions: 'Smooth; groove spacing 400mm; 3000mm × 1200mm × 9mm',
      length_mm: 3000, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 6,
    },
    {
      product_code: '404512',
      profile_name: 'Axon™ Cladding 133mm Grained — 3000mm',
      dimensions: 'Grained; groove spacing 133mm; 3000mm × 1200mm × 9mm',
      length_mm: 3000, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 7,
    },
    {
      product_code: '403934',
      profile_name: 'Axon™ Cladding 133mm Smooth — 3600mm',
      dimensions: 'Smooth; groove spacing 133mm; 3600mm × 1200mm × 9mm',
      length_mm: 3600, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 8,
    },
    {
      product_code: '404420',
      profile_name: 'Axon™ Cladding 400mm Smooth — 3600mm',
      dimensions: 'Smooth; groove spacing 400mm; 3600mm × 1200mm × 9mm',
      length_mm: 3600, width_mm: 1200, thickness_mm: 9,
      uom: 'sheet', supplier_pack_qty: 30, supplier_pack_uom: 'sheets', sort_order: 9,
    },
  ],

  components: [
    {
      sku: '306100',
      name: 'Hardie™ 9mm Aluminium External Square Corner 3,000mm',
      description: 'Aluminium extrusion that creates a square edge in external corner.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack',
      role: 'external_corner', sort_order: 1,
    },
    {
      sku: '305520',
      name: 'Hardie™ 9mm Aluminium Internal Corner 3,000mm',
      description: 'Ready-to-paint aluminium extrusion used at internal corner junctions to conceal the board edge.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack',
      role: 'internal_corner', sort_order: 2,
    },
    {
      sku: '305513',
      name: 'Hardie™ Aluminium Snap On Corner 2 piece 3,000mm',
      description: 'Ready-to-paint aluminium extrusion set for internal and external corner junctions; conceals board edge.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'sets per pack',
      role: 'snap_on_corner', sort_order: 3,
    },
    {
      sku: '306190',
      name: 'Hardie™ 9mm Aluminium Recessed Horizontal Jointer',
      description: 'Recessed horizontal jointer that creates a 6mm horizontal shadow line.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack',
      role: 'horizontal_jointer', sort_order: 4,
    },
    {
      sku: '306191',
      name: 'Hardie™ 9mm Aluminium Recessed Horizontal Jointer Connector',
      description: 'Connector piece for the recessed horizontal jointer (paired with 306190).',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack',
      role: 'horizontal_jointer_connector', sort_order: 5,
    },
    {
      sku: '304560',
      name: 'Hardie™ 50mm Foam Back Sealing Tape 25m roll',
      description: 'Foam-backed sealing tape for panel joints.',
      category: 'Axon accessory', uom: 'each',
      supplier_pack_qty: 1, supplier_pack_uom: 'each',
      role: 'foam_back_sealing_tape', sort_order: 6,
    },
    {
      sku: '305515',
      name: 'Hardie™ 9mm Aluminium Base Trim 3,000mm',
      description: 'Aluminium base trim for bottom of panel installation.',
      category: 'Axon accessory', uom: 'pack',
      supplier_pack_qty: 5, supplier_pack_uom: 'per pack',
      role: 'base_trim', sort_order: 7,
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
  notes: null,

  profiles: [
    {
      product_code: null,
      profile_name: 'Standard frame — 95mm back opening',
      dimensions: 'Back opening 95mm; A 29.5mm; profile overall 154mm × 50mm',
      length_mm: null, width_mm: 154, thickness_mm: 1.05,
      uom: 'each', supplier_pack_qty: null, supplier_pack_uom: null, sort_order: 1,
    },
    {
      product_code: null,
      profile_name: 'Standard frame — 114mm back opening',
      dimensions: 'Back opening 114mm; A 20mm; profile overall 154mm × 50mm',
      length_mm: null, width_mm: 154, thickness_mm: 1.05,
      uom: 'each', supplier_pack_qty: null, supplier_pack_uom: null, sort_order: 2,
    },
    {
      product_code: null,
      profile_name: 'Slider frame — 95mm back opening',
      dimensions: 'Back opening 95mm; A 29.5mm; profile overall 154mm × 50mm',
      length_mm: null, width_mm: 154, thickness_mm: 1.05,
      uom: 'each', supplier_pack_qty: null, supplier_pack_uom: null, sort_order: 3,
    },
    {
      product_code: null,
      profile_name: 'Slider frame — 114mm back opening',
      dimensions: 'Back opening 114mm; A 20mm; profile overall 154mm × 50mm',
      length_mm: null, width_mm: 154, thickness_mm: 1.05,
      uom: 'each', supplier_pack_qty: null, supplier_pack_uom: null, sort_order: 4,
    },
  ],

  components: [
    {
      sku: null,
      name: 'Standard welded zinc-plated hinge',
      description: 'Standard welded 1.6 zinc-plated 100 × 75 hinge used on frames.',
      category: 'Doorframe hardware', uom: 'each',
      supplier_pack_qty: null, supplier_pack_uom: null,
      role: 'included_hardware', sort_order: 1,
    },
    {
      sku: null,
      name: 'Stainless steel adjustable striker plate',
      description: 'Striker plate with adjustable tongue. Placed at 1000mm AFL to centre or as required.',
      category: 'Doorframe hardware', uom: 'each',
      supplier_pack_qty: null, supplier_pack_uom: null,
      role: 'included_hardware', sort_order: 2,
    },
    {
      sku: null,
      name: 'Rubber buffers',
      description: 'Rubber buffers to protect the door and reduce noise.',
      category: 'Doorframe hardware', uom: 'set',
      supplier_pack_qty: null, supplier_pack_uom: null,
      role: 'included_hardware', sort_order: 3,
    },
    {
      sku: null,
      name: 'Brick ties',
      description: 'Welded frames are supplied with brick ties upon delivery.',
      category: 'Doorframe fixing', uom: 'set',
      supplier_pack_qty: null, supplier_pack_uom: null,
      role: 'included_fixing', sort_order: 4,
    },
  ],

  colours: [],
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SystemCardPreviewPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--ds-page-bg)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif',
    }}>
      {/* Preview banner */}
      <div style={{
        background: 'var(--ds-navy)',
        color: '#fff',
        padding: '0.6rem 1.5rem',
        fontSize: '0.8rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700 }}>BuildQuote Data Studio</span>
        <span style={{ opacity: 0.6 }}>·</span>
        <span style={{ opacity: 0.8 }}>System card design preview</span>
        <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.72rem' }}>
          No auth · Static seed data · Not connected to DB
        </span>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1rem 4rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            color: 'var(--ds-navy)',
            margin: '0 0 0.25rem',
          }}>
            System card preview
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', margin: 0 }}>
            Two cards shown — James Hardie Axon™ Cladding and JDS RegalFrame. Both seeded from
            your uploaded CSV exports. Replace <code>hero_image_url: null</code> with a real URL
            to preview with imagery.
          </p>
        </div>

        {/* Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          <div>
            <div style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--ds-text-faint)',
              marginBottom: '0.6rem',
            }}>
              Card 1 of 2 — James Hardie
            </div>
            <SystemCard data={AXON_CLADDING} />
          </div>

          <div>
            <div style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--ds-text-faint)',
              marginBottom: '0.6rem',
            }}>
              Card 2 of 2 — JDS Metal Doorframes
            </div>
            <SystemCard data={JDS_REGALFRAME} />
          </div>
        </div>

        {/* Hero image placeholder note */}
        <div style={{
          marginTop: '2rem',
          background: 'var(--ds-card-bg)',
          border: '1px solid var(--ds-border-soft)',
          borderRadius: 8,
          padding: '1rem 1.25rem',
          fontSize: '0.82rem',
          color: 'var(--ds-text-muted)',
        }}>
          <strong style={{ color: 'var(--ds-text-sub)' }}>Hero image</strong>
          {' '}— set <code style={{ fontSize: '0.8rem' }}>hero_image_url</code> on the card data
          to any image URL and it will render at the top of the card with a gradient overlay.
          Once Docling re-extraction is complete and images are uploaded to R2, those URLs feed
          directly into this field.
        </div>
      </div>
    </div>
  )
}
