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

## Phase 2 — Upload and Storage

- Manufacturer login (Supabase Auth)
- Upload one manufacturer PDF via web UI
- Store source file in Cloudflare R2
- Write source document metadata to staging DB (`catalogue_sources` equivalent)

**Exit criteria:** a PDF is uploaded, stored in R2, and traceable in the staging DB.

---

## Phase 3 — Extraction

- Run Docling against the stored PDF
- Save page-level and chunk-level extraction records to staging DB
- Classify chunks by content type (system description, component table, colour chart, etc.)

**Exit criteria:** raw extracted content is queryable per page and per chunk.

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

**Exit criteria:** a human can review and approve a full system card without leaving the browser.

---

## Phase 6 — Export and Publishing

- Export approved records in production schema format
- Validate against production table structure before writing
- Controlled migration into production Supabase (gated — requires explicit confirmation)
- `catalogue_sources` linkage verified before any export

**Exit criteria:** one verified system card is live in production Supabase and visible in the Manufacturer Portal.
