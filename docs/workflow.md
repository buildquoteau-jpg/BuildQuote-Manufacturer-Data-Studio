# Workflow — Phased Build Plan

Each phase delivers a working vertical slice. Do not start a phase until the previous one is solid.

---

## Phase 1 — Scaffold and Design

- Create repo scaffold (this)
- Design staging Supabase schema (manufacturers, systems, components, source documents, verification state)
- Create manufacturer auth plan
- Create source document upload model
- Document extraction pipeline contracts

**Exit criteria:** repo structure clear, schema designed, contracts documented.

---

## Phase 1b — Manufacturer Login and Workspace Selection

Before uploading anything, the manufacturer must:

1. Sign up or log in via Supabase Auth.
2. Have a `data_studio_user_profiles` row created on first login (global_role = `manufacturer_user`).
3. Either accept a workspace invitation (creating a `manufacturer_users` row) or be manually assigned to a workspace by a BuildQuote admin.
4. Select their active workspace (manufacturer account) from their dashboard.
5. All subsequent actions (uploads, verification, review) are scoped to the selected workspace's `manufacturer_id`.

BuildQuote internal users (reviewers, admins) log in via the same auth system but their `global_role` grants cross-workspace access without workspace selection.

**Exit criteria:** a manufacturer user can log in, land in their workspace dashboard, and see their (empty) document list.

---

## Phase 2 — Upload and Storage

- Manufacturer login (Supabase Auth)
- Upload one manufacturer PDF via web UI
- Validate file type and size server-side
- Create `source_documents` row in Supabase with `status = 'uploading'`
- Store file in Cloudflare R2 using structured key: `manufacturers/{slug}/source-documents/{id}/{filename}`
- Update `source_documents` with storage metadata and `status = 'uploaded'`
- Create queued `extraction_runs` row ready for manual trigger
- Document visible in dashboard as uploaded and ready for extraction

R2 credentials are server-side only. File access during verification uses signed URLs with short TTL.

See [`docs/upload-flow.md`](./upload-flow.md) and [`docs/storage-architecture.md`](./storage-architecture.md) for full detail.

**Exit criteria:** a PDF is uploaded, stored in R2, and traceable in the staging DB via `source_documents`.

---

## Phase 3 — Docling Extraction and Chunk Classification

- Download source PDF from R2 to a temporary local path
- Run Docling extraction (pipeline stage 3): save `document_pages` and `document_chunks` rows
- Store raw Docling JSON in `document_pages.docling_json` and `document_chunks.docling_json`
- Preserve page numbers accurately (1-indexed) — page number is the visual anchor for verification
- Store tables as JSON in `document_chunks.table_json`
- Generate page preview images and store in R2 under `page-previews/` (separate step)
- Run chunk classification (pipeline stage 4): assign `chunk_type` to each chunk
- `extraction_runs` rows created for both the Docling run and the classification run

See `docs/docling-strategy.md` for page number, table preservation and confidence rules.
See `pipelines/docling/run_docling_extract.py` and `pipelines/chunking/chunk_document.py`.

**Exit criteria:** raw extracted content is queryable per page and per chunk, with chunk types assigned.

---

## Phase 4 — AI Parsing

- Send classified chunks to Claude API using extraction prompts
- Generate draft staged records: staged_systems, staged_components, staged_system_colours
- All records stored as `status: ai_suggested`

**Exit criteria:** one complete draft system card generated from a real manufacturer PDF.

---

## Phase 5 — Visual Verification UI

- Side-by-side view: original PDF page alongside generated system card
- Field-level approve / reject / edit controls
- Approved records flagged as `status: human_verified`
- Rejected records flagged with rejection reason

The reviewer verifies fields, not just whole records. Each field on a staged system or component can be individually approved, rejected, edited, or flagged for source checking. The `field_verifications` table tracks the current state of each field. The `verification_events` table logs every action taken. A staged record is only eligible for export once all its fields have been reviewed.

**Exit criteria:** a human can review and approve a full system card without leaving the browser.

---

## Phase 6 — Export and Publishing

- Export approved records in production schema format
- Validate against production table structure before writing
- Controlled migration into production Supabase (gated — requires explicit confirmation)
- `catalogue_sources` linkage verified before any export

**Exit criteria:** one verified system card is live in production Supabase and visible in the Manufacturer Portal.

---

## First Database Milestone

The first database milestone is not to build the whole platform.

It is to support:
- one manufacturer
- one uploaded product guide
- one extraction run
- one draft system card
- one human verification flow
- one approved export package

Every table in `001_initial_extraction_schema.sql` exists to serve that loop. Nothing more yet.
