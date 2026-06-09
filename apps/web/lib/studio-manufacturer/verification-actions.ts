'use server'

import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'

// ─── Auth gate ────────────────────────────────────────────────────────────────
// Manufacturers can only write to their own workspace.
// buildquote_admin can access any workspace.

async function assertManufacturerAccess(
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
  'install_guide_url', 'tech_data_url',
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
