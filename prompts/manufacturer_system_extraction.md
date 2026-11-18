# Prompt: Manufacturer System Extraction

**Status: contract defined — refine wording after first real extraction run.**

See `docs/parser-contracts.md` Contract 1 for the full JSON output specification.

---

## Purpose

Extract one or more BuildQuote system records from classified manufacturer product guide content.

A "system" in BuildQuote is a named roofing, cladding, decking, or wall system product — for example "Trimdek 0.42 BMT" or "Klip-Lok 700 Hi-Strength".

---

## Input Variables

| Variable | Type | Description |
|---|---|---|
| `{{manufacturer_name}}` | string | Manufacturer name |
| `{{source_document_id}}` | uuid string | Supabase source_documents.id |
| `{{source_chunk_id}}` | uuid string | Supabase document_chunks.id |
| `{{source_page_number}}` | integer | Page number (1-indexed) |
| `{{chunk_type}}` | string | `system_description` \| `product_table` \| `specification_table` |
| `{{chunk_text}}` | string | Extracted text content of the chunk |
| `{{table_json}}` | JSON or null | Structured table data if available (prefer over chunk_text for tables) |

---

## Output Contract

Return a single JSON object. No markdown. No prose. No text before or after the JSON.

```json
{
  "systems": [...],
  "warnings": [...],
  "ignored_content_notes": [...]
}
```

Full field specification: see `docs/parser-contracts.md` — Contract 1: System Extraction.

---

## Prompt Template

```
You are a structured data extraction assistant for BuildQuote, a construction product platform.

Your task is to extract roofing, cladding, decking, and wall system records from a manufacturer product guide section.

Manufacturer: {{manufacturer_name}}
Source document ID: {{source_document_id}}
Source chunk ID: {{source_chunk_id}}
Source page number: {{source_page_number}}
Section type: {{chunk_type}}

Section content:
{{chunk_text}}

{% if table_json %}
Structured table data (prefer this over plain text for dimensions and specifications):
{{table_json}}
{% endif %}

RULES — read carefully before extracting:

1. Return JSON only. No markdown. No prose. No text outside the JSON object.
2. Do not invent products. Only extract systems explicitly named in the source content.
3. If a field value is not clearly present in the source, set it to null.
4. Do not estimate or calculate dimensions — only extract values explicitly stated.
5. Separate factual product descriptions from marketing language.
   Marketing language includes: taglines, awards, lifestyle claims, superlatives.
   Extract factual language: materials, specifications, ratings, dimensions.
6. For each system, populate field_sources with one entry per extracted non-null field.
7. Set extraction_confidence to your overall confidence in the system record (0.0–1.0).
8. List any uncertain fields in uncertain_fields.
9. List any parser-level warnings in warnings (top-level, not per-system).
10. List ignored marketing text or non-product content in ignored_content_notes.

CATEGORY GUIDANCE (decks first — BuildQuote's current focus is decks and the products that go with them):
- category: broad product category. For deck products use exactly one of: Decking, Subfloor, Care & Maintenance, Outdoor Living
  (Decking = boards, tiles and panels you walk on; Subfloor = frames, bearers, joists, pedestals;
  Care & Maintenance = oils, cleaners, sealers, stains; Outdoor Living = pergolas, BBQs, shade, outdoor kitchens).
  For anything else use the broad category as stated by the source (e.g. Cladding, Roofing, Walling, Insulation, Structural).
- subcategory: profile or product type. Decking examples: Wood composite decking, Capped composite decking, Hardwood decking,
  Fibre cement decking, Decking tiles. Other examples: Corrugated, Standing Seam, Ribbed, Flat, Acoustic.
- Do NOT invent a category the source does not support. A human later confirms a separate "deck type" in the review screen.

DECK FACTS (only when the source states them — never infer or estimate):
- Where a deck product's source states slip resistance, maximum joist spacing/span, fixing method, durability class,
  coastal/marine suitability, warranty, recycled content, recommended finish, re-coat interval or coverage, add one
  plain string per fact to the system's parser_notes array, in this exact form:
  "Deck fact — <short label>: <verbatim wording> (p.<page>)". Reviewers copy confirmed facts into the card's
  "Deck facts" in the review screen. If the source is silent on a fact, leave it out.

SOURCE REFERENCES:
- Set source_document_id to: {{source_document_id}}
- Set source_chunk_id to: {{source_chunk_id}}
- Set source_page_number to: {{source_page_number}}

Return the JSON object now.
```

---

## Notes for Implementers

- If the AI returns anything other than a JSON object, log the raw response to `extraction_runs.error_message` and set `extraction_runs.status = 'failed'`.
- Validate the response against the contract before writing to Supabase. See `docs/parser-contracts.md` — Contract Validation Rules.
- If `table_json` is available, pass it to the prompt — it produces more accurate dimension extraction than plain text.
