# Live schema dump — 2026-07-07 (through migration 050)

Authoritative snapshot of the **live Data Studio Supabase project**, taken right after manually applying migrations 046–050. Per the house rule, **trust this over migration history** — migrations are applied by hand and drift.

- Columns: [`schema_dump_2026-07-07_mig050_columns.csv`](schema_dump_2026-07-07_mig050_columns.csv) (471 rows)
- RLS + policies: [`schema_dump_2026-07-07_mig050_policies.csv`](schema_dump_2026-07-07_mig050_policies.csv) (212 rows)

Applied state confirmed: migrations **001–050 all live**. 046/047 were already applied; 048/049/050 applied 2026-07-07.

## Findings that matter for the sourced-system-card build

(See [`docs/sourced-system-card-architecture.md`](../../docs/sourced-system-card-architecture.md).)

1. **`document_chunks` already exists and is rich — not legacy.** Columns: `source_document_id, document_page_id, extraction_run_id, page_number, chunk_index, heading, chunk_type, raw_text, table_json, docling_json, confidence`. Full lineage tables also present: `document_pages`, `extraction_runs`, `parser_field_evidence` (has `source_chunk_id`, `source_page_number`), `field_verifications` (same). **Provenance plumbing is already modelled.** Gap G1 is narrower than thought: the *table* exists — the docling worker just doesn't populate it yet (it writes `.local/output.md`). Step 4 = make the worker write `document_chunks` rows, not create the table.
   - RLS: anon + authenticated `SELECT true`; **no INSERT policy** → writes are service-role only (worker uses service role ✓).

2. **`card_versions` exists exactly per migration 049** (12 cols: `card_id, version, slug, name, card_json, stockists_json, validated_by, validated_at, …`). Planned additions land on top: `content_md`, `content_hash`, `sources_json`. It's insert-only (no UPDATE/DELETE policy) — the container is already immutable by design.

3. **`pipeline_jobs` needs no schema change for URL ingestion.** `job_type` is free `text` (CHECK not visible in a columns dump — verify, but current values are inserted freely). Adding `job_type = 'fetch_url'` is code-only. Has `payload jsonb, result, error_message, log_lines text[], progress jsonb, worker_id`. RLS: `service_role` full access; authenticated `SELECT true`.

4. **`source_documents` has NO `source_url` column yet** (17 cols; has `production_catalogue_source_id`). Confirms the planned migration: add `source_url` + `ingest_kind`.

5. **`staged_systems` link fields confirmed:** `website_url, source_url, source_label, tech_data_url, install_guide_urls (jsonb), design_guide_url, hero_image_url, hero_image_asset_id`, plus `source_chunk_id` (provenance) and `source_document_id`. Note ordinal 24 is absent (a dropped column) — harmless.

6. **`manufacturer_users` RLS** = single policy `users can read own membership` (`auth_user_id = auth.uid()`). Confirms the login-provisioning design: the membership's `auth_user_id` must be set (it is). No RLS on the table would have been wrong — it IS enabled with that one self-read policy.

7. **No pgvector confirmation in this dump** (extensions weren't queried). Before Step 7 (embeddings), run:
   ```sql
   select extname, extversion from pg_extension order by extname;
   select name, default_version, installed_version from pg_available_extensions where name='vector';
   ```

## Refresh procedure

Re-run these two queries in the Supabase SQL editor and replace the CSVs + this date:
```sql
-- columns
select table_name, ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns where table_schema='public' order by table_name, ordinal_position;
-- rls + policies
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname='public' order by tablename, cmd, policyname;
```
