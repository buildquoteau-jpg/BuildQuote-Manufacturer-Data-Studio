-- BuildQuote Data Studio — Migration 035
-- Enables RLS on publish_batches / publish_batch_items.
--
-- Previously these tables had no RLS at all (see migration 003's
-- "RLS INTENT — not yet implemented" comment block). Now that
-- apps/web/lib/studio-manufacturer/verification-actions.ts writes to them via
-- submitForPublication() using the anon-key client, any authenticated user
-- could otherwise read/write any manufacturer's publish batches directly
-- through the Supabase REST API, bypassing the app-level
-- assertManufacturerAccess() membership check entirely.
--
-- Policy summary:
--   manufacturer_user — SELECT/INSERT only, scoped to an active
--     manufacturer_users membership for that batch's manufacturer. No
--     UPDATE/DELETE: once a batch is submitted, only BuildQuote staff (or
--     the service role, which always bypasses RLS) can move it through
--     approval/publication.
--   buildquote_admin / buildquote_reviewer — full SELECT/INSERT/UPDATE/DELETE
--     on all rows, via the public.get_my_global_role() helper added in
--     migration 030.
--
-- The manufacturer_user INSERT policies pin the production-write columns
-- (approved_at, published_at on publish_batches; production_table,
-- production_id on publish_batch_items) to NULL and the status to the one
-- value the submit flow actually uses. A manufacturer can never mark its own
-- batch approved/published or claim a production row — that transition is
-- staff/service-role only.

-- ── Enable RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.publish_batches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_batch_items  ENABLE ROW LEVEL SECURITY;

-- ── publish_batches : manufacturer_user ─────────────────────────────────────

CREATE POLICY "manufacturer_user can read own publish batches"
  ON public.publish_batches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = publish_batches.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can submit own publish batches"
  ON public.publish_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = publish_batches.manufacturer_id
        AND mu.status = 'active'
    )
    AND status = 'submitted'
    AND approved_at IS NULL
    AND published_at IS NULL
  );

-- No UPDATE / DELETE policy for manufacturer_user — once submitted, a batch
-- can only be changed by BuildQuote staff or the service role.

-- ── publish_batches : buildquote staff ──────────────────────────────────────

CREATE POLICY "buildquote staff can read all publish batches"
  ON public.publish_batches
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can insert publish batches"
  ON public.publish_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can update publish batches"
  ON public.publish_batches
  FOR UPDATE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'))
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can delete publish batches"
  ON public.publish_batches
  FOR DELETE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

-- ── publish_batch_items : manufacturer_user ─────────────────────────────────

CREATE POLICY "manufacturer_user can read own publish batch items"
  ON public.publish_batch_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.publish_batches pb
      JOIN public.manufacturer_users mu ON mu.manufacturer_id = pb.manufacturer_id
      WHERE pb.id = publish_batch_items.publish_batch_id
        AND mu.auth_user_id = auth.uid()
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can insert own publish batch items"
  ON public.publish_batch_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.publish_batches pb
      JOIN public.manufacturer_users mu ON mu.manufacturer_id = pb.manufacturer_id
      WHERE pb.id = publish_batch_items.publish_batch_id
        AND mu.auth_user_id = auth.uid()
        AND mu.status = 'active'
    )
    AND status = 'pending'
    AND production_table IS NULL
    AND production_id IS NULL
  );

-- No UPDATE / DELETE policy for manufacturer_user — same rationale as above.

-- ── publish_batch_items : buildquote staff ──────────────────────────────────

CREATE POLICY "buildquote staff can read all publish batch items"
  ON public.publish_batch_items
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can insert publish batch items"
  ON public.publish_batch_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can update publish batch items"
  ON public.publish_batch_items
  FOR UPDATE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'))
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can delete publish batch items"
  ON public.publish_batch_items
  FOR DELETE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));
