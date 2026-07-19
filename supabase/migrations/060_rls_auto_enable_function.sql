-- BuildQuote Data Studio — rls_auto_enable() event trigger (reverse drift fixup)
-- Migration: 060_rls_auto_enable_function.sql
--
-- WHY THIS EXISTS (2026-07-18 audit, Brief E item 2): a DDL event trigger
-- function named `rls_auto_enable` exists on the LIVE Data Studio project
-- with no corresponding migration file anywhere in this repo — reverse
-- drift, found via the PostgREST OpenAPI spec (GET /rest/v1/ lists it under
-- "(rpc) rls_auto_enable"; it errors if actually invoked that way, since
-- event trigger functions can only run as triggers). The repo's migration
-- history is supposed to be the source of truth for the schema (see
-- supabase/README.md); a function that only exists in the dashboard means a
-- fresh environment (a new dev, a disaster-recovery restore from
-- schema_complete.sql + migrations) would silently be missing it.
--
-- WHAT IT DOES: fires on every CREATE TABLE / CREATE TABLE AS / SELECT INTO
-- in the `public` schema and auto-enables Row Level Security on the new
-- table, logging success/failure per table via RAISE LOG. Confirmed from the
-- function body (pasted by Melia from the dashboard 2026-07-19).
--
-- ⚠️ THREE THINGS NOT CONFIRMED FROM THE PASTED BODY — VERIFY AGAINST THE
-- DASHBOARD BEFORE APPLYING:
--   1. RETURNS event_trigger — required (it calls pg_event_trigger_ddl_commands()),
--      assumed here since the body only made sense as an event trigger fn.
--   2. SECURITY DEFINER + search_path pinned to '' — defaulted here as the
--      safe choice for a function that must ALTER TABLE regardless of who
--      created it. Check the dashboard function header (Database > Functions
--      > rls_auto_enable) for the real SECURITY DEFINER/INVOKER setting and
--      search_path — get this wrong and the function's privilege level
--      changes on re-apply.
--   3. The CREATE EVENT TRIGGER binding below — the function alone does
--      nothing until something fires it. Check whether an event trigger
--      already exists bound to this function (Database > Triggers, or
--      `SELECT evtname FROM pg_event_trigger WHERE evtfoid =
--      'public.rls_auto_enable()'::regprocedure;`) BEFORE applying this —
--      if one already exists, drop the CREATE EVENT TRIGGER block below (the
--      DO block already guards against creating a duplicate, but confirm the
--      WHEN TAG list and event name match the live one).
--
-- After applying, regenerate the schema reference and confirm no diff beyond
-- what's expected:
--     node scripts/refresh_schema_reference.mjs
--
-- IDEMPOTENT (CREATE OR REPLACE + guarded event trigger creation): safe to re-run.
-- Do NOT run against the RFQ/BuildQuote production Supabase project.

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

-- Bind the event trigger only if nothing is already bound to this function —
-- see point 3 above. Remove this DO block if the dashboard check confirms
-- one already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_event_trigger
    WHERE evtfoid = 'public.rls_auto_enable()'::regprocedure
  ) THEN
    CREATE EVENT TRIGGER rls_auto_enable_on_create_table
      ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable();
  END IF;
END;
$$;
