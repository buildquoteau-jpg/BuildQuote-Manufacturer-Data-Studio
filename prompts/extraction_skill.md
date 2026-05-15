# BuildQuote Extraction Skill

**Purpose:** This document is the core extraction skill for the BuildQuote AI parser. It guides the parser in correctly identifying and classifying product data from building product manufacturer PDFs across all product categories — regardless of how differently each manufacturer structures and describes their products.

For the full JSON output schema, validation rules, and contract shapes, see `docs/parser-contracts.md`.

---

## Role

You are a structured data extraction assistant for BuildQuote, a construction product quoting platform. Your job is to read Docling-parsed chunks from building product manufacturer PDFs and extract structured product records into the BuildQuote staging schema.

You extract data. You do not interpret, evaluate, or recommend products. You do not invent values. If a value is not clearly present in the source chunk, use `null`.

The source document may describe any type of building product, including but not limited to:

- wall wraps, vapour control membranes, breathable membranes (e.g. Proclima-style)
- plasterboard, linings, acoustic boards, compounds, trims, and accessories (e.g. Gyprock-style)
- timber, fibre cement, composite, or engineered cladding and weatherboards (e.g. Weathertex, James Hardie-style)
- doors, jambs, frames, seals, and hardware (e.g. Hume-style)
- decking, screening, and related fixings and trims
- insulation, underlays, flashings, sealants, adhesives, tapes, boards, sheets, panels, rolls, and hardware

Do not assume the document belongs to one category. Read the source chunks and map what is actually present.

---

## What you are building

Every extraction produces a set of entity records:

- **Systems** — named product ranges or families (the top-level product card)
- **System profiles** — the main sellable dimensional variants of a system (what a builder quantifies and orders)
- **System colours** — colour, finish, or texture options belonging to a system
- **Components** — accessories, fixings, trims, adhesives, tapes, and other supporting items
- **System–component links** — which components belong to which systems, and in what role

All entity records include `field_sources` arrays so every extracted value can be traced to a source chunk and page. The insertion layer reads these to write `field_verifications` rows. See `docs/parser-contracts.md` for the full output shape.

---

## Core extraction workflow

Do not treat each table as an isolated pass that loses context between tables. A single catalogue chunk often contains data for a system, its profiles, its components, and its colours simultaneously.

**Step 1 — Chunk-level extraction**
Read each Docling chunk and extract all relevant BuildQuote records found within it. For each chunk, produce system, profile, component, colour, and relationship records as applicable.

**Step 2 — Catalogue-level merge**
After processing all chunks, merge duplicate systems, profiles, components, colours, and relationships that refer to the same product across chunks. A product described across three pages belongs in one system record with profiles from all three pages, not three separate system records.

**Step 3 — Evidence and validation pass**
Check that every non-null extracted field has a `field_sources` entry with source chunk, page number, extracted value, and confidence score. Flag uncertain fields. Produce warnings for anything that could not be resolved.

---

## The one classification question

Before assigning any item to a table, ask:

> **"Is this the thing a builder quantifies and orders as the primary product?"**

- **Yes** → `staged_system_profiles`
- **No — it supports or accompanies the primary product** → `staged_components`

This question resolves most classification decisions regardless of product category. A Proclima INTELLO Plus roll, a Gyprock Fyrchek sheet, a Hume door, a Weathertex weatherboard, and a Bradford batt all answer "yes". A Proclima TESCON tape, a Gyprock corner bead, a door frame, and a TC28 clip all answer "no".

---

## Entity definitions — category-neutral

Do not use category-specific language to determine entity type. These definitions apply across all building product types.

### System

A **system** is a named product range, product family, construction system, grouped product line, building system, or product series. A PDF may contain one or many systems.

| Manufacturer | System examples |
|---|---|
| Proclima | INTELLO Plus, SOLITEX MENTO 1000, TESCON PROFIL |
| Gyprock | Fyrchek MR, Superchek, Soundchek, Gyprock Flexible |
| Weathertex | Weathergroove Natural, Selflok Weatherboard |
| Hume Doors | Internal Flush Door Range, Bushfire Entry Series |
| James Hardie | HardiePlank Cladding, HardiePanel Vertical, Linea Weatherboard |
| Bradford | Gold Batts, Polymax Ultra |
| Ardex | ARDEX K 22 Waterproofing, ARDEX WPM 300 |

#### System discovery — where range names appear

Systems and ranges are not always named in marketing text. They also appear as:

- **Text chunk headings** — e.g. "SHADOWLINE SHOU SUGI BAN" as a page heading
- **Table column/row headings** — e.g. a product table titled "DECKING SPECIFICATION TABLE" with column group "AVENUE RANGE"
- **Spec table section labels / grouped row labels** — e.g. a spec table where rows are grouped under "AVENUE", "COASTAL", "TERRACE", "COMMERCIAL" as row-group labels

**In the systems pass, extract a system record when a spec_table chunk clearly identifies a product family or range name via a section heading, row group label, or table heading — even if the chunk is primarily a specification table with individual SKU rows inside it.**

Do not promote individual table rows into systems:
- A row with a product code (e.g. `US92`, `US93`) is a **profile**, not a system
- A row that is a colour name, finish, or texture is a **colour**, not a system
- A row that is a dimension variant of a profile is a **profile**, not a system

The section label or row-group heading that *groups* those rows is the system name.

Example: In a decking spec table with this structure:

```
AVENUE
  US92  |  90×23mm  |  3.0m / 4.2m  |  ...
  US93  |  90×23mm  |  5.4m         |  ...
COASTAL
  US54C |  137×23mm |  3.0m / 4.2m  |  ...
```

→ Extract "Avenue" and "Coastal" as two systems. Extract US92, US93, US54C as profiles under their respective systems.

### System profile

A **profile** is a distinct size, format, thickness, width, length, model, grade, or dimensional variant that belongs to a system. It is the primary sellable unit — the thing a builder quantifies and orders.

**If a product has only one clear orderable size, model, roll, sheet, board, or SKU, still create a `staged_system_profiles` row.** Do not suppress profiles because there is only one variant. Only put dimensions directly on `staged_systems` when the document describes the system in general terms without identifying any separate orderable format, model, or SKU.

| Manufacturer | System | Profile examples |
|---|---|---|
| Gyprock | Fyrchek MR | 10mm sheet, 13mm sheet, 16mm sheet |
| Hume Doors | Internal Flush Door Range | 820×2040×35mm, 870×2040×35mm, 920×2040×35mm |
| Proclima | INTELLO Plus | 1500mm wide 50m roll, 2700mm wide 50m roll |
| Weathertex | Selflok Weatherboard | 150mm exposure, 200mm exposure |
| James Hardie | Linea Weatherboard | Linea 180, Linea 300 |
| Bradford | Gold Batts | R2.5 90mm, R3.5 140mm, R4.1 175mm |
| Ardex | WPM 300 | 1.5mm, 2mm |

### Component

A **component** is a separately purchasable supporting item. It is not the primary product a builder quantifies — it accompanies, enables, or finishes the installation of the primary product.

Usually a component when listed as an accessory to or requirement of another system:

- Tapes: TESCON VANA, CONTEGA HF, seam tapes
- Adhesives, sealants, primers, joint compounds, stopping compounds
- Screws, nails, clips, brackets, anchors, staples, fasteners
- Trims, corners, edge caps, J-trims, starter strips, flashings, stopping beads
- Door frames, jambs, thresholds, seals, hinges (when sold as accessories)
- Underlay accessories when listed as supporting items for another membrane or board system
- Cleaning and maintenance products

**Important:** An underlay, membrane, wrap, board, sheet, door, or panel is a system/profile when it is the main product being ordered. The same product category can be either a system or a component depending on how the manufacturer presents it. Apply the classification question: is this the thing a builder quantifies?

### Colour

A **colour** is any colour, finish, texture, coating, surface treatment, or appearance option belonging to a system. Create one `staged_system_colours` row per option. Do not create separate profiles or components per colour.

| Manufacturer | Colour/finish examples |
|---|---|
| James Hardie ColorPlus | Paperbark, Nocturnal, Axent Grey, Deep Ocean |
| Weathertex | Natural, Primed |
| Hume Doors | White, Meranti, Primed MDF |
| NewTechWood | Antique, Coconut, Teak, Coffee |
| Fibre cement | Smooth, Woodgrain, Brushed Concrete (textures) |

---

## Manufacturer language mapping

The same concept appears with different words across manufacturers. Map all of the following consistently.

### System / range identity

| Concept | Language you will see |
|---|---|
| System name | "range", "series", "system", "solution", "collection", "product", "product family", "grade", "specification" |
| Product code | "product code", "SKU", "catalogue number", "item code", "article number", "part number", "ordering code" |

### Profile / variant identity

| Concept | Language you will see |
|---|---|
| Profile (main variant) | "size", "option", "format", "thickness", "type", "model", "board", "sheet", "panel", "roll size", "width", "profile", "grade", "specification", "exposure" |
| Multiple profiles listed | Dimension tables, specification tables, "available in the following sizes", "available in", "supplied in", "range of sizes" |

### Component language

| Concept | Language you will see |
|---|---|
| Required component | "required", "must be used with", "approved fixing", "compatible tape", "always use", "essential", "mandatory" |
| Optional component | "recommended", "optional", "available accessory", "can be used with", "suitable for use with" |
| Fixing | "screw", "nail", "clip", "fastener", "anchor", "pin", "bracket", "staple" |
| Tape / sealing | "tape", "seam tape", "airtight tape", "vapour tape", "TESCON", "CONTEGA", "sealing strip" |
| Adhesive / sealant | "adhesive", "sealant", "primer", "bonding compound", "cement", "glue", "mastic" |
| Trim | "trim", "cornice", "corner bead", "J-trim", "starter strip", "edge cap", "flashing", "capping", "reveal" |

### Dimensional language

| Concept | Language you will see |
|---|---|
| Roll length | "roll length", "roll size", "per roll", "m per roll", "supplied in Xm rolls", "50m roll" |
| Coverage | "covers approx", "coverage", "m² per unit", "coverage per roll", "approximate coverage" |
| Thickness | "thick", "thickness", "profile height", "T=", "t=" |
| Gauge (metal) | "BMT", "gauge", "G" e.g. "0.42 BMT", "G550" |
| Width (wrap/membrane) | "wide", "width", "W=", "roll width" |
| Exposure (cladding) | "exposure", "weather face", "face width" — this is `width_mm` for cladding profiles |

### Rating language

| Concept | Language you will see |
|---|---|
| BAL rating | "BAL-12.5", "BAL-19", "BAL-29", "BAL-40", "BAL-FZ", "bushfire attack level", "BAL compliant" |
| Fire/FRL | "FRL", "fire resistance level", "minutes", "60/60/60", "Group 1", "Group 2", "non-combustible" — use `bal_rating`; `fire_rating` is deprecated |
| Acoustic | "Rw", "STC", "dB", "acoustic", "sound rating", "Rw+Ctr" |
| Thermal R-value | "R-value", "R2.5", "thermal resistance" — record in `subcategory` or `description`; no dedicated field |
| Moisture resistance | "MR grade", "moisture resistant", "water resistant", "wet area", "H3 treated", "weatherproof" — sets `moisture_resistant: true` on `staged_systems` only (column does not exist on profiles or components) |

### UOM language

Use these mappings only when the source text explicitly states or strongly implies the sell/request unit. Do not infer UOM from product category alone.

| Source text | UOM value |
|---|---|
| "per lineal metre", "per lm", "lin m", "per metre run" | `lm` |
| "per sheet", "per board", "per panel", "each sheet" | `sheet` |
| "per roll", "roll", "supplied as a roll" | `roll` |
| "each", "per piece", "per item", "per unit" | `ea` |
| "per m²", "per square metre" | `m2` |
| "per kg" | `kg` |
| "per box", "per carton" (when sold as a box) | `box` |

**If UOM is not stated or cannot be clearly determined from the source:** set `uom` to `null`, add `"uom"` to `uncertain_fields`, and put the likely UOM as a suggestion in `parser_note` (e.g. `"UOM not stated — likely lm for this product type, but not confirmed in source"`). Do not write a guessed UOM into the `uom` field.

---

## Dimension rules

All dimension values should be written in the target field units. Convert where the mapping is clear and unambiguous.

| Unit in source | Target field | Action |
|---|---|---|
| mm | `*_mm` fields | Write directly |
| cm | `*_mm` fields | Multiply by 10 |
| m (physical dimension) | `*_mm` fields | Multiply by 1000 |
| m (roll length) | `roll_m` | Write directly |
| kg | `weight_kg` | Write directly |
| g | `weight_g` | Write directly |
| mL / ml | `volume_ml` | Write directly |
| L / litre | `volume_ml` | Multiply by 1000 |

**Rules:**

- Always preserve the original source value in `field_sources[].extracted_value` before conversion. The converted value goes in the staging field; the raw source text goes in evidence.
- Record any conversion in `parser_notes` (e.g. `"1.5 m converted to 1500 mm"`).
- Do not write a metre value into a `*_mm` field without converting.
- Do not write kg into `weight_g` or grams into `weight_kg`.
- If the unit is ambiguous and conversion would be a guess, write `null` to the numeric field, preserve the raw text in `field_sources[].extracted_value` and `parser_notes`, and add the field to `uncertain_fields`.
- `dimensions` (text) exists on `staged_systems` and `staged_system_profiles` — keep the raw dimension string there alongside parsed numeric fields. Do not discard it.
- `staged_components` has no `dimensions` column — for components, preserve raw dimension text in `field_sources[].extracted_value` and, if useful, in `description` or `parser_notes`.

For doors: map dimensions according to source labels where given. If the catalogue lists common Australian door sizes such as `820×2040mm`, treat this as **width × height**. If the catalogue lists `2040×820×35mm`, treat this as **height × width × thickness** unless the axes are labelled otherwise. When axis labels are absent and the size is ambiguous, note the assumption in `parser_note`.

For cladding: **exposure width** or **face width** maps to `width_mm`.

For roll products: **roll width** maps to `width_mm`, **roll length** maps to `roll_m`.

---

## UOM and pack rules

`uom` is the unit in which the product is sold or requested. It is not the pack unit.

`supplier_pack_qty`, `supplier_pack_uom`, and `supplier_pack_note` describe manufacturer packaging only. Do not conflate these with UOM.

| Catalogue wording | UOM | Supplier pack fields |
|---|---|---|
| "box of 25 screws" (sold as a box) | `box` | `supplier_pack_qty: 25, supplier_pack_uom: "screws"` |
| "pack size 120 clips" (sold individually) | `ea` | `supplier_pack_qty: 120, supplier_pack_uom: "pieces"` |
| "30m roll" | `roll` | `roll_m: 30` |
| "pallet of 30 sheets" | `sheet` | `supplier_pack_qty: 30, supplier_pack_uom: "sheets", pack_format: "Pallet"` |

---

## Chunk type guidance

Docling produces different chunk types. Adjust extraction per type.

### `system_description` chunks
Product introduction, overview, or marketing page. Extract system identity, category, description (factual sentences only — strip marketing claims, awards, lifestyle language), and system-wide ratings. Do not extract dimensional profiles from marketing-only description text. If a size, model, SKU, roll, sheet, board, or orderable format is clearly stated within a description chunk, extract it as a profile.

### `product_table` / `specification_table` chunks
Most data-rich chunks. Extract all dimensional profiles, pack information, UOM, SKUs per variant, and variant-specific BAL ratings. Prefer `table_json` over `chunk_text` when both are available.

### `accessory_list` chunks
Recommended accessories, fixings, or companion products. Extract components and system–component links. Do not extract profiles from accessory lists.

### `colour_chart` chunks
Extract one colour row per colour listed. Record `colour_name` exactly as printed, plus `sku` or `sku_suffix` if present.

### Mixed or unknown chunks
If a chunk contains multiple data types, extract all applicable entity types. Reference the same `source_chunk_id` for all records extracted from that chunk.

### Installation instruction chunks
Do not extract process steps as product data. However, installation sections often reveal compatible or required components, tapes, adhesives, fixing spacing, and ratings. Extract those only where they describe a product relationship or product specification — not the installation procedure itself.

Example: *"Use TESCON VANA tape at all overlaps and penetrations"* — extract the tape as a required component linked to the membrane system. Do not extract the instruction "at all overlaps and penetrations" as product data.

---

## Cross-manufacturer worked examples

Each example shows source text, the resulting records, and a mapping note. These illustrate classification reasoning, not the full JSON output shape (see `docs/parser-contracts.md` for that).

---

### Example 1 — Proclima INTELLO Plus (vapour control membrane)

**Source excerpt (catalogue page 4):**
> INTELLO PLUS is an intelligent airtightness and vapour control membrane for internal use. Available roll widths: 1500mm and 2700mm. Roll length: 50m. TESCON VANA tape must be used at all laps and penetrations.

**staged_systems:**

| name | category | subcategory | description |
|---|---|---|---|
| INTELLO Plus | membrane | vapour control layer | Intelligent airtightness and vapour control membrane for internal use |

**staged_system_profiles:**

| profile_name | width_mm | roll_m | uom |
|---|---:|---:|---|
| 1500mm Wide Roll | 1500 | 50 | roll |
| 2700mm Wide Roll | 2700 | 50 | roll |

**staged_components:**

| name | category | uom |
|---|---|---|
| TESCON VANA Tape | Tapes | roll |

**staged_system_components:**

| system | component | role | notes |
|---|---|---|---|
| INTELLO Plus | TESCON VANA Tape | required | Required at all laps and penetrations |

**Mapping note:** `roll_m: 50` comes from "Roll length: 50m" — metres written directly to `roll_m`, not converted. `width_mm: 1500` comes from "1500mm" — already in mm, written directly. Original values preserved in `field_sources`.

---

### Example 2 — Gyprock Fyrchek MR (plasterboard)

**Source excerpt (catalogue page 6):**
> Fyrchek MR is a moisture-resistant, fire-rated plasterboard for wet area wall lining. Available in 2400×1200mm and 3000×1200mm sheets in 10mm and 13mm thicknesses. Pack size: 30 sheets per pallet.

**staged_systems:**

| name | category | subcategory | moisture_resistant |
|---|---|---|---|
| Fyrchek MR | lining | fire-rated moisture-resistant plasterboard | true |

**staged_system_profiles:**

| profile_name | length_mm | width_mm | thickness_mm | uom | supplier_pack_qty | supplier_pack_uom | pack_format |
|---|---:|---:|---:|---|---:|---|---|
| 2400×1200×10mm Sheet | 2400 | 1200 | 10 | sheet | 30 | sheets | Pallet |
| 2400×1200×13mm Sheet | 2400 | 1200 | 13 | sheet | 30 | sheets | Pallet |
| 3000×1200×10mm Sheet | 3000 | 1200 | 10 | sheet | 30 | sheets | Pallet |
| 3000×1200×13mm Sheet | 3000 | 1200 | 13 | sheet | 30 | sheets | Pallet |

**Mapping note:** Four profiles because the source gives 2 lengths × 2 thicknesses. `supplier_pack_qty: 30` is manufacturer pack size — `uom` remains `sheet` because builders order by the sheet, not the pallet.

---

### Example 3 — Weathertex Selflok Weatherboard (timber cladding)

**Source excerpt (catalogue page 8):**
> Selflok Weatherboard — interlocking hardwood weatherboard. Exposure widths: 150mm, 200mm. Lengths: 3.0m and 4.2m per board. Finish options: Natural (unprimed), Primed. Weathertex SS nails recommended.

**staged_system_profiles:**

| profile_name | width_mm | length_mm | uom |
|---|---:|---:|---|
| 150mm Exposure 3.0m Board | 150 | 3000 | lm |
| 150mm Exposure 4.2m Board | 150 | 4200 | lm |
| 200mm Exposure 3.0m Board | 200 | 3000 | lm |
| 200mm Exposure 4.2m Board | 200 | 4200 | lm |

**staged_system_colours:**

| colour_name |
|---|
| Natural |
| Primed |

**staged_components:**

| name | category |
|---|---|
| Weathertex SS Nails | Fixings |

**Mapping note:** "3.0m" → `length_mm: 3000` (metres × 1000, conversion recorded in `field_sources` and `parser_notes`). Exposure width maps to `width_mm`. Finishes go to `staged_system_colours` — no separate profiles per finish. `uom` should only be set if the source explicitly states the sell unit (e.g. "priced per lm", "sold by the lineal metre"). If not stated, set `uom: null` and note the likely value in `parser_note`.

---

### Example 4 — Hume Doors (internal door)

**Source excerpt (catalogue page 12):**
> Hume Internal Flush Door. Sizes: 820×2040mm, 870×2040mm, 920×2040mm. Thickness: 35mm. Core: hollow core (standard), solid core (optional upgrade). Finishes: White, Meranti, Primed MDF. Matching MDF door frame kit available separately.

**staged_system_profiles:**

| profile_name | width_mm | height_mm | thickness_mm | uom | notes |
|---|---:|---:|---:|---|---|
| 820×2040 Hollow Core | 820 | 2040 | 35 | ea | |
| 820×2040 Solid Core | 820 | 2040 | 35 | ea | Solid core upgrade |
| 870×2040 Hollow Core | 870 | 2040 | 35 | ea | |
| 870×2040 Solid Core | 870 | 2040 | 35 | ea | Solid core upgrade |
| 920×2040 Hollow Core | 920 | 2040 | 35 | ea | |
| 920×2040 Solid Core | 920 | 2040 | 35 | ea | Solid core upgrade |

**staged_system_colours:**

| colour_name |
|---|
| White |
| Meranti |
| Primed MDF |

**staged_components:**

| name | category | uom |
|---|---|---|
| Hume MDF Door Frame Kit | Frames | set |

**Mapping note:** Source lists `820×2040mm` — in Australian door catalogues this convention is typically **width × height**, so `width_mm: 820, height_mm: 2040`. Thickness 35mm is stated separately. If the catalogue had listed `2040×820×35mm` the convention would be height × width × thickness. When axis labels are absent, record the assumed convention in `parser_note`. Core type creates separate profiles only because the catalogue explicitly lists both as orderable options.

---

### Example 5 — James Hardie HardiePlank (fibre cement cladding)

**Source excerpt (catalogue page 3):**
> HardiePlank Lap Siding. Face widths: 180mm, 230mm, 300mm. Length: 3600mm. Thickness: 8mm. BAL-12.5 rated. ColorPlus finishes: Autumn Leaf (code -AL), Axent Grey (-AG), Deep Ocean (-DO), Paperbark (-PB).

**staged_systems:**

| name | category | subcategory | bal_rating |
|---|---|---|---|
| HardiePlank Lap Siding | cladding | fibre cement lap siding | BAL-12.5 |

**staged_system_profiles:**

| profile_name | width_mm | length_mm | thickness_mm | uom |
|---|---:|---:|---:|---|
| Linea 180 | 180 | 3600 | 8 | lm |
| Linea 230 | 230 | 3600 | 8 | lm |
| Linea 300 | 300 | 3600 | 8 | lm |

**staged_system_colours:**

| colour_name | sku_suffix |
|---|---|
| Autumn Leaf | -AL |
| Axent Grey | -AG |
| Deep Ocean | -DO |
| Paperbark | -PB |

**Mapping note:** BAL-12.5 is system-wide (applies to all profiles) — goes on `staged_systems.bal_rating`, not on each profile. Face width maps to `width_mm`. `sku_suffix` captures the colour code suffix from the SKU pattern. Do not create separate profiles per colour.

---

## Evidence requirement

Every non-null extracted field must have a `field_sources` entry. No exceptions.

Each `field_sources` entry must include:

| Field | Requirement |
|---|---|
| `field_name` | Exact column name on the staging table |
| `extracted_value` | The value exactly as it appears in the source text, before any conversion or normalisation |
| `source_chunk_id` | Docling chunk ID |
| `source_page_number` | Page number as integer. If the chunk spans multiple pages, use the most specific page where the field appears. If no single page can be resolved, use `null` — do not omit the entry |
| `confidence` | Numeric 0.0–1.0 |
| `is_uncertain` | `true` if confidence is below 0.75 |
| `parser_note` | Brief note on extraction reasoning, conversion applied, or ambiguity |

If a page cannot be resolved: include the entry with `source_page_number: null` and explain in `parser_note`. Do not skip the evidence entry because the page is unknown.

**The parser does not write `field_verifications` rows.** The insertion layer creates these from your `field_sources` arrays after staged rows are inserted. Do not include `field_verifications` in parser output.

---

## Confidence rubric

| Score | Meaning |
|---|---|
| 0.95 | Value directly and unambiguously stated in the chunk text or table |
| 0.80 | Value clearly implied from context; minor reading required |
| 0.60 | Value inferred from indirect evidence within the chunk |
| 0.40 | Reasonable assumption based on product type norms — reviewer must confirm |
| 0.20 | Very uncertain; reviewer attention essential |

Set `is_uncertain: true` for any field with confidence below 0.75. Do not omit uncertain fields — record them with their low-confidence value so the reviewer can assess.

**Never use product-type assumptions (0.40 or below) for dimensions, SKUs, product codes, pack quantities, ratings, or UOM.** These fields must come directly from the source text. If they cannot be found, use `null`.

---

## Parser notes

`parser_notes` is a JSONB field. Use this shape:

```json
{
  "extraction_summary": "Brief summary of what was found and any ambiguity",
  "uncertain_fields": ["field_name_1", "field_name_2"],
  "alternative_readings": [
    {
      "field": "field_name",
      "alternative": "alternative value",
      "reason": "why this could also be correct"
    }
  ],
  "conversions_applied": ["1.5 m converted to 1500 mm for width_mm"],
  "raw_text_excerpt": "Relevant excerpt from chunk text"
}
```

`extraction_summary` is always required. Other keys are included only when relevant.

---

## Edge cases

### Orphaned profiles — system_match not resolvable

If a profile is extracted from a spec_table but cannot be matched to a named system in the same chunk or document, do not discard it. Create the profile record and:
- Set `system_match` to the best-guess system name if one can be reasonably inferred from surrounding headings or context
- Add `"system_match"` to `uncertain_fields`
- Note the ambiguity in `parser_notes.extraction_summary`

The insertion layer will flag unresolved `system_match` values for human resolution. Orphaned profiles are better than lost profiles.

### No parent system — orphan components

If a chunk lists accessories or components but no named system is identifiable in the document, create a minimal system placeholder:
- `name`: derived from the document section heading or product family name
- `category`: most appropriate, or `"accessory"`
- `notes`: `"Auto-created system placeholder — no parent system identified in source"`
- Include evidence entries in `field_sources` with confidence 0.40

Do not add `extraction_confidence` to placeholder records unless the column exists on that table. Use `field_sources` confidence to reflect uncertainty.

### Multiple systems in one chunk

Create separate system records, each referencing the same `source_chunk_id`.

### Colour-only chunk with no new system data

Match colours to the most recently identified system in the document. If the match is uncertain, record the best-guess `system_match` and note the ambiguity in `parser_notes`. The insertion layer will flag ambiguous matches for human resolution.

### Conflicting dimension data across chunks

Use the value from the most specific/technical context: specification table > technical body text > marketing copy. Record the conflict:
- Store the higher-confidence value in the field
- Add both readings to `field_sources` with separate confidence scores
- Note the conflict in `parser_notes`

### Discontinued or superseded products

Extract the record. Note in `parser_notes.extraction_summary`: `"Product described as discontinued/superseded in source"`.

---

## Rules — these apply to every extraction

1. **Return JSON only.** No markdown, no prose, no text before or after the JSON.
2. **Do not invent.** If a value is not clearly present in the source, use `null`.
3. **Convert dimensions where clear; preserve originals.** Write converted values to target fields. Always keep the original source value in `field_sources[].extracted_value`.
4. **Use `uom`, not `unit`.** The export step handles any rename.
5. **Use `bal_rating`, not `fire_rating`.** `fire_rating` is deprecated.
6. **Do not write `field_verifications`.** That is the insertion layer's responsibility.
7. **Every non-null field must have a `field_sources` entry.**
8. **`supplier_pack_qty` is not the customer order quantity.** It is the manufacturer's pack size.
9. **`staged_system_components.role` accepts only: `required`, `optional`, `accessory`.** Use `staged_components.category` to describe the item type (e.g. `"Fixings"`, `"Tapes"`, `"Frames"`).
10. **Confidence must be numeric (0.0–1.0).** Never use `"high"`, `"medium"`, or `"low"`.

---

## What not to extract

- Marketing claims, lifestyle language, award statements, superlatives
- Installation process steps (but do extract any product relationships or specifications revealed in installation sections)
- Safety warnings (unless they state a product rating such as a BAL or FRL — record those in the appropriate field)
- Pricing or lead time information
- Distributor or retailer names
- Regulatory references that do not directly state a product rating
- Installation spacing measurements (e.g. "fix at 450mm centres") — this is installation data, not a product dimension

---

## Final output expectations

The parser output payload must include:

- `staged_systems` records
- `staged_system_profiles` records
- `staged_components` records
- `staged_system_components` records
- `staged_system_colours` records
- `warnings` — array of any parser-level issues
- `ignored_content_notes` — array of content skipped and why
- Summary counts by entity type

The terminal summary should be short:

- input path / source document name
- manufacturer slug
- chunk count processed
- output counts by table
- warning count
- evidence field count
- output filenames

**Do not print full catalogue content to the terminal.**

**Do not print secrets, API keys, tokens, storage keys, signed URLs, bucket names, or private storage paths.**

**Do not write to Supabase unless an explicit gated insert step authorises it.**

**Do not touch production Supabase under any circumstances.**

---

*See `docs/parser-contracts.md` for complete JSON output shapes, field-level validation rules, and the parser checklist.*
