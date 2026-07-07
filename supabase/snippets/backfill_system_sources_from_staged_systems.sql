-- Backfill system_sources from existing staged_systems link fields.
--
-- Step 2 of the sourced-system-card build (docs/sourced-system-card-architecture.md).
-- Turns the scattered scalar/jsonb link fields on staged_systems into typed
-- system_sources rows, so existing cards' links become first-class sources
-- (live link + future ingestion target).
--
-- IDEMPOTENT: ON CONFLICT (staged_system_id, role, url) DO NOTHING — safe to
-- re-run. It only ever inserts; it never edits or deletes existing rows, and it
-- does NOT enqueue ingestion (ingest_status stays 'linked'). Ingestion is a
-- separate, explicit step later.
--
-- include_in_container: PDF-style roles default true (their text belongs in the
-- searchable container); website is link-only (false).
--
-- Run once in the Supabase SQL editor after migration 051 is applied.

-- ── website_url → role 'website' (link-only) ────────────────────────────────
INSERT INTO public.system_sources
  (manufacturer_id, staged_system_id, role, label, url, ingest_status, include_in_container)
SELECT s.manufacturer_id, s.id, 'website', NULL, s.website_url, 'linked', false
FROM public.staged_systems s
WHERE s.website_url IS NOT NULL AND btrim(s.website_url) <> ''
ON CONFLICT (staged_system_id, role, url) DO NOTHING;

-- ── design_guide_url → role 'design_guide' ──────────────────────────────────
INSERT INTO public.system_sources
  (manufacturer_id, staged_system_id, role, label, url, ingest_status, include_in_container)
SELECT s.manufacturer_id, s.id, 'design_guide', NULL, s.design_guide_url, 'linked', true
FROM public.staged_systems s
WHERE s.design_guide_url IS NOT NULL AND btrim(s.design_guide_url) <> ''
ON CONFLICT (staged_system_id, role, url) DO NOTHING;

-- ── tech_data_url → role 'tech_data' ────────────────────────────────────────
INSERT INTO public.system_sources
  (manufacturer_id, staged_system_id, role, label, url, ingest_status, include_in_container)
SELECT s.manufacturer_id, s.id, 'tech_data', NULL, s.tech_data_url, 'linked', true
FROM public.staged_systems s
WHERE s.tech_data_url IS NOT NULL AND btrim(s.tech_data_url) <> ''
ON CONFLICT (staged_system_id, role, url) DO NOTHING;

-- ── source_url (+ source_label) → role 'source_catalogue' ───────────────────
INSERT INTO public.system_sources
  (manufacturer_id, staged_system_id, role, label, url, ingest_status, include_in_container)
SELECT s.manufacturer_id, s.id, 'source_catalogue', NULLIF(btrim(s.source_label), ''), s.source_url, 'linked', true
FROM public.staged_systems s
WHERE s.source_url IS NOT NULL AND btrim(s.source_url) <> ''
ON CONFLICT (staged_system_id, role, url) DO NOTHING;

-- ── install_guide_urls (jsonb [{label,url}]) → role 'install_guide' ─────────
-- One row per array entry with a non-empty url; label carried through.
INSERT INTO public.system_sources
  (manufacturer_id, staged_system_id, role, label, url, ingest_status, include_in_container)
SELECT
  s.manufacturer_id,
  s.id,
  'install_guide',
  NULLIF(btrim(elem->>'label'), ''),
  btrim(elem->>'url'),
  'linked',
  true
FROM public.staged_systems s
CROSS JOIN LATERAL jsonb_array_elements(s.install_guide_urls) AS elem
WHERE jsonb_typeof(s.install_guide_urls) = 'array'
  AND elem->>'url' IS NOT NULL
  AND btrim(elem->>'url') <> ''
ON CONFLICT (staged_system_id, role, url) DO NOTHING;

-- Sanity check — counts by role after backfill:
--   SELECT role, count(*) FROM public.system_sources GROUP BY role ORDER BY role;
