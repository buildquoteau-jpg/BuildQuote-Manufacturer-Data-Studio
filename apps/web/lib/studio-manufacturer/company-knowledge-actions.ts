'use server'

// Company Knowledge panel actions (design doc §9.2 "Company-level answers,
// inherited everywhere") — a small, fixed set of manufacturer-wide
// questions answered once and inherited by every card via
// knowledge_assertions.staged_system_id IS NULL. Verifying a fastener spec
// once for the whole catalogue is what keeps a 500-product manufacturer
// under a realistic time budget — see the design doc's workload-killer list.
//
// Same auth gate and graceful pre-migration-065 degradation as
// assertion-actions.ts / relationship-actions.ts.

import { createStudioServerClient } from '@/lib/supabase/server'
import { assertManufacturerAccess } from './verification-actions'

export type CompanyQuestionKey =
  | 'bq:companyFastenerSpec'
  | 'bq:companyWarrantyPeriod'
  | 'bq:companyWarrantyExclusions'
  | 'bq:companyAuthoritativeDocs'
  | 'bq:companyRegionsServed'

export const COMPANY_QUESTIONS: { key: CompanyQuestionKey; label: string; placeholder: string }[] = [
  {
    key: 'bq:companyFastenerSpec',
    label: 'Default fastener specification by corrosion category',
    placeholder: 'e.g. Class 3 galvanised up to C3; 316 stainless required for C4 and above',
  },
  {
    key: 'bq:companyWarrantyPeriod',
    label: 'Standard warranty period',
    placeholder: 'e.g. 25 years structural, 10 years finish',
  },
  {
    key: 'bq:companyWarrantyExclusions',
    label: 'What voids the warranty',
    placeholder: 'e.g. acid or high-pressure cleaning, non-approved fixings',
  },
  {
    key: 'bq:companyAuthoritativeDocs',
    label: 'Which document set is authoritative',
    placeholder: 'e.g. always the latest revision on our website, not distributor copies',
  },
  {
    key: 'bq:companyRegionsServed',
    label: 'Regions served',
    placeholder: 'e.g. WA and SA only; not sold nationally',
  },
]

export type CompanyAnswer = { key: CompanyQuestionKey; value: string }
export type CompanyKnowledgeResult = { ok: true; answers: CompanyAnswer[] } | { ok: false; error: string }
export type CompanyAnswerActionResult = { ok: true } | { ok: false; error: string }

function isMissingSchemaError(message: string | undefined): boolean {
  return /knowledge_assertions|does not exist|42P01|42703/i.test(message ?? '')
}

export async function getCompanyKnowledge(manufacturerId: string): Promise<CompanyKnowledgeResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data, error } = await supabase
    .from('knowledge_assertions')
    .select('predicate, object_value')
    .eq('manufacturer_id', manufacturerId)
    .is('staged_system_id', null)
    .in('predicate', COMPANY_QUESTIONS.map((q) => q.key))

  if (error) {
    if (isMissingSchemaError(error.message)) return { ok: true, answers: [] } // pre-065 — no answers yet, not an error
    return { ok: false, error: error.message }
  }

  return {
    ok: true,
    answers: (data ?? []).map((r: any) => ({ key: r.predicate, value: String(r.object_value ?? '') })),
  }
}

export async function setCompanyAnswer(
  manufacturerId: string,
  key: CompanyQuestionKey,
  value: string,
): Promise<CompanyAnswerActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const now = new Date().toISOString()

  const { data: existing, error: findErr } = await supabase
    .from('knowledge_assertions')
    .select('id')
    .eq('manufacturer_id', manufacturerId)
    .is('staged_system_id', null)
    .eq('predicate', key)
    .maybeSingle()
  if (findErr) {
    if (isMissingSchemaError(findErr.message)) {
      return { ok: false, error: 'Company Knowledge needs migration 065 applied to this project first.' }
    }
    return { ok: false, error: findErr.message }
  }

  if (existing) {
    const { error } = await supabase
      .from('knowledge_assertions')
      .update({
        object_value: value, epistemic_status: 'manufacturer_verified',
        verified_by: auth.userId, verified_at: now, updated_at: now,
      })
      .eq('id', existing.id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  const { error } = await supabase.from('knowledge_assertions').insert({
    manufacturer_id: manufacturerId,
    staged_system_id: null,
    subject_kind: 'manufacturer',
    predicate: key,
    claim_type: 'manufacturer_statement',
    object_kind: 'literal',
    object_value: value,
    origin: 'manufacturer_supplied',
    epistemic_status: 'manufacturer_verified',
    verified_by: auth.userId,
    verified_at: now,
  })
  if (error) {
    if (isMissingSchemaError(error.message)) {
      return { ok: false, error: 'Company Knowledge needs migration 065 applied to this project first.' }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
