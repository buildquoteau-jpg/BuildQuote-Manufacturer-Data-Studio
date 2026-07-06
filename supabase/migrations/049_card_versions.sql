-- BuildQuote Data Studio — Migration 049
-- Immutable per-card version history.
--
-- One row per card per package generation: the exact card JSON that shipped
-- in package_version N, plus who validated it and when. This is the record
-- layer behind:
--   * versioned card URLs  /cards/<mfr>/<slug>/v/<n>  (old versions stay
--     viewable with a "Superseded" banner; canonical URL always shows current)
--   * the card footer "Validated by <manufacturer> · <date> · v<n>"
--   * CSV audit-trail + PDF validation-certificate exports
--
-- IMMUTABILITY: rows are insert-only. There are deliberately NO update or
-- delete RLS policies — once a version is written it cannot be changed or
-- removed through the API (deleting the card cascades, which is the only
-- removal path).

CREATE TABLE public.card_versions (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    manufacturer_id UUID        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
    card_id         UUID        NOT NULL REFERENCES public.staged_systems(id) ON DELETE CASCADE,
    package_id      UUID        REFERENCES public.card_packages(id) ON DELETE SET NULL,
    version         INTEGER     NOT NULL,   -- card_packages.package_version at snapshot time
    slug            TEXT        NOT NULL,
    name            TEXT        NOT NULL,
    card_json       JSONB       NOT NULL,   -- SystemCardSystem shape, original asset URLs
    stockists_json  JSONB,                  -- stockists embedded with this version
    validated_by    TEXT,                   -- initials label, e.g. "Verified by MB on 04/07/26"
    validated_at    TIMESTAMPTZ,            -- staged_systems.verified_at at snapshot time
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (card_id, version)
);

CREATE INDEX idx_card_versions_manufacturer_id
  ON public.card_versions (manufacturer_id, created_at DESC);
CREATE INDEX idx_card_versions_card_id
  ON public.card_versions (card_id, version DESC);
CREATE INDEX idx_card_versions_slug
  ON public.card_versions (manufacturer_id, slug, version DESC);

ALTER TABLE public.card_versions ENABLE ROW LEVEL SECURITY;

-- ── manufacturer_user: read + insert own; no update/delete ──────────────────

CREATE POLICY "manufacturer_user can read own card versions"
  ON public.card_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = card_versions.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can create own card versions"
  ON public.card_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = card_versions.manufacturer_id
        AND mu.status = 'active'
    )
  );

-- ── buildquote staff: read + insert; no update/delete ───────────────────────

CREATE POLICY "buildquote staff can read all card versions"
  ON public.card_versions
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can create card versions"
  ON public.card_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));
