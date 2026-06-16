-- BuildQuote Data Studio — Migration 036
-- Manufacturer ↔ BuildQuote message board.
--
-- V1: a simple per-manufacturer message thread. Manufacturers can ask for
-- help or notify BuildQuote of a submission; BuildQuote admin/reviewer reads
-- everything in one board (apps/web/app/(protected)/admin/messages) and can
-- reply. No read receipts / unread tracking yet — kept deliberately simple,
-- this is the seam a future WhatsApp Business integration will hang off
-- (each message can carry sender_label / message_type for that later use).
--
-- Also used by submitForPublication() (verification-actions.ts) to post an
-- automatic 'submission' message when a manufacturer submits verified
-- systems — previously that just wrote a publish_batches row nobody saw.

CREATE TABLE public.manufacturer_messages (
    id                       UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    manufacturer_id          UUID        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
    sender_type              TEXT        NOT NULL CHECK (sender_type IN ('manufacturer', 'buildquote')),
    sender_user_id           UUID,
    sender_label             TEXT,
    body                     TEXT        NOT NULL,
    message_type             TEXT        NOT NULL DEFAULT 'general' CHECK (message_type IN ('general', 'help', 'submission')),
    related_publish_batch_id UUID        REFERENCES public.publish_batches(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_manufacturer_messages_manufacturer_id
  ON public.manufacturer_messages (manufacturer_id, created_at);

ALTER TABLE public.manufacturer_messages ENABLE ROW LEVEL SECURITY;

-- ── manufacturer_user ───────────────────────────────────────────────────────

CREATE POLICY "manufacturer_user can read own messages"
  ON public.manufacturer_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_messages.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can send own messages"
  ON public.manufacturer_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_type = 'manufacturer'
    AND sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_messages.manufacturer_id
        AND mu.status = 'active'
    )
  );

-- ── buildquote staff ─────────────────────────────────────────────────────────

CREATE POLICY "buildquote staff can read all messages"
  ON public.manufacturer_messages
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can send messages"
  ON public.manufacturer_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_type = 'buildquote'
    AND public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer')
  );

-- No UPDATE / DELETE policies — messages are an immutable log, like a chat
-- transcript. Edit/delete can be added later if needed.
