# Parser Insertion Adapter — Design Document

Design document for the database insertion adapter that writes a `ParserInsertionPlan` into the local Data Studio Supabase. No implementation code is included here.

**Status:** Design only. No DB writes, no migrations, no API routes created in this document.  
**Depends on:** migrations 001–009, `apps/web/lib/parser/map-to-staged.ts` (planner), `apps/web/lib/parser/types.ts`, `apps/web/lib/parser/validate.ts`.

---

## 1. Insertion Responsibility

The insertion adapter sits between the dry-run planner and the live database. Its responsibilities are narrow and fixed:

| Responsibility | Owner |
|---|---|
| Validate `ParserOutput` structure | `validateParserOutput` (validate.ts) |
| Plan what rows to write | `planParserOutputInsertion` (map-to-staged.ts) |
| Write planned rows to local Supabase | **Insertion adapter** (to be built) |
| Resolve temp keys → DB UUIDs | **Insertion adapter** |
| Log run outcome to `extraction_runs` | **Insertion adapter** |
| Call AI / parse documents | ✗ Never — adapter receives already-parsed output |
| Publish to production | ✗ Never — adapter writes staging tables only |
| Upload files or interact with storage | ✗ Never |

The adapter receives a validated `ParserInsertionPlan` (already `ok: true`) and a `ParserRunContext` (real `extraction_run_id`, `manufacturer_id`, `source_document_id`). It does not call the validator or planner itself — the caller does that before handing off.

---

## 2. Transaction Boundary

All rows for one `ParserInsertionPlan` must be written atomically. A partial insert — staged rows without `field_verifications`, or `field_verifications` with a null `entity_id` — is worse than no insert at all.

### The core problem

The Supabase JavaScript client does **not** support multi-statement transactions. Sequential `.insert()` calls against multiple tables cannot be wrapped in `BEGIN / COMMIT` from JS alone. If the JS client fails mid-sequence, some rows are committed and others are not.

### Recommended approach — Postgres RPC function

Create a single SQL function callable via `supabase.rpc('insert_parser_output_plan', { payload })` that:

1. Accepts the full planned payload as JSONB.
2. Runs all inserts inside one `BEGIN … COMMIT` block.
3. Returns the resolved UUID map (temp key → UUID) so the caller can confirm what was written.
4. On any error, the whole transaction rolls back — no partial state.

This is the only way to guarantee atomicity with the Supabase JS client. A Postgres function is the right boundary here.

### Alternative — server-side direct pg connection

A Next.js API route using `pg` (node-postgres) directly can open a real transaction. This avoids writing a complex SQL function but keeps the logic in TypeScript. It requires a server-side Supabase connection string (not the anon key). Viable for this project since everything is local-only at this stage.

### Not recommended — sequential JS inserts with manual rollback

This pattern attempts to track what was inserted and delete it on failure. It is fragile: if the cleanup itself fails, partial state remains. Do not use.

### Recommendation

**Build the RPC function first** (`insert_parser_output_plan`). It puts the transaction guarantee at the DB layer where it belongs, is callable from both the JS client and any future server route, and keeps the adapter thin. The SQL function can be prototyped against a local fixture before any application code is written.

---

## 3. Insert Order

Within the transaction, rows must be inserted in dependency order. Rows that have no FK dependencies within the payload come first; rows that reference other staged rows must wait until their parent UUIDs are known.

```
1. staged_systems
       ↓  (resolve system temp keys → real UUIDs)
2. staged_system_profiles       (FK: staged_system_id)
3. staged_components            (no FK deps within payload)
       ↓  (resolve profile and component temp keys → real UUIDs)
4. staged_system_colours        (FK: staged_system_id)
5. staged_system_components     (FK: staged_system_id + staged_component_id)
       ↓  (all entity UUIDs now known — resolve temp keys → real UUIDs for verif rows)
6. field_verifications          (FK: entity_id — resolved from staged rows above)
7. parser_field_evidence        (FK: extraction_run_id — from ParserRunContext)
```

**Why profiles before components?** Profiles depend on systems; components do not. Inserting profiles immediately after systems means the system UUID is already in the map when profile rows are built. Components are independent and could be inserted in parallel with profiles in an async implementation — but inserting them third keeps the order readable and avoids premature optimisation.

**Why field_verifications after all staged rows?** Every `field_verifications` row needs a real `entity_id` UUID. That UUID only exists after the staged row has been inserted and returned. All staged rows must be committed (or at least have their IDs known within the transaction) before any `field_verifications` row can be built.

**Why parser_field_evidence last?** Evidence rows are append-only and have no FK to staged rows (only to `extraction_runs`). They can be written last without risk. Writing them last also means the main staged rows are safely in place before the evidence log is appended.

---

## 4. Temp Key Mapping

The planner uses `TempKey` strings (`system_0`, `profile_0`, `component_0`, `colour_0`, `link_0`) as placeholders throughout the plan. The insertion adapter must maintain a running UUID map that is built up as each entity type is inserted.

### Resolution sequence

```
Before any inserts:
  uuidMap: Map<TempKey, UUID> = {}

After inserting staged_systems:
  for each returned row { id, _temp_key }:
    uuidMap.set(_temp_key, id)

After inserting staged_system_profiles:
  for each returned row { id, _temp_key }:
    uuidMap.set(_temp_key, id)

After inserting staged_components:
  for each returned row { id, _temp_key }:
    uuidMap.set(_temp_key, id)

After inserting staged_system_colours:
  for each returned row { id, _temp_key }:
    uuidMap.set(_temp_key, id)

After inserting staged_system_components:
  for each returned row { id, _temp_key }:
    uuidMap.set(_temp_key, id)

Before inserting field_verifications:
  for each planned verif row:
    resolve entity_temp_key → entity_id = uuidMap.get(entity_temp_key)
    if entity_id is null → this is an error; abort transaction

Before inserting parser_field_evidence:
  (same resolution as field_verifications)
```

### What the DB must return

The Postgres function or insert statement must return the `id` alongside a way to identify which temp key it corresponds to. Options:

- Pass `_temp_key` as a column in the payload JSONB, and `RETURNING id, _temp_key_column` from the insert. (Requires a transient `_temp_key` column, or passing it through a CTE.)
- Alternatively, insert rows one at a time and capture `RETURNING id` in order — this works because the planned array maintains insertion order.

The safest approach in a SQL function is to insert each entity's rows as a set via `json_array_elements`, `RETURNING id` in a CTE, and join back to the input JSON by array index or by a passed temp key field.

### Temp keys in the final DB state

**Temp keys must never appear in the final committed rows.** The `_temp_key` and `_staged_system_temp_key` fields on plan types are planner metadata. They must not be inserted as columns — the planner type explicitly prefixes them with `_` to signal this. The SQL function strips them when building the INSERT.

---

## 5. `field_verifications` Behaviour

### Initial insert (first run for this entity)

Each planned `field_verifications` row becomes one DB row with:

| Column | Value |
|---|---|
| `entity_type` | From plan (e.g. `staged_system_profile`) |
| `entity_id` | Resolved UUID from temp key map |
| `field_name` | From plan |
| `extracted_value` | From plan (always stored as text) |
| `verified_value` | `null` — always null at seed time |
| `source_document_id` | From plan / run context |
| `source_chunk_id` | From plan field source |
| `source_page_number` | From plan field source |
| `source_page_id` | `null` initially — see gap note below |
| `status` | `'pending'` — the DB default |
| `confidence` | From plan field source |
| `reviewer_id` | `null` |
| `reviewed_at` | `null` |
| `notes` | `null` |

**Status note:** `field_verifications.status` defaults to `'pending'` (see migration 002). This is distinct from `staged_*.verification_status` which defaults to `'pending_review'`. The adapter must use the correct status string for each table — do not mix them up.

**`source_page_id` gap:** The `field_verifications` table has a `source_page_id` column (FK → `document_pages.id`) that the planner does not populate. The planner only carries `source_page_number` (integer). The adapter will insert `source_page_id = null` on first implementation. A future improvement can resolve `source_page_number → document_pages.id` by querying `document_pages` during insertion if needed for the evidence UI.

### Re-run behaviour (entity already has `field_verifications` rows)

The `field_verifications` table has a `UNIQUE (entity_type, entity_id, field_name)` constraint. On re-run, inserting a duplicate `(entity_type, entity_id, field_name)` will conflict.

The adapter must apply the following rule for each planned verif row on re-run:

```
if existing row status = 'pending':
  UPDATE extracted_value, source_chunk_id, source_page_number, confidence, updated_at
  — the reviewer has not touched this yet; refresh from the new extraction

if existing row status IN ('approved', 'edited', 'rejected', 'needs_source_check'):
  DO NOT update the field_verifications row
  — a reviewer has acted on it; preserve their decision
  — still append a parser_field_evidence row for the new run (see section 6)
```

Implementation: use `INSERT … ON CONFLICT (entity_type, entity_id, field_name) DO UPDATE SET … WHERE field_verifications.status = 'pending'`. This is a single atomic `UPSERT` that respects the reviewer's decision without requiring a pre-read.

### What `field_verifications` never does

- Never overwrites `verified_value` — that is the human's value.
- Never sets `status` to anything other than `'pending'` at insert time.
- Never deletes rows on re-run — old verif rows are updated in-place or left alone.

---

## 6. `parser_field_evidence` Behaviour

`parser_field_evidence` is append-only. There is no UNIQUE constraint.

Each planned `parser_field_evidence` row becomes one new DB row per run, regardless of whether a previous run has already stored evidence for the same field on the same entity. Multiple runs produce multiple rows — that is the intended behaviour.

| Column | Value |
|---|---|
| `extraction_run_id` | Real UUID from `ParserRunContext` — never the placeholder |
| `entity_type` | From plan |
| `entity_id` | Resolved UUID from temp key map |
| `field_name` | From plan |
| `extracted_value` | From plan |
| `source_document_id` | From run context |
| `source_chunk_id` | From plan field source |
| `source_page_number` | From plan field source |
| `confidence` | From plan field source |
| `is_uncertain` | From plan field source |
| `parser_note` | From plan field source |

**On re-run:** Always append. Never update or delete existing evidence rows. The reviewer UI can query all evidence rows for a field ordered by `created_at DESC` to see how the parser's extraction has changed across runs.

**Extraction run ID is mandatory.** The dry-run planner uses placeholder UUIDs (`00000000-…`) when no context is supplied. The real adapter must require a valid `extraction_run_id` from an `extraction_runs` row before proceeding — the FK will enforce this at the DB level.

---

## 7. Re-Run Behaviour

Re-running the same document against the same or a revised parser produces a new `extraction_runs` row and a new `ParserOutput`. The adapter must handle three distinct cases:

### Case A — First run (no existing staged rows for this document)

Insert all planned staged rows, field_verifications, and parser_field_evidence as described above. Straightforward.

### Case B — Re-run, no staged entity has been reviewed yet

All `field_verifications.status` rows for this entity are `'pending'`. The adapter can safely refresh all extracted values and update `field_verifications` in-place (via the UPSERT rule from section 5). New `parser_field_evidence` rows are appended. Staged rows themselves may be updated (see staged row identity discussion in section 8).

### Case C — Re-run, some fields have been reviewed

The reviewer has approved, edited, or rejected at least one field. The adapter must:
- Leave reviewed `field_verifications` rows untouched.
- Still append new `parser_field_evidence` rows so the reviewer can see if the new run extracted a different value.
- Apply the UPSERT rule only to `status = 'pending'` rows.

### Staged row overwrite rules on re-run (open — see section 8)

The biggest unresolved question for re-runs is whether the adapter should overwrite existing staged rows (e.g. `staged_systems`, `staged_system_profiles`) or leave them as-is and only update the evidence tables. This depends on the entity identity strategy, which is not yet decided (see section 8.3).

---

## 8. Open Decisions / Blockers

These must be resolved before the adapter is implemented. Do not assume defaults.

### 8.1 RPC function vs server-side pg connection

**Decision needed:** Use a Postgres RPC function (`supabase.rpc('insert_parser_output_plan', { payload })`) or a server-side Next.js API route using `pg` directly?

| Approach | Pros | Cons |
|---|---|---|
| Postgres RPC function | True DB-level transaction; callable from JS or any future client; self-contained | Complex to write and debug as a SQL function; JSONB manipulation in SQL is verbose |
| Server-side pg route | Transaction in TypeScript (more readable); can call planner directly | Requires DB connection string (not anon key); adds a server route dependency; can't be called from a client component directly |

Recommendation is the RPC function, but both are viable. Decide before writing any adapter code.

### 8.2 Supabase JS client key for insertion

The existing client in `apps/web/lib/supabase.ts` uses the **anon key**. The anon key respects RLS — it can only write to tables where an RLS INSERT policy permits it.

Currently, several staged tables have **RLS disabled** on the local DB (flagged by the advisory in the previous chunk). Before the adapter can write via the anon-key client, either:
- RLS must be enabled with appropriate INSERT policies for the Studio reviewer role, or
- The adapter must use a server-side connection with elevated privileges (service role or direct pg).

This is a hard blocker. The adapter cannot use the anon-key browser client as-is without RLS policies in place.

### 8.3 Staged entity identity on re-run

How does the adapter know whether a staged entity (e.g. a `staged_systems` row for "Avenue Decking") already exists from a prior run?

Options:
- **By `source_document_id` + `product_code`** — upsert on this pair. Fragile if product code changes between parser runs.
- **By `source_document_id` + `name`** — upsert on name. Fragile if the name changes.
- **By a dedicated `parser_run_entity_id` or `source_entity_key`** — emit a stable key from the parser that persists across runs. Not currently in the parser contract.
- **Append-only staged rows** — every run creates new staged rows; old ones are archived. Clean, but produces multiple staged versions of the same product for a reviewer to reconcile.

**No decision is made here.** This must be decided before implementation. The append-only approach is safest for data integrity; the upsert approach is more reviewer-friendly.

### 8.4 Handling `source_page_id` in `field_verifications`

The `field_verifications.source_page_id` column (FK → `document_pages.id`) is not populated by the planner. The adapter must decide:
- Leave it `null` always (acceptable for initial implementation), or
- Resolve `source_page_number → document_pages.id` during insertion by querying `document_pages` within the same transaction.

The second option requires `document_pages` rows to exist before the adapter runs, which is true only if the docling extraction step has completed. For the first implementation, `null` is acceptable and can be backfilled later.

### 8.5 Status string alignment

There are **two different status vocabularies** in this schema:

| Table | Status column | Allowed values |
|---|---|---|
| `staged_*` | `verification_status` | `pending_review`, `in_review`, `approved`, `rejected`, `needs_source_check`, `exported` |
| `field_verifications` | `status` | `pending`, `approved`, `rejected`, `edited`, `needs_source_check` |

The adapter must use `'pending_review'` when inserting staged rows and `'pending'` when inserting `field_verifications` rows. These must not be mixed up.

### 8.6 Error logging back to `extraction_runs`

When the adapter fails (validation error, insert error, temp key resolution failure), it should update `extraction_runs.status = 'failed'` and write the error message to `extraction_runs.error_message`. This requires the adapter to have the `extraction_run_id` in context and UPDATE permission on `extraction_runs`. This needs to be scoped into the RLS policy design.

### 8.7 Whether to write `staged_system_components` if either FK is unresolved

The planner emits a `UNRESOLVED_SYSTEM_MATCH` or `UNRESOLVED_COMPONENT_MATCH` error (severity `error`) when a system-component link cannot be resolved to a temp key. These prevent the plan from being `ok: true` and would be caught before the adapter runs.

But if a looser future re-run strategy allows partial plans, the adapter must decide: skip unresolvable link rows, or abort the whole transaction? Aborting is safer.

---

## 9. Recommended Implementation Path

Do not implement any of this now. This is the proposed coding sequence for the next chunk.

| Step | Task | Notes |
|---|---|---|
| 1 | Decide open questions 8.1–8.3 | Must resolve before writing any code |
| 2 | Create `supabase/functions/insert_parser_output_plan.sql` (or the server route skeleton) | No writes yet — just the function signature, argument types, and `BEGIN / COMMIT` shell |
| 3 | Implement staged entity inserts only (systems + profiles + components + colours + links) in the function | Use a single NTW fixture. Return `id` values. Verify UUIDs in local Studio. Rollback after. |
| 4 | Add temp key resolution logic inside the function | Build the UUID map from returned rows. Log any unresolvable keys as errors before continuing. |
| 5 | Add `field_verifications` inserts using resolved UUIDs | Still within the same transaction. Verify counts match planner summary. Rollback after. |
| 6 | Add `parser_field_evidence` inserts | Verify append-only behaviour. Test a simulated re-run (call the function twice; confirm evidence rows double but staged rows and verifs do not). |
| 7 | Wire the adapter to `plan-fixtures.ts` output (dry-run validation → planner → adapter) | Call the full chain in a local test script. Insert one fixture. Query the five staged tables and both evidence tables. Verify counts. |
| 8 | Reset local DB (`supabase db reset`) and confirm clean state | Confirm the migration set re-creates cleanly after a real insert test. |
| 9 | Only after the full chain works on local fixtures: design the UI trigger | A button in the reviewer UI that calls the adapter for a selected `source_document_id`. This is a separate chunk. |

The production Supabase project must not be connected until step 9 is proven correct against multiple real manufacturer PDFs and approved by a reviewer.

---

## 10. Approved Implementation Decisions

These decisions resolve the open blockers from section 8. They are locked before any RPC or DB-writing code is created. Do not re-open them without a new design chunk.

### 10.1 Transaction strategy

**Decision:** Use a Postgres RPC function for real insertion so staged rows, `field_verifications`, and `parser_field_evidence` are all inserted atomically inside one `BEGIN … COMMIT`.

**Reason:** Insertion spans multiple linked tables with FK dependencies. Sequential Supabase JS `.insert()` calls cannot be wrapped in a real transaction and are too easy to partially fail — leaving orphaned staged rows with no `field_verifications`, or `field_verifications` rows pointing at temp keys that were never resolved.

### 10.2 Write surface

**Decision:** No browser-side or client-component writes for parser insertion. The insertion RPC call must be made from a server-side route or server action only.

**Reason:** The staged tables contain unverified AI-drafted catalogue data. Browser-side writes bypass server-layer validation and are incompatible with the RLS/auth model that will be designed later. Keeping insertion server-side means the write path is one controllable surface.

### 10.3 RLS and auth

**Decision:** Do not add RLS policies in this chunk. Do not solve local write access by loosening RLS. RLS and auth are a future security chunk, addressed after the insertion logic is proven correct against local fixtures.

**Reason:** Designing RLS requires knowing which roles (manufacturer reviewer, admin, service) need which access on which tables. That design has not been done. Patching RLS now to unblock insertion would produce ad hoc policies that need to be redesigned anyway.

### 10.4 Re-run strategy — V1 append-only

**Decision:** V1 is append-only per extraction run. Each run creates a new set of staged candidate rows. Do not attempt entity deduplication, upsert, or merge across extraction runs in V1.

**Reason:** Append-only is the safest and most auditable approach for an initial implementation. Every run's output is fully preserved and traceable via `extraction_run_id`. The reviewer UI can compare runs using `parser_field_evidence`. Deduplication logic (deciding which staged row is the "same" entity across two runs) is a separate, harder problem that should not block V1.

**Implication:** `field_verifications` rows are inserted for the new staged entity rows created by each run. No cross-run field_verifications refresh is needed in V1 because each run produces its own fresh staged candidates with their own UUIDs.

### 10.5 Link failure strategy

**Decision:** Any unresolved required temp-key link aborts the entire insertion transaction. Partial or orphaned links must not be committed.

**Applies to:**
- `staged_system_components` where the system temp key cannot be resolved to a staged system UUID
- `staged_system_components` where the component temp key cannot be resolved to a staged component UUID
- `staged_system_colours` where the system temp key cannot be resolved to a staged system UUID
- `staged_system_profiles` where the system temp key cannot be resolved to a staged system UUID

**Reason:** Orphaned rows (a `staged_system_components` row with a null `staged_system_id`) violate FK constraints and produce data that is unattributable in the review UI. If a link cannot be resolved, the run output is incomplete and the whole insertion must fail cleanly so the issue is surfaced and corrected in the parser output.

**Note:** The dry-run planner already emits `UNRESOLVED_SYSTEM_MATCH` and `UNRESOLVED_COMPONENT_MATCH` errors (severity `error`) for this case, and returns `ok: false`. The adapter must only be called with a plan where `ok === true`. This provides a first line of defence before any DB writes begin.

### 10.6 Status vocabulary — verified from live local schema

**Decision:** The two status vocabularies are separate and must never be mixed. The adapter must use the correct value for each table. These are the exact values from the live local schema (migrations 001–009):

**`staged_*.verification_status`** (all five staged tables — default `'pending_review'`):

| Value | Meaning |
|---|---|
| `pending_review` | AI-drafted, not yet reviewed |
| `in_review` | A reviewer has opened this record |
| `approved` | Reviewer has approved the record |
| `rejected` | Reviewer has rejected the record |
| `needs_source_check` | Reviewer flagged it for source verification |
| `exported` | Record has been published to production |

The adapter inserts staged rows with `verification_status = 'pending_review'`.

**`field_verifications.status`** (default `'pending'`):

| Value | Meaning |
|---|---|
| `pending` | Extracted, awaiting reviewer action |
| `approved` | Reviewer approved the extracted value |
| `rejected` | Reviewer rejected the extracted value |
| `edited` | Reviewer supplied a corrected verified_value |
| `needs_source_check` | Reviewer flagged for source re-check |

The adapter inserts `field_verifications` rows with `status = 'pending'`.

**Source:** Confirmed against migration 001 (staged tables comment), migration 002 (field_verifications comment), and live local schema distinct-value queries on 2026-05-13.

### 10.7 `source_page_id` gap

**Decision:** V1 insertion stores `source_page_number` (integer) and `source_chunk_id` as provided by the planner. `source_page_id` (FK → `document_pages.id`) is left `null` in V1.

**Reason:** Resolving `source_page_number → document_pages.id` requires a pre-query inside the transaction and assumes `document_pages` rows exist for every referenced page, which cannot be guaranteed at insertion time (the docling extraction step may not have run yet). V1 must not be blocked on this. The `source_page_id` column can be backfilled in a later step or resolved at UI display time.

### 10.8 `field_verifications` re-run behaviour

**Decision (V1):** Because V1 is append-only (each run creates new staged rows with fresh UUIDs), each run also creates a fresh set of `field_verifications` rows linked to the new staged rows. There is no cross-run field_verifications overwrite or refresh in V1.

**Decision (future dedupe/upsert path, when introduced):** If a future version introduces entity deduplication across runs (reusing existing staged row UUIDs), the following rule applies to `field_verifications` on re-run:

| Existing `field_verifications.status` | Adapter action on re-run |
|---|---|
| `pending` | May refresh `extracted_value`, `source_chunk_id`, `source_page_number`, `confidence` via upsert |
| `approved` | Preserve — do not overwrite |
| `edited` | Preserve — do not overwrite |
| `rejected` | Preserve — do not overwrite |
| `needs_source_check` | Preserve — do not overwrite |

New `parser_field_evidence` rows are always appended regardless of `field_verifications.status`.

### 10.9 `parser_field_evidence` behaviour

**Decision:** Always append. Never update existing `parser_field_evidence` rows. The table has no UNIQUE constraint on `(entity_type, entity_id, field_name)` by design — multiple rows for the same field from different runs are the intended and correct state.

**At insert time:** Every planned `parser_field_evidence` row becomes one new DB row, even if the same field for the same entity was recorded by a prior run. The `extraction_run_id` column distinguishes which run produced which evidence row.

---

## 11. Schema Reference Summary

For the adapter implementer — the exact table and column targets, as confirmed from live local schema (migrations 001–009):

### staged_systems
`id`, `manufacturer_id`, `source_document_id`, `source_chunk_id`, `production_system_id`, `name`, `product_code`, `slug`, `category`, `subcategory`, `description`, `dimensions`, `length_m`, `double_sided`, `hero_image_url`, `website_url`, `source_label`, `source_url`, `sheet_format`, `fire_rating`, `acoustic_rating`, `moisture_resistant`, `structural_grade`, `install_guide_url`, `tech_data_url`, `sort_order`, `extraction_confidence`, `verification_status` (default `'pending_review'`), `verified_by`, `verified_at`, `reviewer_notes`, `notes`, `bal_rating`, `parser_notes`, `created_at`, `updated_at`

### staged_system_profiles
`id`, `staged_system_id`, `name`, `product_code`, `dimensions`, `length_m`, `sheet_format`, `sort_order`, `verification_status` (default `'pending_review'`), `reviewer_notes`, `created_at`, `profile_name`, `length_mm`, `width_mm`, `height_mm`, `thickness_mm`, `depth_mm`, `gauge_mm`, `diameter_mm`, `roll_m`, `weight_kg`, `pieces`, `volume_ml`, `weight_g`, `pack_format`, `supplier_pack_qty`, `supplier_pack_uom`, `supplier_pack_note`, `bal_rating`, `parser_notes`, `uom`

### staged_components
`id`, `manufacturer_id`, `source_document_id`, `source_chunk_id`, `production_component_id`, `sku`, `name`, `description`, `category`, `uom`, `length_mm`, `width_mm`, `height_mm`, `thickness_mm`, `depth_mm`, `gauge_mm`, `diameter_mm`, `roll_m`, `weight_kg`, `pieces`, `material`, `finish`, `colour`, `profile`, `texture`, `coverage_m2`, `sort_order`, `extraction_confidence`, `verification_status` (default `'pending_review'`), `verified_by`, `verified_at`, `reviewer_notes`, `volume_ml`, `weight_g`, `pack_format`, `supplier_pack_qty`, `supplier_pack_uom`, `supplier_pack_note`, `parser_notes`, `created_at`, `updated_at`

### staged_system_colours
`id`, `staged_system_id`, `colour_name`, `sku`, `image_url`, `is_stocked`, `sort_order`, `verification_status` (default `'pending_review'`), `reviewer_notes`, `created_at`, `sku_suffix`, `parser_notes`

### staged_system_components
`id`, `staged_system_id`, `staged_component_id`, `role`, `notes`, `sort_order`, `extraction_confidence`, `verification_status` (default `'pending_review'`), `verified_by`, `verified_at`, `reviewer_notes`, `created_at`, `parser_notes`

### field_verifications
`id`, `entity_type`, `entity_id`, `field_name`, `extracted_value`, `verified_value`, `source_document_id`, `source_page_id`, `source_chunk_id`, `source_page_number`, `status` (default `'pending'`), `confidence`, `reviewer_id`, `reviewed_at`, `notes`, `created_at`, `updated_at`  
**UNIQUE:** `(entity_type, entity_id, field_name)`

### parser_field_evidence
`id`, `extraction_run_id`, `entity_type`, `entity_id`, `field_name`, `extracted_value`, `source_document_id`, `source_page_number`, `source_chunk_id`, `confidence`, `is_uncertain`, `parser_note`, `created_at`  
**No UNIQUE constraint — append-only.**

---

## 12. Secure RPC Execution Path

Design for how the application will safely call `insert_parser_output_plan_v1` (and future insertion RPCs) without exposing database writes to the browser or to unauthenticated callers.

**Status:** Design only. No grants added, no routes created, no RLS touched in this section.  
**Context:** Migration 011 revoked `EXECUTE` from `anon`, `authenticated`, and `service_role`. The only role that retains `EXECUTE` is `postgres` (the function owner). The anon/publishable client cannot call the RPC. This is the correct baseline to design from.

---

### 12.1 Who is allowed to call the insertion RPC?

**Not permitted:**
- Browser-side code. The publishable (anon) key is embedded in the client bundle. Any user who opens DevTools can read it. Granting the anon role insertion access means any browser session can write staged data.
- Authenticated users calling the RPC directly via the Supabase JS client. Even with a valid session JWT, the `authenticated` role must not have broad `EXECUTE` on insertion RPCs — the caller would bypass server-side validation, workspace checks, and the audit trail.
- Client components and Client Actions in Next.js. These execute in the browser context; the same constraint as above applies.

**Permitted (now and in V1):**
- A server-side Next.js Route Handler, running in the Node.js process, using the service role key. The service role key is never exposed to the browser and must only live in server-side environment variables.

**Permitted (later, once auth/RLS design is complete):**
- A narrow, named Postgres role (e.g. `parser_inserter`) with `EXECUTE` on only the insertion RPC and no other elevated access. This is cleaner than `service_role` but requires more setup and is deferred to the auth/RLS design chunk (§10.3).
- Alternatively, a `SECURITY DEFINER` wrapper function with its own restricted caller grants — discussed in §12.2.

**Rule:** The real insertion RPC must only be reachable from server-side code that has passed explicit application-layer validation. It must never be callable from the browser, directly or indirectly.

---

### 12.2 What role or key should server-side code use?

Three options, in order of practicality for this project:

#### Option A — service_role key, server-side only (recommended for V1)

Supabase provides a service role key (`SUPABASE_SERVICE_ROLE_KEY`) that bypasses RLS and has elevated privileges. It must:
- Live in a server-only environment variable (no `NEXT_PUBLIC_` prefix, never in the browser bundle).
- Be used only inside a Next.js Route Handler or equivalent server-only module.
- Never be imported into a Client Component or passed to the browser.

A separate server-only Supabase client is created using this key — it must not be the same `supabase` instance used for browser reads (`apps/web/lib/supabase.ts`). A future migration will add `GRANT EXECUTE ON FUNCTION public.insert_parser_output_plan_v1(jsonb) TO service_role` so the service role client can call the RPC.

**Why this is acceptable for V1:** The service role is standard Supabase practice for server-side admin operations. The risk surface is contained to the server process. It is straightforward to implement without new Postgres role infrastructure.

**Why the publishable key is not acceptable:** The publishable (anon) key is intentionally public — it is designed to be embedded in browser bundles and is safe to expose because RLS controls what it can read/write. Granting insertion access to `anon` removes that protection entirely. Even if RLS INSERT policies are eventually added to restrict writes, granting `anon` EXECUTE on an insertion RPC is architecturally wrong: it means any unauthenticated browser session can attempt a write path that has no rate limiting, no workspace check, and no session context.

#### Option B — SECURITY DEFINER wrapper with restricted caller grant

A wrapper function is created that:
1. Is marked `SECURITY DEFINER` (runs as its definer, `postgres`, regardless of caller).
2. Accepts a narrow, validated payload — not the full raw JSONB plan.
3. Has `EXECUTE` granted to a dedicated named role (`parser_inserter`) or to `authenticated` with strict pre-checks inside the function body.

This keeps the real insertion logic inside a function that the wrapper calls internally, and the wrapper itself enforces the access boundary. The trade-off is added complexity: two functions instead of one, and a custom Postgres role to manage.

**Not recommended for V1.** Viable once the auth/RLS design (§10.3) is complete and the Studio reviewer role model is defined.

#### Option C — Direct pg connection (node-postgres)

A Next.js Route Handler uses `pg` (node-postgres) with the local DB connection string (`postgresql://postgres:postgres@127.0.0.1:54322/postgres` locally, the Supabase pooler URL in production). This can open a real `BEGIN / COMMIT` transaction in TypeScript without needing a Postgres RPC function at all.

**Trade-offs:**
- Avoids writing complex JSONB-heavy SQL inside a PL/pgSQL function.
- Adds `pg` as a server-side dependency.
- Requires the DB connection string in the server environment (not the anon key).
- Does not use the Supabase JS client for writes — removes the RPC layer entirely.
- Harder to test independently of the Next.js process.

**Not recommended as primary path.** The Postgres RPC function is already in place and provides DB-layer atomicity without an extra dependency. Use Option A (service_role + RPC) for V1.

---

### 12.3 What must the server-side route validate before calling the RPC?

The Route Handler is the application's last line of defence before a DB write. It must validate all of the following before calling `supabase.rpc('insert_parser_output_plan_v1', ...)`:

| Check | Required for | Notes |
|---|---|---|
| User session is present and valid | Once auth exists | Use Supabase session from cookie/header, not from the client. In V1 (no auth yet), this check is skipped — document clearly. |
| User has workspace / manufacturer permission | Once auth exists | The user must belong to the manufacturer's workspace. Check against `manufacturer_users` or equivalent. In V1, skipped. |
| `source_document_id` is provided and exists | V1 | Query `source_documents` to confirm the row exists in the local DB. |
| `source_document_id` belongs to the expected `manufacturer_id` | V1 | Prevents cross-manufacturer data pollution. |
| `extraction_run_id` is provided and exists | V1 | Query `extraction_runs` to confirm the row exists and is `IN_PROGRESS` or equivalent status. |
| `extraction_run_id` belongs to `source_document_id` | V1 | Confirms the run is for the correct document. |
| `ParserOutput` has passed `validateParserOutput` | V1 | Always — must be `ok: true` before planning. Never skip. |
| `ParserInsertionPlan` has passed `planParserOutputInsertion` | V1 | Always — must be `ok: true` before passing to RPC. Never skip. |
| Plan `summary.planningErrors` is 0 | V1 | Belt-and-suspenders: even if `ok: true`, do not proceed if error count is non-zero. |
| No production export involved | V1 | Insertion writes to staging tables only. The route must not accept a `publishToProd` flag or equivalent. |

**Auth-absent V1 behaviour:** In V1, user/session/workspace checks are skipped because auth has not been implemented. This is acceptable for local-only use during the data studio build phase. The absence of auth checks must be clearly marked in the route code with a `// TODO(auth): add session + workspace check` comment so it is not silently carried forward.

---

### 12.4 What must remain blocked until auth/RLS is complete?

These are hard gates. Nothing in this list should be unblocked without a deliberate design and migration:

| Blocked capability | Why it must stay blocked |
|---|---|
| Browser / anon RPC execution | `anon` has no `EXECUTE` after migration 011. Do not re-grant. |
| `authenticated` RPC execution | Same — revoked in 011. Do not re-grant until the Studio role model is defined. |
| Direct table inserts from browser code | No RLS INSERT policies exist on staged tables. Browser writes would go unvalidated. |
| Service role key in client components | Would expose the key to the browser. Fatal. |
| `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` as an env var | The `NEXT_PUBLIC_` prefix pushes vars into the browser bundle. Must never exist. |
| Production publish / export | Publish logic belongs to a separate, separate-chunk route with its own permission model. |
| Manufacturer self-service upload | Auth not ready. If a manufacturer-facing upload surface is added before auth exists, it must write to a tightly RLS-controlled holding table only — not directly into staged tables. |
| Calling the RPC from a Server Action tied to a form | Server Actions are callable from the browser via fetch. Unless the action validates a session, it is equivalent to a browser write. Blocked until auth exists. |

---

### 12.5 Recommended implementation sequence after this design

This extends the implementation path from §9 with the secure execution layer.

| Step | Task | Notes |
|---|---|---|
| 1 | Implement SQL insert logic inside `insert_parser_output_plan_v1` | While still not granted to any app role. Full 7-table insert with temp key resolution. Test via `supabase db query` and local SQL only. Rollback after each test. |
| 2 | Verify insert logic against all three fixtures using local SQL | Confirm row counts match plan summaries. Verify no partial state on forced error. Confirm `db reset` produces clean state. |
| 3 | Create `apps/web/lib/supabase-server.ts` — server-only Supabase client | Uses `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix). Must not be importable from Client Components — enforce via Next.js `server-only` package or filename convention. |
| 4 | Add migration `GRANT EXECUTE ON FUNCTION public.insert_parser_output_plan_v1(jsonb) TO service_role` | This is the minimum deliberate grant for V1. Commit as its own migration. |
| 5 | Create `apps/web/app/api/parser/insert/route.ts` — server-side Route Handler | POST handler. Accepts `{ sourceDocumentId, extractionRunId, parserOutput }`. Runs validate → plan → RPC chain. Returns structured result. In V1: skip auth/session check but mark clearly with TODO. |
| 6 | Update `call-rpc-shell-fixture.ts` (or a new equivalent) to call the Route Handler instead of calling the RPC directly | This proves the full server-side path end-to-end without touching the browser. |
| 7 | Run full chain against all three fixtures via the Route Handler | Confirm counts, confirm no partial state, confirm row counts reset cleanly after `db reset`. |
| 8 | Design auth/RLS policies for the Studio reviewer role | Separate chunk. Decide which Supabase role maps to a reviewer, which tables need RLS, what INSERT/UPDATE policies are needed. |
| 9 | Replace V1 service_role grant with the appropriate minimum grant | Either a dedicated `parser_inserter` role (Option B from §12.2) or a narrowly scoped `authenticated` grant protected by a `SECURITY DEFINER` wrapper. |
| 10 | Only after auth/RLS is proven: add UI trigger | A button in the document review page that calls the Route Handler for the current `source_document_id`. This is a separate UI chunk. |

**Key principle:** The RPC function must never be callable from the browser at any point in this sequence. The Route Handler is the only permitted caller, and the Route Handler is never exposed as a public endpoint without session validation once auth exists.
