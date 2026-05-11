# Extraction Pipeline

This document is the primary reference for the BuildQuote Data Studio extraction pipeline.

The pipeline turns an uploaded manufacturer PDF/product guide into verified, structured BuildQuote system-card data.

---

## Pipeline Overview

```
Stage 1 — Ingest
  ↓ source_documents row created
Stage 2 — R2 Storage
  ↓ file stored in Cloudflare R2, storage metadata written to source_documents
Stage 3 — Docling Extraction
  ↓ text, tables, layout extracted → document_pages + document_chunks created
Stage 4 — Chunk Classification
  ↓ chunks classified by type (product_table, system_description, etc.)
Stage 5 — AI Parse: Systems
  ↓ staged_systems created from classified chunks
Stage 6 — AI Parse: Components
  ↓ staged_components, staged_system_components, staged_system_colours, staged_system_profiles created
Stage 7 — Verification Prep
  ↓ field_verifications seeded per field per staged record
Stage 8 — Publish / Export
  ↓ approved records packaged into publish_batches → export or production migration
```

---

## Stage 1 — Source Document Ingest

**Module:** `pipelines/ingest/ingest_source_document.py`

**Purpose:** Record the uploaded source document in Supabase before any file storage or extraction occurs.

**Inputs:**
- `manufacturer_id` (uuid)
- `original_filename` (string)
- `document_name` (string)
- `file_mime_type` (string)
- `file_size_bytes` (int)
- `uploaded_by` (uuid — auth_user_id)

**Reads:** `data_studio_manufacturers` (to validate manufacturer exists)

**Writes:**
- `source_documents` row with `status = 'uploading'`

**Returns:** `source_document_id` (uuid)

---

## Stage 2 — R2 Storage

**Module:** `pipelines/storage/r2_storage.py`

**Purpose:** Upload the file to Cloudflare R2 and update the source document record with storage metadata.

**Inputs:**
- `source_document_id` (uuid)
- `manufacturer_slug` (string)
- `file_bytes` or file stream
- `original_filename` (string)

**R2 key pattern:**
```
manufacturers/{manufacturer_slug}/source-documents/{source_document_id}/{original_filename}
```

**Reads:** `source_documents` (to confirm row exists before writing)

**Writes:**
- R2 object at constructed key
- `source_documents.storage_provider = 'cloudflare_r2'`
- `source_documents.storage_bucket`
- `source_documents.storage_key`
- `source_documents.status = 'uploaded'`

---

## Stage 3 — Docling Extraction

**Module:** `pipelines/docling/run_docling_extract.py`

**Purpose:** Run Docling against the stored PDF to extract text, tables, layout structure, and page-level content.

**Inputs:**
- `source_document_id` (uuid)
- Local file path (downloaded from R2) or R2 storage key

**Reads:** `source_documents`

**Writes:**
- `extraction_runs` row with `run_type = 'docling_extract'`, `status = 'running'`
- `document_pages` — one row per page, with `page_text` and `docling_json`
- `document_chunks` — raw chunks extracted by Docling, with `raw_text`, `table_json`, `docling_json`
- `extraction_runs.status = 'completed'` or `'failed'`
- `source_documents.status = 'extracted'` or `'failed'`

**Notes:**
- Page numbers must be preserved accurately — they are the visual anchor for verification.
- Tables should be stored as JSON in `document_chunks.table_json`.
- Page preview images may be generated as a separate step and stored in R2 under `page-previews/`.

---

## Stage 4 — Chunk Classification

**Module:** `pipelines/chunking/chunk_document.py`

**Purpose:** Classify extracted chunks by content type to route them to the correct AI parsing prompt.

**Inputs:**
- `source_document_id` (uuid)
- `extraction_run_id` (uuid)

**Reads:** `document_chunks` (raw, unclassified)

**Writes:**
- `document_chunks.chunk_type` — one of:
  - `product_table`
  - `system_description`
  - `accessory_list`
  - `specification_table`
  - `installation_notes`
  - `marketing_text`
  - `colour_chart`
  - `irrelevant`
- `document_chunks.heading`
- `document_chunks.confidence`
- `extraction_runs` row with `run_type = 'chunk_document'`

---

## Stage 5 — AI Parse: Systems

**Module:** `pipelines/parsing/parse_systems.py`

**Prompt:** `prompts/manufacturer_system_extraction.md`

**Purpose:** Send classified chunks to the Claude API and generate draft staged system records.

**Inputs:**
- `source_document_id` (uuid)
- `manufacturer_id` (uuid)
- `document_chunks` where `chunk_type IN ('system_description', 'product_table', 'specification_table')`

**Reads:** `document_chunks`, `data_studio_manufacturers`

**Writes:**
- `extraction_runs` row with `run_type = 'parse_systems'`
- `staged_systems` rows with `verification_status = 'pending_review'`
- `field_verifications` rows seeded for each extracted field with `status = 'pending'`

---

## Stage 6 — AI Parse: Components

**Module:** `pipelines/parsing/parse_components.py`

**Prompt:** `prompts/component_extraction.md`

**Purpose:** Send classified chunks to the Claude API and generate draft staged component, colour, profile and relationship records.

**Inputs:**
- `source_document_id` (uuid)
- `manufacturer_id` (uuid)
- `staged_system_id` (uuid, if system context is available)
- `document_chunks` where `chunk_type IN ('product_table', 'specification_table', 'accessory_list', 'colour_chart')`

**Reads:** `document_chunks`, `staged_systems`

**Writes:**
- `extraction_runs` row with `run_type = 'parse_components'`
- `staged_components` rows
- `staged_system_components` rows
- `staged_system_colours` rows
- `staged_system_profiles` rows
- `field_verifications` rows seeded per extracted field

---

## Stage 7 — Verification Prep

**Module:** `pipelines/verification/prepare_field_verifications.py`

**Purpose:** Ensure all extractable fields on staged records have a corresponding `field_verifications` row ready for the UI.

**Inputs:**
- `staged_system_id` or `staged_component_id` (uuid)
- extracted field values

**Reads:** `staged_systems`, `staged_components`, `document_chunks`, `document_pages`

**Writes:**
- `field_verifications` — one row per (entity_type, entity_id, field_name), `status = 'pending'`
- `verification_events` — initial event if appropriate

**Notes:**
- This stage is idempotent — if a `field_verifications` row already exists for a field, it should not be overwritten unless the extraction was re-run.
- Source page and chunk references should be set on each `field_verifications` row for the UI to show the correct PDF page beside the field.

---

## Stage 8 — Publish / Export

**Module:** `pipelines/publishing/export_publish_batch.py`

**Purpose:** Package approved staged records into a publish batch for controlled export or production migration.

**Inputs:**
- `manufacturer_id` (uuid)
- list of approved `staged_system_id`, `staged_component_id`, etc.
- `export_type` (`csv` or `direct_migration`)

**Reads:**
- `staged_systems`, `staged_components`, `staged_system_components`, `staged_system_colours`, `staged_system_profiles`
- `field_verifications` (must all be `approved` or `edited` — no `pending` or `rejected`)
- `verification_events`

**Writes:**
- `publish_batches` row
- `publish_batch_items` rows
- CSV export file (to R2 or local) — later
- Production Supabase rows — server-side only, service role key, later

**Safety rule:** No record may be included in a publish batch if any `field_verifications` row for that record has `status = 'pending'` or `status = 'rejected'`. This must be enforced in the export module, not just the UI.

---

## Pipeline Execution Model

For the first vertical slice:
- Pipeline stages are triggered **manually** via API routes or scripts.
- No background job queue is required yet.
- Each stage should be independently runnable and testable.
- Stages write their output to Supabase so progress is resumable if a stage fails.

Future:
- A job queue (e.g. BullMQ, Temporal, or Supabase Edge Functions) may coordinate stages.
- For now, manual triggering is acceptable.
