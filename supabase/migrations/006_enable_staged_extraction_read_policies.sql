-- BuildQuote Data Studio — Read Policies for Extraction/Staging Tables
-- Migration: 006_enable_staged_extraction_read_policies.sql
--
-- Enables RLS and adds anon/authenticated SELECT-only policies for the
-- extraction and staging tables used by the document review workspace.
--
-- Pattern is identical to migrations 004 and 005.
-- No INSERT/UPDATE/DELETE policies are added here.
-- Do not run this against the production Supabase project.

-- ============================================================
-- extraction_runs
-- ============================================================

ALTER TABLE public.extraction_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read extraction runs"
  ON public.extraction_runs
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated can read extraction runs"
  ON public.extraction_runs
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- document_pages
-- ============================================================

ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read document pages"
  ON public.document_pages
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated can read document pages"
  ON public.document_pages
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- document_chunks
-- ============================================================

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read document chunks"
  ON public.document_chunks
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated can read document chunks"
  ON public.document_chunks
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- staged_systems
-- ============================================================

ALTER TABLE public.staged_systems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read staged systems"
  ON public.staged_systems
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated can read staged systems"
  ON public.staged_systems
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- staged_components
-- ============================================================

ALTER TABLE public.staged_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read staged components"
  ON public.staged_components
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated can read staged components"
  ON public.staged_components
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- staged_system_components
-- ============================================================

ALTER TABLE public.staged_system_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read staged system components"
  ON public.staged_system_components
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated can read staged system components"
  ON public.staged_system_components
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- staged_system_colours
-- ============================================================

ALTER TABLE public.staged_system_colours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read staged system colours"
  ON public.staged_system_colours
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated can read staged system colours"
  ON public.staged_system_colours
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- staged_system_profiles
-- ============================================================

ALTER TABLE public.staged_system_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read staged system profiles"
  ON public.staged_system_profiles
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated can read staged system profiles"
  ON public.staged_system_profiles
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- field_verifications
-- ============================================================

ALTER TABLE public.field_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read field verifications"
  ON public.field_verifications
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated can read field verifications"
  ON public.field_verifications
  FOR SELECT TO authenticated
  USING (true);
