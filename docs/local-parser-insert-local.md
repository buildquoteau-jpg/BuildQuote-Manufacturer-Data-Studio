# Local Parser Insert (Staged DB Write)

## What this is

A local-only CLI that writes a validated parser plan to the local Supabase staged
tables via the `insert_parser_output_plan_v1` RPC. This is the step after
`parser:insert-preview` passes and you have reviewed the preview report.

**Local only. Never run against production Supabase.**

## Safety gates

All nine gates must pass before any DB write is attempted. The script exits
non-zero at the first failure.

| Gate | Requirement |
|---|---|
| 1 | `--strict` flag present |
| 2 | `--confirm-local-write` flag present |
| 3 | `LOCAL_ONLY_ALLOW_SERVICE_ROLE=true` in `.env.local` |
| 4 | `NEXT_PUBLIC_SUPABASE_URL` points to `127.0.0.1` or `localhost` |
| 5 | `--input` under `.local/parser-inputs/`, `--ai-output` under `.local/parser-ai-outputs/` |
| 6 | Strict dry-run validation passes (0 errors, plan_ok) |
| 7 | `source_document_id` exists in local DB |
| 8 | `manufacturer_id` exists in local DB |
| 9 | No existing staged rows for this document (or `--replace-existing-for-document` passed) |

## Required env

In `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
LOCAL_ONLY_ALLOW_SERVICE_ROLE=true
```

The local service role key is printed by `npx supabase status --local`.

## Commands

### Standard insert (no existing staged rows)

```sh
pnpm parser:insert-local -- \
  --input ".local/parser-inputs/<bundle>.json" \
  --ai-output ".local/parser-ai-outputs/<output>.json" \
  --strict \
  --confirm-local-write
```

### Replace existing staged rows for this document

```sh
pnpm parser:insert-local -- \
  --input ".local/parser-inputs/<bundle>.json" \
  --ai-output ".local/parser-ai-outputs/<output>.json" \
  --strict \
  --confirm-local-write \
  --replace-existing-for-document
```

`--replace-existing-for-document` calls `purge_staged_for_document_v1` before
inserting. It deletes all staged rows (systems, profiles, colours, components,
links, field_verifications, parser_field_evidence) tied to the document +
manufacturer pair. Use this when re-running the parser on an already-inserted
document.

## Flags

| Flag | Description |
|---|---|
| `--input <path>` | Bundle JSON from `parser:bundle` (required) |
| `--ai-output <path>` | Saved AI output from `parser:ai-local` (required) |
| `--strict` | Required. Dry-run must pass with 0 errors before any write. |
| `--confirm-local-write` | Required. Explicit acknowledgement of local DB write. |
| `--replace-existing-for-document` | Purge existing staged rows before inserting. |

## What the script does

1. Passes all 9 safety gates (exits non-zero on any failure)
2. Loads and validates the parser plan (same validation as `parser:dry-run --strict`)
3. Creates an `extraction_runs` row (`run_type='parse_systems'`, `status='running'`)
4. Re-plans with the real `extraction_run_id`
5. Calls `insert_parser_output_plan_v1(plan)` via service role RPC
6. Marks the extraction run `completed` (or `failed` on error)
7. Reads back row counts from the DB and compares to inserted counts

## Inspect results

After insert:

```sh
# Open local Supabase Studio
npx supabase studio --local

# Query staged systems
npx supabase db query --local \
  "SELECT id, name, verification_status FROM staged_systems LIMIT 20"

# Query staged components
npx supabase db query --local \
  "SELECT id, name, verification_status FROM staged_components LIMIT 20"

# Query field_verifications for the document
npx supabase db query --local \
  "SELECT entity_type, field_name, status FROM field_verifications LIMIT 20"

# Query parser_field_evidence for the extraction run
npx supabase db query --local \
  "SELECT entity_type, field_name, confidence FROM parser_field_evidence LIMIT 20"
```

## Reset local staged tables

To wipe all local staged data and start fresh:

```sh
npx supabase db reset --local
```

This re-runs all migrations from scratch. You will need to re-run the full
pipeline (extract → bundle → AI → insert) after a reset.

## Pipeline overview

```
PDF file
  ↓  extract:local-pdf
source_documents + document_chunks (in local Supabase)
  ↓  parser:bundle
.local/parser-inputs/<bundle>.json
  ↓  parser:ai-local [--fixture]
.local/parser-ai-outputs/<output>.json
  ↓  parser:dry-run --ai-output ... --strict
dry-run PASS (no errors)
  ↓  parser:insert-preview --ai-output ... --strict
.local/parser-insert-previews/<preview>.json (review this)
  ↓  parser:insert-local --ai-output ... --strict --confirm-local-write
staged_systems / staged_components / staged_system_profiles
staged_system_colours / staged_system_components
field_verifications / parser_field_evidence   ← this command
```

## Verification after insert

After `parser:insert-local` completes, verify what landed in the DB:

```sh
LOCAL_ONLY_ALLOW_SERVICE_ROLE=true pnpm parser:verify-local-insert -- \
  --document <source_document_id>
```

With preview comparison:

```sh
LOCAL_ONLY_ALLOW_SERVICE_ROLE=true pnpm parser:verify-local-insert -- \
  --document <source_document_id> \
  --preview ".local/parser-insert-previews/<preview>.json" \
  --strict
```

The verify command is read-only. It prints staged row counts, orphan link
warnings, duplicate code/SKU warnings, and optionally compares against the
insert-preview expected counts. With `--strict` it exits non-zero on any
count mismatch or structural issue.

## Parser inspection page

The admin UI has a read-only inspection page showing all staged data for a
document. After insert, visit:

```
/admin/manufacturers/<manufacturerId>/documents/<documentId>/parser
```

The page shows systems, profiles, components, colours, system–component links,
field verifications, and parser field evidence. No write controls. No storage
paths, keys, or secrets are shown. Row counts are capped at 150 per table
for the preview — use the CLI verifier or Supabase Studio for full data.

The inspection page can also be reached via the "View parser staging inspection"
link at the bottom of the document detail page.

## How to compare inserted rows to preview

1. Run `parser:insert-preview` and save the report:
   `.local/parser-insert-previews/<name>.json`
2. Run `parser:insert-local` (all 9 gates must pass)
3. Run `parser:verify-local-insert --preview <preview-path> --strict`
   The CLI compares `row_counts` from the preview against actual DB counts.
4. Alternatively, open the parser inspection page and compare
   `Staged row counts` against the `insert_order` counts in the preview JSON.

## Production note

This script refuses to run if `NEXT_PUBLIC_SUPABASE_URL` is not local. The
production Supabase project is never touched by any local CLI script.

All inspection and verification commands are read-only. No publish or export
is implemented.
