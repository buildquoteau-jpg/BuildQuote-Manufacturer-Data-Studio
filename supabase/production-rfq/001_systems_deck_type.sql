-- RFQ / BuildQuote PRODUCTION project (oxvhmulxuvlfjyjzleki) — NOT the Data Studio project.
-- Run by the owner (never by Claude/CI). Pair with Data Studio migration 069_deck_type.sql.
--
-- Adds the same controlled deck_type to the published `systems` table so Decks WA and
-- buildquote.com.au/library can read the type directly instead of guessing from text.
-- Safe to run before or after the Data Studio publish code ships: publish.ts only writes
-- deck_type when this column exists, and readers treat NULL as "unclassified".

ALTER TABLE public.systems ADD COLUMN IF NOT EXISTS deck_type text;
ALTER TABLE public.systems DROP CONSTRAINT IF EXISTS systems_deck_type_check;
ALTER TABLE public.systems ADD CONSTRAINT systems_deck_type_check
  CHECK (deck_type IS NULL OR deck_type IN
    ('composite','hardwood','fibre-cement','tiles','modified','subfloor','care','outdoor'));
