# pipelines/docling

Stage 3 of the Data Studio extraction pipeline.

**Purpose:** Run Docling against the stored PDF to extract text, tables, layout structure and page content. Docling does not interpret BuildQuote meaning — it extracts raw structure only.

**Module:** `run_docling_extract.py`

**Inputs:**
- `source_document_id`
- Local file path (downloaded from R2) or R2 storage key

**Writes:**
- `extraction_runs` (run_type = `docling_extract`)
- `document_pages` — one row per page
- `document_chunks` — raw extracted chunks
- `source_documents.status = 'extracted'` or `'failed'`

**Key rules:**
- Page numbers must be preserved accurately (1-indexed).
- Tables stored as JSON in `document_chunks.table_json`.
- Raw Docling JSON stored in `document_pages.docling_json` and `document_chunks.docling_json`.

**Status:** Placeholder only. See `docs/docling-strategy.md` and `docs/extraction-pipeline.md`.
