-- BuildQuote Data Studio — Migration 054
-- Hero image zoom for card image positioning.
--
-- Companion to hero_image_position_x/y (migration 040): manufacturers can
-- zoom into the hero image (1.0 = fit, up to 3.0 = 300%) around their chosen
-- focal point. Rendered as transform: scale(zoom) with transform-origin at
-- the crop position, so zoom + position combine naturally.

ALTER TABLE public.staged_systems
  ADD COLUMN IF NOT EXISTS hero_image_zoom NUMERIC NOT NULL DEFAULT 1;

ALTER TABLE public.staged_systems
  DROP CONSTRAINT IF EXISTS staged_systems_hero_image_zoom_check;
ALTER TABLE public.staged_systems
  ADD CONSTRAINT staged_systems_hero_image_zoom_check
  CHECK (hero_image_zoom >= 1 AND hero_image_zoom <= 3);
