'use server'

// Relationships panel actions (design doc §7.3/§10.3) — compatible_with /
// incompatible_with / supersedes / superseded_by / substitute_for /
// requires_system against system_relationships. The one thing manufacturers
// actively author for the AI layer directly (A-class per §4 — only the
// manufacturer can know this). Same auth gate and graceful-degradation
// convention as assertion-actions.ts.

import { createStudioServerClient } from '@/lib/supabase/server'
import { assertManufacturerAccess } from './verification-actions'

export type RelationTarget =
  | { kind: 'internal'; stagedSystemId: string }
  | { kind: 'external'; name: string; manufacturer?: string; url?: string }
  | { kind: 'generic_class'; name: string }

export type SystemRelationship = {
  id: string
  relation: 'compatible_with' | 'incompatible_with' | 'supersedes' | 'superseded_by' | 'substitute_for' | 'requires_system'
  targetStagedSystemId: string | null
  targetExternal: { name: string; manufacturer?: string; url?: string; kind?: string } | null
  note: string | null
  reason: string | null
}

export type RelationshipActionResult = { ok: true; id: string } | { ok: false; error: string }
export type RelationshipListResult = { ok: true; relationships: SystemRelationship[] } | { ok: false; error: string }

function isMissingSchemaError(message: string | undefined): boolean {
  return /system_relationships|does not exist|42P01|42703/i.test(message ?? '')
}

export async function getSystemRelationships(
  systemId: string,
  manufacturerId: string,
): Promise<RelationshipListResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data, error } = await supabase
    .from('system_relationships')
    .select('id, relation, target_staged_system_id, target_external, note, reason')
    .eq('staged_system_id', systemId)
    .order('sort_order')

  if (error) {
    if (isMissingSchemaError(error.message)) return { ok: true, relationships: [] } // pre-065 — empty, not an error
    return { ok: false, error: error.message }
  }

  return {
    ok: true,
    relationships: (data ?? []).map((r: any) => ({
      id: r.id,
      relation: r.relation,
      targetStagedSystemId: r.target_staged_system_id,
      targetExternal: r.target_external,
      note: r.note,
      reason: r.reason,
    })),
  }
}

export async function addSystemRelationship(
  systemId: string,
  manufacturerId: string,
  relation: SystemRelationship['relation'],
  target: RelationTarget,
  note: string | null,
  reason: string | null,
): Promise<RelationshipActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data, error } = await supabase
    .from('system_relationships')
    .insert({
      manufacturer_id: manufacturerId,
      staged_system_id: systemId,
      relation,
      target_staged_system_id: target.kind === 'internal' ? target.stagedSystemId : null,
      target_external: target.kind !== 'internal'
        ? { name: target.name, manufacturer: 'manufacturer' in target ? target.manufacturer : undefined, url: 'url' in target ? target.url : undefined, kind: target.kind }
        : null,
      note,
      reason,
      epistemic_status: 'manufacturer_supplied',
      verified_by: auth.userId,
      verified_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) {
    if (isMissingSchemaError(error?.message)) {
      return { ok: false, error: 'Relationships need migration 065 applied to this project first.' }
    }
    return { ok: false, error: error?.message ?? 'Could not save the relationship.' }
  }
  return { ok: true, id: data.id }
}

export async function removeSystemRelationship(
  relationshipId: string,
  manufacturerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase.from('system_relationships').delete().eq('id', relationshipId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
