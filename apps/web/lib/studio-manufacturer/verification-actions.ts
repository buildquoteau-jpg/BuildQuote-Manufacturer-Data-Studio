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

// Text fields that can be directly updated on staged_systems
const STAGED_TEXT_FIELDS = [
  'name', 'category', 'subcategory', 'description',
  'hero_image_url', 'website_url', 'source_url',
  'install_guide_urls', 'tech_data_url',
  'bal_rating', 'fire_rating', 'acoustic_rating', 'structural_grade',
] as const

// Boolean fields that can be directly updated on staged_systems
const STAGED_BOOL_FIELDS = [
  'australian_made', 'moisture_resistant',
] as const

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

  // If the user made an edit, patch staged_systems so the card renders correctly
  if (status === 'edited' && verifiedValue !== null) {
    if ((STAGED_TEXT_FIELDS as readonly string[]).includes(fieldName)) {
      const { error } = await supabase
        .from('staged_systems')
        .update({ [fieldName]: verifiedValue, updated_at: now })
        .eq('id', systemId)
      if (error) return { ok: false, error: error.message }
    } else if ((STAGED_BOOL_FIELDS as readonly string[]).includes(fieldName)) {
      const { error } = await supabase
        .from('staged_systems')
        .update({ [fieldName]: verifiedValue === 'true', updated_at: now })
        .eq('id', systemId)
      if (error) return { ok: false, error: error.message }
    }
  }

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
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_systems')
    .update({
      hero_image_position_x: Math.round(Math.max(0, Math.min(100, positionX))),
      hero_image_position_y: Math.round(Math.max(0, Math.min(100, positionY))),
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
  data: { profile_name?: string; product_code?: string | null; length_mm?: number | null; width_mm?: number | null; thickness_mm?: number | null; uom?: string | null },
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
  data: { colour_name: string; sku_suffix?: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data: row, error } = await supabase
    .from('staged_system_colours')
    .insert({
      staged_system_id: systemId,
      colour_name: data.colour_name.trim(),
      sku_suffix: data.sku_suffix?.trim() || null,
      is_stocked: true,
      verification_status: 'pending_review',
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (row as any).id }
}

// ─── updateColour ─────────────────────────────────────────────────────────────

export async function updateColour(
  colourId: string,
  systemId: string,
  manufacturerId: string,
  data: { colour_name?: string; sku_suffix?: string | null },
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
  data: { name?: string; sku?: string | null; description?: string | null },
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
