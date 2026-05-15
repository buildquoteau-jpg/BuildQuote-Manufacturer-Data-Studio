-- BuildQuote Data Studio — Staged Schema Alignment
-- Migration: 007_staged_schema_alignment.sql
--
-- Aligns staged_system_profiles, staged_components, and staged_systems
-- with the corrected production catalogue target schema (system_profiles,
-- components, systems as documented in:
--   supabase/snippets/Supabase Snippet Public Tables Column Metadata.csv)
--
-- Additive only — no columns removed or renamed.
-- Existing rows and foreign key relationships are unaffected.
--
-- Do not run against the production Supabase project.

-- ============================================================
-- 1. staged_system_profiles
--
-- The original table had only: id, staged_system_id, name,
-- product_code, dimensions, length_m, sheet_format, sort_order,
-- verification_status, reviewer_notes, created_at.
--
-- Production system_profiles carries full dimensional data,
-- supplier pack fields, a separate profile_name label, and
-- the BAL (Bushfire Attack Level) compliance field.
-- All are added here so the AI parser can store and the
-- reviewer UI can display them before export.
-- ============================================================

ALTER TABLE staged_system_profiles
  ADD COLUMN IF NOT EXISTS profile_name       text,
  ADD COLUMN IF NOT EXISTS length_mm          numeric,
  ADD COLUMN IF NOT EXISTS width_mm           numeric,
  ADD COLUMN IF NOT EXISTS height_mm          numeric,
  ADD COLUMN IF NOT EXISTS thickness_mm       numeric,
  ADD COLUMN IF NOT EXISTS depth_mm           numeric,
  ADD COLUMN IF NOT EXISTS gauge_mm           numeric,
  ADD COLUMN IF NOT EXISTS diameter_mm        numeric,
  ADD COLUMN IF NOT EXISTS roll_m             numeric,
  ADD COLUMN IF NOT EXISTS weight_kg          numeric,
  ADD COLUMN IF NOT EXISTS pieces             numeric,
  ADD COLUMN IF NOT EXISTS volume_ml          numeric,
  ADD COLUMN IF NOT EXISTS weight_g           numeric,
  ADD COLUMN IF NOT EXISTS pack_format        text,
  ADD COLUMN IF NOT EXISTS supplier_pack_qty  numeric,
  ADD COLUMN IF NOT EXISTS supplier_pack_uom  text,
  ADD COLUMN IF NOT EXISTS supplier_pack_note text,
  ADD COLUMN IF NOT EXISTS bal_rating         text;

-- ============================================================
-- 2. staged_components
--
-- Production components carries supplier pack fields and two
-- additional weight/volume fields (volume_ml, weight_g) that
-- were absent from the original staged table.
-- ============================================================

ALTER TABLE staged_components
  ADD COLUMN IF NOT EXISTS volume_ml          numeric,
  ADD COLUMN IF NOT EXISTS weight_g           numeric,
  ADD COLUMN IF NOT EXISTS pack_format        text,
  ADD COLUMN IF NOT EXISTS supplier_pack_qty  numeric,
  ADD COLUMN IF NOT EXISTS supplier_pack_uom  text,
  ADD COLUMN IF NOT EXISTS supplier_pack_note text;

-- ============================================================
-- 3. staged_systems
--
-- Production systems.notes is a product-facing freetext field
-- (e.g. "Suitable for bushfire zones BAL-29 and below").
-- It is distinct from reviewer_notes, which is an internal
-- annotation written by the Data Studio reviewer.
-- ============================================================

ALTER TABLE staged_systems
  ADD COLUMN IF NOT EXISTS notes text;
