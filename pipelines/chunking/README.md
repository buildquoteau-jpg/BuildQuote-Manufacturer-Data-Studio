# pipelines/chunking

Stage 4 of the Data Studio extraction pipeline.

**Purpose:** Classify raw Docling-extracted chunks by content type to route them to the correct AI parsing prompt.

**Module:** `chunk_document.py`

**Inputs:**
- `source_document_id`
- `extraction_run_id`

**Reads:** `document_chunks` (unclassified)

**Writes:**
- `document_chunks.chunk_type` — one of:
  - `product_table`
  - `system_description`
  - `accessory_list`
  - `specification_table`
  - `installation_notes`
  - `colour_chart`
  - `marketing_text`
  - `irrelevant`
- `document_chunks.heading`
- `document_chunks.confidence`
- `extraction_runs` row (run_type = `chunk_document`)

**Status:** Placeholder only. See `docs/extraction-pipeline.md`.
