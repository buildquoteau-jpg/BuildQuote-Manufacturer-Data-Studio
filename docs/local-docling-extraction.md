# Local Docling Extraction

Run a local PDF through Docling and write structured output to `.local/docling-output/`.

**Scope of this workflow:**
- Local PDF in → Docling output files out
- No database writes
- No R2 uploads
- No `parser:insert-local`
- No publish/export

---

## What Docling does

[Docling](https://github.com/DS4SD/docling) is an open-source document conversion library from IBM Research. It parses PDF files using layout analysis and AI-based structure detection to produce:

- Clean **markdown** with headings, lists, and paragraphs preserved
- Structured **JSON** with page-level layout, text blocks, tables, and figure references
- Accurate **table extraction** including multi-column and merged-cell tables

Docling is significantly better than naive PDF text extraction for complex catalogue PDFs with mixed layouts.

---

## Python venv setup (Windows PowerShell)

Run these once from the repo root:

```powershell
python -m venv .venv-docling
.\.venv-docling\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install docling
```

> **First-run model download:** Docling downloads AI models (~1–2 GB) on first use from Hugging Face. This is expected. Subsequent runs use the cached models. Models can be prefetched for offline use — see the [Docling offline docs](https://ds4sd.github.io/docling/usage/offline/) if you need air-gapped operation.

To activate the venv in future sessions:

```powershell
.\.venv-docling\Scripts\Activate.ps1
```

---

## Running an extraction

Always run from the **repo root** with the venv active:

```powershell
python scripts/docling/extract_docling.py `
  --input "C:\path\to\catalogue.pdf" `
  --document-id b576c341-bbb1-4124-ad41-9cc90c4816fc
```

Or with the root package script shorthand (passes through additional args):

```powershell
pnpm docling:extract -- --input "C:\path\to\catalogue.pdf" --document-id b576c341-bbb1-4124-ad41-9cc90c4816fc
```

### Arguments

| Flag | Required | Description |
|------|----------|-------------|
| `--input` | Yes | Absolute or relative path to local PDF |
| `--document-id` | No | UUID of the `source_documents` row to embed in `summary.json` |
| `--out` | No | Custom output folder. Must be under `.local/docling-output/`. Auto-named if omitted. |
| `--ocr` | No | Enable OCR. Only needed for scanned (image-based) PDFs. Off by default — manufacturer catalogues are text-native and OCR can cause memory crashes on large images. |

---

## Output folder

All outputs go to:

```
.local/docling-output/<input-stem>_<timestamp>/
```

This folder is **gitignored** via `.local/` in `.gitignore`.

### Output files

| File | Contents |
|------|----------|
| `output.md` | Full markdown export of the PDF |
| `docling_document.json` | Docling's structured document JSON (pages, tables, text blocks) |
| `summary.json` | Small summary with counts, filename, document_id, timestamp |

### Example `summary.json`

```json
{
  "input_filename": "catalogue.pdf",
  "document_id": "b576c341-bbb1-4124-ad41-9cc90c4816fc",
  "page_count": 48,
  "character_count": 84210,
  "table_count": 12,
  "output_files": {
    "markdown": "output.md",
    "docling_json": "docling_document.json",
    "summary": "summary.json"
  },
  "timestamp": "2026-05-14T12:00:00+00:00"
}
```

---

## What this does NOT do

- Does **not** write to the database (no `source_documents`, `pages`, or `chunks` rows)
- Does **not** upload to R2 or any cloud storage
- Does **not** run `parser:insert-local`
- Does **not** connect to production Supabase
- Does **not** log or print absolute input paths in output files

These steps come later in the pipeline, separately.

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'docling'`**
The venv is not active or Docling is not installed.
```powershell
.\.venv-docling\Scripts\Activate.ps1
pip install docling
```

**Script says input file not found**
Check the path. On Windows, use full paths or run from a known working directory.

**First run is very slow**
Docling is downloading AI models. Normal on first run. Wait for it to complete.

**PowerShell execution policy error**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
