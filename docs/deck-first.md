# Deck-first Data Studio

BuildQuote's current direction is **decks**: the Decks WA site reads published cards from this pipeline.
This note says what changed in Data Studio to support that, and what still needs doing.

## Done in this change
- **`deck_type`** — controlled field on `staged_systems` (migration `069_deck_type.sql`):
  `composite | hardwood | fibre-cement | tiles | modified | subfloor | care | outdoor`. NULL = unclassified.
  - Review screen → Product identity → **Deck type** picker, with a one-click suggestion from the product wording
    (`apps/web/lib/deck/deckTypes.ts`). Never auto-applied; a human confirms.
  - Publish copies it to production `systems.deck_type` **best-effort** (a missing column never fails a publish).
  - Production column is a separate owner-run file: `supabase/production-rfq/001_systems_deck_type.sql`.
- **Deck facts** — standard labels for `custom_technical_attributes` (no schema change):
  slip resistance, joist spacing, fixing method, durability class, coastal suitability, warranty, finish, coverage…
  (`apps/web/lib/deck/deckAttributes.ts`). The attribute editor offers the relevant ones as one-click chips.
  Values are the manufacturer's wording, verified like any field.
- **Parser prompts** now steer deck products to the categories Decking / Subfloor / Care & Maintenance / Outdoor Living and
  ask for deck facts (as `parser_notes` strings, source-quoted only).
- **UI copy** (start-here, examples, placeholders, category pills) is deck-flavoured.

## Run order
1. Apply `supabase/migrations/069_deck_type.sql` to the **Data Studio** project, then
   `node scripts/refresh_schema_reference.mjs`.
2. Run `supabase/production-rfq/001_systems_deck_type.sql` on the **RFQ/production** project (owner only).
3. Deploy. Nothing breaks if either step is skipped — deck type just stays unset/unpublished.
4. Decks WA can then read `systems.deck_type` and drop its text-guessing classifier (follow-up, in that repo).

## Next
- **BuildQuote reference systems** (house manufacturer) for generic subfloor / site-prep / coastal cards, verified by a
  builder + engineer against NCC / AS text instead of a manufacturer document.
- Batch-onboard the decking brand backlog (hint file per brand: Cutek, TimberLock, Evalast, Compform…).
- Host `scripts/worker/pipeline_worker.py` somewhere always-on (see CLAUDE.md → Known Gaps).

## Update: generic subfloor cards (BuildQuote Reference Systems)
Seven generic subfloor / site-prep cards are now defined in `scripts/reference/` and generated into
`supabase/snippets/insert_reference_subfloor_systems.sql`. See `docs/reference-systems.md` (how to run, trust model)
and `docs/reference-systems-images.md` (images to create).
