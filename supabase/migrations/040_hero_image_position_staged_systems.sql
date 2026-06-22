-- Add X/Y crop position controls for system card hero images.
-- Stored as CSS background-position percentages (0=left/top, 50=centre, 100=right/bottom).
-- Defaults to 50/50 (centred), matching existing hard-coded behaviour.

ALTER TABLE public.staged_systems
  ADD COLUMN IF NOT EXISTS hero_image_position_x SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS hero_image_position_y SMALLINT NOT NULL DEFAULT 50;

ALTER TABLE public.staged_systems
  ADD CONSTRAINT staged_systems_hero_image_position_x_range CHECK (hero_image_position_x BETWEEN 0 AND 100),
  ADD CONSTRAINT staged_systems_hero_image_position_y_range CHECK (hero_image_position_y BETWEEN 0 AND 100);
