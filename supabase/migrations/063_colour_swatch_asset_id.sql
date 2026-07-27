-- Colour swatches point at an uploaded Asset Library image by ID, same
-- pattern as staged_systems.hero_image_asset_id (see migration 046). The
-- existing image_url column stays as a legacy/manual fallback, but the
-- review UI now only lets manufacturers pick an uploaded asset — never
-- paste a raw URL — so a swatch photo can never be a presigned R2 link
-- that expires ~1 hour after saving.

ALTER TABLE public.staged_system_colours
  ADD COLUMN image_asset_id UUID REFERENCES public.manufacturer_assets(id) ON DELETE SET NULL;
