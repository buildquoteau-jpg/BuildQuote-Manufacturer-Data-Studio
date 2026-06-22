# Extraction Architecture

Planning document for BuildQuote Data Studio. Covers the end-to-end flow from manufacturer document to staged catalogue data and human verification, including the evidence model, parser output strategy, correction workflow, and export rules.

**Status:** Planning only. No parser code, upload integration, AI integration, auth, writes, or schema changes are included in this document.

---

## 1. End-to-End Flow

```
Manufacturer document (PDF / product guide / spec sheet)
  │
  ▼
source_documents
  │   Uploaded or seeded document metadata.
  │   Tracks filename, type, storage location, status.
  │
  ▼
extraction_runs (run_type: docling_extract | chunk_document)
  │   Each pipeline step against a source document gets its own run record.
  │   Records tool, model, timestamps, status (queued → running → completed | failed),
  │   and any error_message on failure.
  │
  ▼
document_chunks
  │   Extracted text and table evidence from the document.
  │   Each chunk carries: source_document_id, page_number, chunk_type, raw_text,
  │   table_json, docling_json, confidence, and links to document_pages.
  │   chunk_type drives which parsing prompt is used later.
  │
  ▼
extraction_runs (run_type: parse_systems | parse_components)
  │   Parser/extraction runs receive document_chunks as input.
  │   Parser outputs structured JSON only — no direct DB writes.
  │   Output is AI-suggested and must be treated as unverified.
  │
  ▼
Insertion layer (app code — planned, not yet implemented)
  │   Validates parser JSON against parser contracts.
  │   Writes staged rows and field_verifications in one transaction per entity.
  │   Resolves temp entity keys to real UUIDs after DB insert.
  │   Logs any validation failures back to extraction_runs.error_message.
  │
  ▼
staged_systems
staged_system_profiles
staged_components
staged_system_colours
staged_system_components
  │   AI-drafted catalogue candidates. Not trusted as final.
  │   Each row carries: source_document_id, source_chunk_id, extraction_confidence,
  │   verification_status (pending_review → approved | rejected | exported).
  │
  ▼
field_verifications
  │   Field-level extracted value, verified value, source traceability, and status.
  │   One row per (entity_type, entity_id, field_name).
  │   Drives the verification UI: reviewers approve, reject, or correct each field.
  │
  ▼
verification_events
  │   Append-only audit trail of every verification action.
  │   Never updated or deleted. Records old_value, new_value, field_name, reviewer_id.
  │
  ▼
publish_batches / publish_batch_items (planned)
  │   Reviewer assembles approved staged records into a publish batch.
  │   No record is exported without an approved batch.
  │   publish_batch_items tracks each entity's export status and production_id.
  │
  ▼
Production catalogue (manufacturers, systems, system_profiles,
                       components, system_components, system_colours)
     Verified-only target. Parser never writes here directly.
     Only resolved values (see section 6) are published.
     production_system_id / production_component_id on staged rows track the link.
```

---

## 2. Data Ownership Rules

| Layer | Owner | Trust level | Notes |
|---|---|---|---|
| `source_documents` | Data Studio | Trusted metadata | The document exists and was uploaded. Content is not yet verified. |
| `document_chunks` | Extraction pipeline | Raw evidence | Faithful extraction of source text/tables. Not interpreted. |
| `extraction_runs` | Pipeline | Operational | Records what ran, when, with what tool/model, and whether it succeeded. |
| Parser JSON output | AI | Unverified | AI-suggested only. Must not be published without human review. |
| `staged_*` tables | Insertion layer from parser | Draft / unverified | Reviewable catalogue candidates. AI-drafted starting point, not canonical truth. |
| `field_verifications` | Insertion layer + reviewer | Mixed | `extracted_value` is AI raw. `verified_value` is human-confirmed. `status` records current state. |
| `verification_events` | App / reviewer | Trusted audit | Append-only. Source of truth for correction history. |
| `publish_batches` / `publish_batch_items` | Reviewer | Controlled | Explicit human decision to export. |
| Production catalogue | Export layer | Trusted | Receives only verified values via the export resolver. |

### Key ownership rules

- **Parser output is never trusted as final.** The parser's role is to produce structured candidates, not authoritative records.
- **staged rows are AI-drafted candidates, not canonical truth.** Reviewers treat them as a starting point to correct.
- **Raw extracted values are preserved forever.** `field_verifications.extracted_value` must never be overwritten. Corrections go into `verified_value`.
- **Production is never directly edited by the parser.** All writes to production go through the export resolver after verification.
- **Publish batches gate every export.** There is no silent migration path.

---

## 3. Evidence Model

### What evidence exists per extracted field

Every extracted field must be traceable to:

| Evidence field | Source | Where stored |
|---|---|---|
| `source_document_id` | Parser JSON / insertion layer | `field_verifications.source_document_id` |
| `extraction_run_id` | Insertion layer (current run) | Not yet a column on `field_verifications` — see gap below |
| `source_page_number` | Parser JSON `field_sources[].source_page_number` | `field_verifications.source_page_number` |
| `source_chunk_id` | Parser JSON `field_sources[].source_chunk_id` | `field_verifications.source_chunk_id` |
| `extracted_value` | Parser JSON `field_sources[].extracted_value` | `field_verifications.extracted_value` |
| `confidence` | Parser JSON `field_sources[].confidence` | `field_verifications.confidence` |
| Parser notes / uncertainty | Parser JSON `parser_notes`, `uncertain_fields` | Not yet stored per-field — see gap below |

### Is `field_verifications` sufficient?

`field_verifications` as currently defined handles:
- Current field state (pending / approved / rejected / edited)
- Source traceability (document, page, chunk)
- Extracted vs verified value separation
- Per-field confidence and reviewer attribution

**Identified gaps:**

1. `extraction_run_id` is not a column on `field_verifications`. When multiple extraction runs exist for one document, it is not possible to know which run produced a given field row.
2. `parser_notes` and `uncertain_fields` from the parser JSON have no dedicated column. Uncertainty reasons are lost after insertion.
3. Raw snippet text (the exact portion of raw_text that the parser cited) is not stored separately from the chunk. `document_chunks.raw_text` contains the full chunk, not the specific span.

**Recommendation:** A future `extracted_fields` / `field_evidence` table should be considered if any of the following becomes true:

- Multiple extraction runs per document produce competing extracted values for the same field (the current UNIQUE constraint on `field_verifications` prevents storing both).
- The UI needs to show the specific raw snippet, parser note, or uncertainty reason per field alongside the extracted value.
- Audit requirements demand knowing which extraction run produced each value.

Until then, `field_verifications` is sufficient for the initial verification UI. The gaps listed above should be addressed in migration when the parser is integrated, before storing real parser output.

---

## 4. Parser Output Strategy

### Option A — Parser writes staged rows first, field_verifications generated from staged rows

Parser inserts staged rows directly (or via insertion layer). A second step reads the staged rows and creates `field_verifications` rows from what was inserted.

**Pros:**
- Staged rows exist and are browsable before any verification setup.
- Simpler initial pipeline (fewer things to coordinate per run).

**Cons:**
- Evidence (`field_sources`) can be lost between parser output and `field_verifications` creation if the second step fails or is skipped.
- No way to know which fields were actually extracted vs defaulted to null.
- If the second step is a separate job, there is a window where staged rows exist with no field_verifications, which is confusing to reviewers.
- Recovering the source_page_number and source_chunk_id for each field requires re-reading the parser output, which may not be retained.

### Option B — Parser writes field-level extraction records first, staged rows assembled from them

Parser writes a flat list of field evidence records (one per extracted field per entity). A second step assembles staged rows by aggregating the evidence records.

**Pros:**
- Maximum field-level auditability from the start.
- Easy to store multiple competing extractions for the same field if a document is re-parsed.
- Evidence is preserved before any staged row exists.

**Cons:**
- Staged rows do not exist until the assembly step completes — the UI cannot browse candidates until then.
- More complex pipeline: two sequential steps with a dependency.
- Requires a new schema table (the assembly table) not currently in the migration set.
- Entity identity (e.g. which field evidence rows belong to the same profile) must be resolved before staged rows can be created, which is a hard problem when names or SKUs are ambiguous.

### Option C (Recommended) — Hybrid: parser returns entity candidates with field_sources; insertion layer writes staged rows and field_verifications together in one transaction

The parser returns structured entity candidates (systems, profiles, components, colours, links), each with a `field_sources` array. The insertion layer (app code, not the parser itself) reads the parser JSON and, for each entity:

1. Validates the record against the parser contract.
2. Inserts the staged row.
3. Immediately writes one `field_verifications` row per non-null field in `field_sources`, using the just-inserted staged row UUID.
4. All of the above in one database transaction.

If the transaction fails, no partial data is left behind. If the validation step fails, the error is logged to `extraction_runs.error_message` and the run is marked `failed`.

A future `field_evidence` / `extracted_fields` table can be added alongside `field_verifications` without breaking the existing model — `field_verifications` becomes the current-state view, and `field_evidence` becomes the append-only historical record of every extracted value the parser has ever produced for that field.

**Pros:**
- Staged rows and field_verifications are always in sync — no gap window.
- Evidence is captured atomically alongside the staged row.
- Reviewers can see field evidence immediately.
- Transaction boundary prevents partial inserts.
- Extensible: `field_evidence` table can be added later for multi-run evidence without changing `field_verifications`.

**Cons:**
- Insertion layer must be implemented carefully (cannot be a simple upsert loop).
- Temp key resolution (entity_temp_key → UUID) must happen within the same transaction or in an immediately following step before any other writes.

**This is the recommended approach for BuildQuote Data Studio.**

---

## 5. Correction Workflow

### Rules

- Humans must not silently update staged row field values directly.
- A correction is a two-write operation: update `field_verifications` and append to `verification_events`.
- Raw extracted values (`field_verifications.extracted_value`) must never be overwritten.
- The corrected value goes into `field_verifications.verified_value`.
- `field_verifications.status` transitions to `edited`.

### What a correction record preserves

| Field | Stored where |
|---|---|
| Old value | `verification_events.old_value` |
| New value | `verification_events.new_value` (and `field_verifications.verified_value`) |
| Field name | `verification_events.field_name` |
| Entity type and ID | `verification_events.entity_type`, `entity_id` |
| Evidence chunk / page | Carried from `field_verifications.source_chunk_id`, `source_page_number` |
| Reason | `verification_events.notes` |
| Reviewer | `verification_events.reviewer_id` |
| Timestamp | `verification_events.created_at` |
| Status | `field_verifications.status` |
| Supersession | If corrected again, the new `verification_events` row supersedes the prior correction. The old row remains in the log. |

### Enforcement

Currently the correction audit trail is enforced at the app layer only. A future DB trigger or row-level policy could prevent direct updates to `field_verifications.extracted_value` and enforce that all corrections go through the audit path. This is listed as an open question in section 11.

---

## 6. Resolved Value Logic

When the export resolver prepares a field value for publication to production, it applies the following precedence:

```
1. verified_value (status = 'approved' or 'edited')   → use this
2. extracted_value (status = 'approved', no edit)      → use this
3. status = 'pending' or 'rejected' or 'needs_source_check' → do not publish
4. field_verifications row does not exist              → do not publish
```

### Definitions

| Term | Meaning |
|---|---|
| **Raw extracted value** | The value the AI parser extracted. Stored in `field_verifications.extracted_value`. Never overwritten. |
| **Verified value** | The human-confirmed correct value. Stored in `field_verifications.verified_value`. May equal or differ from the extracted value. Set when reviewer approves with or without edit. |
| **Rejected value** | A field the reviewer explicitly rejected. `status = 'rejected'`. The extracted_value is preserved but the field must not be published. |
| **Resolved value** | The value the export resolver selects for publication: `verified_value` if present, otherwise `extracted_value`, only when `status = 'approved'` or `'edited'`. |
| **Publishable value** | A resolved value that exists, is non-null, and whose `field_verifications.status` permits export. Pending, rejected, and unverified fields are not publishable. |

### Partial verification

If some fields on a staged row are approved and others are still pending, the export resolver publishes only the approved fields. It does not hold an entire entity back because one optional field is unverified. However, required fields (e.g. `name` on any staged entity) must be approved before the entity is included in a publish batch.

---

## 7. Entity Matching and Linking Strategy

### Linking during parser output

The parser uses name/product_code match hints rather than UUIDs, because UUIDs do not exist until staged rows are inserted:

- `system_match: { system_name, product_code }` — profiles and colours link to a system.
- `staged_system_match: { system_name, product_code }` — system_components link to a system.
- `component_match: { sku, name }` — system_components link to a component.

The insertion layer resolves these hints to actual staged UUIDs after inserting the parent entities in dependency order:

```
1. staged_systems (no dependencies)
2. staged_system_profiles → depends on staged_systems
3. staged_components (no dependencies)
4. staged_system_colours → depends on staged_systems
5. staged_system_components → depends on staged_systems + staged_components
```

### Temp key convention

Before UUIDs exist, the parser uses sequential temp keys to identify entities within one output payload:

```
systems:    system_0, system_1, ...
profiles:   profile_0, profile_1, ...
components: component_0, component_1, ...
colours:    colour_0, colour_1, ...
links:      link_0, link_1, ...
```

The insertion layer maps temp keys → UUIDs after each insert, then uses those UUIDs to write the corresponding `field_verifications` rows. Temp keys must not appear in the final DB state.

### Production ID tracking

After a publish batch exports a staged entity to production, the production table's UUID is written back:

- `staged_systems.production_system_id`
- `staged_components.production_component_id`

This allows later re-runs or corrections to check whether a staged entity has already been exported.

### Profile-specific components (current limitation)

`staged_system_components` links components to systems via `staged_system_id`. There is no `staged_system_profile_id` column. If a component applies only to a specific profile variant (e.g. a clip designed for one board thickness), it cannot be linked at the profile level with the current schema.

If profile-level component links are needed, a schema change will be required to add `staged_system_profile_id` (nullable) to `staged_system_components`. This should only be done when a real use case is confirmed — do not add it speculatively.

### Colour-to-profile linking (current limitation)

`staged_system_colours` links colours to systems via `staged_system_id` only. If a colour option applies only to certain profile variants, the current schema cannot represent that. A future `staged_profile_colours` join table would be needed. Again, only add when a real use case is confirmed.

---

## 8. Handling Uncertain Data

### Rules

- **Do not invent.** If a value is not clearly stated in the source, the field must be `null`.
- **Do not discard.** Low-confidence extractions must be stored with their confidence value, not silently dropped.
- **Preserve raw text.** `dimensions` and similar raw string fields must contain the original source text even when parsed numeric fields are also populated.
- **Flag uncertainty explicitly.** Uncertain fields must appear in the parser's `uncertain_fields` array and be flagged in `field_verifications` with low confidence.
- **Do not publish uncertain/unverified fields.** See the resolved value logic in section 6.

### What to do per uncertainty type

| Situation | Correct action |
|---|---|
| Value is ambiguous or unclear in source | Set numeric/structured fields to `null`. Store raw text in `dimensions` or `parser_notes`. Add to `uncertain_fields`. |
| Confidence is low but a value exists | Store the value with low confidence. Do not promote it to approved. Reviewer decides. |
| Source gives a range (e.g. "R2.5–R3.5") | Store as a string in a relevant text field. Add parser_note. Do not pick one end of the range. |
| Source is marketing text only, no spec data | Do not extract a numeric value. Note in `ignored_content_notes`. |
| Unit is unclear (e.g. "Pack size: 120" with no UOM hint) | Store in `supplier_pack_qty`. Add `uom` to `uncertain_fields`. |

The UI should surface low-confidence and uncertain fields visually so reviewers focus on them first. This is a future UI concern, not an architecture constraint.

---

## 9. Pack and UOM Handling

### UOM vs manufacturer pack size — these are not the same

`uom` (unit of measure) is the **sell/request unit**: how a builder or supplier would quote or request the item. Examples: `ea`, `piece`, `lm`, `m2`, `sheet`, `roll`, `box`, `carton`, `kg`.

**Manufacturer pack size** is a logistics/catalogue value: the quantity of items in a full manufacturer pack. It does not imply that buyers must order that quantity. Suppliers routinely sell partial packs or trade quantities.

### Architecture rules

- `supplier_pack_qty` stores the manufacturer full-pack quantity. It must **never** be used as the builder/customer RFQ quantity.
- `uom` must reflect the sell/quote unit, not the pack size. Do not set `uom = "pack"` to mean "a pack of 120".
- RFQ quantity is always user-supplied at quoting time in the downstream BuildQuote RFQ tables. The Data Studio catalogue does not set it.
- Pack fields (`pack_format`, `supplier_pack_qty`, `supplier_pack_uom`, `supplier_pack_note`) exist to preserve the manufacturer's packaging information for supplier ordering context — not to drive builder quantities.

### Pack field summary

| Field | Purpose | Example |
|---|---|---|
| `uom` | Sell/quote unit | `"ea"`, `"roll"`, `"box"` |
| `pack_format` | Physical packaging type | `"Box"`, `"Bundle"`, `"Bag"` |
| `supplier_pack_qty` | Units per manufacturer/supplier pack | `120` |
| `supplier_pack_uom` | Name of the unit inside the pack | `"clips"`, `"screws"`, `"boards"` |
| `supplier_pack_note` | Free-text pack constraint or sell minimum | `"Manufacturer full pack; supplier may sell partial"` |

### Verification

Pack fields are extracted from the document and stored in staged rows. They should appear in `field_verifications` like any other field, so reviewers can check and correct the pack information before export. This is especially important for `supplier_pack_qty`, where a misread (e.g. confusing pack size with piece dimensions) could mislead purchasing.

---

## 10. Product Category Flexibility

The extraction architecture is not specific to decking or cladding. The same entity model — manufacturers, systems, system_profiles, components, system_components, system_colours — applies across all building product categories.

### Category examples and dimensional fields used

| Category | System example | Profile dimensional fields typically populated |
|---|---|---|
| Decking boards | NewTechWood Avenue | `length_mm`, `width_mm`, `thickness_mm` |
| Cladding / weatherboard | James Hardie Linea | `length_mm`, `width_mm`, `thickness_mm` |
| Doors | Corinthian Doorzilla | `height_mm`, `width_mm`, `thickness_mm` |
| Climate wrap / building wrap | Enviroseal ProctorWrap | `width_mm`, `roll_m` |
| Thermal underlay / acoustic underlay | Acoustx | `thickness_mm`, `roll_m` or area per roll |
| Membrane / waterproofing | Ardex | `thickness_mm`, `length_mm`, `width_mm` |
| Insulation batts | Bradford Gold | `thickness_mm`, `width_mm`, `length_mm` |
| Panels / boards | Equitone Tectiva | `length_mm`, `width_mm`, `thickness_mm` |
| Adhesives / sealants | Various | `volume_ml` |
| Fixings / clips | Various | `diameter_mm`, `gauge_mm`, `weight_g` |
| Tapes / flashings | Various | `width_mm`, `roll_m` |

### Architecture implications

- Parser classification rules (section 3 of the parser contract) must be applied regardless of category. "Is this the thing a builder quantifies as the primary product?" is the test.
- Dimension field population varies by category. Parser should populate only the fields that are clearly stated in the source, not infer which fields a given category "should" use.
- Verification UI must handle sparse dimensional data gracefully — many fields will be null for any given product.
- Export resolver must not assume fields like `length_mm` or `thickness_mm` will always be present.

---

## 11. Open Schema Questions

These questions are unresolved. Do not implement based on assumption.

| # | Question | Impact |
|---|---|---|
| 1 | Is `field_verifications` sufficient for evidence, or should there be a dedicated `extracted_fields` / `field_evidence` table? | A separate evidence table would allow storing multiple competing extractions per field (e.g. if a document is re-parsed). Currently `field_verifications` has a UNIQUE constraint on `(entity_type, entity_id, field_name)` which prevents this. |
| 2 | Should `field_verifications` have an `extraction_run_id` column? | Without it, there is no way to know which extraction run produced a given field row when multiple runs exist for one document. |
| 3 | Should parser `parser_notes` and `uncertain_fields` have a dedicated column or table? | Currently these are lost after insertion. They contain the parser's uncertainty reasoning, which is valuable for reviewers. |
| 4 | Should `verification_events` be protected by a DB trigger that prevents updates and deletes? | Currently append-only is an app-layer convention, not a DB constraint. A trigger would enforce this at the schema level. |
| 5 | Should direct updates to `field_verifications.extracted_value` be blocked at the DB layer (e.g. via a trigger or RLS policy)? | Currently enforced at app layer only. A DB-layer constraint would be stronger. |
| 6 | Should `staged_components` keep `material`, `finish`, `colour`, `profile`, `texture`, `coverage_m2` if production `components` does not map them? | These are staging-only enrichment fields currently. If they are not in the production schema, they cannot be published. They could be kept as reviewer context only, or they could drive a production schema addition. |
| 7 | Do `staged_system_colours` need a profile-level join? Currently colours link at the system level only. | If a colour is only available for certain profile variants, the current model cannot represent that. A `staged_profile_colours` table would be needed. |
| 8 | Do `staged_system_components` need a profile-level join? Currently component links are at the system level only. | If a component (e.g. a clip) applies only to a specific profile thickness, the current schema cannot represent that. A nullable `staged_system_profile_id` column on `staged_system_components` would be needed. |
| 9 | How should the publish resolver handle partial verification? | Is a partially-verified entity publishable (only approved fields exported) or must all required fields be approved before any export? The `required fields` set needs defining per entity type. |
| 10 | Should there be a materialised `resolved_values` view for the export resolver? | A view that applies the precedence logic from section 6 would make export queries simpler and less error-prone than repeating the logic in application code. |
| 11 | For multi-profile systems where one profile has a BAL rating and another does not — what should `staged_systems.bal_rating` be? | Options: null (only set when clearly system-wide), highest rating across profiles, or a range string. This affects extraction rules and UI display. |
| 12 | Should the parser attempt to emit `field_verifications` rows directly in its output, or is that always the insertion layer's responsibility? | Emitting verifications from the parser would tightly couple the parser to the DB schema. Keeping it as an insertion layer responsibility is cleaner and allows the schema to evolve without changing parser contracts. |

---

## 12. Recommended Future Implementation Sequence

Do not implement any of these steps now. This is a proposed order for future work.

| Step | Task |
|---|---|
| 1 | Confirm `docs/parser-contracts.md` is final. Resolve any open questions in section 16 of that doc before proceeding. |
| 2 | Decide on the field evidence design: is `field_verifications` sufficient, or should `extraction_run_id`, `parser_notes`, and an `extracted_fields` table be added now? Run a short schema migration if needed. |
| 3 | Define TypeScript types for the parser output contracts (systems, profiles, components, colours, links, field_sources, verification seed). These types are the interface between the parser and the insertion layer. |
| 4 | Create mock parser output fixtures for at least two manufacturers (e.g. NewTechWood Avenue decking, James Hardie Linea cladding) covering all entity types. Use these as the primary test input. |
| 5 | Implement the insertion layer against mock fixtures. Test that staged rows and field_verifications are written atomically. Test temp key resolution. Test validation rejection paths. |
| 6 | Build a parser result preview UI: show what the insertion layer would write from a mock fixture, without actually writing it. Good for debugging classification errors early. |
| 7 | Add evidence display in the verification UI: beside each staged field, show source_page_number, source_chunk_id, extracted_value, confidence, and parser_notes. |
| 8 | Add a correction UI that writes to `field_verifications.verified_value` and appends to `verification_events`. Enforce the audit trail at the app layer. |
| 9 | Integrate a real parser (AI call against document_chunks). Test against real manufacturer PDFs. Log results to extraction_runs. |
| 10 | Build the export resolver: apply resolved value logic (section 6), generate publish_batch items, produce CSV or direct migration output. |
| 11 | Add the production publish / migration flow only when the export resolver is proven correct against test data. Do not connect to production Supabase until this step is reviewed and approved. |
