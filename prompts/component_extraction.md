# Prompt: Component Extraction

**Status: contract defined — refine wording after first real extraction run.**

See `docs/parser-contracts.md` Contract 2 for the full JSON output specification.

---

## Purpose

Extract component records, system-component relationships, colour options, and profile variants from classified manufacturer product guide content.

A "component" in BuildQuote is an individual product line item — a sheet, flashing, clip, fastener, ridge cap, trim piece, or accessory — that can be added to a system and quoted.

---

## Input Variables

| Variable | Type | Description |
|---|---|---|
| `{{manufacturer_name}}` | string | Manufacturer name |
| `{{source_document_id}}` | uuid string | Supabase source_documents.id |
| `{{source_chunk_id}}` | uuid string | Supabase document_chunks.id |
| `{{source_page_number}}` | integer | Page number (1-indexed) |
| `{{chunk_type}}` | string | `product_table` \| `specification_table` \| `accessory_list` \| `colour_chart` |
| `{{chunk_text}}` | string | Extracted text content of the chunk |
| `{{table_json}}` | JSON or null | Structured table data (prefer for specification tables) |
| `{{system_context}}` | JSON or null | Known system records to link components to (name, product_code) |

---

## Output Contract

Return a single JSON object. No markdown. No prose. No text before or after the JSON.

```json
{
  "components": [...],
  "system_components": [...],
  "system_colours": [...],
  "system_profiles": [...],
  "warnings": [...],
  "ignored_content_notes": [...]
}
```

Full field specification: see `docs/parser-contracts.md` — Contract 2: Component Extraction.

---

## Prompt Template

```
You are a structured data extraction assistant for BuildQuote, a construction product platform.

Your task is to extract component records, colour options, profile variants, and system-component relationships from a manufacturer product guide section.

Manufacturer: {{manufacturer_name}}
Source document ID: {{source_document_id}}
Source chunk ID: {{source_chunk_id}}
Source page number: {{source_page_number}}
Section type: {{chunk_type}}

Section content:
{{chunk_text}}

{% if table_json %}
Structured table data (prefer this over plain text for dimensions and product codes):
{{table_json}}
{% endif %}

{% if system_context %}
Known systems to link components to (match by name or product_code where possible):
{{system_context}}
{% endif %}

RULES — read carefully before extracting:

1. Return JSON only. No markdown. No prose. No text outside the JSON object.
2. Do not invent products. Only extract components explicitly named in the source content.
3. If a field value is not clearly present in the source, set it to null.
4. Do not estimate, convert, or calculate dimensions. Extract only values explicitly stated in the source.
5. All dimension fields must be numeric. Do not include units inside the value — units belong in uom.
6. Use uom (unit of measure) not unit. Examples: lm, m2, each, roll, sheet, kg, pack.
7. For each component, populate field_sources with one entry per extracted non-null field.
8. Set extraction_confidence to your overall confidence in the component record (0.0–1.0).
9. List uncertain fields in uncertain_fields.
10. Separate component descriptions from marketing language.

DIMENSION GUIDANCE:
- length_mm, width_mm, height_mm, thickness_mm, depth_mm, gauge_mm, diameter_mm — all in millimetres
- roll_m — roll length in metres
- weight_kg — weight in kilograms
- pieces — integer count per pack or bundle
- Do not convert between units. If the source states metres, do not convert to mm — flag as uncertain instead.

COMPONENT ROLE GUIDANCE (for system_components):
Use the most specific role that matches the component's function:
  primary_cladding, decking_board, trim, starter, corner, clip, fastener, sealant, adhesive,
  required, optional, accessory, other

COLOUR CHART GUIDANCE:
- Extract one system_colours entry per colour row.
- colour_name must be the colour name exactly as printed.
- sku should be the colour-specific product code if listed separately.
- is_stocked: true if stocked, false if order-only, null if not stated.

PROFILE/SIZE VARIANT GUIDANCE:
- Extract one system_profiles entry per distinct profile or size variant.
- dimensions should be the human-readable dimension string as printed.

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
- `uom` in parser output maps to `components.unit` in production — the export step handles this rename. Do not rename during extraction or staging.
- `system_components` uses `staged_system_match` (name/product_code) for linking — app code resolves to actual UUIDs after staged records are inserted.
