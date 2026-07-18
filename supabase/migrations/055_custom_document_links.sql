-- Migration 055: arbitrary named document links on a system.
--
-- Install/design/tech guides cover the common documents, but manufacturers
-- also publish one-off resources — energy ratings, sustainability reports,
-- warranty PDFs, spec sheets — that need their own button on the system card.
-- This column holds a list of {label, url} where `label` is the button text
-- rendered on the card and `url` is a PDF or web page (same free shape as
-- install_guide_urls). NULL / empty array = no extra buttons.
--
-- Mirror of staged_systems.install_guide_urls (migration 026). The matching
-- production `systems` column is added separately in the production project.

ALTER TABLE public.staged_systems
  ADD COLUMN IF NOT EXISTS custom_document_links JSONB;

COMMENT ON COLUMN public.staged_systems.custom_document_links IS
  'Extra named document buttons on the system card: [{"label":"Energy rating","url":"https://…"}]. Free-form label + PDF/web URL, same shape as install_guide_urls.';
