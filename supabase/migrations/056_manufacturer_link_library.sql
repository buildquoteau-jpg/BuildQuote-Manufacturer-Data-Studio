-- BuildQuote Data Studio — Migration 056
-- Manufacturer link library: reusable named {label, url} pairs a manufacturer
-- can attach to multiple system cards' custom_document_links (055) without
-- retyping the same URL on every system — e.g. a decking calculator link
-- that applies to several product lines. Lives on the Assets tab alongside
-- the image asset library (046), since both are public reusable building
-- blocks attached to cards — unlike Documents, which is private pipeline
-- source material.
--
-- Deleting a library entry does not affect systems that already have it
-- copied into their custom_document_links — that field is a snapshot taken
-- at attach time, not a live reference.

CREATE TABLE public.manufacturer_link_library (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    manufacturer_id UUID        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
    label           TEXT        NOT NULL,
    url             TEXT        NOT NULL,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_manufacturer_link_library_manufacturer_id
  ON public.manufacturer_link_library (manufacturer_id, created_at DESC);

ALTER TABLE public.manufacturer_link_library ENABLE ROW LEVEL SECURITY;

-- ── manufacturer_user ───────────────────────────────────────────────────────

CREATE POLICY "manufacturer_user can read own link library"
  ON public.manufacturer_link_library
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_link_library.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can create own link library entries"
  ON public.manufacturer_link_library
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_link_library.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can update own link library entries"
  ON public.manufacturer_link_library
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_link_library.manufacturer_id
        AND mu.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_link_library.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can delete own link library entries"
  ON public.manufacturer_link_library
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = manufacturer_link_library.manufacturer_id
        AND mu.status = 'active'
    )
  );

-- ── buildquote staff ────────────────────────────────────────────────────────

CREATE POLICY "buildquote staff can read all link libraries"
  ON public.manufacturer_link_library
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can create link library entries"
  ON public.manufacturer_link_library
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can update link library entries"
  ON public.manufacturer_link_library
  FOR UPDATE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'))
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

CREATE POLICY "buildquote staff can delete link library entries"
  ON public.manufacturer_link_library
  FOR DELETE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));
