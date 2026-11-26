// Adapter: Data Studio staged data → master System Card renderer props.
//
// Takes the shapes returned by getManufacturerVerificationData()
// (lib/studio-manufacturer/workspace.ts) and produces the plain-JSON
// SystemCardSystem the renderer consumes. Pure function — safe to call on
// the server before passing to a client component, and reusable later by
// the static package generator.

import type {
  VerificationSystem,
  VerificationSystemComponent,
  ManufacturerInfo,
} from '@/lib/studio-manufacturer/workspace'
import type { SystemCardSystem, SystemCardComponentEntry } from './types'

// Prefer the stored staged_systems.slug; fall back to a stable slug derived
// from the name (matches lib/packages/readiness.ts resolveCardSlug).
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const PACK_UOMS = new Set(['pack', 'box', 'roll', 'carton', 'bag', 'kit', 'tub', 'bucket', 'bundle'])
const PACK_COUNT_RE =
  /\b\d+(?:\.\d+)?\s*(?:pcs?|pieces?|lengths?|boards?|clips?|screws?|fasteners?|strips?|sheets?|units?|caps?|m\b|lm\b|metres?|meters?|kg\b|g\b|l\b|ml\b)|\b(?:pack|box|roll|carton|bag|kit|tub)\s+of\s+\d+|\bper\s+(?:pack|box|roll|carton|bag|kit|tub)\b/i

// Enforces customer UOM clarity: pack/box/roll/carton MUST state the piece/length count
// in its description (e.g. "5 lengths per pack", "250 pieces per box", "50 m per roll"),
// otherwise display "each" (per piece).
export function normalizeCustomerUom(opts: {
  uom: string | null | undefined
  description?: string | null
  name?: string | null
  supplierPackQty?: number | null
  supplierPackUom?: string | null
}): { uom: string | null; description: string | null } {
  const rawUom = (opts.uom ?? '').trim()
  const desc = (opts.description ?? '').trim() || null
  if (!rawUom || !PACK_UOMS.has(rawUom.toLowerCase())) {
    return { uom: rawUom || null, description: desc }
  }
  const combined = `${opts.name ?? ''} ${desc ?? ''}`
  if (PACK_COUNT_RE.test(combined)) {
    return { uom: rawUom, description: desc }
  }
  if (opts.supplierPackQty && opts.supplierPackQty > 0) {
    const unit = (opts.supplierPackUom ?? 'pieces').trim()
    const note = `${opts.supplierPackQty} ${unit} per ${rawUom.toLowerCase()}`
    return { uom: rawUom, description: desc ? `${desc} (${note})` : note }
  }
  return { uom: 'each', description: desc }
}

function adaptComponent(c: VerificationSystemComponent, i: number): SystemCardComponentEntry {
  const norm = normalizeCustomerUom({
    uom: c.uom,
    description: c.description,
    name: c.name,
  })
  return {
    id: c.id ?? `staged-comp-${i}`,
    // Staged components have no system "role" label — the category is the
    // closest equivalent and is what the card groups by anyway.
    role: c.category ?? 'Component',
    notes: null,
    sort_order: c.sort_order ?? i,
    components: {
      name: c.name,
      sku: c.sku,
      description: norm.description,
      category: c.category,
      uom: norm.uom,
      procurement_route: c.procurement_route,
      image_url: c.image_url ?? null,
    },
  }
}

export function adaptStagedSystem(
  system: VerificationSystem,
  manufacturer: ManufacturerInfo,
): SystemCardSystem {
  const bySort = <T extends { sort_order?: number | null }>(a: T, b: T) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0)

  return {
    id: system.id,
    name: system.name,
    product_code: system.product_code,
    slug: (system.slug && system.slug.trim()) || slugify(system.name),
    category: system.category,
    subcategory: system.subcategory,
    description: system.description,
    hero_image_url: system.hero_image_url,
    hero_image_position_x: system.hero_image_position_x,
    hero_image_position_y: system.hero_image_position_y,
    hero_image_zoom: system.hero_image_zoom ?? null,
    gallery_images: system.gallery_images ?? null,
    australian_made: system.australian_made,
    bal_rating: system.bal_rating,
    fire_rating: system.fire_rating,
    moisture_resistant: system.moisture_resistant,
    acoustic_rating: system.acoustic_rating,
    structural_grade: system.structural_grade,
    notes: system.notes,
    deck_type: system.deck_type ?? null,
    website_url: system.website_url ?? system.source_url,
    install_guide_urls: system.install_guide_urls,
    design_guide_url: system.design_guide_url,
    tech_data_url: system.tech_data_url,
    custom_document_links: system.custom_document_links ?? null,
    custom_technical_attributes: system.custom_technical_attributes ?? null,
    manufacturer: {
      name: manufacturer.name,
      slug: manufacturer.slug,
      logo_url: null,
    },
    system_colours: [...system.colours]
      .map((c, i) => ({
        colour_name: c.colour_name,
        image_url: c.image_url,
        sort_order: i,
        is_stocked: c.is_stocked ?? true,
      })),
    system_profiles: [...system.profiles]
      .sort(bySort)
      .map((p, i) => {
        const norm = normalizeCustomerUom({
          uom: p.uom,
          description: p.description,
          name: p.profile_name,
          supplierPackQty: p.supplier_pack_qty,
          supplierPackUom: p.supplier_pack_uom,
        })
        return {
          id: p.id ?? `staged-profile-${i}`,
          profile_name: p.profile_name,
          name: null,
          product_code: p.product_code,
          description: norm.description,
          dimensions: p.dimensions,
          length_mm: p.length_mm,
          width_mm: p.width_mm,
          height_mm: p.height_mm,
          thickness_mm: p.thickness_mm,
          uom: norm.uom,
          supplier_pack_qty: p.supplier_pack_qty,
          supplier_pack_uom: p.supplier_pack_uom,
          sort_order: p.sort_order ?? i,
          image_url: p.image_url ?? null,
        }
      }),
    system_components: [...system.components]
      .sort(bySort)
      .map(adaptComponent),
  }
}
