# Local PDF Extraction Runbook

## What this is

A local-only extraction harness for BuildQuote Data Studio developers. It lets you take a
real PDF file on your machine, run text extraction against it, write the resulting pages and
chunks into your local Supabase staging database, and then inspect those chunks through the
protected admin document detail route.

**This is NOT:**
- An upload system (no R2 / Cloudflare storage involved)
- A manufacturer-facing upload flow
- An AI parser call (no LLM, no Anthropic API)
- A staged catalogue insertion (no `staged_systems`, `staged_components`)
- A production DB write (never touches `oxvhmulxuvlfjyjzleki.supabase.co`)

**Tables written by this harness:**
- `source_documents` — one row per extraction, `storage_provider = 'local_only'`
- `extraction_runs` — one row per run, `run_type = 'chunk_document'`
- `document_pages` — one row per PDF page (with raw `page_text`)
- `document_chunks` — chunked text rows linked to pages and the run

---

## Prerequisites

| Requirement | How to check |
|---|---|
| Local Supabase running | `npx supabase status` — should show local URL |
| Migrations applied | `npx supabase db reset` or inspect tables in Supabase Studio |
| Manufacturer seeded | Open Supabase Studio → `data_studio_manufacturers` table |
| `.env.local` configured | See `.env.example` for required vars |
| `LOCAL_ONLY_ALLOW_SERVICE_ROLE=true` in `.env.local` | Required; see safety note below |
| PDF file on your machine | Any readable PDF — use an absolute path |

### Required `.env.local` entries

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your local anon key>
SUPABASE_SERVICE_ROLE_KEY=<your local service role key>
LOCAL_ONLY_ALLOW_SERVICE_ROLE=true
```

> **Why service role?**
> RLS migrations 004–006 grant only SELECT to anon/authenticated on all data studio tables.
> No INSERT/UPDATE policy exists yet. The extraction script uses the service role key to
> bypass RLS for local writes only. This is intentional — app runtime code never uses the
> service role key. Get your local keys from `npx supabase status`.

---

## Seeded manufacturer slugs

The default seed (`supabase/seed.sql`) creates these manufacturers:

| Slug | Name | Status |
|---|---|---|
| `newtechwood` | NewTechWood | active |
| `james-hardie` | James Hardie | active |
| `modwood` | ModWood | draft |

If you need a different manufacturer, insert one via Supabase Studio or a SQL snippet first.

---

## How to run the extraction script

From the monorepo root:

```bash
pnpm extract:local-pdf -- \
  --manufacturer newtechwood \
  --file "C:\Users\you\Documents\newtechwood-guide.pdf" \
  --type product_guide \
  --name "NewTechWood Product Guide Test"
```

**From `apps/web` directly:**

```bash
pnpm run extract:local-pdf -- \
  --manufacturer newtechwood \
  --file "/Users/you/Documents/newtechwood-guide.pdf" \
  --type product_guide \
  --name "NewTechWood Product Guide Test"
```

### Arguments

| Arg | Required | Description |
|---|---|---|
| `--manufacturer` | Yes | Manufacturer slug (must exist in `data_studio_manufacturers`) |
| `--file` | Yes | Absolute path to the PDF file |
| `--type` | No | `product_guide` \| `installation_guide` \| `brochure` \| `spec_sheet` \| `other` (default: `product_guide`) |
| `--name` | No | Display name for the document (default: filename without extension) |

### What the script prints

On success, you will see a summary like:

```
──────────────────────────────────────────────────────────────
  Local Extraction Complete
──────────────────────────────────────────────────────────────
  Manufacturer:   NewTechWood (newtechwood)
  Pages:          42
  Chunks:         87
  Status:         extracted
  Source doc ID:  <uuid>
  Extraction run: <uuid>
  Artifact:       .local/extractions/newtechwood-2026-...json
──────────────────────────────────────────────────────────────
```

No secrets, keys, or extracted file contents are printed to the terminal.

---

## Local artifact

The script writes a JSON artifact to `.local/extractions/` (gitignored). It contains:

- Manufacturer and document metadata
- `pages` array: page number, char count, full extracted text, hash
- `chunks` array: page number, chunk index, char count, full text, hash

This file is safe to inspect locally but **must not be committed** (it may contain
copyrighted catalogue text). The `.gitignore` entry for `.local/` covers it.

---

## How to view chunks in the admin route

1. Start the dev server: `pnpm dev`
2. Log in as a BuildQuote admin user
3. Navigate to `/admin/manufacturers`
4. Find the manufacturer you extracted for
5. Click into `Documents`
6. Each document row now links to its detail page
7. The detail page shows:
   - Document metadata (status, type, file size, source note)
   - Latest extraction run (tool, status, timing)
   - All extracted chunks: page number, chunk index, char count, text preview

---

## Troubleshooting

### Docker / local Supabase not running

```
Error: NEXT_PUBLIC_SUPABASE_URL is set but Supabase is not reachable
```

Start Supabase: `npx supabase start`

### RLS blocks writes — "permission denied for table source_documents"

The service role key is wrong or not loaded. Check:
1. `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local` (get from `npx supabase status`)
2. `LOCAL_ONLY_ALLOW_SERVICE_ROLE=true` is also in `.env.local`
3. The `.env.local` file is at the monorepo root

### Manufacturer slug not found

The slug must exist in `data_studio_manufacturers`. Check via Supabase Studio or:

```sql
SELECT slug, name FROM data_studio_manufacturers;
```

If you haven't seeded, run `npx supabase db reset` which applies `supabase/seed.sql`.

### Missing env vars

The script validates env vars before connecting. Each missing var is named explicitly.
Copy `.env.example` to `.env.local` and fill in values.

### PDF extraction returns empty text

Some PDFs are image-only (scanned) — `pdf-parse` can only extract text layer content.
Scanned PDFs will produce empty pages. The script still inserts page rows (with `page_text = null`)
and proceeds without error. Chunk count will be zero.

### Build / TypeScript errors

Run typecheck from the web package:

```bash
pnpm --filter web build
```

The extraction script (`extract-local-pdf.mjs`) is not TypeScript and is excluded from the
`tsconfig.json` `include` glob — it will not cause typecheck failures.

---

## Safety checklist

| Rule | Status |
|---|---|
| Do not commit PDF files | `.gitignore` covers `*.pdf` — verify before committing |
| Do not commit `.local/` artifacts | `.gitignore` covers `.local/` |
| Do not use production Supabase | `NEXT_PUBLIC_SUPABASE_URL` must point to `127.0.0.1` |
| Do not print secrets | Script never echoes env var values |
| Do not expose storage keys in UI | Detail page shows `storage_provider` label only, never bucket/key/URL |
| Service role only in local script | `extract-local-pdf.mjs` is never imported by app runtime code |
| `LOCAL_ONLY_ALLOW_SERVICE_ROLE=true` is local-only | Never commit `.env.local`; never set this in CI/CD |

---

## What comes next (out of scope for this chunk)

- Manufacturer-facing upload UI
- Cloudflare R2 storage integration
- AI / LLM parser calls
- `staged_systems` / `staged_components` insertion
- `parser_field_evidence` insertion
- Field-level correction UI
- Approve / reject writes
- Production publishing / export
