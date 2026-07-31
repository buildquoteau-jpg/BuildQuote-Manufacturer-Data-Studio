-- BuildQuote Data Studio — Migration 064
-- card_publish_events was missing its INSERT policy: migration 053 enabled
-- RLS and added two SELECT-only policies, but the hybrid publish action
-- (publishCardLive, apps/web/lib/studio-manufacturer/publish-live-actions.ts)
-- writes as the authenticated manufacturer-session client, not service role,
-- so every publish hit "new row violates row-level security policy for
-- table card_publish_events" and the event never logged.

DROP POLICY IF EXISTS "manufacturer_user can insert own publish events" ON public.card_publish_events;
CREATE POLICY "manufacturer_user can insert own publish events"
  ON public.card_publish_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
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

DROP POLICY IF EXISTS "buildquote staff can insert publish events" ON public.card_publish_events;
CREATE POLICY "buildquote staff can insert publish events"
  ON public.card_publish_events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));
