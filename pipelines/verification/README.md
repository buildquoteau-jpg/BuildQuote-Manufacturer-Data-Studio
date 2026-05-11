# pipelines/verification

Stage 7 of the Data Studio extraction pipeline.

**Purpose:** Ensure all extractable fields on staged records have a `field_verifications` row ready for the human verification UI. This stage is idempotent — it prepares state, it does not verify data.

**Module:** `prepare_field_verifications.py`

**Inputs:**
- `staged_system_id` or `staged_component_id`
- Extracted field values and source chunk references

**Reads:** `staged_systems`, `staged_components`, `document_chunks`, `document_pages`

**Writes:**
- `field_verifications` — one row per (entity_type, entity_id, field_name), `status = 'pending'`
- `verification_events` — initial event where appropriate

**Key rules:**
- Each `field_verifications` row must carry `source_page_id` and `source_chunk_id` so the UI can display the correct PDF page alongside the field.
- Do not overwrite existing `field_verifications` rows that have already been reviewed (status != 'pending').

**Status:** Placeholder only. See `docs/extraction-pipeline.md`.
