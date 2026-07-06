-- BuildQuote Data Studio — Migration 050
-- Share tracking + lightweight card analytics.
--
-- card_share_links: tokenised share URLs (/s/<token> → canonical card URL).
--   Created from the workspace (optionally with a sender tag, e.g. a rep
--   name) or from a card's share buttons (via the public /api/share route,
--   service role). Channel: copy | sms | email.
--
-- card_events: append-only event log. No cookies, no personal data —
--   device_hash is a one-way hash of IP + user agent computed server-side,
--   giving "unique-ish devices" without storing either. Event types:
--     view       — beacon ping from a hosted or static card page
--     share_open — someone followed a /s/<token> link
--     doc_click  — source-document / install-guide click-through redirect
--
-- Public endpoints write via the service role (bypasses RLS); RLS below only
-- grants reads to the owning manufacturer + BuildQuote staff, and share-link
-- creation to workspace users. card_events has NO insert/update/delete
-- policies on purpose (append-only via service role).

CREATE TABLE public.card_share_links (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    manufacturer_id UUID        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
    card_id         UUID        REFERENCES public.staged_systems(id) ON DELETE SET NULL,
    card_slug       TEXT        NOT NULL,
    token           TEXT        NOT NULL,
    channel         TEXT        NOT NULL DEFAULT 'copy' CHECK (channel IN ('copy', 'sms', 'email')),
    sender_tag      TEXT,       -- optional, e.g. rep name
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_card_share_links_token ON public.card_share_links (token);
CREATE INDEX idx_card_share_links_manufacturer ON public.card_share_links (manufacturer_id, created_at DESC);

CREATE TABLE public.card_events (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    manufacturer_id UUID        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
    card_id         UUID        REFERENCES public.staged_systems(id) ON DELETE SET NULL,
    card_slug       TEXT        NOT NULL,
    version         INTEGER,
    event_type      TEXT        NOT NULL CHECK (event_type IN ('view', 'share_open', 'doc_click')),
    channel         TEXT,       -- share channel for share_open events
    sender_tag      TEXT,       -- copied from the share link for share_open events
    share_token     TEXT,
    host_domain     TEXT,       -- where the card was viewed (static packages travel)
    doc_label       TEXT,       -- e.g. "Installation guide" for doc_click
    doc_url         TEXT,
    device_hash     TEXT,       -- sha256(ip|user-agent) truncated — no raw PII
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_events_manufacturer_time ON public.card_events (manufacturer_id, created_at DESC);
CREATE INDEX idx_card_events_card ON public.card_events (manufacturer_id, card_slug, created_at DESC);

ALTER TABLE public.card_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_events      ENABLE ROW LEVEL SECURITY;

-- ── card_share_links ─────────────────────────────────────────────────────────

CREATE POLICY "manufacturer_user can read own share links"
  ON public.card_share_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = card_share_links.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can create own share links"
  ON public.card_share_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = card_share_links.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "buildquote staff can read all share links"
  ON public.card_share_links
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can create share links"
  ON public.card_share_links
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

-- ── card_events: read-only through the API ──────────────────────────────────

CREATE POLICY "manufacturer_user can read own card events"
  ON public.card_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = card_events.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "buildquote staff can read all card events"
  ON public.card_events
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));
