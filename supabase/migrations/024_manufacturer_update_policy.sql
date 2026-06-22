-- Allow manufacturer users to update their own workspace brand profile.
-- buildquote_admin can update any manufacturer record.

CREATE POLICY "manufacturer_user can update own workspace"
  ON public.data_studio_manufacturers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = data_studio_manufacturers.id
        AND mu.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = data_studio_manufacturers.id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "buildquote_admin can update any manufacturer"
  ON public.data_studio_manufacturers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.data_studio_user_profiles p
      WHERE p.auth_user_id = auth.uid()
        AND p.global_role = 'buildquote_admin'
    )
  )
  WITH CHECK (true);
