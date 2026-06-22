# BuildQuote Data Studio — Foundation Summary

This document is the canonical briefing for anyone (or any Claude session) beginning work in this repo. Read this first before making any changes.

---

## What This Repo Is

BuildQuote Data Studio is the trusted manufacturer data ingestion, extraction, verification and publishing system.

It is responsible for turning manufacturer product guides, PDFs, brochures, installation guides and product data into verified BuildQuote system-card data.

---

## Three-Repo Architecture

BuildQuote is split across three distinct repos. Do not blur these boundaries.

### RFQ Repo
- Builder auth
- RFQ drafts, line items, status
- Messy-list AI parser (builder uploads rough lists, AI parses into RFQ items)
- RFQ review and send flow
- PDF/CSV/email generation
- Receives approved manufacturer system-card items into RFQs

### Manufacturer Portal Repo
- Public manufacturer product pages
- Supplier-facing widgets (embeddable product displays)
- Approved system-card display (reads from production Supabase)
- Add-to-RFQ flow
- Production-facing presentation layer

### Data Studio Repo (this repo)
- Manufacturer login and workspace management
- Manufacturer source document upload
- Cloudflare R2 source file storage
- Docling extraction (text, tables, layout, page structure)
- AI parser producing staged system/component data
- Human field-level verification against original source PDF
- Approval/export/publishing preparation
- Controlled migration into production Supabase (BuildQuote admin only)

---

## Core Trust Rule

> AI can suggest data.
> Humans must verify data.
> Only approved data can be exported or migrated into production.

Manufacturer verification confirms that AI-extracted data accurately reflects their own source documents. It is not the same as production publishing. Final production migration is BuildQuote-controlled, server-side only, using the service role key.

---

## Storage Boundary

**Cloudflare R2 stores files:**
- Original PDFs and product guides
- Page preview images (for verification UI)
- Extracted product images
- Approved system/component images
- Manufacturer branding (logo, hero)

**Supabase stores data:**
- Document metadata (`source_documents`)
- Extraction runs and status
- Page and chunk records
- Staged systems and components
- Field-level verification state
- Verification audit events
- Publish batches and items

R2 credentials are server-side only. Source PDFs are private by default — access uses signed URLs with short TTL. Approved public images may be CDN-backed later.

---

## Database Layers

### Source Layer
- `data_studio_manufacturers`
- `manufacturer_users`
- `data_studio_user_profiles`
- `workspace_invitations`
- `source_documents`

### Extraction Layer
- `extraction_runs`
- `document_pages`
- `document_chunks`

### Staging Layer
- `staged_systems`
- `staged_components`
- `staged_system_components`
- `staged_system_colours`
- `staged_system_profiles`

### Verification Layer
- `field_verifications` — current tick/cross/edit state per field (UI reads/writes this)
- `verification_events` — append-only audit trail of all review actions over time

### Publishing Layer
- `publish_batches`
- `publish_batch_items`

Migrations: `supabase/migrations/001_initial_extraction_schema.sql`, `002_field_verification_state.sql`, `003_manufacturer_workspaces.sql`

---

## Parser Contract Rules

Parser output (`parse_systems.py`, `parse_components.py`) must follow strict contracts defined in `docs/parser-contracts.md`.

Key rules:
- Return **JSON only**. No markdown, no prose, no commentary outside JSON.
- **Do not invent** products, systems, or values.
- Unknown values must be `null` — never estimated or guessed.
- Every extracted record must include source references: `source_document_id`, `source_chunk_id`, `source_page_number`.
- Every field must seed a `field_verifications` row with `status = 'pending'`.
- Parser output must be validated against the contract before any Supabase insert.

---

## UOM and Dimension Fields

Data Studio uses `uom` (unit of measure) internally throughout staging and parser output.

Production naming difference:
- `staged_components.uom` → `production.components.unit` (renamed at export only)
- `staged_components.uom` → `production.rfq_draft_items.uom` (no rename needed)

Do not rename `uom` to `unit` during extraction, staging, or verification. Only the export step handles this.

Dimension fields to preserve in staged components (they feed `rfq_draft_items` downstream):

| Field | Unit |
|---|---|
| `length_mm` | millimetres |
| `width_mm` | millimetres |
| `height_mm` | millimetres |
| `thickness_mm` | millimetres |
| `depth_mm` | millimetres |
| `gauge_mm` | millimetres |
| `diameter_mm` | millimetres |
| `roll_m` | metres |
| `weight_kg` | kilograms |
| `pieces` | integer count |

---

## First Strong Room

Do not build the whole palace. Build one strong room first.

First implementation slice:

```
One manufacturer
  → one login / workspace path
  → one uploaded source PDF
  → one source_documents record
  → one R2 storage reference
  → one Docling extraction run
  → one draft system card (staged_systems + staged_components)
  → field-level verification UI beside the source PDF
  → one approved export package
```

Every architectural decision has been made in service of this loop. Nothing else matters until this loop closes end-to-end.

---

## Key Docs

| Doc | Purpose |
|---|---|
| [`docs/architecture.md`](./architecture.md) | Pipeline stages and database layers |
| [`docs/workflow.md`](./workflow.md) | Phased build plan |
| [`docs/repo-boundaries.md`](./repo-boundaries.md) | Strict repo ownership boundaries |
| [`docs/storage-architecture.md`](./storage-architecture.md) | R2 key structure, access policy |
| [`docs/upload-flow.md`](./upload-flow.md) | Step-by-step upload flow |
| [`docs/auth-and-workspaces.md`](./auth-and-workspaces.md) | Roles, RLS intent, workspace model |
| [`docs/extraction-pipeline.md`](./extraction-pipeline.md) | Stage-by-stage pipeline contracts |
| [`docs/docling-strategy.md`](./docling-strategy.md) | Docling extraction rules and boundaries |
| [`docs/parser-contracts.md`](./parser-contracts.md) | Strict JSON output contracts for all parsers |
| [`docs/production-schema-mapping.md`](./production-schema-mapping.md) | Staged → production field mapping |
| [`docs/claude-build-plan.md`](./claude-build-plan.md) | Build principle |

---

## Claude Code Safety Rules

When working in this repo, Claude Code must:

- Always work on a branch — never commit directly to master.
- Show current branch and `git status` before any changes.
- List intended files before editing.
- Make one focused change at a time.
- Never run destructive commands (`git reset --hard`, `rm -rf`, etc.) without explicit instruction.
- Never edit production schema unless explicitly instructed.
- Never add real secrets or credentials to any file.
- Never bypass the human verification requirement — `field_verifications` pending/rejected records must not be exported.
- Show `git diff --stat` and `git status` after changes.
- Stop and wait after completing each task.
