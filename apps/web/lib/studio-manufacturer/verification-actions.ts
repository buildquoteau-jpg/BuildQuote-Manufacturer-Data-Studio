'use server'

import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { postSubmissionMessage } from './messages-actions'

// ─── Auth gate ────────────────────────────────────────────────────────────────
// Manufacturers can only write to their own workspace.
// buildquote_admin can access any workspace.

export async function assertManufacturerAccess(
  manufacturerId: string,
): Promise<{ allowed: true; userId: string } | { allowed: false; error: string }> {
  const session = await getStudioSession()
  if (!session.profile) return { allowed: false, error: 'Not authenticated.' }

  if (session.globalRole === 'buildquote_admin') {
    return { allowed: true, userId: session.user!.id }
  }

  if (session.globalRole !== 'manufacturer_user') {
    return { allowed: false, error: 'Access denied.' }
  }

  const hasMembership = session.memberships.some(
    (m) => m.manufacturerId === manufacturerId && m.status === 'active',
  )
  if (!hasMembership) {
    return { allowed: false, error: 'Not a member of this workspace.' }
  }

  return { allowed: true, userId: session.user!.id }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldVerificationStatus = 'approved' | 'edited' | 'flagged'
export type ActionResult = { ok: true } | { ok: false; error: string }

// Text fields that can be directly updated on staged_systems.
// install_guide_urls is NOT here — it's an array (a system can have several
// guides, e.g. one per frame type) and goes through setInstallGuideUrls
// instead, so a generic text edit can never clobber it with a plain string.
const STAGED_TEXT_FIELDS = [
  'name', 'category', 'subcategory', 'description',
  'hero_image_url', 'website_url', 'source_url',
  'tech_data_url',
  'bal_rating', 'fire_rating', 'acoustic_rating', 'structural_grade',
] as const

// Boolean fields that can be directly updated on staged_systems
const STAGED_BOOL_FIELDS = [
  'australian_made', 'moisture_resistant',
] as const

// Hybrid publishing: once a card is live, any draft edit flips its status to
// published_with_changes so list views can show "unpublished changes". Fails
// soft pre-migration-053 (publish_status column absent).
async function markDraftChanged(
  supabase: ReturnType<typeof createStudioServerClient>,
  systemId: string,
): Promise<void> {
  try {
    await supabase
      .from('staged_systems')
      .update({ publish_status: 'published_with_changes' })
      .eq('id', systemId)
      .eq('publish_status', 'published')
  } catch {
    /* pre-053 environments — publish state tracking simply not available */
  }
}

// ─── upsertFieldVerification ──────────────────────────────────────────────────
// Writes one field verification record.
// If status='edited', also patches the field value directly on staged_systems.

export async function upsertFieldVerification(
  systemId: string,
  manufacturerId: string,
  fieldName: string,
  extractedValue: string | null,
  verifiedValue: string | null,
  status: FieldVerificationStatus,
  notes: string | null,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const now = new Date().toISOString()

  // Upsert the field_verifications record (unique on entity_type + entity_id + field_name)
  const { error: fvError } = await supabase
    .from('field_verifications')
    .upsert(
      {
        entity_type: 'staged_system',
        entity_id: systemId,
        field_name: fieldName,
        extracted_value: extractedValue,
        verified_value: verifiedValue,
        status,
        reviewer_id: auth.userId,
        reviewed_at: now,
        notes,
        updated_at: now,
      },
      { onConflict: 'entity_type,entity_id,field_name' },
    )

  if (fvError) return { ok: false, error: fvError.message }

  // If the user made an edit, patch staged_systems so the card renders correctly.
  // verifiedValue can legitimately be null here — clearing a field to empty is
  // still an edit and must persist, not just log an audit row that reverts on
  // reload. (Status other than 'edited' — e.g. 'flagged' — never reaches here
  // regardless of value, which is the actual guard against unwanted writes.)
  if (status === 'edited') {
    if ((STAGED_TEXT_FIELDS as readonly string[]).includes(fieldName)) {
      const { error } = await supabase
        .from('staged_systems')
        .update({ [fieldName]: verifiedValue, updated_at: now })
        .eq('id', systemId)
      if (error) return { ok: false, error: error.message }
    } else if ((STAGED_BOOL_FIELDS as readonly string[]).includes(fieldName)) {
      // "Not set" must clear the column to null, not write false — false
      // means an affirmative "No" while null means "not verified", and the
      // toggle UI only ever offers Yes / Not set, never a real No.
      const { error } = await supabase
        .from('staged_systems')
        .update({ [fieldName]: verifiedValue === null ? null : verifiedValue === 'true', updated_at: now })
        .eq('id', systemId)
      if (error) return { ok: false, error: error.message }
    }
    await markDraftChanged(supabase, systemId)
  }

  return { ok: true }
}

// ─── setInstallGuideUrls ───────────────────────────────────────────────────────
// Replaces the whole install_guide_urls array. Systems can have more than one
// guide (e.g. a steel-frame and a timber-frame install guide), so this takes
// the full list rather than a single value — keeps the array shape intact
// where the generic text-field path would flatten it to a string.

export async function setInstallGuideUrls(
  systemId: string,
  manufacturerId: string,
  guides: { label: string; url: string }[],
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('staged_systems')
    .update({ install_guide_urls: guides.length > 0 ? guides : null, updated_at: now })
    .eq('id', systemId)
  if (error) return { ok: false, error: error.message }
  await markDraftChanged(supabase, systemId)

  // Audit trail only, consistent with other verified fields — not read back
  // by the UI, which uses staged_systems.install_guide_urls directly.
  await supabase.from('field_verifications').upsert(
    {
      entity_type: 'staged_system',
      entity_id: systemId,
      field_name: 'install_guide_urls',
      verified_value: JSON.stringify(guides),
      status: 'edited',
      reviewer_id: auth.userId,
      reviewed_at: now,
      notes: null,
      updated_at: now,
    },
    { onConflict: 'entity_type,entity_id,field_name' },
  )

  return { ok: true }
}

// ─── setCustomDocumentLinks ───────────────────────────────────────────────────
// Replaces the whole custom_document_links array. These are arbitrary named
// documents (energy ratings, sustainability reports, warranty PDFs…) that get
// their own button on the card — each carries a required label (the button
// text) plus a PDF/web URL. Same full-array pattern as setInstallGuideUrls so
// the JSONB shape is never flattened by the generic text-field path.
// Fails soft pre-migration-055 (column absent) so older environments don't
// break — the update simply no-ops there.

// `type` categorises each link for the self-serve setup flow's "Links &
// resources" step (design doc addendum 3 §C5 step 2) — 'product_page' (the
// manufacturer's own page for this product) vs 'web_guide' (any other
// external resource). Optional and purely presentational: no schema change,
// it rides inside the existing custom_document_links jsonb array, and older
// entries with no type render as an unlabelled "resource".
export type CustomDocumentLink = { label: string; url: string; type?: 'product_page' | 'web_guide' }

export async function setCustomDocumentLinks(
  systemId: string,
  manufacturerId: string,
  links: CustomDocumentLink[],
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('staged_systems')
    .update({ custom_document_links: links.length > 0 ? links : null, updated_at: now })
    .eq('id', systemId)
  if (error) {
    if (/custom_document_links|does not exist/i.test(error.message ?? '')) {
      return { ok: false, error: 'Additional documents need migration 055 applied first.' }
    }
    return { ok: false, error: error.message }
  }
  await markDraftChanged(supabase, systemId)

  // Audit trail only, consistent with install_guide_urls — not read back by
  // the UI, which uses staged_systems.custom_document_links directly.
  await supabase.from('field_verifications').upsert(
    {
      entity_type: 'staged_system',
      entity_id: systemId,
      field_name: 'custom_document_links',
      verified_value: JSON.stringify(links),
      status: 'edited',
      reviewer_id: auth.userId,
      reviewed_at: now,
      notes: null,
      updated_at: now,
    },
    { onConflict: 'entity_type,entity_id,field_name' },
  )

  return { ok: true }
}

// ─── setGalleryImages ─────────────────────────────────────────────────────────
// Replaces the whole hero-gallery array (hybrid publishing, migration 053).
// Ordered; element 0 is the cover/share image. Same full-array pattern as
// setInstallGuideUrls so reordering can never interleave with field edits.

export async function setGalleryImages(
  systemId: string,
  manufacturerId: string,
  images: {
    asset_id?: string | null; url: string; og_jpg_url?: string | null; alt: string; caption?: string | null
    // Focal-point position as a percentage (0-100), same semantics as the
    // hero's hero_image_position_x/y, plus an optional zoom (1.0-3.0, same
    // semantics as hero_image_zoom) — the "left/right and zoom editor" per
    // design doc addendum 3 §C5 step 1 / §C6. Stored in-array since
    // gallery_images is jsonb — no migration needed.
    position_x?: number | null; position_y?: number | null; zoom?: number | null
  }[],
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }
  if (images.length > 10) return { ok: false, error: 'A gallery can hold at most 10 images.' }

  const supabase = createStudioServerClient()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('staged_systems')
    .update({ gallery_images: images, updated_at: now })
    .eq('id', systemId)
  if (error) return { ok: false, error: error.message }
  await markDraftChanged(supabase, systemId)

  await supabase.from('field_verifications').upsert(
    {
      entity_type: 'staged_system',
      entity_id: systemId,
      field_name: 'gallery_images',
      verified_value: JSON.stringify(images.map((i) => i.url)),
      status: 'edited',
      reviewer_id: auth.userId,
      reviewed_at: now,
      notes: null,
      updated_at: now,
    },
    { onConflict: 'entity_type,entity_id,field_name' },
  )

  return { ok: true }
}

// ─── updateSystemImageCrop ────────────────────────────────────────────────────
// Directly saves X/Y crop positions for the system hero image.
// Bypasses field_verifications — this is an aesthetic control, not a parsed field.

export async function updateSystemImageCrop(
  systemId: string,
  manufacturerId: string,
  positionX: number,
  positionY: number,
  zoom?: number,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const patch: Record<string, unknown> = {
    hero_image_position_x: Math.round(Math.max(0, Math.min(100, positionX))),
    hero_image_position_y: Math.round(Math.max(0, Math.min(100, positionY))),
    updated_at: new Date().toISOString(),
  }
  if (zoom !== undefined) {
    // 1.0 (fit) … 3.0 (300%), two decimal places — migration 054.
    patch.hero_image_zoom = Math.round(Math.max(1, Math.min(3, zoom)) * 100) / 100
  }

  let { error } = await supabase.from('staged_systems').update(patch).eq('id', systemId)
  if (error && zoom !== undefined && /hero_image_zoom|does not exist/i.test(error.message ?? '')) {
    // Pre-054 environments — save position without zoom rather than failing.
    delete patch.hero_image_zoom
    ;({ error } = await supabase.from('staged_systems').update(patch).eq('id', systemId))
  }

  if (error) return { ok: false, error: error.message }
  await markDraftChanged(supabase, systemId)
  return { ok: true }
}

// ─── updateSystemHeroAsset ─────────────────────────────────────────────────────
// Links (or unlinks) a system's hero image to an Asset Library image, so the
// static package can bundle a durable, optimized local copy instead of a
// best-effort live fetch of an external URL at generation time. Sets
// hero_image_url too, so the raw-URL field / crop preview / live card preview
// all stay in sync automatically — matches the pattern already used for the
// manufacturer-level logo/hero slots in BrandProfileForm.

export async function updateSystemHeroAsset(
  systemId: string,
  manufacturerId: string,
  assetId: string | null,
  assetUrl: string | null,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_systems')
    .update({
      hero_image_asset_id: assetId,
      // Linking an asset (assetId set) always syncs hero_image_url to match
      // — including clearing it to null when the asset has no durable public
      // URL, so a stale/wrong value can't survive under a newly-linked asset.
      // Unlinking (assetId null) leaves hero_image_url alone, since it's the
      // intended manual fallback once no asset is linked.
      ...(assetId !== null ? { hero_image_url: assetUrl } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', systemId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── clearFieldVerification ───────────────────────────────────────────────────
// Removes a field verification (resets to unreviewed).

export async function clearFieldVerification(
  systemId: string,
  manufacturerId: string,
  fieldName: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('field_verifications')
    .delete()
    .eq('entity_type', 'staged_system')
    .eq('entity_id', systemId)
    .eq('field_name', fieldName)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── markSystemVerified ───────────────────────────────────────────────────────
// Sets verification_status = 'manufacturer_verified' on staged_systems.
// Records initials + date in reviewer_notes.

export async function markSystemVerified(
  systemId: string,
  manufacturerId: string,
  initials: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const now = new Date().toISOString()
  const dateStr = new Date().toLocaleDateString('en-AU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })

  const { error } = await supabase
    .from('staged_systems')
    .update({
      verification_status: 'manufacturer_verified',
      verified_by: auth.userId,
      verified_at: now,
      reviewer_notes: `Verified by ${initials.trim().toUpperCase()} on ${dateStr}`,
      updated_at: now,
    })
    .eq('id', systemId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── setSystemInReview ────────────────────────────────────────────────────────
// Moves a system to 'in_review' when the manufacturer opens it for editing.

export async function setSystemInReview(
  systemId: string,
  manufacturerId: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data: current } = await supabase
    .from('staged_systems')
    .select('verification_status')
    .eq('id', systemId)
    .single()

  // Don't downgrade a verified system
  if ((current as any)?.verification_status === 'manufacturer_verified') return { ok: true }

  const { error } = await supabase
    .from('staged_systems')
    .update({ verification_status: 'in_review', updated_at: new Date().toISOString() })
    .eq('id', systemId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── saveSystemNotes ──────────────────────────────────────────────────────────
// Saves free-text manufacturer notes to staged_systems.notes.

export async function saveSystemNotes(
  systemId: string,
  manufacturerId: string,
  notes: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_systems')
    .update({ notes: notes.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', systemId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── addMissingProfile ────────────────────────────────────────────────────────

export async function addMissingProfile(
  systemId: string,
  manufacturerId: string,
  data: { profile_name: string; product_code?: string; length_mm?: number | null; width_mm?: number | null; thickness_mm?: number | null; uom?: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data: row, error } = await supabase
    .from('staged_system_profiles')
    .insert({
      staged_system_id: systemId,
      profile_name: data.profile_name.trim(),
      product_code: data.product_code?.trim() || null,
      length_mm: data.length_mm ?? null,
      width_mm: data.width_mm ?? null,
      thickness_mm: data.thickness_mm ?? null,
      uom: data.uom?.trim() || null,
      verification_status: 'pending_review',
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (row as any).id }
}

// ─── updateProfile ────────────────────────────────────────────────────────────

export async function updateProfile(
  profileId: string,
  systemId: string,
  manufacturerId: string,
  data: { profile_name?: string; product_code?: string | null; description?: string | null; length_mm?: number | null; width_mm?: number | null; thickness_mm?: number | null; uom?: string | null },
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_system_profiles')
    .update(data as any)
    .eq('id', profileId)
    .eq('staged_system_id', systemId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── addMissingColour ─────────────────────────────────────────────────────────

export async function addMissingColour(
  systemId: string,
  manufacturerId: string,
  data: { colour_name: string; sku_suffix?: string; image_asset_id?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  let { data: row, error } = await supabase
    .from('staged_system_colours')
    .insert({
      staged_system_id: systemId,
      colour_name: data.colour_name.trim(),
      sku_suffix: data.sku_suffix?.trim() || null,
      // Colour swatches always link an Asset Library upload by id — never a
      // raw/pasted URL, since that path was how expiring presigned R2 links
      // used to end up permanently stored (see updateColourSwatchAsset).
      image_asset_id: data.image_asset_id ?? null,
      is_stocked: true,
      verification_status: 'pending_review',
    })
    .select('id')
    .single()

  // Pre-migration-063 environments lack image_asset_id — retry without it.
  if (error && /image_asset_id|does not exist/i.test(error.message ?? '')) {
    ({ data: row, error } = await supabase
      .from('staged_system_colours')
      .insert({
        staged_system_id: systemId,
        colour_name: data.colour_name.trim(),
        sku_suffix: data.sku_suffix?.trim() || null,
        is_stocked: true,
        verification_status: 'pending_review',
      })
      .select('id')
      .single())
  }

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (row as any).id }
}

// ─── updateColourSwatchAsset ───────────────────────────────────────────────────
// Links (or unlinks) a colour swatch to an Asset Library image — same pattern
// as updateSystemHeroAsset. image_url is synced from the asset's own durable
// public_url (or cleared to null) so it can never be a presigned R2 link that
// expires ~1 hour after saving; the review UI renders the swatch via
// /api/assets/{id} regardless, so image_url here is only a legacy fallback.

export async function updateColourSwatchAsset(
  colourId: string,
  systemId: string,
  manufacturerId: string,
  assetId: string | null,
  assetUrl: string | null,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_system_colours')
    .update({
      image_asset_id: assetId,
      ...(assetId !== null ? { image_url: assetUrl } : {}),
    })
    .eq('id', colourId)
    .eq('staged_system_id', systemId)

  // Pre-migration-063 environments lack image_asset_id — nothing to link to,
  // so treat it as a no-op rather than surfacing a confusing DB error.
  if (error && /image_asset_id|does not exist/i.test(error.message ?? '')) {
    return { ok: false, error: 'Colour swatch linking needs migration 063 applied to this project yet.' }
  }
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── updateColour ─────────────────────────────────────────────────────────────

export async function updateColour(
  colourId: string,
  systemId: string,
  manufacturerId: string,
  data: { colour_name?: string; sku_suffix?: string | null; image_url?: string | null },
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_system_colours')
    .update(data as any)
    .eq('id', colourId)
    .eq('staged_system_id', systemId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── getManufacturerComponents ────────────────────────────────────────────────
// Returns all staged_components for a manufacturer (for de-dup search).

export async function getManufacturerComponents(
  manufacturerId: string,
): Promise<{ ok: true; components: { id: string; name: string; sku: string | null; description: string | null }[] } | { ok: false; error: string }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data, error } = await supabase
    .from('staged_components')
    .select('id, name, sku, description')
    .eq('manufacturer_id', manufacturerId)
    .order('name')

  if (error) return { ok: false, error: error.message }
  return { ok: true, components: (data ?? []) as { id: string; name: string; sku: string | null; description: string | null }[] }
}

// ─── getManufacturerColours ───────────────────────────────────────────────────
// Distinct colours/finishes already saved on any of this manufacturer's other
// systems, for the "choose from existing" picker on Verify systems. Unlike
// components, colours have no shared manufacturer-level table to link a
// foreign key to (staged_system_colours only has staged_system_id) — so
// "linking" here means copying the matched row's name/sku/swatch onto a new
// row for the current system via addMissingColour, not a real FK reuse.

export async function getManufacturerColours(
  manufacturerId: string,
): Promise<
  | { ok: true; colours: { id: string; colour_name: string; sku_suffix: string | null; image_asset_id: string | null }[] }
  | { ok: false; error: string }
> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  let { data, error } = await supabase
    .from('staged_system_colours')
    .select('id, colour_name, sku_suffix, image_asset_id, staged_systems!inner(manufacturer_id)')
    .eq('staged_systems.manufacturer_id', manufacturerId)
    .order('colour_name')

  // Pre-migration-063 environments lack image_asset_id — retry without it.
  if (error && /image_asset_id|does not exist/i.test(error.message ?? '')) {
    const retry = await supabase
      .from('staged_system_colours')
      .select('id, colour_name, sku_suffix, staged_systems!inner(manufacturer_id)')
      .eq('staged_systems.manufacturer_id', manufacturerId)
      .order('colour_name')
    data = (retry.data ?? []).map((r: any) => ({ ...r, image_asset_id: null })) as any
    error = retry.error
  }

  if (error) return { ok: false, error: error.message }

  // Dedupe by name — the same colour is typically saved on many systems, and
  // the picker should show each once (preferring an entry that has a swatch).
  const byName = new Map<string, { id: string; colour_name: string; sku_suffix: string | null; image_asset_id: string | null }>()
  for (const row of (data ?? []) as any[]) {
    const key = row.colour_name.trim().toLowerCase()
    const existing = byName.get(key)
    const imageAssetId = row.image_asset_id ?? null
    if (!existing || (!existing.image_asset_id && imageAssetId)) {
      byName.set(key, { id: row.id, colour_name: row.colour_name, sku_suffix: row.sku_suffix, image_asset_id: imageAssetId })
    }
  }
  return { ok: true, colours: Array.from(byName.values()) }
}

// ─── linkExistingComponent ────────────────────────────────────────────────────
// Links an existing staged_component to a system (no new component created).

export async function linkExistingComponent(
  systemId: string,
  componentId: string,
  manufacturerId: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_system_components')
    .insert({ staged_system_id: systemId, staged_component_id: componentId })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── addMissingComponent ──────────────────────────────────────────────────────

export async function addMissingComponent(
  systemId: string,
  manufacturerId: string,
  data: { name: string; sku?: string; description?: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()

  // Insert the component
  const { data: comp, error: compError } = await supabase
    .from('staged_components')
    .insert({
      manufacturer_id: manufacturerId,
      name: data.name.trim(),
      sku: data.sku?.trim() || null,
      description: data.description?.trim() || null,
      verification_status: 'pending_review',
    })
    .select('id')
    .single()

  if (compError) return { ok: false, error: compError.message }

  // Link to system
  const { error: linkError } = await supabase
    .from('staged_system_components')
    .insert({
      staged_system_id: systemId,
      staged_component_id: (comp as any).id,
    })

  if (linkError) return { ok: false, error: linkError.message }
  return { ok: true, id: (comp as any).id }
}

// ─── updateComponent ──────────────────────────────────────────────────────────

export async function updateComponent(
  componentId: string,
  manufacturerId: string,
  data: { name?: string; sku?: string | null; description?: string | null; uom?: string | null; procurement_route?: 'specialist_supplier' | 'trade_merchant' | null; sort_order?: number | null },
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_components')
    .update({ ...data, updated_at: new Date().toISOString() } as any)
    .eq('id', componentId)
    .eq('manufacturer_id', manufacturerId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── removeProfile ────────────────────────────────────────────────────────────

export async function removeProfile(
  profileId: string,
  systemId: string,
  manufacturerId: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_system_profiles')
    .delete()
    .eq('id', profileId)
    .eq('staged_system_id', systemId)

  if (error) return { ok: false, error: error.message }
  await markDraftChanged(supabase, systemId)
  return { ok: true }
}

// ─── removeColour ─────────────────────────────────────────────────────────────

export async function removeColour(
  colourId: string,
  systemId: string,
  manufacturerId: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_system_colours')
    .delete()
    .eq('id', colourId)
    .eq('staged_system_id', systemId)

  if (error) return { ok: false, error: error.message }
  await markDraftChanged(supabase, systemId)
  return { ok: true }
}

// ─── unlinkComponent ──────────────────────────────────────────────────────────
// Removes the component from this system only (deletes the join row). The
// underlying staged_components record is left alone — it may be linked to
// other systems, and deleting it outright would silently break those too.

export async function unlinkComponent(
  componentId: string,
  systemId: string,
  manufacturerId: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_system_components')
    .delete()
    .eq('staged_system_id', systemId)
    .eq('staged_component_id', componentId)

  if (error) return { ok: false, error: error.message }
  await markDraftChanged(supabase, systemId)
  return { ok: true }
}

// ─── setCustomAttributes ──────────────────────────────────────────────────────
// Freeform label/value technical facts with no dedicated column (migration 061).

export async function setCustomAttributes(
  systemId: string,
  manufacturerId: string,
  attributes: { label: string; value: string }[],
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_systems')
    .update({ custom_technical_attributes: attributes.length > 0 ? attributes : null, updated_at: new Date().toISOString() })
    .eq('id', systemId)

  if (error) {
    if (/custom_technical_attributes|does not exist/i.test(error.message ?? '')) {
      return { ok: false, error: 'Custom technical attributes need migration 061 applied first.' }
    }
    return { ok: false, error: error.message }
  }
  await markDraftChanged(supabase, systemId)
  return { ok: true }
}

// ─── reopenSystem ─────────────────────────────────────────────────────────────
// Reopens a verified system for re-checking.

export async function reopenSystem(
  systemId: string,
  manufacturerId: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_systems')
    .update({
      verification_status: 'in_review',
      verified_by: null,
      verified_at: null,
      reviewer_notes: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', systemId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── submitForPublication ─────────────────────────────────────────────────────
// Manufacturer tells BuildQuote they're ready to publish their verified systems.
// Creates a publish_batches row (status 'submitted') with one publish_batch_item
// per system that is new or has changed since it was last submitted — systems
// already submitted with no edits since are skipped, so re-submitting after
// fixing one card doesn't re-bundle everything already sent.
//
// Each item is tagged change_type: 'new' (no production_system_id yet) or
// 'update' (already live, this is a re-publish) — see migration 037. BuildQuote
// admin reviews and publishes from there — that review/publish UI does not
// exist yet.

export async function submitForPublication(
  manufacturerId: string,
  message: string | null,
): Promise<ActionResult & { batchId?: string; systemCount?: number; newCount?: number; updateCount?: number }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()

  const { data: verified, error: sysError } = await supabase
    .from('staged_systems')
    .select('id, production_system_id, updated_at, last_submitted_at')
    .eq('manufacturer_id', manufacturerId)
    .eq('verification_status', 'manufacturer_verified')

  if (sysError) return { ok: false, error: sysError.message }
  if (!verified || verified.length === 0) {
    return { ok: false, error: 'No verified systems to submit yet.' }
  }

  // Column-to-column comparison isn't expressible through PostgREST filters,
  // and the verified set per manufacturer is small, so filter in JS.
  const toSubmit = verified.filter(
    (s) => !s.last_submitted_at || new Date(s.updated_at) > new Date(s.last_submitted_at),
  )

  if (toSubmit.length === 0) {
    return { ok: false, error: 'Nothing new to submit — every verified system was already sent to BuildQuote.' }
  }

  const { data: batch, error: batchError } = await supabase
    .from('publish_batches')
    .insert({
      manufacturer_id: manufacturerId,
      status: 'submitted',
      created_by: auth.userId,
      notes: message,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return { ok: false, error: batchError?.message ?? 'Could not create publish batch.' }
  }

  const items = toSubmit.map((s) => ({
    publish_batch_id: batch.id,
    entity_type: 'staged_system',
    entity_id: s.id,
    status: 'pending',
    change_type: s.production_system_id ? ('update' as const) : ('new' as const),
  }))

  const { error: itemsError } = await supabase.from('publish_batch_items').insert(items)
  if (itemsError) return { ok: false, error: itemsError.message }

  const now = new Date().toISOString()
  const { error: stampError } = await supabase
    .from('staged_systems')
    .update({ last_submitted_at: now })
    .in('id', toSubmit.map((s) => s.id))
  if (stampError) return { ok: false, error: stampError.message }

  const newCount = items.filter((i) => i.change_type === 'new').length
  const updateCount = items.length - newCount
  const summary = [
    newCount > 0 ? `${newCount} new system${newCount !== 1 ? 's' : ''}` : null,
    updateCount > 0 ? `${updateCount} update${updateCount !== 1 ? 's' : ''} to live system${updateCount !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' and ')

  // Post to the BuildQuote message board so the submission is actually visible
  // somewhere — the publish_batches row alone is silent otherwise. Best-effort:
  // a failure here shouldn't undo the submission itself.
  const session = await getStudioSession()
  await postSubmissionMessage(
    manufacturerId,
    auth.userId,
    session.profile?.email ?? 'Manufacturer',
    message ?? `We have ${summary} ready to publish.`,
    batch.id,
  )

  return { ok: true, batchId: batch.id, systemCount: toSubmit.length, newCount, updateCount }
}

// ─── getManufacturerSourceDocuments ──────────────────────────────────────────
// Lists source documents for this manufacturer so the user can pick one to link.

export async function getManufacturerSourceDocuments(
  manufacturerId: string,
): Promise<{ ok: true; documents: { id: string; document_name: string; document_type: string | null; document_date: string | null }[] } | { ok: false; error: string }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data, error } = await supabase
    .from('source_documents')
    .select('id, document_name, document_type, document_date')
    .eq('manufacturer_id', manufacturerId)
    .order('uploaded_at', { ascending: false })
    .limit(50)

  if (error) return { ok: false, error: error.message }
  return { ok: true, documents: (data ?? []) as { id: string; document_name: string; document_type: string | null; document_date: string | null }[] }
}

// ─── linkSourceDocument ───────────────────────────────────────────────────────
// Attaches (or detaches) a source_document to a staged_system.

export async function linkSourceDocument(
  systemId: string,
  manufacturerId: string,
  documentId: string | null,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_systems')
    .update({ source_document_id: documentId, updated_at: new Date().toISOString() })
    .eq('id', systemId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── createBlankSystem ────────────────────────────────────────────────────────
// Inserts a new staged_system with a placeholder name for manual data entry.

export async function createBlankSystem(
  manufacturerId: string,
  name?: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data, error } = await supabase
    .from('staged_systems')
    .insert({
      manufacturer_id: manufacturerId,
      name: name?.trim() || 'New system',
      verification_status: 'pending_review',
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data.id }
}

// ─── archiveSystem ────────────────────────────────────────────────────────────
// Soft-deletes a staged_system by setting verification_status = 'archived'.
// The staging record is hidden from the UI but not removed — safe for systems
// that have a production counterpart (production record is untouched).

export async function archiveSystem(
  systemId: string,
  manufacturerId: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_systems')
    .update({ verification_status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', systemId)
    .eq('manufacturer_id', manufacturerId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── deleteSystem ─────────────────────────────────────────────────────────────
// Hard-deletes a staged_system and its child rows (profiles, colours,
// component links, field verifications). Only intended for systems that have
// never been published — the production record (if any) is NOT affected.

export async function deleteSystem(
  systemId: string,
  manufacturerId: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()

  // Delete child records first to avoid FK violations
  await supabase.from('staged_system_profiles').delete().eq('staged_system_id', systemId)
  await supabase.from('staged_system_colours').delete().eq('staged_system_id', systemId)
  await supabase.from('staged_system_components').delete().eq('staged_system_id', systemId)
  await supabase.from('field_verifications').delete()
    .eq('entity_type', 'staged_system').eq('entity_id', systemId)

  const { error } = await supabase
    .from('staged_systems')
    .delete()
    .eq('id', systemId)
    .eq('manufacturer_id', manufacturerId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
