-- Allow manufacturer users to insert staged_systems for their own workspace.
-- Mirrors the assertManufacturerAccess check in server actions.

CREATE POLICY "manufacturer_user can insert own staged_systems"
  ON public.staged_systems
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = staged_systems.manufacturer_id
        AND mu.status = 'active'
    )
  );

-- buildquote_admin can insert into any workspace.
CREATE POLICY "buildquote_admin can insert staged_systems"
  ON public.staged_systems
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
