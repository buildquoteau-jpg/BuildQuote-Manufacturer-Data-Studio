-- BuildQuote Data Studio — Read Policies for parser_field_evidence
-- Migration: 016_parser_field_evidence_read_policies.sql
--
-- Migration 008 created parser_field_evidence but did not enable RLS or
-- add read policies. This migration enables RLS and grants anon/authenticated
-- SELECT, matching the pattern established by migration 006 for all other
-- staged extraction tables.
--
-- Required for:
--   - Admin inspection page (/admin/.../documents/.../parser)
--   - CLI verification script (parser:verify-local-insert)
--
-- No INSERT/UPDATE/DELETE policies are added. Read-only.
-- Do not run against the production Supabase project.

ALTER TABLE public.parser_field_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read parser field evidence"
  ON public.parser_field_evidence
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated can read parser field evidence"
  ON public.parser_field_evidence
  FOR SELECT TO authenticated
  USING (true);
