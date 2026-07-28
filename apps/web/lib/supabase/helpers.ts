// Shared Supabase plumbing for server-side reads/writes.
//
// Both helpers encode house patterns that were previously copy-pasted into
// every studio-admin / studio-manufacturer module:
//   * makeStudioClient    — construct the session client, degrade to a result
//                           envelope instead of throwing when env vars are missing
//   * isMissingSchemaError — treat "relation/column does not exist" as a
//                           soft failure so pages still render before a
//                           migration has been applied

import { createStudioServerClient } from '@/lib/supabase/server'

export type StudioClientResult =
  | { ok: true; supabase: ReturnType<typeof createStudioServerClient> }
  | { ok: false; error: string }

export function makeStudioClient(): StudioClientResult {
  try {
    return { ok: true as const, supabase: createStudioServerClient() }
  } catch {
    return { ok: false as const, error: 'Supabase client not configured — check env vars.' }
  }
}

export function isMissingSchemaError(
  err: { code?: string; message?: string } | null,
): boolean {
  if (!err) return false
  if (err.code === '42P01' || err.code === '42703') return true
  return /does not exist/i.test(err.message ?? '')
}

/**
 * Turns a raw Postgres "does not exist" message into a feature-specific hint
 * ("… migration 048 has not been applied"). Anything else passes through.
 */
export function friendlyDbError(message: string, missingSchemaMessage: string): string {
  if (/does not exist/i.test(message)) return missingSchemaMessage
  return message
}
