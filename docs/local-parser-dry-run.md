# Local Parser Dry-Run

## What this is

A two-step local CLI harness that takes extracted `document_chunks` from Supabase,
builds a structured parser input bundle, then validates a parser output candidate
against the existing parser contracts and produces a staged insertion plan — without
writing anything to any database.

This sits between the extraction step (which populates `document_chunks`) and the
eventual staged-write step (which would populate `staged_systems`, `staged_components`,
etc.). It lets you verify the pipeline contracts are sound before any AI integration
or DB writes happen.

## How it relates to extraction

```
PDF file
  ↓  extract:local-pdf
source_documents + document_chunks (in local Supabase)
  ↓  parser:bundle
.local/parser-inputs/<bundle>.json   ← parser input bundle
  ↓  parser:dry-run
validation result + insertion plan   ← printed to terminal, nothing written
  ↓  (future, with explicit approval)
staged_systems / staged_components / field_verifications / ...
```

## Commands

### Step 1 — Build parser input bundle

Reads the document metadata and all extracted chunks for a given document ID
from your local Supabase instance and writes a JSON bundle to `.local/parser-inputs/`.

```sh
pnpm parser:bundle -- --document b576c341-bbb1-4124-ad41-9cc90c4816fc
```

Optional: specify output path:

```sh
pnpm parser:bundle -- \
  --document b576c341-bbb1-4124-ad41-9cc90c4816fc \
  --out .local/parser-inputs/my-bundle.json
```

Output is written to `.local/parser-inputs/<doc-name>-<timestamp>.json`.
The `.local/` directory is gitignored — bundles are never committed.

### Step 2 — Run parser dry-run

Loads the bundle, applies the mock parser output fixture (`mockNTWAvenueDecking`),
validates it against the parser contract, and prints the staged insertion plan.
Nothing is written to the database.

```sh
pnpm parser:dry-run -- --input ".local/parser-inputs/newtechwood-product-brochure-october-2025-2026-01-15T12-00-00.json"
```

The output shows:
- Bundle summary (document name, chunk count, total chars)
- Parser output fixture used
- Candidate entity counts (systems, profiles, components, colours, etc.)
- Planned staged row counts for all tables
- Validation errors and warnings
- PASS / FAIL result

## Prerequisites

- Local Supabase must be running (`supabase start`)
- `.env.local` must contain:
  ```
  LOCAL_ONLY_ALLOW_SERVICE_ROLE=true
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
  SUPABASE_SERVICE_ROLE_KEY=<local service role key>
  ```
- Run `pnpm install` first if `tsx` is not yet installed (added as devDependency)

## Known reference IDs (NewTechWood extraction)

| Field | Value |
|---|---|
| Manufacturer ID | `1caee8a9-0dbe-4a74-bce1-6e426f8d4ed5` |
| Source document ID | `b576c341-bbb1-4124-ad41-9cc90c4816fc` |
| Extraction run ID | `7cc3a25f-2137-44df-9b83-7a3b0de52791` |
| Chunks extracted | 16 |

## Safety boundaries

- **No AI call.** The dry-run uses an existing fixture, not real AI-extracted output.
- **No DB writes.** The planner is read-only — it returns a plan struct, writes nothing.
- **No staged table writes.** `staged_systems`, `staged_components`, etc. are untouched.
- **No `parser_field_evidence` insertion.** Evidence rows are planned but not written.
- **No field_verifications insertion.** Verification rows are planned but not written.
- **No production Supabase.** The bundle script requires `LOCAL_ONLY_ALLOW_SERVICE_ROLE=true`.
- **No upload / R2 / storage.** Neither script touches file storage.
- **No publish / export.** Nothing leaves the local environment.
- **Bundles are gitignored.** `.local/` is in `.gitignore`. Never commit bundles.

## What is not done yet

| Capability | Status |
|---|---|
| AI parser call against real chunks | Not implemented |
| Real AI parser output → dry-run | Not implemented |
| Staged writes (`staged_systems`, etc.) | Not implemented |
| `parser_field_evidence` insertion | Not implemented |
| Correction UI / field verification UI | Not implemented |
| Publish / export | Not implemented |

## Next step after dry-run passes

1. Confirm dry-run PASS with the fixture output.
2. Agree on AI parser integration approach (prompt, model, calling convention).
3. Hook the real AI parser into `parser-dry-run.ts` (or a new script) — replace
   the fixture with actual parser output from the bundle's chunk text.
4. Re-run dry-run with the real parser output to verify the contract still passes.
5. With explicit approval: implement the staged-write step using the
   `ParserInsertionPlan` from `planParserOutputInsertion`.

This staged write step is a **separate work chunk** and requires explicit approval
before any code is written.
