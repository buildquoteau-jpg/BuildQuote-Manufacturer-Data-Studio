-- BuildQuote Data Studio — Migration 022
-- Adds write policies for the verification workflow.
--
-- field_verifications: currently has RLS enabled + SELECT policy but no write
--   policies → manufacturers can read but not save verifications.
-- staged_system_profiles / staged_system_colours / staged_components /
--   staged_system_components: need INSERT/UPDATE so manufacturers can add
--   missing items through the verification UI.
--
-- Auth guard (membership check) is enforced in server actions before any DB
-- call. These policies use USING (true) / WITH CHECK (true) for authenticated
-- users, matching the pattern in migration 020.

-- ── field_verifications ───────────────────────────────────────────────────────

CREATE POLICY "authenticated can insert field verifications"
  ON public.field_verifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated can update field verifications"
  ON public.field_verifications
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated can delete field verifications"
  ON public.field_verifications
  FOR DELETE TO authenticated
  USING (true);

-- ── staged_system_profiles ────────────────────────────────────────────────────

CREATE POLICY "authenticated can insert staged system profiles"
  ON public.staged_system_profiles
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated can update staged system profiles"
  ON public.staged_system_profiles
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── staged_system_colours ─────────────────────────────────────────────────────

CREATE POLICY "authenticated can insert staged system colours"
  ON public.staged_system_colours
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated can update staged system colours"
  ON public.staged_system_colours
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── staged_components ─────────────────────────────────────────────────────────

CREATE POLICY "authenticated can insert staged components"
  ON public.staged_components
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated can update staged components"
  ON public.staged_components
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── staged_system_components ──────────────────────────────────────────────────

CREATE POLICY "authenticated can insert staged system components"
  ON public.staged_system_components
  FOR INSERT TO authenticated
  WITH CHECK (true);
