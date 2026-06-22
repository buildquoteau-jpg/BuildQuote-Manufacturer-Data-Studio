-- Allow buildquote_admin to insert new manufacturer workspace records.
-- Consistent with the UPDATE policy in migration 024.
-- The API route also gates on globalRole, but RLS gives a second layer of defence.

CREATE POLICY "buildquote_admin can insert manufacturer"
  ON public.data_studio_manufacturers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.data_studio_user_profiles p
      WHERE p.auth_user_id = auth.uid()
        AND p.global_role = 'buildquote_admin'
    )
  );
