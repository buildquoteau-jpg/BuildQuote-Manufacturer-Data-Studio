// Backfills existing field_verifications/parser_field_evidence/custom_
// technical_attributes data into knowledge_assertions + assertion_evidence
// rows (task #3, design doc §14 step 3). Reuses buildFactsForCanonicalSystem
// — the exact same resolution logic the live knowledge.jsonld route runs —
// so the backfilled rows and a freshly-generated live object never disagree.
//
// Idempotent: guarded by "does a row already exist for this
// (staged_system_id, predicate)" rather than a DB unique constraint, because
// the schema deliberately allows supersession chains (multiple rows per
// predicate over time) — a hard uniqueness constraint would break that. Safe
// to re-run; it only ever inserts, never edits or deletes.
//
// Requires migration 065 applied first. Every insert is wrapped so a missing
// table (42P01) or column (42703) surfaces as a clear per-system error
// rather than a stack trace, per house convention.

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildFactsForCanonicalSystem } from './buildSystemKnowledge'
import { fetchCanonicalSystemBundle, type CanonicalSystemBundle } from './fetchCanonicalKnowledgeData'
import type { Assertion } from './types'

export type BackfillSystemResult = {
  systemId: string
  systemName: string
  inserted: number
  skippedExisting: number
  error: string | null
}

export type BackfillSummary = {
  ok: true
  dryRun: boolean
  systems: BackfillSystemResult[]
  totalInserted: number
} | { ok: false; error: string }

function objectValueFromCompact(a: Assertion): unknown {
  return a['bq:objectValue'] ?? null
}

async function backfillOneSystem(
  supabase: SupabaseClient,
  manufacturerId: string,
  bundle: CanonicalSystemBundle,
  dryRun: boolean,
): Promise<BackfillSystemResult> {
  const { compactAssertions } = buildFactsForCanonicalSystem(bundle)
  let inserted = 0
  let skippedExisting = 0

  for (const a of compactAssertions) {
    const predicate = a['bq:predicate']

    const { data: existing, error: existErr } = await supabase
      .from('knowledge_assertions')
      .select('id')
      .eq('staged_system_id', bundle.system.id)
      .eq('predicate', predicate)
      .limit(1)
      .maybeSingle()
    if (existErr) {
      return { systemId: bundle.system.id, systemName: bundle.system.name, inserted, skippedExisting, error: existErr.message }
    }
    if (existing) {
      skippedExisting += 1
      continue
    }

    if (dryRun) {
      inserted += 1
      continue
    }

    const { data: row, error: insErr } = await supabase
      .from('knowledge_assertions')
      .insert({
        manufacturer_id: manufacturerId,
        staged_system_id: bundle.system.id,
        subject_kind: 'system',
        predicate,
        object_kind: typeof a['bq:objectValue'] === 'boolean' ? 'boolean' : 'literal',
        object_value: objectValueFromCompact(a),
        claim_type: 'unknown', // backfilled rows get a proper claimType once a reviewer confirms one (§5a.9)
        origin: a['bq:origin'],
        epistemic_status: a['bq:epistemicStatus'],
        confidence: a['bq:confidence'] ?? null,
        verified_at: a['bq:verifiedAt'] ?? null,
      })
      .select('id')
      .single()
    if (insErr || !row) {
      return { systemId: bundle.system.id, systemName: bundle.system.name, inserted, skippedExisting, error: insErr?.message ?? 'Insert failed' }
    }
    inserted += 1

    const evidence = a['bq:evidence']?.[0]
    if (evidence) {
      await supabase.from('assertion_evidence').insert({
        assertion_id: row.id,
        source_kind: evidence['bq:sourceKind'] ?? 'document',
        page_start: evidence['bq:pageStart'] ?? null,
        document_chunk_id: evidence['bq:chunkId'] ?? null,
      })
    }
  }

  return { systemId: bundle.system.id, systemName: bundle.system.name, inserted, skippedExisting, error: null }
}

export async function backfillKnowledgeAssertions(
  supabase: SupabaseClient,
  opts: { dryRun: boolean; manufacturerId?: string; systemSlug?: string },
): Promise<BackfillSummary> {
  try {
    let query = supabase
      .from('staged_systems')
      .select('id, slug, manufacturer_id, data_studio_manufacturers(slug)')
      .neq('verification_status', 'archived')
    if (opts.manufacturerId) query = query.eq('manufacturer_id', opts.manufacturerId)
    if (opts.systemSlug) query = query.eq('slug', opts.systemSlug)

    const { data: rows, error } = await query
    if (error) return { ok: false, error: error.message }

    type Row = { id: string; slug: string | null; manufacturer_id: string; data_studio_manufacturers: { slug: string } | { slug: string }[] | null }
    const results: BackfillSystemResult[] = []

    for (const r of (rows ?? []) as unknown as Row[]) {
      if (!r.slug) continue
      const mfr = Array.isArray(r.data_studio_manufacturers) ? r.data_studio_manufacturers[0] : r.data_studio_manufacturers
      if (!mfr) continue
      const bundle = await fetchCanonicalSystemBundle(mfr.slug, r.slug)
      if (!bundle) continue
      results.push(await backfillOneSystem(supabase, r.manufacturer_id, bundle, opts.dryRun))
    }

    return {
      ok: true,
      dryRun: opts.dryRun,
      systems: results,
      totalInserted: results.reduce((sum, r) => sum + r.inserted, 0),
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
