-- Migration 062: free-text description on system profiles/variants.
--
-- Components already carry name/sku/description/uom, but profiles only had
-- name/product_code/dimensions/uom — no description column at all. The
-- review grid's profile table faked one by gluing raw `dimensions` text onto
-- a reformatted length/width/thickness string, which doubled up the same
-- numbers on screen. This gives profiles a real description field so that
-- fake concatenation can go away.
--
-- Mirror of staged_components.description. The matching production
-- `system_profiles` column is added separately in the production project.

ALTER TABLE public.staged_system_profiles
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.staged_system_profiles.description IS
  'Free-text description of this profile/variant, shown alongside its formatted dimensions on the review grid and public system card.';
