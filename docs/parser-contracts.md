# Parser Contracts

This document defines the strict JSON output contracts for all AI parser stages in BuildQuote Data Studio.

Parser output is AI-suggested data. All output must be treated as unverified until a human reviewer approves each field via the verification UI.

---

## Core Rules for All Parser Output

- Return **JSON only**. No markdown, no prose, no commentary outside the JSON.
- **Do not invent** products, systems, components, SKUs, or values.
- If a value is not clearly present in the source, use `null`. Do not estimate or guess.
- Every extracted record must include source references:
  - `source_document_id`
  - `source_chunk_id`
  - `source_page_number`
- Every extracted field must include enough data to seed `field_verifications`:
  - `field_name`
  - `extracted_value`
  - `source_page_number`
  - `source_chunk_id`
  - `confidence` (0.0 – 1.0)
- Confidence must be numeric between 0 and 1.
- Separate product/system data from parser notes, warnings, uncertain fields, and ignored marketing text.
- `uom` (unit of measure) is used throughout parser output. Do **not** use `unit`. The export step handles the rename to `components.unit` in production.

---

## Contract 1: System Extraction

**Used by:** `pipelines/parsing/parse_systems.py`
**Prompt:** `prompts/manufacturer_system_extraction.md`
**Example:** `samples/expected-outputs/system_extraction_example.json`

### Top-Level Shape

```json
{
  "systems": [],
  "warnings": [],
  "ignored_content_notes": []
}
```

| Field | Type | Notes |
|---|---|---|
| `systems` | array | Extracted system records — see below |
| `warnings` | array of strings | Parser-level warnings (ambiguous section, conflicting data, etc.) |
| `ignored_content_notes` | array of strings | Marketing text, boilerplate, or content not suitable for extraction |

### System Record Shape

```json
{
  "source_document_id": "uuid-or-null",
  "source_chunk_id": "uuid-or-null",
  "source_page_number": 1,
  "name": "string",
  "product_code": "string-or-null",
  "slug": "string-or-null",
  "category": "string-or-null",
  "subcategory": "string-or-null",
  "description": "string-or-null",
  "dimensions": "string-or-null",
  "length_m": null,
  "double_sided": null,
  "sheet_format": "string-or-null",
  "fire_rating": "string-or-null",
  "acoustic_rating": "string-or-null",
  "moisture_resistant": null,
  "structural_grade": "string-or-null",
  "install_guide_url": null,
  "tech_data_url": null,
  "sort_order": null,
  "extraction_confidence": 0.85,
  "field_sources": [
    {
      "field_name": "name",
      "extracted_value": "string",
      "source_page_number": 1,
      "source_chunk_id": "uuid-or-null",
      "confidence": 0.92
    }
  ],
  "parser_notes": [],
  "uncertain_fields": []
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Must be present — reject record if absent |
| `product_code` | no | SKU or product code as printed |
| `slug` | no | If not extractable, app code will generate from name |
| `category` | no | e.g. Roofing, Cladding, Decking, Insulation |
| `subcategory` | no | e.g. Corrugated, Standing Seam, Longrun |
| `description` | no | Factual product description only — not marketing prose |
| `dimensions` | no | Human-readable dimension string as stated |
| `length_m` | no | Numeric only, in metres |
| `double_sided` | no | Boolean if stated |
| `sheet_format` | no | e.g. "Custom length", "Fixed 6m" |
| `fire_rating` | no | As stated in document |
| `acoustic_rating` | no | As stated in document |
| `moisture_resistant` | no | Boolean if explicitly stated |
| `structural_grade` | no | As stated |
| `install_guide_url` | no | Only if a URL is explicitly present in the source |
| `tech_data_url` | no | Only if a URL is explicitly present in the source |
| `extraction_confidence` | yes | Overall record confidence 0.0–1.0 |
| `field_sources` | yes | One entry per extracted non-null field |
| `parser_notes` | yes | Array of strings — empty if none |
| `uncertain_fields` | yes | Array of field names the parser is unsure about |

---

## Contract 2: Component Extraction

**Used by:** `pipelines/parsing/parse_components.py`
**Prompt:** `prompts/component_extraction.md`
**Example:** `samples/expected-outputs/component_extraction_example.json`

### Top-Level Shape

```json
{
  "components": [],
  "system_components": [],
  "system_colours": [],
  "system_profiles": [],
  "warnings": [],
  "ignored_content_notes": []
}
```

### Component Record Shape

```json
{
  "source_document_id": "uuid-or-null",
  "source_chunk_id": "uuid-or-null",
  "source_page_number": 1,
  "sku": "string-or-null",
  "name": "string",
  "description": "string-or-null",
  "category": "string-or-null",
  "uom": "string-or-null",
  "length_mm": null,
  "width_mm": null,
  "height_mm": null,
  "thickness_mm": null,
  "depth_mm": null,
  "gauge_mm": null,
  "diameter_mm": null,
  "roll_m": null,
  "weight_kg": null,
  "pieces": null,
  "material": "string-or-null",
  "finish": "string-or-null",
  "colour": "string-or-null",
  "profile": "string-or-null",
  "texture": "string-or-null",
  "coverage_m2": null,
  "sort_order": null,
  "extraction_confidence": 0.88,
  "field_sources": [],
  "parser_notes": [],
  "uncertain_fields": []
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Must be present — reject record if absent |
| `sku` | no | As printed in source |
| `uom` | no | Use `uom` not `unit`. e.g. lm, m2, each, roll, sheet, kg |
| All `*_mm` fields | no | Numeric only. Do not convert units. Null if not stated |
| `roll_m` | no | Numeric, metres |
| `weight_kg` | no | Numeric, kilograms |
| `pieces` | no | Integer only |
| `extraction_confidence` | yes | 0.0–1.0 |
| `field_sources` | yes | One entry per extracted non-null field |
| `uncertain_fields` | yes | Array of field names — empty if none |

### System Component Relationship Shape

```json
{
  "staged_system_match": {
    "system_name": "string-or-null",
    "product_code": "string-or-null"
  },
  "component_match": {
    "sku": "string-or-null",
    "name": "string"
  },
  "role": "required",
  "notes": "string-or-null",
  "sort_order": null,
  "extraction_confidence": 0.80,
  "source_page_number": null,
  "source_chunk_id": "uuid-or-null"
}
```

Valid `role` values:
`required`, `optional`, `accessory`, `primary_cladding`, `decking_board`, `trim`, `starter`, `corner`, `clip`, `fastener`, `sealant`, `adhesive`, `other`

### System Colour Shape

```json
{
  "system_match": {
    "system_name": "string-or-null",
    "product_code": "string-or-null"
  },
  "colour_name": "string",
  "sku": "string-or-null",
  "image_url": null,
  "is_stocked": null,
  "sort_order": null,
  "source_page_number": null,
  "source_chunk_id": "uuid-or-null",
  "extraction_confidence": 0.90
}
```

### System Profile Shape

```json
{
  "system_match": {
    "system_name": "string-or-null",
    "product_code": "string-or-null"
  },
  "name": "string-or-null",
  "product_code": "string-or-null",
  "dimensions": "string-or-null",
  "length_m": null,
  "sheet_format": "string-or-null",
  "sort_order": null,
  "source_page_number": null,
  "source_chunk_id": "uuid-or-null",
  "extraction_confidence": 0.85
}
```

---

## Contract 3: Verification Seed

**Used by:** `pipelines/verification/prepare_field_verifications.py`
**Example:** `samples/expected-outputs/verification_seed_example.json`

This contract defines how parser field_sources data maps to `field_verifications` rows.

### Shape

```json
{
  "field_verifications": [
    {
      "entity_type": "staged_system",
      "entity_temp_key": "string-used-before-db-id-exists",
      "field_name": "name",
      "extracted_value": "string-or-null",
      "verified_value": null,
      "source_document_id": "uuid-or-null",
      "source_page_number": 1,
      "source_chunk_id": "uuid-or-null",
      "status": "pending",
      "confidence": 0.92,
      "notes": null
    }
  ]
}
```

| Field | Notes |
|---|---|
| `entity_type` | `staged_system` \| `staged_component` \| `staged_system_component` \| `staged_system_colour` \| `staged_system_profile` |
| `entity_temp_key` | Temporary key (e.g. `"system_0"`, `"component_3"`) used before the DB row exists. App code replaces with actual UUID after insert. |
| `field_name` | Exact column name on the staged table |
| `extracted_value` | Always stored as string regardless of original type |
| `verified_value` | Always `null` at seeding time — set by human reviewer |
| `status` | Always `"pending"` at seeding time |
| `confidence` | From `field_sources[].confidence` |

### entity_temp_key Convention

```
systems:     "system_0", "system_1", ...
components:  "component_0", "component_1", ...
colours:     "colour_0", "colour_1", ...
profiles:    "profile_0", "profile_1", ...
```

After all staged rows are inserted into Supabase, app code resolves temp keys to actual UUIDs and writes the final `field_verifications` rows.

---

## Contract Validation Rules

Parser modules (`parse_systems.py`, `parse_components.py`) must validate AI output against these contracts before writing to Supabase:

1. Reject any record missing a required `name` field.
2. Reject any record where a numeric field contains a non-numeric value.
3. Reject any record where `extraction_confidence` is absent or outside 0.0–1.0.
4. Strip any field not in the contract before inserting — do not pass unknown fields to Supabase.
5. If the AI returns prose instead of JSON, log the failure to `extraction_runs.error_message` and set status to `failed`.
6. Warn (do not reject) if `field_sources` is empty — the record can still be created but will be flagged low-confidence.

See `pipelines/parsing/README.md` for implementation guidance.
