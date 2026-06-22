# Local Parser Dry-Run

## What this is

A local CLI harness that takes extracted `document_chunks` from Supabase,
builds a structured parser input bundle, optionally calls the AI parser,
validates a parser output candidate against the existing parser contracts,
runs hardened validation checks, saves a JSON report, and produces a staged
insertion plan — without writing anything to any database.

This sits between the extraction step (which populates `document_chunks`) and the
eventual staged-write step (which would populate `staged_systems`, `staged_components`,
etc.). It lets you verify the pipeline contracts are sound before any DB writes happen.

## How it relates to extraction

```
PDF file
  ↓  extract:local-pdf
source_documents + document_chunks (in local Supabase)
  ↓  parser:bundle
.local/parser-inputs/<bundle>.json   ← parser input bundle
  ↓  parser:ai-local (optional)
.local/parser-ai-outputs/<output>.json  ← AI parser output
  ↓  parser:dry-run
validation result + insertion plan   ← printed to terminal, nothing written to DB
.local/parser-reports/<report>.json  ← structured JSON report saved locally
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

### Step 2a (optional) — Run AI parser locally

Sends the bundle's chunks to the Anthropic API and writes the parser output to
`.local/parser-ai-outputs/`. Requires `ANTHROPIC_API_KEY` in `.env.local`.

```sh
pnpm parser:ai-local -- --input ".local/parser-inputs/<bundle>.json"
```

Available flags:

| Flag | Description |
|---|---|
| `--input <path>` | Bundle JSON from `parser:bundle` (required) |
| `--model <id>` | Override AI model (default: `claude-sonnet-4-6`) |
| `--out <path>` | Custom output path (must be under `.local/`) |
| `--fixture` | Skip AI call, write fixture output instead (useful for pipeline testing) |

**Fixture mode** (no API key needed):

```sh
pnpm parser:ai-local -- --input ".local/parser-inputs/<bundle>.json" --fixture
```

Output is written to `.local/parser-ai-outputs/<doc-name>-<timestamp>.json`.

### Step 2b — Run parser dry-run with fixture (no AI)

Loads the bundle and applies the built-in mock fixture. Validates, saves a
report to `.local/parser-reports/`, and prints a summary.

```sh
pnpm parser:dry-run -- --input ".local/parser-inputs/<bundle>.json"
```

### Step 3 — Run parser dry-run with AI output

Loads the bundle for context and validates the real AI parser output against
all parser contracts. Report filename gets an `-ai` suffix.

```sh
pnpm parser:dry-run -- \
  --input ".local/parser-inputs/<bundle>.json" \
  --ai-output ".local/parser-ai-outputs/<output>.json"
```

### Strict mode

Add `--strict` to either dry-run form to exit non-zero on any validation errors
or plan failures. Use this before approving a staged write.

```sh
pnpm parser:dry-run -- \
  --input ".local/parser-inputs/<bundle>.json" \
  --ai-output ".local/parser-ai-outputs/<output>.json" \
  --strict
```

## What PASS / FAIL means

| Result | Meaning |
|---|---|
| `PASS` | Plan ok, no errors, possibly some warnings |
| `PASS (with errors)` | Plan ok but validation checks found errors. Use `--strict` to enforce exit code. |
| `PASS (with warnings)` | Plan ok, no errors, review warnings before staged write |
| `FAIL` | Planner returned ok=false (validation errors from existing parser contract) |
| `FAIL (--strict)` | Strict mode: any errors present or plan failed |

## Output folders

| Folder | Contents | Gitignored |
|---|---|---|
| `.local/parser-inputs/` | Parser input bundles from `parser:bundle` | Yes |
| `.local/parser-ai-outputs/` | AI parser output from `parser:ai-local` | Yes |
| `.local/parser-reports/` | Validation reports from `parser:dry-run` | Yes |

All `.local/` output is gitignored and never committed.

## Report files

Each dry-run saves a structured JSON report to:

```
.local/parser-reports/<doc-name>-<fixture|ai>-<timestamp>.json
```

The report includes:
- Entity counts (staged_systems, profiles, components, etc.)
- Planning error and warning counts
- Evidence coverage summary (entities with/without field sources, uncertain fields)
- All check results grouped by category:
  - `required_fields` — missing name, category, uom, etc.
  - `evidence` — entities without field sources, parity checks
  - `classification` — profile/component heuristic warnings
  - `pack_uom` — numeric UOM, pack size used as UOM
  - `dimensions` — flat product dimension mapping warnings
  - `duplicates` — duplicate product codes, SKUs, colour names
  - `uncertain` — uncertain field summary

## Prerequisites

- Local Supabase must be running (`supabase start`)
- `.env.local` must contain:
  ```
  LOCAL_ONLY_ALLOW_SERVICE_ROLE=true
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
  SUPABASE_SERVICE_ROLE_KEY=<local service role key>
  ```
- For AI parser calls, also add:
  ```
  ANTHROPIC_API_KEY=<your key>
  ```
- Run `pnpm install` first if `tsx` or `@anthropic-ai/sdk` are not yet installed

## Known reference IDs (NewTechWood extraction)

| Field | Value |
|---|---|
| Manufacturer ID | `1caee8a9-0dbe-4a74-bce1-6e426f8d4ed5` |
| Source document ID | `b576c341-bbb1-4124-ad41-9cc90c4816fc` |
| Extraction run ID | `7cc3a25f-2137-44df-9b83-7a3b0de52791` |
| Chunks extracted | 16 |

## Safety boundaries

- **No DB writes.** The planner is read-only — it returns a plan struct, writes nothing.
- **No staged table writes.** `staged_systems`, `staged_components`, etc. are untouched.
- **No `parser_field_evidence` insertion.** Evidence rows are planned but not written.
- **No field_verifications insertion.** Verification rows are planned but not written.
- **No production Supabase.** The bundle script requires `LOCAL_ONLY_ALLOW_SERVICE_ROLE=true`.
- **No upload / R2 / storage.** Neither script touches file storage.
- **No publish / export.** Nothing leaves the local environment.
- **All outputs are gitignored.** `.local/` is in `.gitignore`. Never commit bundles, AI outputs, or reports.

## What is not done yet

| Capability | Status |
|---|---|
| Staged writes (`staged_systems`, etc.) | Not implemented |
| `parser_field_evidence` insertion | Not implemented |
| Correction UI / field verification UI | Not implemented |
| Publish / export | Not implemented |

## Next step after dry-run passes

1. Run `parser:bundle` to build a fresh bundle from your local DB.
2. Run `parser:ai-local` to get real AI parser output from the chunks.
3. Run `parser:dry-run --ai-output` to validate the AI output against contracts.
4. Re-run with `--strict` to confirm no errors before staged write.
5. With explicit approval: implement the staged-write step using the
   `ParserInsertionPlan` from `planParserOutputInsertion`.

The staged write step is a **separate work chunk** and requires explicit approval
before any code is written.
