-- BuildQuote Data Studio — rls_auto_enable() function (reverse drift fixup)
-- Migration: 060_rls_auto_enable_function.sql
--
-- STATUS: STUB — needs Melia to fill in the real function body before this
-- can be applied. Do NOT run this file as-is; it will fail (or worse,
-- silently overwrite the live function with an empty placeholder) until the
-- CREATE OR REPLACE FUNCTION block below is replaced with the real definition.
--
-- WHY THIS EXISTS (2026-07-18 audit, Brief E item 2): a callable RPC named
-- `rls_auto_enable` exists on the LIVE Data Studio project with no
-- corresponding migration file anywhere in this repo — reverse drift, found
-- via the PostgREST OpenAPI spec (GET /rest/v1/ lists it under
-- "(rpc) rls_auto_enable", confirmed 2026-07-19). The repo's migration
-- history is supposed to be the source of truth for the schema (see
-- supabase/README.md); a function that only exists in the dashboard means a
-- fresh environment (a new dev, a disaster-recovery restore from
-- schema_complete.sql + migrations) would silently be missing it.
--
-- What's confirmed about it from the outside (PostgREST introspection only —
-- the function body itself is NOT retrievable via the REST API, only via the
-- SQL editor):
--   * Callable as POST /rest/v1/rpc/rls_auto_enable
--   * Takes no required arguments (empty body schema)
--   * Name strongly implies it bulk-enables Row Level Security across tables
--     (likely `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` looped over
--     information_schema/pg_tables, possibly scoped to public schema tables
--     missing RLS) — but this is inference from the name, not confirmed.
--
-- TODO (Melia): Supabase Dashboard → Database → Functions → find
-- `rls_auto_enable` → copy its exact definition (the "Show definition" /
-- source view gives the full CREATE OR REPLACE FUNCTION statement including
-- language, security definer/invoker, and search_path) → paste it in place
-- of the placeholder body below → delete this comment block once done →
-- commit. Pay particular attention to:
--   * SECURITY DEFINER vs SECURITY INVOKER (get this wrong and the function's
--     privilege level changes on re-apply)
--   * search_path (a mutable search_path on a SECURITY DEFINER function is a
--     real privilege-escalation vector — pin it explicitly if the original
--     does)
--   * the exact return type (void vs a result set)
--
-- After filling this in, regenerate the schema reference and confirm no
-- diff beyond what's expected:
--     node scripts/refresh_schema_reference.mjs
--
-- IDEMPOTENT once filled in (CREATE OR REPLACE): safe to re-run.
-- Do NOT run against the RFQ/BuildQuote production Supabase project.

-- ⚠️ PLACEHOLDER — replace this entire block with the real definition from
-- the dashboard before applying. As written, this intentionally does nothing
-- destructive (RAISEs instead of silently no-op'ing) so an accidental apply
-- fails loudly instead of clobbering the live function with a no-op.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'rls_auto_enable() migration stub not filled in — copy the real definition from the Supabase dashboard (Database > Functions) before applying this migration. See supabase/migrations/060_rls_auto_enable_function.sql.';
END;
$$;
