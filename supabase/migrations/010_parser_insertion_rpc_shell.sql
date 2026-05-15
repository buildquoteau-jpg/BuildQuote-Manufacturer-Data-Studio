-- BuildQuote Data Studio — Parser Insertion RPC Shell
-- Migration: 010_parser_insertion_rpc_shell.sql
--
-- Creates the shell/signature for the parser output insertion RPC function.
-- Full insert logic will be wired in a later migration once the insert
-- sequence has been validated against local fixtures with rollback testing.
--
-- Approved design decisions (docs/parser-insertion-adapter-design.md §10):
--   §10.1  Transaction strategy: Postgres RPC for atomic multi-table insert
--   §10.2  Write surface: server-side route/action only
--   §10.3  RLS/auth: future security chunk — no policies added here
--   §10.4  Re-run strategy V1: append-only per extraction run
--   §10.5  Link failure: unresolved FK links abort the whole transaction
--
-- Grant note:
--   Postgres grants EXECUTE to PUBLIC by default on CREATE FUNCTION.
--   That default is explicitly revoked here — this shell has no insert
--   logic yet and should not be callable by any app role.
--   The real implementation chunk will add a deliberate GRANT after
--   the RLS/auth design is complete (docs/parser-insertion-adapter-design.md §10.3).
--
-- Do not run against the production Supabase project.

-- ============================================================
-- insert_parser_output_plan_v1(plan jsonb)
--
-- Entry point for the parser insertion adapter.
-- Called from a server-side route/action — never from browser code.
--
-- Argument:
--   plan  — JSON-serialised ParserInsertionPlan produced by the
--           TypeScript planner (apps/web/lib/parser/map-to-staged.ts).
--           Must have ok=true before being passed here; the caller
--           is responsible for running validateParserOutput and
--           planParserOutputInsertion first.
--
-- Returns jsonb:
--   ok              — true if shell validation passed
--   mode            — "dry_rpc_shell" until insert logic is wired
--   message         — human-readable status
--   received_counts — array lengths from the plan, for sanity checking
--   missing_keys    — (only on validation failure) which keys were absent
--
-- Future implementation will add (in one transaction):
--   1. Insert staged_systems            → capture UUIDs
--   2. Insert staged_system_profiles    → FK: staged_system_id
--   3. Insert staged_components         → capture UUIDs
--   4. Insert staged_system_colours     → FK: staged_system_id
--   5. Insert staged_system_components  → FK: staged_system_id + staged_component_id
--   6. Insert field_verifications       → FK: entity_id (resolved from UUID map)
--   7. Insert parser_field_evidence     → FK: extraction_run_id
-- ============================================================

CREATE OR REPLACE FUNCTION public.insert_parser_output_plan_v1(
  plan jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_missing_keys            text[]  := '{}';
  v_staged_systems_count    int;
  v_staged_profiles_count   int;
  v_staged_components_count int;
  v_staged_colours_count    int;
  v_staged_links_count      int;
  v_field_verifs_count      int;
  v_field_evidence_count    int;
  v_media_candidates_count  int;
BEGIN

  -- ----------------------------------------------------------------
  -- 1. Null guard
  -- ----------------------------------------------------------------
  IF plan IS NULL THEN
    RETURN jsonb_build_object(
      'ok',             false,
      'mode',           'dry_rpc_shell',
      'message',        'plan argument is null',
      'received_counts', NULL
    );
  END IF;

  -- ----------------------------------------------------------------
  -- 2. Top-level key presence check
  --
  --    Mirrors the ParserInsertionPlan TypeScript type from
  --    apps/web/lib/parser/map-to-staged.ts.
  --    Keys must be present (empty arrays are valid; null is not).
  -- ----------------------------------------------------------------
  -- array_append used (not ||) to avoid PL/pgSQL resolving the literal as text[] instead of text
  IF NOT (plan ? 'stagedSystems')           THEN v_missing_keys := array_append(v_missing_keys, 'stagedSystems');           END IF;
  IF NOT (plan ? 'stagedSystemProfiles')    THEN v_missing_keys := array_append(v_missing_keys, 'stagedSystemProfiles');    END IF;
  IF NOT (plan ? 'stagedComponents')        THEN v_missing_keys := array_append(v_missing_keys, 'stagedComponents');        END IF;
  IF NOT (plan ? 'stagedSystemColours')     THEN v_missing_keys := array_append(v_missing_keys, 'stagedSystemColours');     END IF;
  IF NOT (plan ? 'stagedSystemComponents')  THEN v_missing_keys := array_append(v_missing_keys, 'stagedSystemComponents');  END IF;
  IF NOT (plan ? 'fieldVerifications')      THEN v_missing_keys := array_append(v_missing_keys, 'fieldVerifications');      END IF;
  IF NOT (plan ? 'parserFieldEvidence')     THEN v_missing_keys := array_append(v_missing_keys, 'parserFieldEvidence');     END IF;

  IF array_length(v_missing_keys, 1) IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',             false,
      'mode',           'dry_rpc_shell',
      'message',        'plan is missing required top-level keys',
      'missing_keys',   to_jsonb(v_missing_keys),
      'received_counts', NULL
    );
  END IF;

  -- ----------------------------------------------------------------
  -- 3. Count received arrays for the shell response
  --
  --    jsonb_array_length returns NULL for non-array values.
  --    COALESCE to 0 so the response is always numeric.
  --    The real implementation will validate array element shapes.
  -- ----------------------------------------------------------------
  v_staged_systems_count    := COALESCE(jsonb_array_length(plan -> 'stagedSystems'),          0);
  v_staged_profiles_count   := COALESCE(jsonb_array_length(plan -> 'stagedSystemProfiles'),   0);
  v_staged_components_count := COALESCE(jsonb_array_length(plan -> 'stagedComponents'),       0);
  v_staged_colours_count    := COALESCE(jsonb_array_length(plan -> 'stagedSystemColours'),    0);
  v_staged_links_count      := COALESCE(jsonb_array_length(plan -> 'stagedSystemComponents'), 0);
  v_field_verifs_count      := COALESCE(jsonb_array_length(plan -> 'fieldVerifications'),     0);
  v_field_evidence_count    := COALESCE(jsonb_array_length(plan -> 'parserFieldEvidence'),    0);
  v_media_candidates_count  := COALESCE(jsonb_array_length(plan -> 'mediaCandidates'),        0);

  -- ----------------------------------------------------------------
  -- 4. Shell response — no DB writes
  --
  --    Returns ok=true to confirm the shell is reachable and the
  --    plan passed basic structural validation.
  --    mode='dry_rpc_shell' signals to any caller that this is not
  --    yet the real insertion — no staged rows have been written.
  -- ----------------------------------------------------------------
  RETURN jsonb_build_object(
    'ok',      true,
    'mode',    'dry_rpc_shell',
    'message', 'RPC shell OK — plan structure valid; insert logic not yet wired; no rows written',
    'received_counts', jsonb_build_object(
      'stagedSystems',          v_staged_systems_count,
      'stagedSystemProfiles',   v_staged_profiles_count,
      'stagedComponents',       v_staged_components_count,
      'stagedSystemColours',    v_staged_colours_count,
      'stagedSystemComponents', v_staged_links_count,
      'fieldVerifications',     v_field_verifs_count,
      'parserFieldEvidence',    v_field_evidence_count,
      'mediaCandidates',        v_media_candidates_count
    )
  );

END;
$$;

-- ============================================================
-- Grant management
--
-- Revoke the Postgres default PUBLIC EXECUTE grant.
-- No app role can call this function until the real insert logic
-- is wired and a deliberate grant is added alongside the
-- RLS/auth design (docs/parser-insertion-adapter-design.md §10.3).
-- ============================================================

REVOKE EXECUTE
  ON FUNCTION public.insert_parser_output_plan_v1(jsonb)
  FROM PUBLIC;
