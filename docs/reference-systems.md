# BuildQuote Reference Systems (generic deck subfloor cards)

A house "manufacturer" (`buildquote-reference-systems`) that holds **generic, manufacturer-neutral** System Cards for the
parts of a deck that aren't a branded board: site preparation and subframes. They follow the pattern of the existing
"Build Stage Systems by BuildQuote" cards — a generic RFQ template, **not** a manufacturer-certified system.

## What's seeded (7 cards, 97 shared components)
| Code | Card |
|---|---|
| DWA-SITE | Deck Site Preparation |
| DWA-TSF | Timber Deck Subframe |
| DWA-SSF | Steel Deck Subframe |
| DWA-ASF | Aluminium Deck Subframe (starter; branded cards should replace it) |
| DWA-PED | Pedestal / Over-Slab Deck System |
| DWA-TSF-C | Coastal Timber Deck Subframe |
| DWA-SSF-C | Coastal Steel Deck Subframe |

Each has profiles (example stock sizes — *placeholders*), components grouped by role (structure, footings, connectors,
fixings, bracing, protection, services), "variables to confirm" and open questions in the notes, a BAL (AS 3959) overlay
note, and linked reference sources (`system_sources`). `deck_type` is set to `subfloor` when migration 069 is applied.

## Trust model (important)
- Verified by **a builder and an engineer** against NCC / Australian Standards text — not by a manufacturer.
- Everything is inserted as `pending_review`. Nothing is marked verified, and the cards say "not engineering advice".
- Standards are paywalled: sources are linked, not reproduced. Tags in the notes: `[S]` found in a published source,
  `[R]` trade practice from memory (verify), `[?]` open question.
- Known open conflicts (see `Decks-WA/docs/system-card-drafts.md`): H4 vs H5 for in-ground posts; how far each AS 4312
  corrosivity category extends; older vs current NCC deck-load wording.

## Run it
1. (Optional but recommended) apply `supabase/migrations/069_deck_type.sql` first.
2. Paste `supabase/snippets/insert_reference_subfloor_systems.sql` into the **Data Studio** project SQL editor (ovndok…). Never the RFQ/production project.
   It is idempotent — safe to re-run; it skips systems that already exist.
3. In Data Studio, open the **BuildQuote Reference Systems** workspace → each system → add the hero image (see
   `docs/reference-systems-images.md`) → have a builder and an engineer review → verify → publish.
4. Change the content by editing `scripts/reference/reference_subfloor_data.py` and re-running
   `python3 scripts/reference/generate_reference_subfloor_sql.py`.

## Notes
- Publishing requires a source document; each card is linked to a reference-source row (`ingest_kind = url_fetch`, no file).
- The manufacturer row is created with the default `draft` status; set it active in Data Studio when you're ready to publish.
