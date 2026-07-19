-- PRODUCTION cleanup (project oxvhmulxuvlfjyjzleki) — run in the Supabase SQL
-- editor of the *production* (RFQ) project, NOT Data Studio.
--
-- Why this exists (2026-07-19 audit, Brief E item 3): Data Studio migration
-- 026 (install_guide_urls_jsonb) replaced the singular install_guide_url TEXT
-- column with the plural install_guide_urls JSONB column — but it only ever
-- touched staged_systems in the Data Studio project. It never ran against the
-- production `systems` table at all, so the legacy singular column has sat
-- unused on production ever since, despite docs elsewhere claiming it was
-- dropped on 2026-06-16. Confirmed still present via the production
-- PostgREST OpenAPI spec on 2026-07-19 (both install_guide_url and
-- install_guide_urls listed on public.systems).
--
-- Confirmed safe to drop: publish.ts (apps/web/lib/studio-admin/publish.ts)
-- only ever writes install_guide_urls to production; a full-repo search of
-- Build-Quote-v6 (the only other consumer of this database) found zero live
-- reads or writes of the singular install_guide_url anywhere — the sole
-- occurrence is a stale local supabase/schema.sql reference file, not
-- executing code. The only real SELECT against systems in that repo
-- (getSystems.ts SYSTEM_DETAIL_SELECT) already selects the plural only.
--
-- Update Build-Quote-v6/buildquote/supabase/schema.sql to drop the singular
-- column too after applying this, so that reference file stops going stale.

ALTER TABLE public.systems
  DROP COLUMN IF EXISTS install_guide_url;
