-- BuildQuote Data Studio — Add image URL columns to staged tables
-- Migration: 018_add_image_urls_to_staged_tables.sql
--
-- Adds nullable image URL columns to the three staged entity tables:
--   staged_systems.hero_image_url       — one hero image per system
--   staged_system_colours.image_url     — one swatch/lifestyle image per colour
--   staged_components.image_url         — one product image per component
--
-- These columns are filled by a post-parse image extraction or upload step,
-- not by the AI parser. The parser outputs image_candidates (source page
-- references) so a human or image pipeline knows where to look.
--
-- Additive only. No columns removed or modified. Safe to run against local.
-- Do not run against production Supabase.

ALTER TABLE staged_systems
  ADD COLUMN IF NOT EXISTS hero_image_url text;

ALTER TABLE staged_system_colours
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE staged_components
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN staged_systems.hero_image_url IS
  'Hero/primary image URL for this system. Populated post-parse by image extraction or manual upload — not set by the AI parser.';

COMMENT ON COLUMN staged_system_colours.image_url IS
  'Colour swatch or lifestyle image URL. Populated post-parse — not set by the AI parser.';

COMMENT ON COLUMN staged_components.image_url IS
  'Product image URL for this component. Populated post-parse — not set by the AI parser.';
