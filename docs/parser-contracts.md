# Parser Contracts

This document defines the strict JSON output contracts for all AI parser stages in BuildQuote Data Studio, the classification rules the parser must follow, and the planning context for future parser implementation.

Parser output is AI-suggested data. All output must be treated as unverified until a human reviewer approves each field via the verification UI.

---

## 1. Parser Purpose

The parser turns manufacturer PDFs, product guides, and install guides into **staged catalogue records** for human review. It does not write directly to production tables.

The pipeline is:

```
Source document (PDF)
  → extraction run
  → document_chunks (text/table evidence)
  → staged_* tables (AI-drafted, unverified)
  → human verification UI
  → publish_batches → production tables
```

The parser consumes document chunks created during an extraction run and produces staged catalogue candidates plus field evidence. Everything after that is a human or export concern.

---

## 2. Core Rules for All Parser Output

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

## 3. Classification Rules

This is the most important section. Getting this wrong creates schema pollution that is hard to clean up.

### 3.1 What belongs in `staged_system_profiles`

System profiles are the **main sellable dimensional variants or options** of a system — the primary product that gets priced and quantified in a BuildQuote.

Examples across categories:

| Category | System | Profile examples |
|---|---|---|
| Decking | NewTechWood Avenue Decking | 5400×138×29mm board, 2900×138×29mm board |
| Cladding | James Hardie Linea | Linea 180, Linea 300 |
| Doors | Corinthian Doorzilla | 2040×820×35mm, 2040×920×35mm, 2340×920×40mm |
| Climate wrap | Enviroseal ProctorWrap | 2700mm wide 50m roll, 1350mm wide 50m roll |
| Underlay | Acoustx Acoustic Underlay | 5mm × 15m² roll, 10mm × 10m² roll |
| Membrane | Ardex Waterproofing | 1.5mm sheet, 2mm sheet |
| Insulation | Bradford Gold | R2.5 90mm batts, R3.5 140mm batts |
| Panels | Equitone Tectiva | 2530×1280×8mm, 3050×1280×8mm |

A profile is the **primary sellable unit of the system** — the thing a builder orders by the lineal metre, sheet, roll, or piece.

### 3.2 What belongs in `staged_components`

Components are **supporting parts, accessories, fixings, trims, and similar items** that accompany a system. They are components, not profile variants.

Always put in components — never in profiles:

- Edge boards, fascia boards, bullnose boards
- Trims, corner trims, J-trims, starter trims, end caps
- Clips, hidden fix clips, TC28 clips, joist clips
- Screws, bolts, fixings, fasteners, nails
- Adhesives, sealants, tapes, joint compounds
- Flashings, membranes where they are accessories to the main product
- Brackets, packers, shims, spacers
- Door frames, jambs, hinges, thresholds, seals
- Cleaning and maintenance products
- Installation accessories of any kind

**Rule:** If the item is an accessory/part that supports the installation or finishing of the system, it is a component.

### 3.3 The classification test

Ask: "Is this the thing a builder quantifies and orders as the primary product?"

- Yes → `staged_system_profiles`
- No, it supports or accompanies the primary product → `staged_components`

**Do not create fake profiles for accessories.** Do not put fascia boards, edge boards, or trims into profiles unless the manufacturer explicitly presents them as a primary board/panel variant of the system — not merely as an optional add-on.

### 3.4 Many categories, one model

This model is not decking/cladding-only. The same entity structure applies to all building product categories. `system_profiles` means the main sellable dimensional variants of whatever the system is, across any category.

---

## 4. Quantity and Pack Rules

### 4.1 UOM vs manufacturer pack size — these are different things

**`uom`** is the sell/request unit used for quoting. It describes how a builder or supplier would typically request or quote the item:

> `ea`, `piece`, `length`, `lm`, `m2`, `sheet`, `roll`, `box`, `carton`, `ream`, `bale`, `kg`

**Manufacturer pack size** is a catalogue or logistics value — the quantity in a full manufacturer pack. It does not imply that the item must be ordered in that quantity. Suppliers frequently sell partial packs or trade quantities.

Do not conflate the two. A catalogue listing "Pack size: 120" for a clip does not mean `uom = "pack"` or that builders order 120 at a time. It means the manufacturer distributes 120 per full pack.

### 4.2 Pack fields

| Field | Meaning | Example |
|---|---|---|
| `uom` | How the item is sold/quoted | `"ea"`, `"roll"`, `"box"` |
| `pack_format` | Physical packaging type | `"Box"`, `"Roll"`, `"Bag"`, `"Carton"` |
| `supplier_pack_qty` | Units in one manufacturer/supplier pack | `120` |
| `supplier_pack_uom` | Name of the unit inside the pack | `"pieces"`, `"screws"`, `"clips"` |
| `supplier_pack_note` | Free-text note about pack constraint | `"Manufacturer full pack; supplier may sell partial"` |

### 4.3 Examples

**"Pack size: 120" for clips:**
```json
{
  "uom": "ea",
  "pack_format": null,
  "supplier_pack_qty": 120,
  "supplier_pack_uom": "pieces",
  "supplier_pack_note": "Manufacturer full pack size; supplier may sell partial packs"
}
```

**"Box of 25 screws" — sold/quoted as a box:**
```json
{
  "uom": "box",
  "pack_format": "Box",
  "supplier_pack_qty": 25,
  "supplier_pack_uom": "screws",
  "supplier_pack_note": null
}
```

**"Roll 30m":**
```json
{
  "uom": "roll",
  "roll_m": 30,
  "pack_format": "Roll",
  "supplier_pack_qty": null,
  "supplier_pack_uom": null,
  "supplier_pack_note": null
}
```

**"15m² roll (minimum 2 roll order)":**
```json
{
  "uom": "roll",
  "pack_format": "Roll",
  "supplier_pack_qty": null,
  "supplier_pack_uom": null,
  "supplier_pack_note": "minimum 2 roll order"
}
```

### 4.4 Rules

- **Never use `supplier_pack_qty` as the builder/customer RFQ quantity.** RFQ quantity is always user-supplied at quoting time.
- **Never set `uom` to a pack size.** `uom` reflects the sell/quote unit, not the manufacturer logistics unit.
- If the source only states a pack size with no indication of sell unit, use `supplier_pack_qty` and flag `uom` as uncertain in `uncertain_fields`.
- `pieces` is for the true product piece count of the item itself — not for supplier pack sizes.

---

## 5. Dimension Normalization Rules

### 5.1 Units

| Field | Unit | Notes |
|---|---|---|
| `length_mm` | millimetres | Primary length for boards, panels, sheets |
| `width_mm` | millimetres | Width |
| `height_mm` | millimetres | Use only when the source clearly labels the axis as height — e.g. door height, panel height. Do not use for board/sheet thickness. |
| `depth_mm` | millimetres | Use where depth is explicitly labelled as a distinct axis |
| `thickness_mm` | millimetres | Board, sheet, panel, or cladding thickness — the thin third dimension of flat products |
| `gauge_mm` | millimetres | Metal gauge |
| `diameter_mm` | millimetres | Pipe, rod, screw shank |
| `roll_m` | metres | Roll length |
| `length_m` | metres | Primary length in metres where schema expects it |
| `weight_kg` | kilograms | Item weight |
| `weight_g` | grams | Item weight where grams are more appropriate |
| `volume_ml` | millilitres | Adhesive/sealant cartridge volume |
| `pieces` | integer | True product piece count of the item itself — not supplier pack size |

- Convert to mm when stated in cm or inches. Record the conversion in `parser_notes`.
- Do not convert mm to m or vice versa silently — use the matching field.
- Keep the original `dimensions` text field as well. Do not discard raw dimension strings.
- If uncertain about which mm field to use, use `dimensions` and `parser_notes` and mark the numeric field as null.

### 5.2 Parsing examples

| Source text | Parser output |
|---|---|
| `"5400 x 138 x 29 mm board"` | `length_mm=5400, width_mm=138, thickness_mm=29, dimensions="5400 x 138 x 29 mm"` |
| `"4.88 m length"` | `length_m=4.88, length_mm=4880, dimensions="4.88 m length"` |
| `"30 m roll"` | `roll_m=30, dimensions="30 m roll"` |
| `"8g screw"` | `gauge_mm=null, dimensions="8g", parser_notes=["gauge 8 — no mm equivalent extracted"]` |
| `"300 ml adhesive cartridge"` | `volume_ml=300, dimensions="300 ml"` |
| `"Pack of 100"` | `pack_format="Pack", supplier_pack_qty=100, supplier_pack_uom=null, parser_notes=["item type in pack not determinable from source — add supplier_pack_uom manually"]` |
| `"2040 x 820 x 35 mm door"` | `height_mm=2040, width_mm=820, thickness_mm=35, dimensions="2040 x 820 x 35 mm"` |
| `"10mm thick, 2530 x 1280mm sheet"` | `thickness_mm=10, length_mm=2530, width_mm=1280, dimensions="10mm thick, 2530 x 1280mm"` |

---

## 6. BAL / Compliance Rules

- Use `bal_rating`, not `fire_rating`. The field `fire_rating` is deprecated.
- Put **profile-specific** BAL ratings on `staged_system_profiles.bal_rating`.
- Put **system-wide** BAL ratings on `staged_systems.bal_rating` only when the document clearly states it applies to the whole system regardless of profile option.
- Do not invent BAL ratings. If the document does not state one, use `null`.
- Record the source page/chunk for any BAL rating extracted.
- If the document states different BAL ratings for different profiles, extract each to the relevant profile record.

---

## 7. Colour and SKU Rules

- Colour, finish, and texture options belong in `staged_system_colours`.
- Do not create duplicate components or profiles for each colour option.
- If a colour changes the SKU by a suffix (e.g. `-ANT` for Antique), record that in the colour record.
- If a colour has a fully different SKU, record the full SKU override in the colour record.
- If the catalogue lists separate component SKUs per colour (e.g. distinct clips per colour), those can be separate component records — but flag this in `parser_notes` for reviewer confirmation.

---

## 8. Evidence Requirement

Every extracted field should ideally be traceable to:

- Source document (`source_document_id`)
- Page number (`source_page_number`)
- Chunk id (`source_chunk_id`)
- Raw text snippet (`extracted_value` in field_sources)
- Confidence score (`confidence`)

The parser must:
- Not silently discard evidence when the confidence is low — instead, record the low-confidence value and flag it.
- Not overwrite a previously extracted value without creating an audit record.
- Preserve raw extraction evidence in `field_sources` even for fields that seem obvious.

---

## 9. Correction and Audit Rule

Human corrections must use audit records, not silent overwrites.

- Raw extracted values are preserved in `field_verifications.extracted_value` at all times.
- Corrected/resolved values go to `field_verifications.verified_value`.
- Only verified and approved values are used in production export.
- If a field is not verified or confidently extracted, it must not be published.
- The parser must never update a previously verified field directly — corrections go through the verification UI.

---

## 10. Contract 1: System Extraction

**Used by:** `pipelines/parsing/parse_systems.py` _(planned, not yet created)_
**Prompt:** `prompts/manufacturer_system_extraction.md` _(planned, not yet created)_
**Example:** `samples/expected-outputs/system_extraction_example.json` _(planned, not yet created)_

### Top-Level Shape

```json
{
  "systems": [],
  "warnings": [],
  "ignored_content_notes": []
}
```

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
  "bal_rating": "string-or-null",
  "acoustic_rating": "string-or-null",
  "moisture_resistant": null,
  "structural_grade": "string-or-null",
  "double_sided": null,
  "sheet_format": "string-or-null",
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
| `category` | no | e.g. Decking, Cladding, Doors, Insulation, Membrane |
| `subcategory` | no | e.g. Hidden fix, Exposed fix, Longrun |
| `description` | no | Factual product description only — not marketing prose |
| `bal_rating` | no | System-wide BAL rating only. Profile-specific BAL goes on profile records |
| `acoustic_rating` | no | As stated in document |
| `moisture_resistant` | no | Boolean if explicitly stated |
| `structural_grade` | no | As stated |
| `double_sided` | no | Boolean if stated |
| `sheet_format` | no | e.g. "Custom length", "Fixed 6m" |
| `install_guide_url` | no | Only if a URL is explicitly present in the source |
| `tech_data_url` | no | Only if a URL is explicitly present in the source |
| `extraction_confidence` | yes | Overall record confidence 0.0–1.0 |
| `field_sources` | yes | One entry per extracted non-null field |
| `parser_notes` | yes | Array of strings — empty if none |
| `uncertain_fields` | yes | Array of field names the parser is unsure about |

Note: `fire_rating` is **deprecated** — use `bal_rating`.

---

## 11. Contract 2: Component Extraction

**Used by:** `pipelines/parsing/parse_components.py` _(planned, not yet created)_
**Prompt:** `prompts/component_extraction.md` _(planned, not yet created)_
**Example:** `samples/expected-outputs/component_extraction_example.json` _(planned, not yet created)_

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
  "dimensions": "string-or-null",
  "length_mm": null,
  "width_mm": null,
  "height_mm": null,
  "depth_mm": null,
  "thickness_mm": null,
  "gauge_mm": null,
  "diameter_mm": null,
  "roll_m": null,
  "weight_kg": null,
  "weight_g": null,
  "pieces": null,
  "volume_ml": null,
  "pack_format": "string-or-null",
  "supplier_pack_qty": null,
  "supplier_pack_uom": "string-or-null",
  "supplier_pack_note": "string-or-null",
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
| `uom` | no | Sell/quote unit — use `uom` not `unit`. e.g. `ea`, `piece`, `lm`, `m2`, `roll`, `sheet`, `box`, `kg`. Do not set to a pack size. |
| `dimensions` | no | Raw dimension string — preserve original text |
| All `*_mm` fields | no | Numeric only. Null if not stated. See dimension rules |
| `roll_m` | no | Numeric, metres |
| `weight_kg` | no | Numeric, kilograms |
| `weight_g` | no | Numeric, grams — use for small items where grams is more natural |
| `pieces` | no | True product piece count of the item itself — not supplier pack size |
| `volume_ml` | no | Numeric, millilitres — for adhesives, sealants, liquid products |
| `pack_format` | no | Physical packaging type, e.g. "Box", "Roll", "Bag", "Tube", "Carton" |
| `supplier_pack_qty` | no | Units per manufacturer/supplier pack — not the customer order quantity |
| `supplier_pack_uom` | no | Unit name for items inside the pack, e.g. "screws", "clips", "pieces" |
| `supplier_pack_note` | no | Free-text note about pack constraint or sell minimum |
| `extraction_confidence` | yes | 0.0–1.0 |
| `field_sources` | yes | One entry per extracted non-null field |
| `uncertain_fields` | yes | Array of field names — empty if none |

### System Profile Shape

Profiles are the main dimensional variants of a system. See Classification Rules (section 3) before assigning anything here.

```json
{
  "system_match": {
    "system_name": "string-or-null",
    "product_code": "string-or-null"
  },
  "name": "string-or-null",
  "profile_name": "string-or-null",
  "product_code": "string-or-null",
  "dimensions": "string-or-null",
  "length_m": null,
  "length_mm": null,
  "width_mm": null,
  "height_mm": null,
  "depth_mm": null,
  "thickness_mm": null,
  "gauge_mm": null,
  "diameter_mm": null,
  "roll_m": null,
  "weight_kg": null,
  "weight_g": null,
  "pieces": null,
  "volume_ml": null,
  "pack_format": "string-or-null",
  "supplier_pack_qty": null,
  "supplier_pack_uom": "string-or-null",
  "supplier_pack_note": "string-or-null",
  "bal_rating": "string-or-null",
  "sort_order": null,
  "source_page_number": null,
  "source_chunk_id": "uuid-or-null",
  "extraction_confidence": 0.85,
  "field_sources": [],
  "parser_notes": [],
  "uncertain_fields": []
}
```

Field meanings:
- `name` — full descriptive profile name as written in the source (e.g. "Avenue Grooved Board 5400mm"). Output this where the staged schema column exists.
- `profile_name` — short profile/variant label (e.g. "Avenue 5400" or "Linea 180"). Intended as a compact identifier.
- Both fields serve different purposes. Output both where possible. Do not silently map one to the other — the insertion layer is responsible for resolving which column each value writes to.

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

Valid `role` values (DB-enforced):
`required`, `optional`, `accessory`

Do not use detailed descriptive role values like `clip`, `trim`, `fastener`, `sealant`, `adhesive`, or `other` — the DB schema does not support them and inserts will fail. Instead:
- Use `component.category` to describe the item type (e.g. `"Fixings"`, `"Sealants"`, `"Trims"`).
- Use the link `notes` field for any specific installation or relationship note.

### System Colour Shape

```json
{
  "system_match": {
    "system_name": "string-or-null",
    "product_code": "string-or-null"
  },
  "colour_name": "string",
  "sku": "string-or-null",
  "sku_suffix": "string-or-null",
  "image_url": null,
  "is_stocked": null,
  "sort_order": null,
  "source_page_number": null,
  "source_chunk_id": "uuid-or-null",
  "extraction_confidence": 0.90
}
```

---

## 12. Contract 3: Verification Seed

**Used by:** `pipelines/verification/prepare_field_verifications.py` _(planned, not yet created)_
**Example:** `samples/expected-outputs/verification_seed_example.json` _(planned, not yet created)_

This contract defines how parser `field_sources` data maps to `field_verifications` rows.

### Shape

```json
{
  "field_verifications": [
    {
      "entity_type": "staged_system",
      "entity_temp_key": "system_0",
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
| `entity_temp_key` | Temporary key used before the DB row exists. App code replaces with actual UUID after insert |
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
links:       "link_0", "link_1", ...
```

After all staged rows are inserted into Supabase, app code resolves temp keys to actual UUIDs and writes the final `field_verifications` rows.

---

## 13. Output Shape Examples

### Example A — System

NewTechWood Avenue Decking system card:

```json
{
  "source_document_id": null,
  "source_chunk_id": null,
  "source_page_number": 2,
  "name": "Avenue Decking",
  "product_code": "NTW-AVE",
  "slug": null,
  "category": "Decking",
  "subcategory": "Composite",
  "description": "Co-extrusion composite decking with solid core and grooved/smooth face options.",
  "bal_rating": null,
  "extraction_confidence": 0.91,
  "field_sources": [
    { "field_name": "name", "extracted_value": "Avenue Decking", "source_page_number": 2, "source_chunk_id": null, "confidence": 0.96 },
    { "field_name": "category", "extracted_value": "Decking", "source_page_number": 2, "source_chunk_id": null, "confidence": 0.88 }
  ],
  "parser_notes": [],
  "uncertain_fields": []
}
```

### Example B — System Profile

NewTechWood Avenue 5400mm board variant:

```json
{
  "system_match": { "system_name": "Avenue Decking", "product_code": "NTW-AVE" },
  "name": "Avenue Grooved Board 5400mm",
  "profile_name": "Avenue 5400",
  "product_code": "NTW-AVE-5400-GR",
  "dimensions": "5400 x 138 x 29 mm",
  "length_mm": 5400,
  "width_mm": 138,
  "height_mm": null,
  "depth_mm": null,
  "thickness_mm": 29,
  "gauge_mm": null,
  "diameter_mm": null,
  "roll_m": null,
  "weight_kg": null,
  "weight_g": null,
  "pieces": null,
  "volume_ml": null,
  "pack_format": "Bundle",
  "supplier_pack_qty": 10,
  "supplier_pack_uom": "boards",
  "supplier_pack_note": null,
  "bal_rating": "BAL-12.5",
  "sort_order": 1,
  "source_page_number": 4,
  "source_chunk_id": null,
  "extraction_confidence": 0.89,
  "field_sources": [
    { "field_name": "profile_name", "extracted_value": "Avenue 5400", "source_page_number": 4, "source_chunk_id": null, "confidence": 0.91 },
    { "field_name": "length_mm", "extracted_value": "5400", "source_page_number": 4, "source_chunk_id": null, "confidence": 0.95 },
    { "field_name": "bal_rating", "extracted_value": "BAL-12.5", "source_page_number": 4, "source_chunk_id": null, "confidence": 0.88 }
  ],
  "parser_notes": [],
  "uncertain_fields": []
}
```

### Example C — Profile for a different category

James Hardie Linea 180 cladding profile with BAL:

```json
{
  "system_match": { "system_name": "Linea Weatherboard", "product_code": null },
  "name": "Linea 180 Weatherboard 3600mm",
  "profile_name": "Linea 180",
  "product_code": "H4040180",
  "dimensions": "3600 x 180 x 11 mm",
  "length_mm": 3600,
  "width_mm": 180,
  "height_mm": null,
  "thickness_mm": 11,
  "gauge_mm": null,
  "diameter_mm": null,
  "roll_m": null,
  "weight_kg": null,
  "pack_format": "Bundle",
  "supplier_pack_qty": 8,
  "supplier_pack_uom": "sheets",
  "supplier_pack_note": null,
  "bal_rating": "BAL-12.5",
  "sort_order": 1,
  "source_page_number": 3,
  "source_chunk_id": null,
  "extraction_confidence": 0.93,
  "field_sources": [],
  "parser_notes": [],
  "uncertain_fields": []
}
```

### Example D — Component / Accessory

TC28 hidden fix clip — this is a component, not a profile:

```json
{
  "source_document_id": null,
  "source_chunk_id": null,
  "source_page_number": 8,
  "sku": "TC28-SS304",
  "name": "TC28 Hidden Fix Clip",
  "description": "Stainless steel 304 hidden fix clip for composite decking installation.",
  "category": "Fixings",
  "uom": "ea",
  "dimensions": null,
  "length_mm": null,
  "width_mm": null,
  "height_mm": null,
  "gauge_mm": null,
  "diameter_mm": null,
  "weight_g": 4.2,
  "pack_format": "Box",
  "supplier_pack_qty": 200,
  "supplier_pack_uom": "clips",
  "supplier_pack_note": "Manufacturer full box; supplier may sell partial packs",
  "pieces": null,
  "volume_ml": null,
  "sort_order": 1,
  "extraction_confidence": 0.92,
  "field_sources": [],
  "parser_notes": [],
  "uncertain_fields": []
}
```

### Example E — Colour

```json
{
  "system_match": { "system_name": "Avenue Decking", "product_code": "NTW-AVE" },
  "colour_name": "Antique",
  "sku": null,
  "sku_suffix": "-ANT",
  "is_stocked": true,
  "sort_order": 1,
  "source_page_number": 5,
  "source_chunk_id": null,
  "extraction_confidence": 0.87
}
```

### Example F — System–Component Link

```json
{
  "staged_system_match": { "system_name": "Avenue Decking", "product_code": "NTW-AVE" },
  "component_match": { "sku": "TC28-SS304", "name": "TC28 Hidden Fix Clip" },
  "role": "accessory",
  "notes": "Hidden fix clip — 1 per board end per joist. Category: Fixings.",
  "sort_order": 1,
  "extraction_confidence": 0.83,
  "source_page_number": 9,
  "source_chunk_id": null
}
```

---

## 14. Parser Validation Checklist

Use this checklist before accepting any parser output for staging:

**Classification**
- [ ] Are systems broad product cards, not individual size/colour variants?
- [ ] Are the main sellable dimensional variants in `system_profiles`, not in `system_components`?
- [ ] Are all accessories, fixings, trims, clips, adhesives, tapes, and frames in `components`?
- [ ] Are there any fascia/edge boards incorrectly placed in `system_profiles`? Move them to `components`.

**Dimensions**
- [ ] Are all `*_mm` fields numeric (not strings like "138mm")?
- [ ] Are metre values in `roll_m` or `length_m`, not in `*_mm` fields?
- [ ] Is the raw `dimensions` string preserved alongside parsed fields?
- [ ] Are uncertain dimension parses flagged in `uncertain_fields` rather than silently nulled?

**Pack and quantity**
- [ ] Is `supplier_pack_qty` describing the supplier pack, not a builder order quantity?
- [ ] Is `uom` used (not `unit`)?

**BAL and compliance**
- [ ] Is `bal_rating` used (not `fire_rating`)?
- [ ] Profile-specific BAL ratings are on the profile record, not the system record?

**Evidence**
- [ ] Does every record have `source_page_number` where available?
- [ ] Does every non-null field have an entry in `field_sources`?
- [ ] Are uncertain fields listed in `uncertain_fields` rather than guessed?

**General**
- [ ] Are raw extracted values preserved (not overwritten by cleaned versions)?
- [ ] Are records with no `name` rejected, not inserted as blank rows?
- [ ] Are numeric fields using numeric types, not strings?

---

## 15. Contract Validation Rules

Parser modules (`parse_systems.py`, `parse_components.py`) _(planned, not yet created)_ must validate AI output against these contracts before writing to Supabase:

1. Reject any record missing a required `name` field.
2. Reject any record where a numeric field contains a non-numeric value.
3. Reject any record where `extraction_confidence` is absent or outside 0.0–1.0.
4. Strip any field not in the contract before inserting — do not pass unknown fields to Supabase.
5. If the AI returns prose instead of JSON, log the failure to `extraction_runs.error_message` and set status to `failed`.
6. Warn (do not reject) if `field_sources` is empty — the record can still be created but will be flagged low-confidence.
7. If `bal_rating` is present on a profile, verify it also appears in `field_sources`. A BAL rating without evidence is suspect.
8. If any `supplier_pack_qty` > 0 but `supplier_pack_uom` is null, add to `uncertain_fields`.

See `pipelines/parsing/README.md` _(planned, not yet created)_ for implementation guidance.

---

## 16. Open Questions / Decisions Needed

These are unresolved at time of writing. Do not implement based on assumption — raise before resolving.

| # | Question | Impact |
|---|---|---|
| 1 | Should `staged_components` keep `material`, `finish`, `colour`, `profile`, `texture`, `coverage_m2` if production schema does not currently map them? | Could be staging-only enrichment or could need a production schema addition |
| 2 | Do DB triggers need to enforce the correction audit trail (i.e. prevent direct updates to extracted_value), or is this enforced only at the app layer? | Determines whether schema migration is needed for audit enforcement |
| 3 | Should the parser output `field_verifications` rows immediately alongside staged rows, or output staged rows first and generate verifications in a separate pipeline step? | Affects pipeline architecture and error recovery |
| 4 | Do colour/profile SKU variants need a richer join model later — e.g. a `staged_profile_colours` table linking profiles to colour options? | Current model puts colours at system level only |
| 5 | Should system-wide extra fields like `acoustic_rating`, `moisture_resistant`, `structural_grade`, `double_sided`, `sheet_format` be added to the production target schema, or remain staging-only? | Production schema migration needed if these are to be published |
| 6 | Is `profile_name` the canonical field going forward, or does `name` persist on `staged_system_profiles`? Need to confirm the migration and ensure parser uses the correct column. | Parser must write to the right column |
| 7 | For multi-profile systems where one profile has a BAL rating and another does not — what should the system-level `bal_rating` be? Highest? Null? A range string? | Affects extraction rules and UI display |
| 8 | Should the parser attempt to link components to specific profiles (not just systems), or always link at the system level? The current schema links via `staged_system_id` only. | Would need a schema change to support profile-level component links |
