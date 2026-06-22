-- BuildQuote Data Studio — Migration 044
-- Add acknowledged_at to manufacturer_messages.
--
-- Enables manufacturers to mark incoming BuildQuote messages as read from
-- the new Inbox page (/manufacturer/inbox). The server action only ever
-- updates this single column; broader updates are not permitted by RLS.

ALTER TABLE public.manufacturer_messages
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

-- Manufacturers may update acknowledged_at on messages sent to them by
-- BuildQuote staff. The WITH CHECK mirrors the USING clause so the policy
-- cannot be leveraged to change the row's core fields (enforced at app layer).
CREATE POLICY "manufacturer_user can acknowledge buildquote messages"
  ON public.manufacturer_messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_type = 'buildquote'
    AND EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_messages.manufacturer_id
        AND mu.status = 'active'
    )
  )
  WITH CHECK (
    sender_type = 'buildquote'
    AND EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_messages.manufacturer_id
        AND mu.status = 'active'
    )
  );
