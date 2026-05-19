# buildquote-data-studio

PDF catalogue ingestion pipeline and review UI for BuildQuote.

## Two Supabase projects

| | Project | URL |
|---|---|---|
| **This repo** | Data Studio (local dev) | http://localhost:54323 |
| **Production** | BuildQuote production | oxvhmulxuvlfjyjzleki.supabase.co |

**Never run data-studio migrations against the production project.**

## Schema reference

**`supabase/schema_complete.sql`** — canonical `CREATE TABLE` reference for all tables in this repo's Supabase project. Read this first before any DB work. Refreshed by re-running the columns query and updating the file.

To refresh:
```sql
SELECT table_schema, table_name, ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```
Export CSV → save to `supabase/snippets/` → update `schema_complete.sql`.

## Table groups

- **Document pipeline:** `source_documents` → `document_pages` → `document_chunks` → `extraction_runs`
- **Staged (parser output):** `staged_systems`, `staged_system_colours`, `staged_system_profiles`, `staged_components`, `staged_system_components`
- **Verification:** `field_verifications`, `parser_field_evidence`, `verification_events`
- **Publishing:** `publish_batches`, `publish_batch_items`
- **Auth/users:** `data_studio_manufacturers`, `data_studio_user_profiles`, `manufacturer_users`, `workspace_invitations`

## Key conventions

- All staged tables have `verification_status` (default `pending_review`), `parser_notes` (jsonb), `extracted_at`
- `staged_*.production_*_id` is NULL until promoted; set on publish
- Binary files (PDFs, page images) are never stored in Supabase — always Cloudflare R2; Supabase holds only the `storage_key`
- Parser inserts go through the `insert_parser_output_plan_v1` RPC (service role only) — see migration 012
