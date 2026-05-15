-- BuildQuote Data Studio — Add uom to staged_system_profiles
-- Migration: 009_add_uom_to_staged_system_profiles.sql
--
-- Resolves SCHEMA_GAP_PROFILE_UOM identified by the dry-run insertion planner.
--
-- staged_system_profiles represents main sellable dimensional variants/options
-- of a system (e.g. a decking board length, a sheet format, a roll product).
-- These are commercially quotable items and need their own sell/request unit,
-- the same way staged_components.uom already exists for component line items.
--
-- uom = sell/request unit used for quoting, e.g. "lm", "ea", "roll", "sheet".
-- This is NOT a pack quantity or manufacturer bundle size.
-- supplier_pack_qty / supplier_pack_uom / supplier_pack_note remain separate.
--
-- Additive only. No columns removed, renamed, or modified.
-- Do not run against the production Supabase project.

ALTER TABLE staged_system_profiles
  ADD COLUMN IF NOT EXISTS uom text;
