-- Add vertical-position control for the manufacturer brand hero image.
-- Stored as a CSS background-position-y percentage (0 = top, 50 = centre, 100 = bottom).
-- Default 50 keeps existing heroes centred, matching prior hard-coded behaviour.

ALTER TABLE public.data_studio_manufacturers
  ADD COLUMN IF NOT EXISTS hero_image_position_y SMALLINT NOT NULL DEFAULT 50;

ALTER TABLE public.data_studio_manufacturers
  ADD CONSTRAINT data_studio_manufacturers_hero_image_position_y_range
  CHECK (hero_image_position_y BETWEEN 0 AND 100);
