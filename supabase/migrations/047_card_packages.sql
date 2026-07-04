-- BuildQuote Data Studio — Migration 047
-- Card package records (System Card package model).
--
-- A "card package" is one generated static-website ZIP for a manufacturer:
-- the handover product they install on their own site under
-- intended_install_path (default /system-cards/). These tables are the
-- record-keeping layer only — the ZIP itself lives in R2 (zip_storage_key)
-- and the generator lives in apps/web/lib/packages/.
--
-- Status flow (labels come from apps/web/lib/statuses.ts):
--   generating → generated → downloaded        (happy path)
--   generating → failed                        (build error, see error_message)
--   generated  → superseded                    (a newer version was generated)
--
-- RLS mirrors manufacturer_assets (046): manufacturer users see and create
-- their own workspace's packages, BuildQuote staff see everything.

CREATE TABLE public.card_packages (
    id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    manufacturer_id       UUID        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
    package_version       INTEGER     NOT NULL DEFAULT 1,
    status                TEXT        NOT NULL DEFAULT 'generating' CHECK (status IN (
                              'generating', 'generated', 'downloaded', 'failed', 'superseded')),
    intended_install_path TEXT        NOT NULL DEFAULT '/system-cards/',
    zip_storage_key       TEXT,       -- R2 key of the generated ZIP
    zip_url               TEXT,       -- public URL if the bucket exposes one
    manifest_url          TEXT,
    feed_url              TEXT,
    preview_url           TEXT,
    checksum              TEXT,       -- sha256 of the ZIP bytes
    file_size_bytes       BIGINT,
    card_count            INTEGER     NOT NULL DEFAULT 0,
    error_message         TEXT,
    build_log             TEXT,
    generated_at          TIMESTAMPTZ,
    generated_by          UUID,
    downloaded_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_packages_manufacturer_id
  ON public.card_packages (manufacturer_id, created_at DESC);

CREATE TABLE public.card_package_items (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    package_id          UUID        NOT NULL REFERENCES public.card_packages(id) ON DELETE CASCADE,
    card_id             UUID        NOT NULL REFERENCES public.staged_systems(id) ON DELETE CASCADE,
    package_slug        TEXT        NOT NULL,  -- slug used for /cards/<slug>/ in this package
    generated_card_path TEXT,                  -- e.g. cards/card-slug/index.html
    generated_json_path TEXT,                  -- e.g. cards/card-slug/card.json
    qr_code_path        TEXT,                  -- e.g. cards/card-slug/qr-code.png
    status              TEXT        NOT NULL DEFAULT 'included' CHECK (status IN (
                            'included', 'skipped', 'failed')),
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_package_items_package_id
  ON public.card_package_items (package_id);
CREATE INDEX idx_card_package_items_card_id
  ON public.card_package_items (card_id);

ALTER TABLE public.card_packages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_package_items ENABLE ROW LEVEL SECURITY;

-- ── card_packages: manufacturer_user ────────────────────────────────────────

CREATE POLICY "manufacturer_user can read own packages"
  ON public.card_packages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = card_packages.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can create own packages"
  ON public.card_packages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = card_packages.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can update own packages"
  ON public.card_packages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = card_packages.manufacturer_id
        AND mu.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = card_packages.manufacturer_id
        AND mu.status = 'active'
    )
  );

-- ── card_packages: buildquote staff ─────────────────────────────────────────

CREATE POLICY "buildquote staff can read all packages"
  ON public.card_packages
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can create packages"
  ON public.card_packages
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can update packages"
  ON public.card_packages
  FOR UPDATE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'))
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

-- ── card_package_items: access follows the parent package ───────────────────

CREATE POLICY "manufacturer_user can read own package items"
  ON public.card_package_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.card_packages cp
      JOIN public.manufacturer_users mu ON mu.manufacturer_id = cp.manufacturer_id
      WHERE cp.id = card_package_items.package_id
        AND mu.auth_user_id = auth.uid()
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can create own package items"
  ON public.card_package_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.card_packages cp
      JOIN public.manufacturer_users mu ON mu.manufacturer_id = cp.manufacturer_id
      WHERE cp.id = card_package_items.package_id
        AND mu.auth_user_id = auth.uid()
        AND mu.status = 'active'
    )
  );

CREATE POLICY "buildquote staff can read all package items"
  ON public.card_package_items
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can create package items"
  ON public.card_package_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));
