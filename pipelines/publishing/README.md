# pipelines/publishing

Stage 8 of the Data Studio extraction pipeline.

**Purpose:** Package human-approved staged records into a publish batch for controlled export or production migration. This is the only stage that can produce output destined for the production Supabase project.

**Module:** `export_publish_batch.py`

**Inputs:**
- `manufacturer_id`
- List of approved staged record IDs
- `export_type` (`csv` or `direct_migration`)

**Reads:**
- `staged_systems`, `staged_components`, `staged_system_components`, `staged_system_colours`, `staged_system_profiles`
- `field_verifications` (all must be `approved` or `edited` — none may be `pending` or `rejected`)
- `verification_events`

**Writes:**
- `publish_batches`
- `publish_batch_items`
- CSV export (future)
- Production Supabase rows (future — server-side only, service role key)

**Safety rule:** A record with any `field_verifications` row in `pending` or `rejected` status must be blocked from inclusion in a publish batch. This check must be enforced in this module, not only in the UI.

**Status:** Placeholder only. See `docs/extraction-pipeline.md` and `docs/production-schema-mapping.md`.
