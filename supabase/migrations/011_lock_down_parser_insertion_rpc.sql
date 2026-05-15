-- BuildQuote Data Studio — Lock down parser insertion RPC
-- Migration: 011_lock_down_parser_insertion_rpc.sql
--
-- Corrects incomplete grant revocation from migration 010.
--
-- When a function is created in the public schema, Supabase automatically
-- issues explicit EXECUTE grants to anon, authenticated, and service_role.
-- These are named-role grants, independent of the PUBLIC pseudo-role.
-- Migration 010's REVOKE FROM PUBLIC only removed the PUBLIC entry; the
-- three Supabase-managed grants remained, which is why the anon/publishable
-- client could still execute the function.
--
-- This migration revokes EXECUTE from all three Supabase app roles.
-- No app role can call this function until the real insert logic is wired
-- and a deliberate GRANT is added alongside the RLS/auth design
-- (docs/parser-insertion-adapter-design.md §10.3).
--
-- Do not run against the production Supabase project.

REVOKE EXECUTE
  ON FUNCTION public.insert_parser_output_plan_v1(jsonb)
  FROM anon;

REVOKE EXECUTE
  ON FUNCTION public.insert_parser_output_plan_v1(jsonb)
  FROM authenticated;

REVOKE EXECUTE
  ON FUNCTION public.insert_parser_output_plan_v1(jsonb)
  FROM service_role;
