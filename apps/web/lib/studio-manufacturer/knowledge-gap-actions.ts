'use server'

// Reads and the resolution write path for the AI Knowledge Gap & Feedback
// Loop (design doc addendum §A6/§18-22). The resolution never becomes a
// second, parallel answer store — it always goes through the existing
// assertion-actions.ts write path, the same one the System Workspace's fact
// rows use, so a manufacturer's answer here and a manufacturer's answer
// there produce the exact same kind of knowledge_assertions row.
//
// Predicate/claimType inference (inferPredicateAndClaimType) is deliberately
// coarse: a bucket per question type (suitability/installation/compatibility/
// specification/general), not the rich structured relationship graph §22 of
// the master spec describes ("application -> wet_area -> shower -> wall ->
// tiled_finish"). That level of structured conversion needs the taxonomy
// work (knowledge_taxonomy_terms, migration 065 §5a.6), which is empty by
// design and explicitly Phase 2 — see plan addendum §A2's schema-gap
// escalation entry. This is honest about being a coarser first pass, not a
// finished knowledge model.

import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { assertManufacturerAccess } from './verification-actions'
import { correctAssertion, markAssertionUnknown } from './assertion-actions'
import type { ClaimType } from '@/lib/knowledge/vocabulary'
import type { NormalisedQuestion, QuestionType } from '@/lib/knowledge/askPipeline'

async function assertBuildquoteStaff(): Promise<{ allowed: true } | { allowed: false; error: string }> {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin' && session.globalRole !== 'buildquote_reviewer') {
    return { allowed: false, error: 'Access denied.' }
  }
  return { allowed: true }
}

export type KnowledgeGapRow = {
  id: string
  created_at: string
  status: string
  failure_type: string | null
  priority: string
  user_question: string
  normalised_question: NormalisedQuestion | null
  staged_system_id: string | null
  manufacturer_id: string
  missing_information: string | null
  repeat_count: number
  resolution_type: string | null
  manufacturer_response: { answer: string; appliesTo: string | null; doesNotApplyTo: string | null } | null
  resolution_notes: string | null
  resolved_at: string | null
  systemName?: string | null
  systemId?: string | null
  manufacturerName?: string | null
}

function isMissingSchemaError(message: string | undefined): boolean {
  return /ai_knowledge_gaps|does not exist|42P01|42703/i.test(message ?? '')
}

export async function listKnowledgeGaps(
  manufacturerId: string,
  statusFilter?: string,
): Promise<{ ok: true; gaps: KnowledgeGapRow[] } | { ok: false; error: string }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  let query = supabase
    .from('ai_knowledge_gaps')
    .select('id, created_at, status, failure_type, priority, user_question, normalised_question, staged_system_id, manufacturer_id, missing_information, repeat_count, resolution_type, manufacturer_response, resolution_notes, resolved_at, staged_systems(name)')
    .eq('manufacturer_id', manufacturerId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (statusFilter && statusFilter !== 'all') {
    query = statusFilter === 'open'
      ? query.not('status', 'in', '(RESOLVED,PUBLISHED,DUPLICATE,OUT_OF_SCOPE,NO_ACTION_REQUIRED)')
      : query.eq('status', statusFilter)
  }

  const { data, error } = await query
  if (error) {
    if (isMissingSchemaError(error.message)) {
      return { ok: false, error: 'The AI Knowledge Gap feature needs migration 066 applied to this project first.' }
    }
    return { ok: false, error: error.message }
  }

  type Row = Omit<KnowledgeGapRow, 'systemName' | 'systemId'> & { staged_systems: { name: string } | { name: string }[] | null }
  const rows = (data ?? []) as unknown as Row[]
  const gaps: KnowledgeGapRow[] = rows.map((r) => {
    const sys = Array.isArray(r.staged_systems) ? r.staged_systems[0] : r.staged_systems
    return { ...r, systemName: sys?.name ?? null, systemId: r.staged_system_id }
  })
  return { ok: true, gaps }
}

export async function getKnowledgeGap(
  gapId: string,
  manufacturerId: string,
): Promise<{ ok: true; gap: KnowledgeGapRow } | { ok: false; error: string }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data, error } = await supabase
    .from('ai_knowledge_gaps')
    .select('id, created_at, status, failure_type, priority, user_question, normalised_question, staged_system_id, manufacturer_id, missing_information, repeat_count, resolution_type, manufacturer_response, resolution_notes, resolved_at, staged_systems(name)')
    .eq('id', gapId)
    .eq('manufacturer_id', manufacturerId)
    .maybeSingle()

  if (error) {
    if (isMissingSchemaError(error.message)) {
      return { ok: false, error: 'The AI Knowledge Gap feature needs migration 066 applied to this project first.' }
    }
    return { ok: false, error: error.message }
  }
  if (!data) return { ok: false, error: 'Not found.' }

  type Row = Omit<KnowledgeGapRow, 'systemName' | 'systemId'> & { staged_systems: { name: string } | { name: string }[] | null }
  const r = data as unknown as Row
  const sys = Array.isArray(r.staged_systems) ? r.staged_systems[0] : r.staged_systems
  return { ok: true, gap: { ...r, systemName: sys?.name ?? null, systemId: r.staged_system_id } }
}

function inferPredicateAndClaimType(questionType: QuestionType): { predicate: string; claimType: ClaimType } {
  switch (questionType) {
    case 'suitability': return { predicate: 'bq:suitabilityAnswer', claimType: 'application' }
    case 'installation': return { predicate: 'bq:installationAnswer', claimType: 'installation_requirement' }
    case 'compatibility': return { predicate: 'bq:compatibilityAnswer', claimType: 'compatibility' }
    case 'specification': return { predicate: 'bq:specificationAnswer', claimType: 'performance_claim' }
    default: return { predicate: 'bq:manufacturerAnswer', claimType: 'manufacturer_statement' }
  }
}

export type ResolutionType = 'confirmed_yes' | 'confirmed_no' | 'conditional' | 'info_not_available' | 'needs_review'

export type ResolveKnowledgeGapResult = { ok: true } | { ok: false; error: string }

export async function resolveKnowledgeGap(
  gapId: string,
  manufacturerId: string,
  input: {
    resolutionType: ResolutionType
    answer: string
    appliesTo: string | null
    doesNotApplyTo: string | null
    verified: boolean
  },
): Promise<ResolveKnowledgeGapResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  // The three "an answer exists" resolutions require the manufacturer's
  // verification declaration (§21) — there is no lesser "unverified,
  // manufacturer-supplied" status in this system's model to fall back to,
  // and per §20 a manufacturer who isn't sure should pick "Information not
  // available" or "Needs technical review" rather than submit an unconfirmed
  // guess. Enforced server-side, not just by disabling the submit button.
  const requiresVerification = input.resolutionType === 'confirmed_yes' || input.resolutionType === 'confirmed_no' || input.resolutionType === 'conditional'
  if (requiresVerification && !input.verified) {
    return { ok: false, error: 'Please confirm this information is accurate before submitting.' }
  }

  const found = await getKnowledgeGap(gapId, manufacturerId)
  if (!found.ok) return found

  const gap = found.gap
  const resultingAssertionIds: string[] = []

  if (gap.staged_system_id && input.resolutionType !== 'needs_review') {
    const questionType: QuestionType = gap.normalised_question?.questionType ?? 'general'
    const { predicate, claimType } = inferPredicateAndClaimType(questionType)
    const objectValue = {
      resolutionType: input.resolutionType,
      answer: input.answer,
      appliesTo: input.appliesTo,
      doesNotApplyTo: input.doesNotApplyTo,
    }

    // There is no prior extracted value for these ad-hoc, question-derived
    // predicates to "confirm as-is" — every resolution here is a brand-new
    // manufacturer-authored fact, so correctAssertion (-> manufacturer_corrected,
    // "verified" trust level) is the right write path for all three, not
    // verifyAssertion (which exists for confirming an *existing* extraction).
    // {} , not null, as the placeholder "original" value: object_value is
    // NOT NULL in knowledge_assertions (migration 065) — this placeholder
    // row exists only for the instant before correctAssertion supersedes it.
    const writeResult = input.resolutionType === 'info_not_available'
      ? await markAssertionUnknown(gap.staged_system_id, manufacturerId, predicate, claimType, objectValue, 'manufacturer_supplied', input.answer || null)
      : await correctAssertion(gap.staged_system_id, manufacturerId, predicate, claimType, {}, objectValue, 'manufacturer_supplied')

    if (!writeResult.ok) return { ok: false, error: writeResult.error }
    resultingAssertionIds.push(writeResult.id)
  }

  const newStatus = input.resolutionType === 'needs_review' ? 'ESCALATED' : 'RESOLVED'
  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('ai_knowledge_gaps')
    .update({
      status: newStatus,
      resolution_type: input.resolutionType,
      manufacturer_response: { answer: input.answer, appliesTo: input.appliesTo, doesNotApplyTo: input.doesNotApplyTo },
      resulting_assertion_ids: resultingAssertionIds,
      resolved_by: auth.userId,
      resolved_at: new Date().toISOString(),
      manufacturer_verification_required: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gapId)
    .eq('manufacturer_id', manufacturerId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── Admin cross-manufacturer triage (design doc addendum §A6) ─────────────
// Mirrors admin/messages' getAllMessageThreads() shape exactly — same list
// pattern, same auth gate. Primary use: RETRIEVAL_GAP and SCHEMA_GAP rows,
// which route to BuildQuote's own team rather than the manufacturer (§25/§23
// of the master spec), plus a cross-manufacturer view of what's still open.

export async function getAllKnowledgeGaps(): Promise<
  { ok: true; gaps: KnowledgeGapRow[] } | { ok: false; error: string }
> {
  const auth = await assertBuildquoteStaff()
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data, error } = await supabase
    .from('ai_knowledge_gaps')
    .select('id, created_at, status, failure_type, priority, user_question, normalised_question, staged_system_id, manufacturer_id, missing_information, repeat_count, resolution_type, manufacturer_response, resolution_notes, resolved_at, staged_systems(name), data_studio_manufacturers(name)')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    if (isMissingSchemaError(error.message)) {
      return { ok: false, error: 'The AI Knowledge Gap feature needs migration 066 applied to this project first.' }
    }
    return { ok: false, error: error.message }
  }

  type Row = Omit<KnowledgeGapRow, 'systemName' | 'systemId'> & {
    staged_systems: { name: string } | { name: string }[] | null
    data_studio_manufacturers: { name: string } | { name: string }[] | null
  }
  const rows = (data ?? []) as unknown as Row[]
  const gaps: KnowledgeGapRow[] = rows.map((r) => {
    const sys = Array.isArray(r.staged_systems) ? r.staged_systems[0] : r.staged_systems
    const mfr = Array.isArray(r.data_studio_manufacturers) ? r.data_studio_manufacturers[0] : r.data_studio_manufacturers
    return { ...r, systemName: sys?.name ?? null, systemId: r.staged_system_id, manufacturerName: mfr?.name ?? null }
  })
  return { ok: true, gaps }
}

export async function getKnowledgeGapAsStaff(
  gapId: string,
): Promise<{ ok: true; gap: KnowledgeGapRow } | { ok: false; error: string }> {
  const auth = await assertBuildquoteStaff()
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data, error } = await supabase
    .from('ai_knowledge_gaps')
    .select('id, created_at, status, failure_type, priority, user_question, normalised_question, staged_system_id, manufacturer_id, missing_information, repeat_count, resolution_type, manufacturer_response, resolution_notes, resolved_at, staged_systems(name), data_studio_manufacturers(name)')
    .eq('id', gapId)
    .maybeSingle()

  if (error) {
    if (isMissingSchemaError(error.message)) {
      return { ok: false, error: 'The AI Knowledge Gap feature needs migration 066 applied to this project first.' }
    }
    return { ok: false, error: error.message }
  }
  if (!data) return { ok: false, error: 'Not found.' }

  type Row = Omit<KnowledgeGapRow, 'systemName' | 'systemId'> & {
    staged_systems: { name: string } | { name: string }[] | null
    data_studio_manufacturers: { name: string } | { name: string }[] | null
  }
  const r = data as unknown as Row
  const sys = Array.isArray(r.staged_systems) ? r.staged_systems[0] : r.staged_systems
  const mfr = Array.isArray(r.data_studio_manufacturers) ? r.data_studio_manufacturers[0] : r.data_studio_manufacturers
  return { ok: true, gap: { ...r, systemName: sys?.name ?? null, systemId: r.staged_system_id, manufacturerName: mfr?.name ?? null } }
}

export async function setKnowledgeGapStatus(
  gapId: string,
  status: 'TRIAGED' | 'NO_ACTION_REQUIRED' | 'DUPLICATE' | 'OUT_OF_SCOPE',
  notes: string | null,
): Promise<ResolveKnowledgeGapResult> {
  const auth = await assertBuildquoteStaff()
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('ai_knowledge_gaps')
    .update({ status, resolution_notes: notes, updated_at: new Date().toISOString() })
    .eq('id', gapId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
