-- BuildQuote Data Studio — Migration 061
-- Adds two pieces for the manufacturer verification UI:
--
-- 1. custom_technical_attributes on staged_systems — freeform label/value
--    pairs for spec facts that don't fit a dedicated column (same jsonb-array
--    pattern as custom_document_links from migration 055).
--
-- 2. DELETE policies for staged_system_profiles / staged_system_colours /
--    staged_system_components — migration 022 added INSERT/UPDATE for these
--    so manufacturers could add/edit items, but never DELETE, so the review
--    UI could not offer a "remove profile / colour / component" action.
--    staged_components itself is intentionally NOT given a DELETE policy:
--    a component row can be linked to multiple systems, so "delete" from a
--    system's perspective means removing the staged_system_components link,
--    not destroying the shared component record.

ALTER TABLE public.staged_systems
  ADD COLUMN IF NOT EXISTS custom_technical_attributes JSONB;

COMMENT ON COLUMN public.staged_systems.custom_technical_attributes IS
  'Freeform [{label, value}] pairs for spec facts with no dedicated column (e.g. warranty period, R-value). Null/empty = none set.';

CREATE POLICY "authenticated can delete staged system profiles"
  ON public.staged_system_profiles
  FOR DELETE TO authenticated
  USING (true);

CREATE POLICY "authenticated can delete staged system colours"
  ON public.staged_system_colours
  FOR DELETE TO authenticated
  USING (true);

CREATE POLICY "authenticated can delete staged system components"
  ON public.staged_system_components
  FOR DELETE TO authenticated
  USING (true);
