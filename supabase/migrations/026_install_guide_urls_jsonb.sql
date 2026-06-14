-- Migration 026: replace install_guide_url TEXT with install_guide_urls JSONB
-- Supports multiple install guides per system e.g. [{label, url}, {label, url}]
-- Existing single URLs are migrated into the array as the first entry.

ALTER TABLE public.staged_systems
  ADD COLUMN install_guide_urls JSONB;

UPDATE public.staged_systems
SET install_guide_urls = jsonb_build_array(
  jsonb_build_object('label', 'Installation Guide', 'url', install_guide_url)
)
WHERE install_guide_url IS NOT NULL;

ALTER TABLE public.staged_systems
  DROP COLUMN install_guide_url;
