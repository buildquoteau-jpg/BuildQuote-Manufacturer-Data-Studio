-- Add a dedicated full-width banner image for the manufacturer page, separate
-- from hero_image_url (which drives the showroom grid card). A tall product
-- shot can suit the card but crop poorly in the wide banner, so reps can now
-- supply a different image just for the banner.
--
-- Both columns are optional: when hero_wide_image_url is NULL the banner falls
-- back to hero_image_url (preserving existing behaviour). hero_wide_image_position_y
-- is the CSS background-position-y percentage for the banner image (0 = top,
-- 50 = centre, 100 = bottom).

ALTER TABLE public.data_studio_manufacturers
  ADD COLUMN IF NOT EXISTS hero_wide_image_url TEXT;

ALTER TABLE public.data_studio_manufacturers
  ADD COLUMN IF NOT EXISTS hero_wide_image_position_y SMALLINT NOT NULL DEFAULT 50;

ALTER TABLE public.data_studio_manufacturers
  ADD CONSTRAINT data_studio_manufacturers_hero_wide_image_position_y_range
  CHECK (hero_wide_image_position_y BETWEEN 0 AND 100);
