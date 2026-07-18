-- PRODUCTION migration (project oxvhmulxuvlfjyjzleki) — run in the Supabase
-- SQL editor of the *production* project, NOT Data Studio.
--
-- Adds the column that publish.ts writes and that both the v6 library
-- (getSystems.ts SYSTEM_DETAIL_SELECT) and the embed widget (getWidgetData.ts)
-- read. Apply this BEFORE deploying the v6 / Data Studio code that selects it —
-- those selects have no pre-migration fallback (same as install_guide_urls).

ALTER TABLE public.systems
  ADD COLUMN IF NOT EXISTS custom_document_links JSONB;

COMMENT ON COLUMN public.systems.custom_document_links IS
  'Extra named document buttons on the system card: [{"label":"Energy rating","url":"https://…"}]. Mirrors staged_systems.custom_document_links.';
