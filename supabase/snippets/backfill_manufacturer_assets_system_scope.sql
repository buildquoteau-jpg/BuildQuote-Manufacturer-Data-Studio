-- Backfill manufacturer_assets.staged_system_id / asset_role from existing
-- links (task #4, design doc §6.2 / §10.4).
--
-- manufacturer_assets today is a flat, workspace-wide pool with no link to
-- a system — this infers that link from where each asset is ALREADY
-- referenced (hero_image_asset_id, gallery_images[].asset_id,
-- staged_system_colours.image_asset_id, the three manufacturer-level brand
-- slots), so the System Workspace's in-place upload/reuse picker (task #5)
-- can scope "reuse an existing image" to the current system instead of the
-- whole manufacturer's pool.
--
-- IDEMPOTENT: every UPDATE is guarded by
-- `WHERE staged_system_id IS NULL AND asset_role IS NULL`, so it only ever
-- claims an unscoped row once — safe to re-run, and safe to run again after
-- new assets are linked the normal way (new links already carry a role from
-- day one via the updated linking actions, task #5/#6 — this backfill only
-- ever touches rows those actions haven't scoped yet).
--
-- Precedence where one asset is referenced from more than one place (rare —
-- e.g. the same photo reused as both a hero and a colour swatch): hero >
-- gallery > colour_swatch > brand, enforced by running in this order and
-- re-checking the guard before each step.
--
-- Run once in the Supabase SQL editor after migration 065 is applied.

-- ── System hero images ──────────────────────────────────────────────────────
UPDATE public.manufacturer_assets ma
SET staged_system_id = s.id, asset_role = 'hero'
FROM public.staged_systems s
WHERE s.hero_image_asset_id = ma.id
  AND ma.staged_system_id IS NULL
  AND ma.asset_role IS NULL;

-- ── Gallery images (jsonb array [{asset_id, url, ...}]) ─────────────────────
UPDATE public.manufacturer_assets ma
SET staged_system_id = s.id, asset_role = 'gallery'
FROM public.staged_systems s
WHERE s.gallery_images IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(s.gallery_images) elem
    WHERE (elem->>'asset_id') = ma.id::text
  )
  AND ma.staged_system_id IS NULL
  AND ma.asset_role IS NULL;

-- ── Colour swatches ──────────────────────────────────────────────────────────
UPDATE public.manufacturer_assets ma
SET staged_system_id = c.staged_system_id, asset_role = 'colour_swatch'
FROM public.staged_system_colours c
WHERE c.image_asset_id = ma.id
  AND ma.staged_system_id IS NULL
  AND ma.asset_role IS NULL;

-- ── Manufacturer-level brand assets (stay unscoped to any system) ──────────
UPDATE public.manufacturer_assets ma
SET asset_role = 'brand'
FROM public.data_studio_manufacturers m
WHERE ma.id IN (m.logo_asset_id, m.hero_image_asset_id, m.hero_wide_image_asset_id)
  AND ma.staged_system_id IS NULL
  AND ma.asset_role IS NULL;

-- ── Verify ────────────────────────────────────────────────────────────────
--   SELECT asset_role, count(*), count(*) FILTER (WHERE staged_system_id IS NOT NULL) AS scoped
--   FROM public.manufacturer_assets GROUP BY asset_role ORDER BY asset_role;
--   SELECT count(*) FROM public.manufacturer_assets WHERE staged_system_id IS NULL AND asset_role IS NULL; -- unreferenced/orphaned uploads, review manually
