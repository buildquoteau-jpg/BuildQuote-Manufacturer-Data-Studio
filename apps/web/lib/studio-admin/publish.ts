import type { SupabaseClient } from '@supabase/supabase-js'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { createProductionServiceClient } from '@/lib/supabase/production'

// ─── Durable image URLs ─────────────────────────────────────────────────────
// Same guard as lib/publishing/buildCardSnapshot.ts's hybrid-publish path
// (duplicated rather than imported — small, and this module intentionally
// has no dependency on the newer publishing pipeline). Hero image URLs on
// staged_systems are often presigned R2 links that expire after an hour
// (X-Amz-Expires); this batch/queue publish path was copying them into
// production's systems.hero_image_url verbatim with no check, so any
// manufacturer whose raw R2 URL (rather than an Asset-linked one) got
// published this way ended up with a dead image within the hour. Every
// hero image must be resolved to a durable URL — or dropped — before it's
// written to production.

const STUDIO_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'

function durableAssetUrl(assetId: string): string {
  return `${STUDIO_ORIGIN.replace(/\/$/, '')}/api/assets/${assetId}`
}

function isEphemeralUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return /r2\.cloudflarestorage\.com|X-Amz-Signature=/i.test(url)
}

// Resolves a staged system's hero image the same way buildCardSnapshot does:
// prefer the Asset-linked durable URL when one exists, otherwise pass
// through a non-expiring URL untouched, otherwise drop it (null) rather
// than publish a link that's already ticking down to a broken image.
function resolveDurableHeroImageUrl(rawUrl: string | null, assetId: string | null): string | null {
  if (assetId) return durableAssetUrl(assetId)
  if (isEphemeralUrl(rawUrl)) return null
  return rawUrl
}

// ─── Slug helper ────────────────────────────────────────────────────────────
// Matches the toSlug() used in apps/web/app/(protected)/admin/manufacturers/NewManufacturerButton.tsx.

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function uniqueSystemSlug(prod: SupabaseClient, name: string, manufacturerId: string): Promise<string> {
  const base = toSlug(name) || 'system'
  let candidate = base
  let suffix = 2
  // Small, bounded loop — collisions are rare and this only runs for systems
  // that never had a slug staged (most do).
  for (let i = 0; i < 20; i++) {
    const { data, error } = await prod
      .from('systems')
      .select('id')
      .eq('manufacturer_id', manufacturerId)
      .eq('slug', candidate)
      .maybeSingle()
    if (error) throw new Error(`Slug check failed: ${error.message}`)
    if (!data) return candidate
    candidate = `${base}-${suffix}`
    suffix++
  }
  return `${base}-${Date.now()}`
}

// ─── Result types ───────────────────────────────────────────────────────────

export type EntityAction = 'created' | 'updated' | 'skipped'

export type PublishItemResult = {
  ok: boolean
  systemId: string
  systemName: string
  systemAction: EntityAction
  productionSystemId: string | null
  manufacturerAction: EntityAction
  catalogueSourceAction: EntityAction
  profiles: { id: string; action: EntityAction }[]
  colours: { id: string; action: EntityAction }[]
  components: { id: string; name: string; action: EntityAction }[]
  error: string | null
  // Rich preview fields
  category: string | null
  description: string | null
  heroImageUrl: string | null
  hasSourceDoc: boolean
}

export type PublishBatchResult = {
  ok: true
  batchId: string
  dryRun: boolean
  items: PublishItemResult[]
  succeeded: number
  failed: number
} | { ok: false; error: string }

// ─── publishManufacturer ────────────────────────────────────────────────────
// Creates the production manufacturer row on first publish for this manufacturer,
// or refreshes brand fields on every subsequent publish. Adopts an existing
// production row by slug if one was created out-of-band, instead of duplicating.

export async function publishManufacturer(
  ds: SupabaseClient,
  prod: SupabaseClient,
  manufacturerId: string,
  dryRun: boolean,
): Promise<{ productionManufacturerId: string; action: EntityAction }> {
  const { data: mfr, error } = await ds
    .from('data_studio_manufacturers')
    .select('id, production_manufacturer_id, name, slug, website_url, logo_url, logo_asset_id, hero_image_url, hero_image_asset_id, hero_image_position_y, hero_wide_image_url, hero_wide_image_asset_id, hero_wide_image_position_y, description, abn, phone')
    .eq('id', manufacturerId)
    .single()
  if (error || !mfr) throw new Error(`Could not load manufacturer: ${error?.message ?? 'not found'}`)

  const payload = {
    name: mfr.name,
    website_url: mfr.website_url,
    logo_url: resolveDurableHeroImageUrl(mfr.logo_url, mfr.logo_asset_id),
    hero_image_url: resolveDurableHeroImageUrl(mfr.hero_image_url, mfr.hero_image_asset_id),
    hero_image_position_y: mfr.hero_image_position_y ?? 50,
    hero_wide_image_url: resolveDurableHeroImageUrl(mfr.hero_wide_image_url, mfr.hero_wide_image_asset_id),
    hero_wide_image_position_y: mfr.hero_wide_image_position_y ?? 50,
    description: mfr.description,
    abn: mfr.abn,
    phone: mfr.phone,
  }

  if (mfr.production_manufacturer_id) {
    if (!dryRun) {
      const { error: updErr } = await prod
        .from('manufacturers')
        .update(payload)
        .eq('id', mfr.production_manufacturer_id)
      if (updErr) throw new Error(`Could not update production manufacturer: ${updErr.message}`)
    }
    return { productionManufacturerId: mfr.production_manufacturer_id, action: 'updated' }
  }

  // Adopt an existing production row with the same slug rather than duplicating
  // (e.g. someone created it manually before Data Studio onboarding existed).
  const { data: existing } = await prod
    .from('manufacturers')
    .select('id')
    .eq('slug', mfr.slug)
    .maybeSingle()

  if (existing) {
    if (!dryRun) {
      await prod.from('manufacturers').update(payload).eq('id', existing.id)
      await ds.from('data_studio_manufacturers').update({ production_manufacturer_id: existing.id }).eq('id', manufacturerId)
    }
    return { productionManufacturerId: existing.id, action: 'updated' }
  }

  if (dryRun) {
    return { productionManufacturerId: '(new)', action: 'created' }
  }

  const { data: created, error: insErr } = await prod
    .from('manufacturers')
    .insert({ ...payload, slug: mfr.slug })
    .select('id')
    .single()
  if (insErr || !created) throw new Error(`Could not create production manufacturer: ${insErr?.message}`)

  await ds.from('data_studio_manufacturers').update({ production_manufacturer_id: created.id }).eq('id', manufacturerId)
  return { productionManufacturerId: created.id, action: 'created' }
}

// ─── publishManufacturerProfile ─────────────────────────────────────────────
// Standalone entry point for pushing ONLY the brand-profile fields (hero,
// banner, description, website, logo, phone, ABN) to production, independent
// of the system-publish batch/approval queue.
//
// Why this exists: publishManufacturer() above only ever ran as a side effect
// of publishSystem() — which only fires when a staged_system gets submitted
// and approved. A manufacturer who edits ONLY their brand profile (no system
// changes) had no path to production at all; their live card kept showing
// whatever was captured at their last system publish. See saveBrandProfile()
// in lib/studio-manufacturer/brand-actions.ts, which calls this after every
// successful profile save.
//
// Deliberately un-gated by the admin approval queue — brand assets (logo,
// hero image, description, website) are low-risk compared to catalogue data
// (dimensions, ratings, components), so requiring staff sign-off for every
// banner tweak would be friction with no real safety benefit. Fails soft:
// callers should not fail the profile save if this throws.
export async function publishManufacturerProfile(
  manufacturerId: string,
): Promise<{ ok: true; productionManufacturerId: string; action: EntityAction } | { ok: false; error: string }> {
  try {
    const ds = createStudioServiceClient()
    const prod = createProductionServiceClient()
    const result = await publishManufacturer(ds, prod, manufacturerId, false)
    return { ok: true, ...result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error publishing manufacturer profile' }
  }
}

// ─── publishCatalogueSource ──────────────────────────────────────────────────
// Source Traceability Rule (docs/production-schema-mapping.md): every exported
// system must reference a catalogue_sources row. Returns null only if the
// staged system genuinely has no source_document_id — callers must treat that
// as a hard error, not silently publish an untraceable record.

async function publishCatalogueSource(
  ds: SupabaseClient,
  prod: SupabaseClient,
  sourceDocumentId: string,
  productionManufacturerId: string,
  dryRun: boolean,
): Promise<{ productionSourceId: string; action: EntityAction }> {
  const { data: doc, error } = await ds
    .from('source_documents')
    .select('id, manufacturer_id, document_name, document_type, document_date, public_url, production_catalogue_source_id')
    .eq('id', sourceDocumentId)
    .single()
  if (error || !doc) throw new Error(`Could not load source document: ${error?.message ?? 'not found'}`)

  if (doc.production_catalogue_source_id) {
    return { productionSourceId: doc.production_catalogue_source_id, action: 'skipped' }
  }

  if (dryRun) return { productionSourceId: '(new)', action: 'created' }

  const { data: created, error: insErr } = await prod
    .from('catalogue_sources')
    .insert({
      manufacturer_id: productionManufacturerId,
      document_name: doc.document_name,
      document_url: doc.public_url,
      document_date: doc.document_date,
      extracted_by: 'data-studio-publish',
    })
    .select('id')
    .single()
  if (insErr || !created) throw new Error(`Could not create catalogue source: ${insErr?.message}`)

  await ds.from('source_documents').update({ production_catalogue_source_id: created.id }).eq('id', sourceDocumentId)
  return { productionSourceId: created.id, action: 'created' }
}

// ─── publishComponent ────────────────────────────────────────────────────────

async function publishComponent(
  ds: SupabaseClient,
  prod: SupabaseClient,
  stagedComponentId: string,
  productionManufacturerId: string,
  dryRun: boolean,
): Promise<{ id: string; name: string; productionComponentId: string; action: EntityAction }> {
  const { data: c, error } = await ds
    .from('staged_components')
    .select(`
      id, production_component_id, sku, name, description, category, uom, sort_order,
      length_mm, width_mm, height_mm, thickness_mm, depth_mm, gauge_mm, diameter_mm,
      roll_m, weight_kg, pieces, volume_ml, weight_g, pack_format,
      supplier_pack_qty, supplier_pack_uom, supplier_pack_note, procurement_route
    `)
    .eq('id', stagedComponentId)
    .single()
  if (error || !c) throw new Error(`Could not load component: ${error?.message ?? 'not found'}`)

  const payload = {
    manufacturer_id: productionManufacturerId,
    sku: c.sku, name: c.name, description: c.description, category: c.category, uom: c.uom,
    sort_order: c.sort_order,
    length_mm: c.length_mm, width_mm: c.width_mm, height_mm: c.height_mm, thickness_mm: c.thickness_mm,
    depth_mm: c.depth_mm, gauge_mm: c.gauge_mm, diameter_mm: c.diameter_mm, roll_m: c.roll_m,
    weight_kg: c.weight_kg, pieces: c.pieces, volume_ml: c.volume_ml, weight_g: c.weight_g,
    pack_format: c.pack_format, supplier_pack_qty: c.supplier_pack_qty,
    supplier_pack_uom: c.supplier_pack_uom, supplier_pack_note: c.supplier_pack_note,
    procurement_route: c.procurement_route,
  }

  if (c.production_component_id) {
    if (!dryRun) {
      const { error: updErr } = await prod.from('components').update(payload).eq('id', c.production_component_id)
      if (updErr) throw new Error(`Could not update component "${c.name}": ${updErr.message}`)
    }
    return { id: c.id, name: c.name, productionComponentId: c.production_component_id, action: 'updated' }
  }

  // No linked production row yet — before inserting, check whether one
  // already exists for this manufacturer+sku (e.g. a manufacturer whose
  // catalogue was seeded straight into production and only later brought
  // into Data Studio via a reverse clone, so the staged row has no link
  // even though the production row is real). Adopting it here avoids a
  // duplicate-key error (or a silent duplicate row, where there's no
  // unique constraint to catch it) and backfills the link for next time.
  if (c.sku) {
    const { data: existing } = await prod
      .from('components')
      .select('id')
      .eq('manufacturer_id', productionManufacturerId)
      .eq('sku', c.sku)
      .maybeSingle()
    if (existing) {
      if (!dryRun) {
        const { error: updErr } = await prod.from('components').update(payload).eq('id', existing.id)
        if (updErr) throw new Error(`Could not update component "${c.name}": ${updErr.message}`)
        await ds.from('staged_components').update({ production_component_id: existing.id }).eq('id', c.id)
      }
      return { id: c.id, name: c.name, productionComponentId: existing.id, action: 'updated' }
    }
  }

  if (dryRun) return { id: c.id, name: c.name, productionComponentId: '(new)', action: 'created' }

  const { data: created, error: insErr } = await prod.from('components').insert(payload).select('id').single()
  if (insErr || !created) throw new Error(`Could not create component "${c.name}": ${insErr?.message}`)

  await ds.from('staged_components').update({ production_component_id: created.id }).eq('id', c.id)
  return { id: c.id, name: c.name, productionComponentId: created.id, action: 'created' }
}

// ─── publishSystem ────────────────────────────────────────────────────────────
// Publishes one staged_system and everything under it: profiles, colours,
// components (+ the system_components junction). Idempotent — safe to call
// again for a system that's already fully published; unchanged rows are just
// re-written with the same values (cheap UPDATEs), not duplicated.

export async function publishSystem(
  systemId: string,
  dryRun: boolean,
): Promise<PublishItemResult> {
  const ds = createStudioServiceClient()
  const prod = createProductionServiceClient()

  const { data: sys, error: sysErr } = await ds
    .from('staged_systems')
    .select(`
      id, manufacturer_id, source_document_id, production_system_id, name, product_code, slug,
      category, subcategory, description, dimensions, length_m, double_sided, hero_image_url,
      hero_image_asset_id, hero_image_position_x, hero_image_position_y,
      website_url, source_label, source_url, sheet_format, fire_rating, acoustic_rating,
      moisture_resistant, structural_grade, tech_data_url, bal_rating, australian_made,
      install_guide_urls, design_guide_url, custom_document_links, custom_technical_attributes, sort_order
    `)
    .eq('id', systemId)
    .single()

  if (sysErr || !sys) {
    return blankResult(systemId, `Could not load system: ${sysErr?.message ?? 'not found'}`)
  }

  const richExtra = {
    category: sys.category,
    description: sys.description,
    heroImageUrl: sys.hero_image_url,
    hasSourceDoc: !!sys.source_document_id,
  }

  try {
    const { productionManufacturerId, action: manufacturerAction } =
      await publishManufacturer(ds, prod, sys.manufacturer_id, dryRun)

    if (!sys.source_document_id) {
      throw new Error(
        'This system has no source document linked — the Source Traceability Rule requires every ' +
        'published system to reference a catalogue source. Re-run the parser with a source document, ' +
        'or attach one manually, before publishing.',
      )
    }
    const { productionSourceId, action: catalogueSourceAction } =
      await publishCatalogueSource(ds, prod, sys.source_document_id, productionManufacturerId, dryRun)

    const slug = sys.slug || (dryRun ? '(generated on publish)' : await uniqueSystemSlug(prod, sys.name, productionManufacturerId))

    const systemPayload = {
      manufacturer_id: productionManufacturerId,
      name: sys.name,
      product_code: sys.product_code ?? slug,
      slug,
      category: sys.category,
      subcategory: sys.subcategory,
      description: sys.description,
      dimensions: sys.dimensions,
      length_m: sys.length_m,
      double_sided: sys.double_sided,
      hero_image_url: resolveDurableHeroImageUrl(sys.hero_image_url, sys.hero_image_asset_id),
      hero_image_position_x: sys.hero_image_position_x ?? 50,
      hero_image_position_y: sys.hero_image_position_y ?? 50,
      website_url: sys.website_url,
      source_label: sys.source_label,
      source_url: sys.source_url,
      sheet_format: sys.sheet_format,
      fire_rating: sys.fire_rating,
      acoustic_rating: sys.acoustic_rating,
      moisture_resistant: sys.moisture_resistant,
      structural_grade: sys.structural_grade,
      install_guide_urls: sys.install_guide_urls,
      design_guide_url: sys.design_guide_url,
      tech_data_url: sys.tech_data_url,
      custom_document_links: sys.custom_document_links,
      custom_technical_attributes: sys.custom_technical_attributes,
      bal_rating: sys.bal_rating,
      australian_made: sys.australian_made,
      sort_order: sys.sort_order,
      source_document_id: productionSourceId,
    }

    let productionSystemId = sys.production_system_id
    let systemAction: EntityAction = 'updated'

    if (productionSystemId) {
      if (!dryRun) {
        const { error: updErr } = await prod.from('systems').update(systemPayload).eq('id', productionSystemId)
        if (updErr) throw new Error(`Could not update system: ${updErr.message}`)
      }
    } else if (dryRun) {
      productionSystemId = '(new)'
      systemAction = 'created'
    } else {
      const { data: created, error: insErr } = await prod.from('systems').insert(systemPayload).select('id').single()
      if (insErr || !created) throw new Error(`Could not create system: ${insErr?.message}`)
      productionSystemId = created.id
      systemAction = 'created'
      await ds.from('staged_systems').update({ production_system_id: created.id }).eq('id', systemId)
    }

    const profiles = await publishProfiles(ds, prod, systemId, productionSystemId, dryRun)
    const colours = await publishColours(ds, prod, systemId, productionSystemId, dryRun)
    const components = await publishComponents(ds, prod, systemId, productionSystemId, productionManufacturerId, dryRun)

    if (!dryRun) {
      await ds.from('staged_systems').update({ last_published_at: new Date().toISOString() }).eq('id', systemId)
    }

    return {
      ok: true,
      systemId,
      systemName: sys.name,
      systemAction,
      productionSystemId,
      manufacturerAction,
      catalogueSourceAction,
      profiles,
      colours,
      components,
      error: null,
      ...richExtra,
    }
  } catch (e) {
    return blankResult(systemId, e instanceof Error ? e.message : String(e), sys.name, richExtra)
  }
}

function blankResult(systemId: string, error: string, systemName = '(unknown)', extra?: Partial<PublishItemResult>): PublishItemResult {
  return {
    ok: false, systemId, systemName, systemAction: 'skipped', productionSystemId: null,
    manufacturerAction: 'skipped', catalogueSourceAction: 'skipped',
    profiles: [], colours: [], components: [], error,
    category: null, description: null, heroImageUrl: null, hasSourceDoc: false,
    ...extra,
  }
}

// ─── publishProfiles / publishColours / publishComponents ───────────────────

async function publishProfiles(
  ds: SupabaseClient, prod: SupabaseClient, stagedSystemId: string, productionSystemId: string, dryRun: boolean,
): Promise<{ id: string; action: EntityAction }[]> {
  const { data: rows, error } = await ds
    .from('staged_system_profiles')
    .select(`
      id, production_profile_id, name, profile_name, product_code, description, dimensions, length_m, sheet_format,
      length_mm, width_mm, height_mm, thickness_mm, depth_mm, gauge_mm, diameter_mm, roll_m,
      weight_kg, pieces, volume_ml, weight_g, pack_format, bal_rating,
      supplier_pack_qty, supplier_pack_uom, supplier_pack_note, uom, procurement_route, sort_order
    `)
    .eq('staged_system_id', stagedSystemId)
  if (error) throw new Error(`Could not load profiles: ${error.message}`)

  const results: { id: string; action: EntityAction }[] = []
  for (const p of rows ?? []) {
    const payload = {
      system_id: productionSystemId,
      name: p.name, profile_name: p.profile_name, product_code: p.product_code, description: p.description,
      dimensions: p.dimensions, length_m: p.length_m, sheet_format: p.sheet_format,
      length_mm: p.length_mm, width_mm: p.width_mm, height_mm: p.height_mm, thickness_mm: p.thickness_mm,
      depth_mm: p.depth_mm, gauge_mm: p.gauge_mm, diameter_mm: p.diameter_mm, roll_m: p.roll_m,
      weight_kg: p.weight_kg, pieces: p.pieces, volume_ml: p.volume_ml, weight_g: p.weight_g,
      pack_format: p.pack_format, bal_rating: p.bal_rating, supplier_pack_qty: p.supplier_pack_qty,
      supplier_pack_uom: p.supplier_pack_uom, supplier_pack_note: p.supplier_pack_note,
      uom: p.uom, procurement_route: p.procurement_route, sort_order: p.sort_order,
    }
    if (p.production_profile_id) {
      if (!dryRun) {
        const { error: e } = await prod.from('system_profiles').update(payload).eq('id', p.production_profile_id)
        if (e) throw new Error(`Could not update profile "${p.profile_name ?? p.name}": ${e.message}`)
      }
      results.push({ id: p.id, action: 'updated' })
      continue
    }

    // No linked production row yet — check for an existing one by
    // (system, product_code) before inserting. See the matching comment in
    // publishComponent for why this matters: without it, a manufacturer
    // whose catalogue already exists in production (e.g. reverse-cloned
    // into Data Studio) gets a duplicate row inserted every publish —
    // silently, since system_profiles has no unique constraint to catch it.
    const existing = p.product_code
      ? (await prod.from('system_profiles').select('id')
          .eq('system_id', productionSystemId).eq('product_code', p.product_code).maybeSingle()).data
      : null
    if (existing) {
      if (!dryRun) {
        const { error: e } = await prod.from('system_profiles').update(payload).eq('id', existing.id)
        if (e) throw new Error(`Could not update profile "${p.profile_name ?? p.name}": ${e.message}`)
        await ds.from('staged_system_profiles').update({ production_profile_id: existing.id }).eq('id', p.id)
      }
      results.push({ id: p.id, action: 'updated' })
    } else if (dryRun) {
      results.push({ id: p.id, action: 'created' })
    } else {
      const { data: created, error: e } = await prod.from('system_profiles').insert(payload).select('id').single()
      if (e || !created) throw new Error(`Could not create profile "${p.profile_name ?? p.name}": ${e?.message}`)
      await ds.from('staged_system_profiles').update({ production_profile_id: created.id }).eq('id', p.id)
      results.push({ id: p.id, action: 'created' })
    }
  }
  return results
}

async function publishColours(
  ds: SupabaseClient, prod: SupabaseClient, stagedSystemId: string, productionSystemId: string, dryRun: boolean,
): Promise<{ id: string; action: EntityAction }[]> {
  const { data: rows, error } = await ds
    .from('staged_system_colours')
    .select('id, production_colour_id, colour_name, sku, sku_suffix, image_url, is_stocked, sort_order')
    .eq('staged_system_id', stagedSystemId)
  if (error) throw new Error(`Could not load colours: ${error.message}`)

  const results: { id: string; action: EntityAction }[] = []
  for (const c of rows ?? []) {
    const payload = {
      system_id: productionSystemId,
      colour_name: c.colour_name,
      sku: c.sku_suffix ?? c.sku,
      image_url: c.image_url,
      is_stocked: c.is_stocked,
      sort_order: c.sort_order,
    }
    if (c.production_colour_id) {
      if (!dryRun) {
        const { error: e } = await prod.from('system_colours').update(payload).eq('id', c.production_colour_id)
        if (e) throw new Error(`Could not update colour "${c.colour_name}": ${e.message}`)
      }
      results.push({ id: c.id, action: 'updated' })
      continue
    }

    // No linked production row yet — check for an existing one by
    // (system, colour_name) before inserting. system_colours has a unique
    // constraint on this pair, so without this check a manufacturer whose
    // catalogue already exists in production throws a duplicate-key error
    // on every publish attempt instead of updating.
    const { data: existing } = await prod.from('system_colours').select('id')
      .eq('system_id', productionSystemId).eq('colour_name', c.colour_name).maybeSingle()
    if (existing) {
      if (!dryRun) {
        const { error: e } = await prod.from('system_colours').update(payload).eq('id', existing.id)
        if (e) throw new Error(`Could not update colour "${c.colour_name}": ${e.message}`)
        await ds.from('staged_system_colours').update({ production_colour_id: existing.id }).eq('id', c.id)
      }
      results.push({ id: c.id, action: 'updated' })
    } else if (dryRun) {
      results.push({ id: c.id, action: 'created' })
    } else {
      const { data: created, error: e } = await prod.from('system_colours').insert(payload).select('id').single()
      if (e || !created) throw new Error(`Could not create colour "${c.colour_name}": ${e?.message}`)
      await ds.from('staged_system_colours').update({ production_colour_id: created.id }).eq('id', c.id)
      results.push({ id: c.id, action: 'created' })
    }
  }
  return results
}

async function publishComponents(
  ds: SupabaseClient, prod: SupabaseClient, stagedSystemId: string, productionSystemId: string,
  productionManufacturerId: string, dryRun: boolean,
): Promise<{ id: string; name: string; action: EntityAction }[]> {
  const { data: links, error } = await ds
    .from('staged_system_components')
    .select('id, staged_component_id, role, notes, sort_order')
    .eq('staged_system_id', stagedSystemId)
  if (error) throw new Error(`Could not load component links: ${error.message}`)

  const results: { id: string; name: string; action: EntityAction }[] = []
  for (const link of links ?? []) {
    const { id, name, productionComponentId, action: componentAction } =
      await publishComponent(ds, prod, link.staged_component_id, productionManufacturerId, dryRun)

    if (!dryRun) {
      const { data: existingLink } = await prod
        .from('system_components')
        .select('id')
        .eq('system_id', productionSystemId)
        .eq('component_id', productionComponentId)
        .maybeSingle()

      const linkPayload = { role: link.role, notes: link.notes, sort_order: link.sort_order }
      if (existingLink) {
        await prod.from('system_components').update(linkPayload).eq('id', existingLink.id)
      } else {
        await prod.from('system_components').insert({
          system_id: productionSystemId, component_id: productionComponentId, ...linkPayload,
        })
      }
    }

    results.push({ id, name, action: componentAction })
  }
  return results
}

// ─── publishBatch ─────────────────────────────────────────────────────────────
// Top-level entry point. Iterates a publish_batches row's pending items
// (entity_type='staged_system' is the only kind submitForPublication creates
// today) and publishes each one. Per-item failures don't abort the batch —
// each item gets its own success/error outcome, so a retry only needs to
// touch what actually failed.

export async function publishBatch(batchId: string, opts: { dryRun: boolean }): Promise<PublishBatchResult> {
  const ds = createStudioServiceClient()

  const { data: batch, error: batchErr } = await ds
    .from('publish_batches')
    .select('id, manufacturer_id, status')
    .eq('id', batchId)
    .single()
  if (batchErr || !batch) return { ok: false, error: `Could not load publish batch: ${batchErr?.message ?? 'not found'}` }

  const { data: items, error: itemsErr } = await ds
    .from('publish_batch_items')
    .select('id, entity_type, entity_id, status, change_type')
    .eq('publish_batch_id', batchId)
    .neq('status', 'migrated_to_production')
  if (itemsErr) return { ok: false, error: `Could not load batch items: ${itemsErr.message}` }

  const results: PublishItemResult[] = []

  for (const item of items ?? []) {
    if (item.entity_type !== 'staged_system') {
      results.push(blankResult(item.entity_id, `Unsupported entity_type "${item.entity_type}" — only staged_system is implemented.`))
      continue
    }

    const result = await publishSystem(item.entity_id, opts.dryRun)
    results.push(result)

    if (!opts.dryRun) {
      if (result.ok) {
        await ds.from('publish_batch_items').update({
          status: 'migrated_to_production',
          production_table: 'systems',
          production_id: result.productionSystemId,
          error_message: null,
        }).eq('id', item.id)
      } else {
        await ds.from('publish_batch_items').update({
          status: 'failed',
          error_message: result.error,
        }).eq('id', item.id)
      }
    }
  }

  const succeeded = results.filter((r) => r.ok).length
  const failed = results.length - succeeded

  if (!opts.dryRun && results.length > 0) {
    const batchStatus = failed === 0 ? 'published' : succeeded === 0 ? batch.status : 'partially_published'
    await ds.from('publish_batches').update({
      status: batchStatus,
      published_at: failed === 0 ? new Date().toISOString() : null,
    }).eq('id', batchId)
  }

  return { ok: true, batchId, dryRun: opts.dryRun, items: results, succeeded, failed }
}

// ─── reportOrphans ───────────────────────────────────────────────────────────
// Production hygiene report — NOT part of the publish flow and NEVER writes
// anything. Publishing is upsert-by-natural-key and never deletes: if a
// staged row is deleted or renamed in Data Studio after it was published, the
// production row it created stays behind forever with no staging counterpart
// to point back at it. This function finds those orphans (production
// systems/system_profiles/system_colours/components whose id isn't
// referenced by any staged_*.production_*_id for the manufacturer) so a
// human can look at the list and decide what to do — report-only, by design.

export type OrphanRow = { id: string; label: string }

export type OrphanReport =
  | {
      ok: true
      manufacturerId: string
      manufacturerName: string
      productionManufacturerId: string | null
      systems: OrphanRow[]
      systemProfiles: OrphanRow[]
      systemColours: OrphanRow[]
      components: OrphanRow[]
      totalOrphans: number
    }
  | { ok: false; error: string }

function toIdSet(rows: { [key: string]: unknown }[] | null, field: string): Set<string> {
  return new Set(
    (rows ?? [])
      .map((r) => r[field])
      .filter((v): v is string => typeof v === 'string' && v.length > 0),
  )
}

export async function reportOrphans(manufacturerId: string): Promise<OrphanReport> {
  const ds = createStudioServiceClient()
  const prod = createProductionServiceClient()

  const { data: mfr, error: mfrErr } = await ds
    .from('data_studio_manufacturers')
    .select('id, name, production_manufacturer_id')
    .eq('id', manufacturerId)
    .single()
  if (mfrErr || !mfr) {
    return { ok: false, error: `Could not load manufacturer: ${mfrErr?.message ?? 'not found'}` }
  }

  const productionManufacturerId = mfr.production_manufacturer_id as string | null
  if (!productionManufacturerId) {
    // Never published — there is nothing in production to orphan yet.
    return {
      ok: true, manufacturerId, manufacturerName: mfr.name, productionManufacturerId: null,
      systems: [], systemProfiles: [], systemColours: [], components: [], totalOrphans: 0,
    }
  }

  // ── Staging side: every production id a current staged row still points at ──
  const { data: stagedSystems, error: stagedSysErr } = await ds
    .from('staged_systems')
    .select('id, production_system_id')
    .eq('manufacturer_id', manufacturerId)
  if (stagedSysErr) return { ok: false, error: `Could not load staged systems: ${stagedSysErr.message}` }

  const referencedSystemIds = toIdSet(stagedSystems, 'production_system_id')
  const stagedSystemIds = (stagedSystems ?? []).map((s) => s.id as string)

  let referencedProfileIds = new Set<string>()
  let referencedColourIds = new Set<string>()
  if (stagedSystemIds.length > 0) {
    const { data: stagedProfiles, error: profErr } = await ds
      .from('staged_system_profiles')
      .select('production_profile_id')
      .in('staged_system_id', stagedSystemIds)
    if (profErr) return { ok: false, error: `Could not load staged profiles: ${profErr.message}` }
    referencedProfileIds = toIdSet(stagedProfiles, 'production_profile_id')

    const { data: stagedColours, error: colErr } = await ds
      .from('staged_system_colours')
      .select('production_colour_id')
      .in('staged_system_id', stagedSystemIds)
    if (colErr) return { ok: false, error: `Could not load staged colours: ${colErr.message}` }
    referencedColourIds = toIdSet(stagedColours, 'production_colour_id')
  }

  const { data: stagedComponents, error: compErr } = await ds
    .from('staged_components')
    .select('production_component_id')
    .eq('manufacturer_id', manufacturerId)
  if (compErr) return { ok: false, error: `Could not load staged components: ${compErr.message}` }
  const referencedComponentIds = toIdSet(stagedComponents, 'production_component_id')

  // ── Production side: every row that exists for this manufacturer ──
  const { data: prodSystems, error: prodSysErr } = await prod
    .from('systems')
    .select('id, name')
    .eq('manufacturer_id', productionManufacturerId)
  if (prodSysErr) return { ok: false, error: `Could not load production systems: ${prodSysErr.message}` }

  const orphanSystems: OrphanRow[] = (prodSystems ?? [])
    .filter((s) => !referencedSystemIds.has(s.id as string))
    .map((s) => ({ id: s.id as string, label: (s.name as string) ?? s.id as string }))

  const prodSystemIds = (prodSystems ?? []).map((s) => s.id as string)

  let orphanProfiles: OrphanRow[] = []
  let orphanColours: OrphanRow[] = []
  if (prodSystemIds.length > 0) {
    const { data: prodProfiles, error: prodProfErr } = await prod
      .from('system_profiles')
      .select('id, name, profile_name')
      .in('system_id', prodSystemIds)
    if (prodProfErr) return { ok: false, error: `Could not load production profiles: ${prodProfErr.message}` }
    orphanProfiles = (prodProfiles ?? [])
      .filter((p) => !referencedProfileIds.has(p.id as string))
      .map((p) => ({ id: p.id as string, label: (p.profile_name as string) ?? (p.name as string) ?? p.id as string }))

    const { data: prodColours, error: prodColErr } = await prod
      .from('system_colours')
      .select('id, colour_name')
      .in('system_id', prodSystemIds)
    if (prodColErr) return { ok: false, error: `Could not load production colours: ${prodColErr.message}` }
    orphanColours = (prodColours ?? [])
      .filter((c) => !referencedColourIds.has(c.id as string))
      .map((c) => ({ id: c.id as string, label: (c.colour_name as string) ?? c.id as string }))
  }

  const { data: prodComponents, error: prodCompErr } = await prod
    .from('components')
    .select('id, name')
    .eq('manufacturer_id', productionManufacturerId)
  if (prodCompErr) return { ok: false, error: `Could not load production components: ${prodCompErr.message}` }
  const orphanComponents: OrphanRow[] = (prodComponents ?? [])
    .filter((c) => !referencedComponentIds.has(c.id as string))
    .map((c) => ({ id: c.id as string, label: (c.name as string) ?? c.id as string }))

  return {
    ok: true,
    manufacturerId,
    manufacturerName: mfr.name,
    productionManufacturerId,
    systems: orphanSystems,
    systemProfiles: orphanProfiles,
    systemColours: orphanColours,
    components: orphanComponents,
    totalOrphans: orphanSystems.length + orphanProfiles.length + orphanColours.length + orphanComponents.length,
  }
}
