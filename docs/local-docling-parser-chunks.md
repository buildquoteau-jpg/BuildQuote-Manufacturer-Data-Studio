# Local Docling Parser Chunks

Splits a Docling markdown export into structured, parser-ready chunks.
Run this after `docling:extract` to get chunks suitable for AI parsing.

**Scope of this workflow:**
- Reads `.local/docling-output/<folder>/output.md` + `summary.json`
- Writes `.local/parser-inputs/docling/<folder>/parser_chunks.json`
- No database writes
- No AI calls
- No Supabase
- No secrets

---

## Prerequisites

Run `docling:extract` first to produce a Docling output folder:

```powershell
python scripts/docling/extract_docling.py `
  --input "C:\path\to\catalogue.pdf" `
  --document-id b576c341-bbb1-4124-ad41-9cc90c4816fc
```

See [local-docling-extraction.md](local-docling-extraction.md) for setup.

---

## Running

From the repo root:

```powershell
pnpm docling:chunks -- --input ".local/docling-output/NewTechWood-Product-Brochure-October-2025_20260514T122534Z"
```

### Dry-run (no file written)

```powershell
pnpm docling:chunks -- `
  --input ".local/docling-output/NewTechWood-Product-Brochure-October-2025_20260514T122534Z" `
  --dry-run
```

Prints counts, type breakdown, and first 5 chunk headings only. No catalogue text is printed to terminal.

### Arguments

| Flag | Required | Description |
|------|----------|-------------|
| `--input` | Yes | Path to Docling output directory (under `.local/docling-output/`) |
| `--dry-run` | No | Preview stats without writing output |
| `--out` | No | Custom output path. Must be under `.local/`. Defaults to `.local/parser-inputs/docling/<folder>/parser_chunks.json` |

---

## Output

```
.local/parser-inputs/docling/<docling-folder>/parser_chunks.json
```

This folder is **gitignored** via `.local/` in `.gitignore`.

### Output structure

```json
{
  "_meta": {
    "generated_at": "2026-05-14T12:00:00.000Z",
    "generator": "docling-build-chunks.ts",
    "local_only": true,
    "source_tool": "docling"
  },
  "document": {
    "input_filename": "NewTechWood-Product-Brochure-October-2025.pdf",
    "document_id": "b576c341-bbb1-4124-ad41-9cc90c4816fc",
    "page_count": 16,
    "docling_output_dir": "NewTechWood-Product-Brochure-October-2025_20260514T122534Z"
  },
  "combined_text_metadata": {
    "chunk_count": 28,
    "total_chars": 27400,
    "chunk_type_counts": {
      "text": 16,
      "table": 3,
      "spec_table": 9
    }
  },
  "chunks": [
    {
      "chunk_index": 0,
      "page_number": null,
      "chunk_type": "text",
      "heading": "Build with the Benchmark",
      "char_count": 412,
      "raw_text": "..."
    }
  ]
}
```

### Chunk types

| Type | Description |
|------|-------------|
| `text` | Prose paragraphs, feature bullets, product code lines |
| `table` | Markdown pipe table (compatibility matrix, ranges) |
| `spec_table` | Technical specification table containing profile codes, dimensions, lengths, qty/pack, or span ratings |

**Spec-table detection:** A table is classified as `spec_table` if its headers contain at least one core keyword (`profile code`, `dimensions`, `qty/pack`) or two or more secondary keywords (`max span`, `slip rating`, `secret fix`, `double sided`, etc.).

### Page numbers

`page_number` is `null` for all chunks. Docling's markdown export does not include page boundary markers. Page-level information is available in `docling_document.json` for future use.

---

## What this does NOT do

- Does **not** call OpenAI, Anthropic, or any AI API
- Does **not** write to the database (no `document_chunks` rows)
- Does **not** run `parser:insert-local`
- Does **not** upload to R2 or any cloud storage
- Does **not** connect to Supabase

---

## Full local pipeline so far

```
1. python scripts/docling/extract_docling.py --input <pdf>
        ↓
   .local/docling-output/<folder>/output.md
                                 docling_document.json
                                 summary.json

2. pnpm docling:chunks -- --input ".local/docling-output/<folder>"
        ↓
   .local/parser-inputs/docling/<folder>/parser_chunks.json

3. (next) pnpm parser:ai-local — feed chunks to AI parser
4. (next) pnpm parser:dry-run — validate AI output
5. (next) pnpm parser:insert-local — write to local Supabase
```

Steps 3–5 use the existing parser pipeline. The Docling chunk bundle replaces the earlier simple-extraction bundle.
