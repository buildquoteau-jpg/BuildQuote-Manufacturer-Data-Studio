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

## 10. Schema Reference Summary

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
