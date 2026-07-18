# Skill: Manufacturer Catalogue Parser Pipeline

## What this does

Converts a manufacturer PDF catalogue into structured Supabase staging data (systems, profiles, colours, components, links) using a two-pass AI extraction approach.

## Pipeline overview

```
PDF  →  Docling (chunked)  →  output.md  →  run_parser.py  →  Supabase staging tables
```

### Stage 1 — Systems, profiles, colours
Each markdown chunk is sent to the LLM. Returns: product lines (systems), dimensional SKU variants (profiles), and stocked colour options.

### Stage 2 — Components and links
Same chunks re-sent with known systems as context. Returns: accessories/fixings/tools (components) and which systems they belong to (links).

### RPC insert
All extracted data is sent to Supabase in one transaction via `insert_parser_output_plan_v1`.

---

## Step 1: Docling extraction

Run from repo root with the `.venv-docling` Python environment.

```powershell
.venv-docling/Scripts/python.exe scripts/docling/extract_docling_chunked.py `
  --input "C:\path\to\catalogue.pdf" `
  --chunk-size 7
```

- `--chunk-size 7` splits the PDF into 7-page chunks to avoid memory crashes and keep LLM prompts small
- Output lands in `.local/docling-output/<stem>_chunked_<timestamp>/output.md`
- Each chunk is marked with `<!-- chunk N: pages X-Y -->` in the merged output

---

## Step 1b: Merge multiple Docling outputs (when multiple PDFs exist)

If the manufacturer has multiple source PDFs (e.g. main catalogue + accessories/fixings sheet), extract each with Docling then merge before parsing. This ensures Stage 2 sees the full component/accessory data.

```powershell
$primary   = Get-Content ".local/docling-output/<primary-stem>/output.md" -Raw
$secondary = Get-Content ".local/docling-output/<accessory-stem>/output.md" -Raw

$merged = @"
<!-- SOURCE: <primary label> -->
$primary

<!-- SOURCE: <accessory label> -->
$secondary
"@

$merged | Set-Content ".local/docling-output/<slug>_merged.md" -Encoding UTF8
```

Use `<slug>_merged.md` as the `--input` to the parser.

**Note:** The parser processes each `<!-- SOURCE -->` block as a separate chunk. Systems and colours are deduped automatically. Components are deduped by SKU. Do not merge docs that represent completely separate product lines.

---

## Step 2: AI parsing (dry run first)

```powershell
python scripts/parser/run_parser.py `
  --input ".local/docling-output/<run>/output.md" `
  --manufacturer-id "<uuid from data_studio_manufacturers>" `
  --manufacturer-name "James Hardie" `
  --hints "prompts/manufacturer-hints/james_hardie.md" `
  --openai-model "gpt-5.4" `
  --dry-run
```

Dry run writes plan JSON to `.local/parser-dry-run/plan_<timestamp>.json`. Review it before inserting.

### To insert live (remove `--dry-run`):

```powershell
python scripts/parser/run_parser.py `
  --input ".local/docling-output/<run>/output.md" `
  --manufacturer-id "<uuid>" `
  --manufacturer-name "James Hardie" `
  --hints "prompts/manufacturer-hints/james_hardie.md" `
  --openai-model "gpt-5.4"
```

---

## Key files

| File | Purpose |
|------|---------|
| `scripts/docling/extract_docling_chunked.py` | Splits PDF into chunks, runs Docling on each, merges output |
| `scripts/parser/run_parser.py` | Two-pass AI parser → Supabase RPC |
| `prompts/manufacturer-hints/<slug>.md` | Per-manufacturer extraction hints injected into prompts |
| `supabase/migrations/012_implement_parser_insertion_rpc.sql` | The RPC that handles all inserts in one transaction (current body: migration 058; 057/058 fixed schema drift) |
| `scripts/lib/pipeline_report.py` | Reports every run to `pipeline_jobs` → live progress/failures on the app's Pipeline page |

---

## Manufacturer hints file

Create `prompts/manufacturer-hints/<manufacturer-slug>.md` with:
- UOM rules (sheets vs length vs roll vs pack)
- Colour rules (pre-primed = no colours, ColorPlus = stocked colours)
- Profile naming conventions
- Component role names (e.g. `external_corner`, `horizontal_jointer`)
- Worked examples for complex products

---

## Environment variables (`.env.local`)

```
ANTHROPIC_API_KEY=...        # Used if --openai-model not set
OPENAI_API_KEY=...           # Used with --openai-model
NEXT_PUBLIC_SUPABASE_URL=... # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=... # Service role key for RPC
```

---

## Supported models

| Flag | Model | Notes |
|------|-------|-------|
| *(no flag)* | `claude-sonnet-4-6` | Anthropic default — 8k TPM limit on this key, needs 65s delays |
| `--model <id>` | any Anthropic model | Overrides the Anthropic default (was hardcoded before 2026-07-18) |
| `--openai-model gpt-5.4` | GPT-5.4 | Higher limits, uses `max_completion_tokens` — requires `OPENAI_API_KEY` in `.env.local` (currently not set) |
| `--openai-model gpt-4o` | GPT-4o | Fallback if gpt-5.4 unavailable |

Recovery flags (2026-07-18): every run saves its plan before inserting —
`--from-plan <file>` re-inserts without re-extracting; `--allow-partial`
overrides the refuse-to-insert gate when some chunks failed (failures are
listed in `.local/parser-dry-run/manifest_*.json`).

---

## Database tables written

- `staged_systems` — product lines
- `staged_system_profiles` — dimensional/SKU variants per system
- `staged_system_colours` — stocked colour options per system
- `staged_components` — accessories, fixings, tools, tapes
- `staged_system_components` — links between systems and components (with `role` field)

---

## Known issues / gotchas

- **Chunk 1 (TOC pages)** always extracts system stubs with no profiles — these are deduplicated by the parser automatically
- **™/® symbols** are stripped from all name fields before inserting
- **Images**: not extracted by Docling — hero images must be added manually post-parse
- **`australian_made`** boolean on `staged_systems`: set to `true` only if explicitly stated in catalogue
- **`staged_system_components.role`** default is `'component'` — use custom strings like `external_corner`, `jointer`, `tool` where appropriate

---

## Adding a new manufacturer

1. Get the PDF catalogue
2. Create `data_studio_manufacturers` row (or use existing)
3. Create `prompts/manufacturer-hints/<slug>.md`
4. Run Docling extraction
5. Dry-run the parser, review `.local/parser-dry-run/plan_*.json`
6. Run live insert
