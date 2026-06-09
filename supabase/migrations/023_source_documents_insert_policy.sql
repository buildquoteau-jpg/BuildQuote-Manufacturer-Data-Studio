-- Allow manufacturer users to insert source_documents for their own workspace.
-- The membership check mirrors assertManufacturerAccess in server actions.

CREATE POLICY "manufacturer_user can insert own source_documents"
  ON public.source_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = source_documents.manufacturer_id
        AND mu.status = 'active'
    )
  );

-- buildquote_admin can insert into any workspace.
CREATE POLICY "buildquote_admin can insert source_documents"
  ON public.source_documents
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
