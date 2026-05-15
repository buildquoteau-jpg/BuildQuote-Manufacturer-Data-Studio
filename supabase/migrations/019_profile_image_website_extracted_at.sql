-- BuildQuote Data Studio — Profile image, website URLs, extracted_at
-- Migration: 019_profile_image_website_extracted_at.sql
--
-- Closes three schema gaps identified in audit:
--
--   1. staged_system_profiles.image_url
--      Profile-level product image URL (e.g. a photo of the specific board
--      variant). Distinct from staged_systems.hero_image_url which is the
--      hero image for the whole system. Populated post-parse by the image
--      pipeline — not set by the AI parser.
--
--   2. website_url on staged_system_profiles and staged_components
--      Direct URL to the product page on the manufacturer's website for
--      this specific profile or component. Allows reviewers and builders
--      to cross-reference the source site. Populated manually or by the
--      image/enrichment pipeline — not set by the AI parser.
--      (staged_systems.website_url already exists from migration 001.)
--
--   3. extracted_at on all five staged tables
--      Timestamp of when the AI parser extracted this record. Distinct
--      from created_at (DB row insert time) and from
--      extraction_runs.completed_at (pipeline run timestamp).
--      Set by the insertion layer at the moment parser output is written
--      to the staged table. Allows reviewers to see how fresh the
--      extraction is and whether a re-parse has occurred.
--
-- Additive only. No columns removed, renamed, or modified.
-- Safe to run against local Supabase. Do not run against production.

-- ============================================================
-- 1. staged_system_profiles — image_url, website_url, extracted_at
-- ============================================================

ALTER TABLE staged_system_profiles
  ADD COLUMN IF NOT EXISTS image_url    text,
  ADD COLUMN IF NOT EXISTS website_url  text,
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

COMMENT ON COLUMN staged_system_profiles.image_url IS
  'Product image URL for this profile variant. Populated post-parse by the image pipeline — not set by the AI parser.';

COMMENT ON COLUMN staged_system_profiles.website_url IS
  'Direct URL to the manufacturer product page for this specific profile. Populated manually or by enrichment pipeline.';

COMMENT ON COLUMN staged_system_profiles.extracted_at IS
  'Timestamp when the AI parser extracted this record. Set by the insertion layer. Distinct from created_at (DB insert time).';

-- ============================================================
-- 2. staged_components — website_url, extracted_at
--    (image_url already exists from migration 018)
-- ============================================================

ALTER TABLE staged_components
  ADD COLUMN IF NOT EXISTS website_url  text,
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

COMMENT ON COLUMN staged_components.website_url IS
  'Direct URL to the manufacturer product page for this component. Populated manually or by enrichment pipeline.';

COMMENT ON COLUMN staged_components.extracted_at IS
  'Timestamp when the AI parser extracted this record. Set by the insertion layer. Distinct from created_at (DB insert time).';

-- ============================================================
-- 3. staged_systems — extracted_at
--    (hero_image_url and website_url already exist from migration 001)
-- ============================================================

ALTER TABLE staged_systems
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

COMMENT ON COLUMN staged_systems.extracted_at IS
  'Timestamp when the AI parser extracted this record. Set by the insertion layer. Distinct from created_at (DB insert time).';

-- ============================================================
-- 4. staged_system_colours — extracted_at
--    (image_url already exists from migration 001)
-- ============================================================

ALTER TABLE staged_system_colours
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

COMMENT ON COLUMN staged_system_colours.extracted_at IS
  'Timestamp when the AI parser extracted this record. Set by the insertion layer. Distinct from created_at (DB insert time).';

-- ============================================================
-- 5. staged_system_components — extracted_at
-- ============================================================

ALTER TABLE staged_system_components
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

COMMENT ON COLUMN staged_system_components.extracted_at IS
  'Timestamp when the AI parser extracted this record. Set by the insertion layer. Distinct from created_at (DB insert time).';
