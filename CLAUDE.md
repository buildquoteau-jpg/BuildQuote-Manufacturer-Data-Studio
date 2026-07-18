# buildquote-data-studio

PDF catalogue ingestion pipeline and review UI for BuildQuote.

## Two Supabase projects

| | Project | URL | env vars |
|---|---|---|---|
| **Data Studio (this repo, LIVE)** | staging tables + app + pipeline | ovndokzwkxpfjfobewaq.supabase.co | `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` |
| **RFQ / BuildQuote production** | published cards, RFQ, buildquote.com.au | oxvhmulxuvlfjyjzleki.supabase.co | `PRODUCTION_SUPABASE_URL` / `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` |

**Never run data-studio migrations against the RFQ production project.** The
RFQ project is written to only by the hybrid-publishing flow
(`apps/web/lib/studio-admin/publish.ts`). There is no separate "Data Studio
production" project anymore — ovndok IS live Data Studio; the old local-dev
topology this doc used to describe is gone (2026-07-18 audit).

## Schema reference

**`supabase/schema_complete.sql`** — GENERATED reference for all tables in the
live Data Studio project. Read this first before any DB work, and **regenerate
it after every applied migration**:

```powershell
node scripts/refresh_schema_reference.mjs
```

It pulls the PostgREST OpenAPI spec from the live project (creds from
`.env.local`) — never hand-edit it. A surprising diff after regeneration IS the
schema-drift alarm; the hand-maintained version of this file went two months
stale and enabled the migration-026 RPC breakage.

**After any migration touching `staged_*` tables or the parser RPC**, also run
the tests in `supabase/tests/` (see its README) — `012_06` round-trips every
plan field through the RPC and catches both loud (42703) and silent
(dropped-field) drift.

## Table groups

- **Document pipeline:** `source_documents` → `document_pages` → `document_chunks` → `extraction_runs`
- **Staged (parser output):** `staged_systems`, `staged_system_colours`, `staged_system_profiles`, `staged_components`, `staged_system_components`
- **Verification:** `field_verifications`, `parser_field_evidence`, `verification_events`
- **Publishing:** `publish_batches`, `publish_batch_items`
- **Auth/users:** `data_studio_manufacturers`, `data_studio_user_profiles`, `manufacturer_users`, `workspace_invitations`

## Skills / runbooks

Step-by-step guides for common pipeline tasks live in `docs/skills/`:

| Skill | What it covers |
|---|---|
| [`manufacturer-onboarding-pipeline.md`](docs/skills/manufacturer-onboarding-pipeline.md) | Full end-to-end: create manufacturer → Docling → AI parser → dup check → web enricher → verify → backup |
| [`catalogue-parser-pipeline.md`](docs/skills/catalogue-parser-pipeline.md) | Docling extraction + AI two-pass parser in detail |
| [`web-enricher-pipeline.md`](docs/skills/web-enricher-pipeline.md) | Fills `hero_image_url`, `website_url`, `source_url` from manufacturer website |

**Start with `manufacturer-onboarding-pipeline.md`** for any new manufacturer.

---

## Key conventions

- All staged tables have `verification_status` (default `pending_review`), `parser_notes` (jsonb), `extracted_at`
- `staged_*.production_*_id` is NULL until promoted; set on publish
- Binary files (PDFs, page images) are never stored in Supabase — always Cloudflare R2; Supabase holds only the `storage_key`
- Parser inserts go through the `insert_parser_output_plan_v1` RPC (service role only) — see migrations 012/057/058
- Every pipeline script run (worker-spawned or manual terminal) reports to `pipeline_jobs` via `scripts/lib/pipeline_report.py`; the app's Pipeline page (Funnel tab) shows live progress, stalled jobs, and failures
- The parser saves its plan to `.local/parser-dry-run/plan_*.json` BEFORE inserting; a failed insert is retried with `--from-plan` (no re-extraction)
