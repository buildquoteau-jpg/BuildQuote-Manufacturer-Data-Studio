-- BuildQuote Data Studio — Update policy for staged_systems verification
-- Migration: 020_staged_systems_verification_update.sql
--
-- Allows authenticated users (admin/reviewer) to update verification_status
-- and reviewer_notes on staged_systems. Access to this page is already gated
-- by Next.js middleware + role checks in server actions.
-- Read policies already exist from migration 006 (RLS is enabled).

CREATE POLICY "authenticated can update staged systems verification"
  ON public.staged_systems
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
