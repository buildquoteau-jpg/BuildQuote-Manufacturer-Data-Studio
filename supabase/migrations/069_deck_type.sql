-- 069: deck_type — a controlled "what kind of deck product is this?" field.
--
-- Until now the only classification was free-text category/subcategory, so sites reading the
-- published data (Decks WA) had to guess the type from words in the name/description. This adds
-- an explicit, human-confirmed value. NULL = not classified yet (safe default; nothing breaks).
--
-- Values (keep in sync with apps/web/lib/deck/deckTypes.ts and the Decks WA library):
--   composite | hardwood | fibre-cement | tiles | modified     -- decking boards
--   subfloor | care | outdoor                                   -- the rest of the deck
--
-- Run on the DATA STUDIO project (ovndok…) only. The matching column for the RFQ/production
-- project is in supabase/production-rfq/001_systems_deck_type.sql (run separately, by the owner).

ALTER TABLE public.staged_systems
  ADD COLUMN IF NOT EXISTS deck_type text;

ALTER TABLE public.staged_systems
  DROP CONSTRAINT IF EXISTS staged_systems_deck_type_check;
ALTER TABLE public.staged_systems
  ADD CONSTRAINT staged_systems_deck_type_check
  CHECK (deck_type IS NULL OR deck_type IN
    ('composite','hardwood','fibre-cement','tiles','modified','subfloor','care','outdoor'));

-- Conservative backfill: only rows that clearly say so. Anything else stays NULL for a human.
UPDATE public.staged_systems SET deck_type = 'care'
 WHERE deck_type IS NULL
   AND lower(coalesce(name,'') || ' ' || coalesce(category,'') || ' ' || coalesce(subcategory,''))
       ~ '\y(oils?|cleaners?|sealers?|stains?|restorers?|brighteners?|protectors?)\y';

UPDATE public.staged_systems SET deck_type = 'outdoor'
 WHERE deck_type IS NULL
   AND lower(coalesce(name,'') || ' ' || coalesce(category,'') || ' ' || coalesce(subcategory,''))
       ~ '(pergola|gazebo|bbq|barbecue|outdoor kitchen|fire ?pit|awning|shade ?sail)';

UPDATE public.staged_systems SET deck_type = 'subfloor'
 WHERE deck_type IS NULL
   AND lower(coalesce(name,'') || ' ' || coalesce(category,'') || ' ' || coalesce(subcategory,''))
       ~ '(sub-?floor|sub-?frame|pedestal)';

UPDATE public.staged_systems SET deck_type = 'composite'
 WHERE deck_type IS NULL AND lower(coalesce(category,'')) ~ 'deck'
   AND lower(coalesce(name,'') || ' ' || coalesce(subcategory,'') || ' ' || coalesce(description,''))
       ~ '(composite|wpc|co-extruded|capped)';

UPDATE public.staged_systems SET deck_type = 'fibre-cement'
 WHERE deck_type IS NULL AND lower(coalesce(category,'')) ~ 'deck'
   AND lower(coalesce(name,'') || ' ' || coalesce(subcategory,'') || ' ' || coalesce(description,''))
       ~ 'fib(re|er)[ -]?cement';

UPDATE public.staged_systems SET deck_type = 'hardwood'
 WHERE deck_type IS NULL AND lower(coalesce(category,'')) ~ 'deck'
   AND lower(coalesce(name,'') || ' ' || coalesce(subcategory,'') || ' ' || coalesce(description,''))
       ~ '(hardwood|jarrah|karri|spotted gum|blackbutt|merbau|kwila|ironbark|timber)';

COMMENT ON COLUMN public.staged_systems.deck_type IS
  'Controlled deck product type; human-confirmed. NULL = unclassified.';
