# pipelines/ingest

Stage 1 of the Data Studio extraction pipeline.

**Purpose:** Record the uploaded source document in Supabase before any file storage or extraction occurs.

**Module:** `ingest_source_document.py`

**Inputs:**
- `manufacturer_id`
- `original_filename`
- `document_name`
- `file_mime_type`
- `file_size_bytes`
- `uploaded_by` (auth_user_id)

**Writes:** `source_documents` row with `status = 'uploading'`

**Returns:** `source_document_id`

**Status:** Placeholder only. See `docs/extraction-pipeline.md` for full spec.
