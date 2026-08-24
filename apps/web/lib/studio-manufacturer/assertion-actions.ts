'use server'

// Assertion-aware server actions for the System Workspace (design doc §9.3
// — the five fact-row actions: Correct, Fix, Not applicable, Don't know,
// Dispute) and the answer-policy override (§5a.3/§5a.12).
//
// Sits beside verification-actions.ts, not inside it — that file already
// owns the field_verifications/staged_systems write path; this one owns
// knowledge_assertions. Both share the same assertManufacturerAccess() gate
// so a manufacturer can only ever write their own workspace's facts.
//
// Upserts by (staged_system_id, predicate): a fact the generator currently
// derives live (Step 1) may not have a knowledge_assertions row yet — the
// manufacturer confirming or correcting it here is exactly the event that
// should create one, not a precondition that blocks the action.
//
// Degrades gracefully (42P01/42703) if migration 065 hasn't been applied to
// this environment yet, same convention as every other pre-migration guard
// in this codebase (see e.g. updateColourSwatchAsset in verification-actions.ts).

import { createStudioServerClient } from '@/lib/supabase/server'
import { assertManufacturerAccess } from './verification-actions'
import { isTighteningOverride, resolveAnswerPolicy } from '@/lib/knowledge/vocabulary'
import type { AnswerPolicy, ClaimType, EpistemicStatus } from '@/lib/knowledge/vocabulary'

export type AssertionActionResult = { ok: true; id: string } | { ok: false; error: string }

function isMissingSchemaError(message: string | undefined): boolean {
  return /knowledge_assertions|does not exist|42P01|42703/i.test(message ?? '')
}

async function findOrCreateAssertion(
  supabase: ReturnType<typeof createStudioServerClient>,
  systemId: string,
  manufacturerId: string,
  predicate: string,
  claimType: ClaimType,
  objectValue: unknown,
  origin: string,
): Promise<{ ok: true; id: string; currentStatus: EpistemicStatus } | { ok: false; error: string }> {
  const { data: existing, error: findErr } = await supabase
    .from('knowledge_assertions')
    .select('id, epistemic_status')
    .eq('staged_system_id', systemId)
    .eq('predicate', predicate)
    .maybeSingle()
  if (findErr) {
    if (isMissingSchemaError(findErr.message)) {
      return { ok: false, error: 'The AI knowledge layer needs migration 065 applied to this project first.' }
    }
    return { ok: false, error: findErr.message }
  }
  if (existing) return { ok: true, id: existing.id, currentStatus: existing.epistemic_status as EpistemicStatus }

  const { data: created, error: insErr } = await supabase
    .from('knowledge_assertions')
    .insert({
      manufacturer_id: manufacturerId,
      staged_system_id: systemId,
      subject_kind: 'system',
      predicate,
      claim_type: claimType,
      object_kind: typeof objectValue === 'boolean' ? 'boolean' : 'literal',
      object_value: objectValue,
      origin,
      epistemic_status: 'unverified',
    })
    .select('id')
    .single()
  if (insErr || !created) {
    if (isMissingSchemaError(insErr?.message)) {
      return { ok: false, error: 'The AI knowledge layer needs migration 065 applied to this project first.' }
    }
    return { ok: false, error: insErr?.message ?? 'Could not create assertion.' }
  }
  return { ok: true, id: created.id, currentStatus: 'unverified' }
}

// ─── ✓ Correct — confirm the extracted value as-is ─────────────────────────

export async function verifyAssertion(
  systemId: string,
  manufacturerId: string,
  predicate: string,
  claimType: ClaimType,
  objectValue: unknown,
  origin: string,
): Promise<AssertionActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const found = await findOrCreateAssertion(supabase, systemId, manufacturerId, predicate, claimType, objectValue, origin)
  if (!found.ok) return found

  const { error } = await supabase
    .from('knowledge_assertions')
    .update({
      epistemic_status: 'manufacturer_verified',
      verified_by: auth.userId,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', found.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: found.id }
}

// ─── ✎ Fix — manufacturer supplies a corrected value ───────────────────────
// The original assertion is superseded, not overwritten — §9.4 relies on the
// old value staying resolvable for the "was X → now Y" re-verification diff.

export async function correctAssertion(
  systemId: string,
  manufacturerId: string,
  predicate: string,
  claimType: ClaimType,
  originalValue: unknown,
  correctedValue: unknown,
  origin: string,
): Promise<AssertionActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const found = await findOrCreateAssertion(supabase, systemId, manufacturerId, predicate, claimType, originalValue, origin)
  if (!found.ok) return found

  const now = new Date().toISOString()
  await supabase.from('knowledge_assertions').update({ epistemic_status: 'superseded', updated_at: now }).eq('id', found.id)

  const { data: created, error } = await supabase
    .from('knowledge_assertions')
    .insert({
      manufacturer_id: manufacturerId,
      staged_system_id: systemId,
      subject_kind: 'system',
      predicate,
      claim_type: claimType,
      object_kind: typeof correctedValue === 'boolean' ? 'boolean' : 'literal',
      object_value: correctedValue,
      origin: 'manufacturer_supplied',
      epistemic_status: 'manufacturer_corrected',
      supersedes_assertion_id: found.id,
      verified_by: auth.userId,
      verified_at: now,
    })
    .select('id')
    .single()
  if (error || !created) return { ok: false, error: error?.message ?? 'Could not save the correction.' }
  return { ok: true, id: created.id }
}

// ─── ✗ Not applicable / ? Don't know — first-class declared gaps ──────────

async function setStatus(
  systemId: string,
  manufacturerId: string,
  predicate: string,
  claimType: ClaimType,
  objectValue: unknown,
  origin: string,
  status: EpistemicStatus,
  notes: string | null,
): Promise<AssertionActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const found = await findOrCreateAssertion(supabase, systemId, manufacturerId, predicate, claimType, objectValue, origin)
  if (!found.ok) return found

  const { error } = await supabase
    .from('knowledge_assertions')
    .update({
      epistemic_status: status,
      verified_by: auth.userId,
      verified_at: new Date().toISOString(),
      reviewer_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', found.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: found.id }
}

export async function markAssertionNotApplicable(
  systemId: string, manufacturerId: string, predicate: string, claimType: ClaimType, objectValue: unknown, origin: string, notes: string | null,
): Promise<AssertionActionResult> {
  return setStatus(systemId, manufacturerId, predicate, claimType, objectValue, origin, 'not_applicable', notes)
}

export async function markAssertionUnknown(
  systemId: string, manufacturerId: string, predicate: string, claimType: ClaimType, objectValue: unknown, origin: string, notes: string | null,
): Promise<AssertionActionResult> {
  return setStatus(systemId, manufacturerId, predicate, claimType, objectValue, origin, 'unknown', notes)
}

// ─── ⚑ Dispute — suppress from the AI reading surface immediately ─────────

export async function disputeAssertion(
  systemId: string, manufacturerId: string, predicate: string, claimType: ClaimType, objectValue: unknown, origin: string, notes: string | null,
): Promise<AssertionActionResult> {
  return setStatus(systemId, manufacturerId, predicate, claimType, objectValue, origin, 'disputed', notes)
}

// ─── Answer policy override — BuildQuote staff or manufacturer admin, ─────
// tightening only (design doc §5a.12, resolved decision).

export async function overrideAnswerPolicy(
  assertionId: string,
  manufacturerId: string,
  currentEpistemicStatus: EpistemicStatus,
  currentClaimType: ClaimType,
  nextPolicy: AnswerPolicy,
): Promise<AssertionActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }
  // assertManufacturerAccess already restricts to buildquote_admin or an
  // active member of this manufacturer's workspace — the tightening check
  // below is the additional business rule §5a.12 requires beyond membership.

  const currentDefault = resolveAnswerPolicy(currentEpistemicStatus, currentClaimType)
  if (!isTighteningOverride(currentDefault, nextPolicy)) {
    return { ok: false, error: 'An answer policy can only be tightened, never loosened.' }
  }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('knowledge_assertions')
    .update({ answer_policy: nextPolicy, updated_at: new Date().toISOString() })
    .eq('id', assertionId)
  if (error) {
    if (isMissingSchemaError(error.message)) {
      return { ok: false, error: 'The AI knowledge layer needs migration 065 applied to this project first.' }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, id: assertionId }
}
