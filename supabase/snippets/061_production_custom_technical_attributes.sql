-- PRODUCTION migration (project oxvhmulxuvlfjyjzleki) — run in the Supabase
-- SQL editor of the *production* project, NOT Data Studio.
--
-- Adds the column that publish.ts writes and that v6's library (getSystems.ts
-- SYSTEM_DETAIL_SELECT) reads. Apply this BEFORE deploying the v6 / Data
-- Studio code that selects it — those selects have no pre-migration fallback
-- (same as custom_document_links, install_guide_urls).

ALTER TABLE public.systems
  ADD COLUMN IF NOT EXISTS custom_technical_attributes JSONB;

COMMENT ON COLUMN public.systems.custom_technical_attributes IS
  'Freeform [{label, value}] pairs for spec facts with no dedicated column (e.g. warranty period, R-value), rendered as extra attribute pills. Mirrors staged_systems.custom_technical_attributes.';
