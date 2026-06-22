# pipelines/storage

Stage 2 of the Data Studio extraction pipeline.

**Purpose:** Upload the source document to Cloudflare R2 and update the `source_documents` record with storage metadata.

**Module:** `r2_storage.py`

**Inputs:**
- `source_document_id`
- `manufacturer_slug`
- File bytes or stream
- `original_filename`

**R2 key pattern:**
```
manufacturers/{manufacturer_slug}/source-documents/{source_document_id}/{original_filename}
```

**Writes:**
- R2 object
- `source_documents.storage_provider`, `.storage_bucket`, `.storage_key`, `.status = 'uploaded'`

**Status:** Placeholder only. See `docs/storage-architecture.md` and `docs/extraction-pipeline.md`.
