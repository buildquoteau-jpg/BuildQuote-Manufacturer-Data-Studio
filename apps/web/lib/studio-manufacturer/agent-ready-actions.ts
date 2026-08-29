'use server'

// Agent Ready sign-off (migration 068) — a distinct verification from
// markSystemVerified: that one confirms the human-facing System Card
// fields, this one confirms the machine-readable knowledge object itself
// (the actual JSON-LD blob and its markdown rendering, viewed on the
// Agent Ready tab) is accurate for an AI agent to read and cite.

import { createStudioServerClient } from '@/lib/supabase/server'
import { assertManufacturerAccess } from './verification-actions'

export type ActionResult = { ok: true } | { ok: false; error: string }

function isMissingSchemaError(message: string | undefined): boolean {
  return /agent_ready|does not exist|42P01|42703/i.test(message ?? '')
}

export async function markAgentReadySignedOff(
  systemId: string,
  manufacturerId: string,
  notes: string | null,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('staged_systems')
    .update({
      agent_ready_verified_by: auth.userId,
      agent_ready_verified_at: now,
      agent_ready_notes: notes?.trim() || null,
      updated_at: now,
    })
    .eq('id', systemId)

  if (error) {
    if (isMissingSchemaError(error.message)) {
      return { ok: false, error: 'Agent Ready sign-off needs migration 068 applied to this project first.' }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function clearAgentReadySignOff(
  systemId: string,
  manufacturerId: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_systems')
    .update({ agent_ready_verified_by: null, agent_ready_verified_at: null, updated_at: new Date().toISOString() })
    .eq('id', systemId)

  if (error) {
    if (isMissingSchemaError(error.message)) return { ok: true } // nothing to clear pre-068
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
