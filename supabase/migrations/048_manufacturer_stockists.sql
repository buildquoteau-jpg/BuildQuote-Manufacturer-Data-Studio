-- BuildQuote Data Studio — Migration 048
-- Manufacturer stockists for travelling System Cards.
--
-- A stockist is a merchant the manufacturer lists on their System Cards
-- ("Local stockists" section). Managed in the manufacturer workspace
-- (/manufacturer/stockists). By default a stockist appears on ALL of the
-- manufacturer's cards (all_cards = true); per-card overrides live in
-- manufacturer_stockist_cards (only consulted when all_cards = false).
--
-- Confirmation: each stockist carries a confirm_token. The manufacturer can
-- email their stockist a no-login link (/stockist-confirm/<token>); one click
-- sets confirm_status = 'confirmed' + confirmed_at. Same tokenised pattern as
-- the embed widgets (033).
--
-- Cards read stockists two ways:
--   * hosted/preview: direct query at render time
--   * static package: embedded at build time + refreshed client-side from
--     /api/cards/<slug>/stockists.json (service-role read, so no public RLS)
--
-- RLS mirrors manufacturer_assets (046): manufacturer users manage their own
-- workspace's stockists, BuildQuote staff see everything.

CREATE TABLE public.manufacturer_stockists (
    id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    manufacturer_id  UUID        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
    business_name    TEXT        NOT NULL,
    suburb           TEXT,
    state            TEXT,       -- 'WA' | 'NSW' | 'VIC' | 'QLD' | 'SA' | 'TAS' | 'NT' | 'ACT'
    phone            TEXT,
    website_url      TEXT,
    trade_desk_email TEXT,
    all_cards        BOOLEAN     NOT NULL DEFAULT true,
    confirm_token    UUID        NOT NULL DEFAULT gen_random_uuid(),
    confirm_status   TEXT        NOT NULL DEFAULT 'unconfirmed' CHECK (confirm_status IN ('unconfirmed', 'confirmed')),
    confirmed_at     TIMESTAMPTZ,
    archived         BOOLEAN     NOT NULL DEFAULT false,
    sort_order       INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_manufacturer_stockists_manufacturer_id
  ON public.manufacturer_stockists (manufacturer_id, archived, state, business_name);
CREATE UNIQUE INDEX idx_manufacturer_stockists_confirm_token
  ON public.manufacturer_stockists (confirm_token);

-- Per-card override links (only used when all_cards = false)
CREATE TABLE public.manufacturer_stockist_cards (
    id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    stockist_id  UUID        NOT NULL REFERENCES public.manufacturer_stockists(id) ON DELETE CASCADE,
    card_id      UUID        NOT NULL REFERENCES public.staged_systems(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (stockist_id, card_id)
);

CREATE INDEX idx_manufacturer_stockist_cards_card_id
  ON public.manufacturer_stockist_cards (card_id);

ALTER TABLE public.manufacturer_stockists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_stockist_cards ENABLE ROW LEVEL SECURITY;

-- ── manufacturer_stockists: manufacturer_user ───────────────────────────────

CREATE POLICY "manufacturer_user can read own stockists"
  ON public.manufacturer_stockists
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_stockists.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can create own stockists"
  ON public.manufacturer_stockists
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_stockists.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can update own stockists"
  ON public.manufacturer_stockists
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_stockists.manufacturer_id
        AND mu.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_stockists.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can delete own stockists"
  ON public.manufacturer_stockists
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_stockists.manufacturer_id
        AND mu.status = 'active'
    )
  );

-- ── manufacturer_stockists: buildquote staff ────────────────────────────────

CREATE POLICY "buildquote staff can read all stockists"
  ON public.manufacturer_stockists
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can create stockists"
  ON public.manufacturer_stockists
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can update stockists"
  ON public.manufacturer_stockists
  FOR UPDATE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'))
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can delete stockists"
  ON public.manufacturer_stockists
  FOR DELETE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

-- ── manufacturer_stockist_cards: access follows the parent stockist ─────────

CREATE POLICY "manufacturer_user can read own stockist cards"
  ON public.manufacturer_stockist_cards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.manufacturer_stockists ms
      JOIN public.manufacturer_users mu ON mu.manufacturer_id = ms.manufacturer_id
      WHERE ms.id = manufacturer_stockist_cards.stockist_id
        AND mu.auth_user_id = auth.uid()
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can create own stockist cards"
  ON public.manufacturer_stockist_cards
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.manufacturer_stockists ms
      JOIN public.manufacturer_users mu ON mu.manufacturer_id = ms.manufacturer_id
      WHERE ms.id = manufacturer_stockist_cards.stockist_id
        AND mu.auth_user_id = auth.uid()
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can delete own stockist cards"
  ON public.manufacturer_stockist_cards
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.manufacturer_stockists ms
      JOIN public.manufacturer_users mu ON mu.manufacturer_id = ms.manufacturer_id
      WHERE ms.id = manufacturer_stockist_cards.stockist_id
        AND mu.auth_user_id = auth.uid()
        AND mu.status = 'active'
    )
  );

CREATE POLICY "buildquote staff can read all stockist cards"
  ON public.manufacturer_stockist_cards
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can create stockist cards"
  ON public.manufacturer_stockist_cards
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can delete stockist cards"
  ON public.manufacturer_stockist_cards
  FOR DELETE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));
