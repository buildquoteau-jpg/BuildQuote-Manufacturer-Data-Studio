-- BuildQuote Data Studio — Migration 046
-- Manufacturer asset library (System Card package model).
--
-- Assets are the PUBLIC visual files that ship inside a manufacturer's static
-- System Card website package: logos, hero images, banners, card heroes,
-- profile/product shots, thumbnails, icons. They are distinct from
-- source_documents (private source/reference files: catalogues, data sheets).
--
-- Rule: Studio references assets by ID (asset-id columns below). Clean public
-- file names are generated only at package time by the package generator —
-- the R2 storage_key is an opaque UUID key, never the public name.
--
-- Binary bytes live in Cloudflare R2 (storage_key), same as source_documents.
-- RLS mirrors manufacturer_messages (036): manufacturer users manage their own
-- workspace's assets, BuildQuote staff see everything. No DELETE policy —
-- assets are archived (archived = true), not deleted, so generated packages
-- keep valid references.

CREATE TABLE public.manufacturer_assets (
    id                       UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    manufacturer_id          UUID        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
    asset_type               TEXT        NOT NULL CHECK (asset_type IN (
                                 'logo', 'brand_hero', 'banner', 'card_hero',
                                 'profile', 'product', 'thumbnail', 'icon')),
    title                    TEXT,
    alt_text                 TEXT,
    caption                  TEXT,
    storage_key              TEXT,       -- R2 object key; NULL only while an import is pending
    source_url               TEXT,       -- where the file was imported from (manufacturer site, Wix, etc.)
    public_url               TEXT,       -- R2 public URL if the bucket has one configured
    mime_type                TEXT,
    file_size_bytes          BIGINT,
    width                    INTEGER,
    height                   INTEGER,
    focal_x                  SMALLINT    NOT NULL DEFAULT 50 CHECK (focal_x BETWEEN 0 AND 100),
    focal_y                  SMALLINT    NOT NULL DEFAULT 50 CHECK (focal_y BETWEEN 0 AND 100),
    approved_for_publication BOOLEAN     NOT NULL DEFAULT false,
    archived                 BOOLEAN     NOT NULL DEFAULT false,
    created_by               UUID,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_manufacturer_assets_manufacturer_id
  ON public.manufacturer_assets (manufacturer_id, asset_type, created_at DESC);

ALTER TABLE public.manufacturer_assets ENABLE ROW LEVEL SECURITY;

-- ── manufacturer_user ───────────────────────────────────────────────────────

CREATE POLICY "manufacturer_user can read own assets"
  ON public.manufacturer_assets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_assets.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can create own assets"
  ON public.manufacturer_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_assets.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can update own assets"
  ON public.manufacturer_assets
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_assets.manufacturer_id
        AND mu.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_assets.manufacturer_id
        AND mu.status = 'active'
    )
  );

-- ── buildquote staff ────────────────────────────────────────────────────────

CREATE POLICY "buildquote staff can read all assets"
  ON public.manufacturer_assets
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can create assets"
  ON public.manufacturer_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can update assets"
  ON public.manufacturer_assets
  FOR UPDATE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'))
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

-- ── Asset-id references ─────────────────────────────────────────────────────
-- Studio records point at assets by ID. The existing *_url columns stay and
-- keep working (import source / legacy fallback); nothing that reads them
-- breaks. ON DELETE SET NULL so a hard-deleted asset never strands a record.

ALTER TABLE public.data_studio_manufacturers
  ADD COLUMN logo_asset_id            UUID REFERENCES public.manufacturer_assets(id) ON DELETE SET NULL,
  ADD COLUMN hero_image_asset_id      UUID REFERENCES public.manufacturer_assets(id) ON DELETE SET NULL,
  ADD COLUMN hero_wide_image_asset_id UUID REFERENCES public.manufacturer_assets(id) ON DELETE SET NULL;

ALTER TABLE public.staged_systems
  ADD COLUMN hero_image_asset_id UUID REFERENCES public.manufacturer_assets(id) ON DELETE SET NULL;
