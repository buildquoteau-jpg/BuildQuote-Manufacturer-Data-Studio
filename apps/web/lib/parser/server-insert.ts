// BuildQuote Data Studio — Server-side parser insertion adapter skeleton.
//
// SERVER-SIDE ONLY. Never import this from a Client Component.
// This module will hold the service role Supabase client call when insertion is wired.
//
// Current state: skeleton only. insertParserOutputServerSide always returns
// { ok: false, mode: 'disabled' } and performs no database writes.
//
// Future sequence when enabled:
//   1. Require Studio user (session from cookie, validated server-side).
//   2. Require BuildQuote admin or active manufacturer membership.
//   3. Validate ParserOutput via validateParserOutput — must return ok: true.
//   4. Build ParserInsertionPlan via planParserOutputInsertion — must return ok: true.
//   5. Call public.insert_parser_output_plan_v1 via service-role Supabase client.
//   6. Return inserted counts and id_maps from the RPC response.
//
// Blockers before enabling (see docs/parser-insertion-adapter-design.md §12):
//   - GRANT EXECUTE ON FUNCTION public.insert_parser_output_plan_v1(jsonb) TO service_role
//     must be added in a dedicated migration (not yet done — intentional).
//   - Server-only Supabase client using SUPABASE_SERVICE_ROLE_KEY must be created
//     (NEVER NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY).
//   - Studio auth (Supabase Auth + data_studio_user_profiles) must be wired
//     before user/workspace checks can run.
//
// Do not add Supabase client calls, env var reads, or real processing here
// until the above blockers are resolved and approved.

import type { ParserOutput, ParserRunContext } from './types'
import type { ParserInsertionPlan } from './map-to-staged'

// ----------------------------------------------------------
// Result types
// ----------------------------------------------------------

/** Counts returned by the RPC on a successful insert. */
export type InsertedCounts = {
  stagedSystems: number
  stagedSystemProfiles: number
  stagedComponents: number
  stagedSystemColours: number
  stagedSystemComponents: number
  fieldVerifications: number
  parserFieldEvidence: number
}

/** UUID maps returned by the RPC — temp_key → real DB UUID. */
export type InsertedIdMaps = {
  systems: Record<string, string>
  profiles: Record<string, string>
  components: Record<string, string>
  colours: Record<string, string>
  links: Record<string, string>
}

export type InsertionResult =
  | {
      ok: true
      mode: 'inserted'
      insertedCounts: InsertedCounts
      idMaps: InsertedIdMaps
    }
  | {
      ok: false
      mode: 'disabled'
      message: string
    }
  | {
      ok: false
      mode: 'validation_failed'
      message: string
      issues: string[]
    }
  | {
      ok: false
      mode: 'error'
      message: string
    }

// ----------------------------------------------------------
// Main entry point (skeleton — disabled)
// ----------------------------------------------------------

/**
 * Server-side parser insertion adapter.
 *
 * SERVER-SIDE ONLY. Must only be called from a Next.js Route Handler or
 * equivalent server-only module. Never from a Client Component or
 * Server Action that can be triggered from the browser without auth.
 *
 * Current state: always returns { ok: false, mode: 'disabled' }.
 * No database writes, no Supabase calls, no env var reads.
 *
 * When insertion is enabled, this function will:
 *   1. Require Studio user (session validated server-side)
 *   2. Require BuildQuote admin or active manufacturer membership
 *   3. Run validateParserOutput → planParserOutputInsertion
 *   4. Call insert_parser_output_plan_v1 via service-role client
 *   5. Return inserted counts and id_maps
 *
 * @param output     - Validated ParserOutput from the AI extraction pipeline.
 * @param context    - Run context: extraction_run_id, source_document_id, manufacturer_id.
 * @param _plan      - Optional pre-built plan (if already validated by caller). Reserved for future use.
 */
export async function insertParserOutputServerSide(
  _output: ParserOutput,
  _context: ParserRunContext,
  _plan?: ParserInsertionPlan,
): Promise<InsertionResult> {
  // TODO(insertion): Replace this stub with the real implementation once:
  //   - EXECUTE grant is added to service_role (separate migration, requires approval)
  //   - Server-only Supabase client is created (lib/supabase-server.ts)
  //   - Studio auth is wired (Supabase Auth + data_studio_user_profiles)
  // See docs/parser-insertion-adapter-design.md §12.5 for the implementation sequence.
  return {
    ok: false,
    mode: 'disabled',
    message:
      'Parser insertion is not enabled yet. ' +
      'The RPC remains locked until the service_role grant, server-only Supabase client, ' +
      'and Studio auth are in place. See docs/parser-insertion-adapter-design.md §12.',
  }
}
