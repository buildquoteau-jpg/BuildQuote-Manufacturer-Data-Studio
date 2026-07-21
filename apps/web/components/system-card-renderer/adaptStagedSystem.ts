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

function adaptComponent(c: VerificationSystemComponent, i: number): SystemCardComponentEntry {
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
      description: c.description,
      category: c.category,
      uom: c.uom,
      procurement_route: c.procurement_route,
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
        // Staged colours have no swatch image yet — chip renders text-only.
        // TODO(images): populate when staged_system_colours grows an image_url.
        image_url: null,
        sort_order: i,
        is_stocked: c.is_stocked ?? true,
      })),
    system_profiles: [...system.profiles]
      .sort(bySort)
      .map((p, i) => ({
        id: p.id ?? `staged-profile-${i}`,
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
    system_components: [...system.components]
      .sort(bySort)
      .map(adaptComponent),
  }
}
