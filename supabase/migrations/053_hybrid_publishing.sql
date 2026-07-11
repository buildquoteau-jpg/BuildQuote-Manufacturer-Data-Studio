-- BuildQuote Data Studio — Migration 053
-- Hybrid publishing (Library V7): gallery images, live-publish status and
-- the card_events analytics stub.
--
-- Manufacturers now publish cards straight to the live library (no ZIP, no
-- admin approval). Draft state lives in staged_systems; each Publish writes
-- an immutable card_versions row here AND a published_cards row in the
-- PRODUCTION project (see v6 migration create_published_cards.sql).

-- ── Gallery ──────────────────────────────────────────────────────────────────
-- Ordered array of images shown in the card's swipeable hero gallery.
-- Element shape: { asset_id, url, og_jpg_url?, alt, caption? }
-- Index 0 is the cover image — used for tiles and og:image share previews.
ALTER TABLE public.staged_systems
  ADD COLUMN IF NOT EXISTS gallery_images JSONB NOT NULL DEFAULT '[]';

-- ── Live-publish state ───────────────────────────────────────────────────────
-- draft                    → never live-published
-- published                → live card matches the draft (content_hash equal)
-- published_with_changes   → draft edited since last publish
ALTER TABLE public.staged_systems
  ADD COLUMN IF NOT EXISTS publish_status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE public.staged_systems
  DROP CONSTRAINT IF EXISTS staged_systems_publish_status_check;
ALTER TABLE public.staged_systems
  ADD CONSTRAINT staged_systems_publish_status_check
  CHECK (publish_status IN ('draft', 'published', 'published_with_changes'));

-- Version string of the latest live publish, e.g. '1.0', '1.1'.
-- (last_published_at already exists from migration 037.)
ALTER TABLE public.staged_systems
  ADD COLUMN IF NOT EXISTS published_version TEXT;

-- Future manufacturer-accounts hook: which account owns/maintains this card.
-- No FK target yet — accounts, analytics dashboards and subscriptions come
-- later; this column just keeps the data model ready for them.
ALTER TABLE public.staged_systems
  ADD COLUMN IF NOT EXISTS owner_account_id UUID;

-- ── Publish-event log ────────────────────────────────────────────────────────
-- Minimal event log for the hybrid-publishing channel. Only 'publish' events
-- are written today; future manufacturer analytics land here too.
-- NOTE: named card_publish_events because migration 050 already owns
-- card_events (public share/view analytics keyed by card_slug).
CREATE TABLE IF NOT EXISTS public.card_publish_events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    card_id     UUID NOT NULL REFERENCES public.staged_systems(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    meta        JSONB
);

CREATE INDEX IF NOT EXISTS idx_card_publish_events_card_id
  ON public.card_publish_events (card_id, occurred_at DESC);

ALTER TABLE public.card_publish_events ENABLE ROW LEVEL SECURITY;

-- Insert-only from the app (service role bypasses RLS; these policies cover
-- authenticated manufacturer users so events can also be written client-side
-- later if needed).
DROP POLICY IF EXISTS "manufacturer_user can read own publish events" ON public.card_publish_events;
CREATE POLICY "manufacturer_user can read own publish events"
  ON public.card_publish_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staged_systems ss
      JOIN public.manufacturer_users mu
        ON mu.manufacturer_id = ss.manufacturer_id
      WHERE ss.id = card_publish_events.card_id
        AND mu.auth_user_id = auth.uid()
        AND mu.status = 'active'
    )
  );

DROP POLICY IF EXISTS "buildquote staff can read all publish events" ON public.card_publish_events;
CREATE POLICY "buildquote staff can read all publish events"
  ON public.card_publish_events
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));
