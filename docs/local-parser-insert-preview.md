# Local Parser Insert Preview

## What this is

A local-only CLI safety gate that maps a validated parser plan to the exact
intended database insert order, payload shapes, temp key resolution, and
relationship strategy — without writing anything to any database.

This is the step between `parser:dry-run` passing and any actual staged write
being approved. It answers: **"If we were to insert, exactly what would we insert,
in what order, and how would temp keys resolve?"**

No DB writes. No Supabase client. No AI calls. Output is gitignored.

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
.local/parser-insert-previews/<preview>.json   ← this command
  ↓  (future, requires explicit approval)
staged_systems / staged_components / field_verifications / ...
```

## Commands

### Step 1 — Build parser input bundle

```sh
pnpm parser:bundle -- --document b576c341-bbb1-4124-ad41-9cc90c4816fc
```

### Step 2 — Run AI parser (or use fixture)

```sh
# Real AI call (requires ANTHROPIC_API_KEY in .env.local)
pnpm parser:ai-local -- --input ".local/parser-inputs/<bundle>.json"

# Fixture mode — no API key needed
pnpm parser:ai-local -- --input ".local/parser-inputs/<bundle>.json" --fixture
```

### Step 3 — Strict dry-run validation

Must pass with no errors before running the insert preview.

```sh
pnpm parser:dry-run -- \
  --input ".local/parser-inputs/<bundle>.json" \
  --ai-output ".local/parser-ai-outputs/<output>.json" \
  --strict
```

### Step 4 — Insert preview

```sh
pnpm parser:insert-preview -- \
  --input ".local/parser-inputs/<bundle>.json" \
  --ai-output ".local/parser-ai-outputs/<output>.json"
```

With strict validation gate (exits non-zero if dry-run has any errors):

```sh
pnpm parser:insert-preview -- \
  --input ".local/parser-inputs/<bundle>.json" \
  --ai-output ".local/parser-ai-outputs/<output>.json" \
  --strict
```

Custom output path:

```sh
pnpm parser:insert-preview -- \
  --input ".local/parser-inputs/<bundle>.json" \
  --ai-output ".local/parser-ai-outputs/<output>.json" \
  --out ".local/parser-insert-previews/my-preview.json"
```

## Flags

| Flag | Description |
|---|---|
| `--input <path>` | Bundle JSON from `parser:bundle` (required) |
| `--ai-output <path>` | Saved AI output from `parser:ai-local` (required) |
| `--strict` | Exit non-zero if dry-run validation has any errors or plan failures |
| `--out <path>` | Custom output path (must be under `.local/parser-insert-previews/`) |

## Output location

```
.local/parser-insert-previews/<doc-name>-<timestamp>.json
```

Gitignored. Never committed.

## What the preview report contains

| Section | Description |
|---|---|
| `source` | Bundle + AI output file paths (relative), document/manufacturer IDs, AI source |
| `validation` | Plan ok, error/warning/info counts from full dry-run |
| `insert_order` | Ordered list of 7 steps — table, row count, dependencies, FK resolution notes |
| `row_counts` | Row count per table, plus totals for catalogue rows, evidence rows, all rows |
| `relationship_strategy` | Prose description of how temp keys resolve to real UUIDs at insertion time |
| `temp_key_mapping` | Every temp key → target table, display name, parent link, and link type |
| `required_fields_summary` | All required-field errors and warnings from dry-run |
| `evidence_coverage` | Entities with/without field sources, parity check |
| `issues_summary` | Full errors, warnings, and infos from dry-run |
| `sample_payloads` | Up to 3 redacted rows per target table |
| `safety` | Explicit flags: no_db_writes, staged_write_requires_explicit_approval, next_step |

## Planned insert order

The preview describes this transaction sequence:

| Step | Table | Dependencies |
|---|---|---|
| 1 | `staged_systems` | none (needs manufacturer_id resolved) |
| 2 | `staged_system_profiles` | `staged_systems` |
| 3 | `staged_components` | none (needs manufacturer_id resolved) |
| 4 | `staged_system_colours` | `staged_systems` |
| 5 | `staged_system_components` | `staged_systems` + `staged_components` |
| 6 | `field_verifications` | all staged entity tables |
| 7 | `parser_field_evidence` | all staged entity tables |

This is the intended order. The actual insertion layer (not yet implemented) will
execute this as a single DB transaction. No insertion happens until that work chunk
is explicitly approved.

## Redaction

Sample payloads in the preview are redacted:

- Any field ending in `_url` or named `url` → `[REDACTED]`
- Any field ending in `_path` or named `path` → `[REDACTED]`
- Any field containing `bucket`, `token`, `secret`, `storage_key`, `provider_key` → `[REDACTED]`

This ensures no storage keys, signed URLs, or infrastructure values appear in the report.
Entity UUIDs (source_document_id, source_chunk_id, manufacturer_id, extraction_run_id)
are kept — they are identifiers, not secrets.

## Output guardrails

The script refuses to run if:

- `--input` is not under `.local/parser-inputs/`
- `--ai-output` is not under `.local/parser-ai-outputs/`
- `--out` (if provided) is not under `.local/parser-insert-previews/`
- `--strict` is passed and dry-run validation has any errors

## Safety boundaries

- **No DB writes.** The script calls the planner and report builder (both pure functions). Nothing is inserted.
- **No Supabase client.** No connection to local or production Supabase.
- **No AI calls.** Reads the saved AI output file — does not call Anthropic API.
- **No upload / R2 / storage.** No file storage touched.
- **No production Supabase.** Bundle script requires `LOCAL_ONLY_ALLOW_SERVICE_ROLE=true`.
- **All outputs gitignored.** `.local/` is in `.gitignore`.

## What is not implemented yet

| Capability | Status |
|---|---|
| Staged writes (`staged_systems`, etc.) | Not implemented — requires explicit approval |
| `parser_field_evidence` insertion | Not implemented |
| `field_verifications` insertion | Not implemented |
| Correction / review UI | Not implemented |
| Publish / export | Not implemented |

## Next step after insert preview passes

1. Review `.local/parser-insert-previews/<preview>.json`
2. Confirm payload shapes, temp key mapping, and relationship strategy look correct
3. Confirm row counts match expectations
4. Explicitly approve the staged insertion task as a separate work chunk
5. The insertion layer is then implemented and run with a DB transaction

**The staged write is a separate task and requires explicit approval before any code is written.**
