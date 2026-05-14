-- BuildQuote Data Studio — Grant parser insert RPC to service_role
-- Migration: 014_grant_parser_rpc_to_service_role.sql
--
-- Grants EXECUTE on insert_parser_output_plan_v1 to service_role only.
-- Migrations 010 + 011 revoked EXECUTE from PUBLIC, anon, authenticated,
-- and service_role. This migration restores service_role access to enable
-- the local-only CLI script (parser:insert-local) to call the RPC using
-- the Supabase service role key.
--
-- Grant scope: service_role only.
-- anon and authenticated remain revoked — no browser or app code can call this.
-- The function remains SECURITY INVOKER (runs as the calling role's permissions).
--
-- This migration only applies to the local Supabase instance.
-- Do not run against the production Supabase project.

GRANT EXECUTE
  ON FUNCTION public.insert_parser_output_plan_v1(jsonb)
  TO service_role;
