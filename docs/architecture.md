# Architecture

## High-Level Pipeline

```
Manufacturer PDF / Product Guide
         │
         ▼
    [ Upload ]
    Manufacturer logs in and uploads source document via Data Studio web app.
         │
         ▼
    [ Store Source File ]
    Original file stored in Cloudflare R2.
    Metadata (filename, manufacturer_id, upload_timestamp, file_hash) stored in staging DB.
         │
         ▼
    [ Extract — Docling ]
    Docling processes the PDF: extracts text blocks, tables, images, layout structure.
    Page-level and chunk-level records saved to staging DB.
         │
         ▼
    [ Chunk & Classify ]
    Extracted content chunked by logical section.
    Sections classified: system description, component list, specification table, colour chart, etc.
         │
         ▼
    [ AI / Agent Parse ]
    Claude (or other LLM) reads classified chunks and generates draft structured records:
    staged_systems, staged_components, staged_system_colours, etc.
    All records are flagged as AI-suggested, not verified.
         │
         ▼
    [ Human Visual Verification ]
    Reviewer sees side-by-side: original PDF page alongside the AI-generated system card.
    Reviewer can approve, reject, or edit each field.
    Approved records flagged as human-verified.
         │
         ▼
    [ Export / Publish ]
    Approved records transformed into production schema format.
    Controlled export (SQL, CSV, or direct Supabase migration) into production project.
```

## Key Constraints

- The staging Supabase project is separate from the production project.
- No AI-generated record may enter production without human approval.
- Source documents must be traceable from every exported record (catalogue_sources linkage).
- The R2 bucket stores originals; the staging DB stores extracted and parsed derivatives.

## Storage Split

**Cloudflare R2** stores all file objects: source PDFs, page preview images, extracted images, approved product images, and manufacturer branding assets.

**Supabase** stores all metadata, structured records, and state: document metadata, extraction runs, page/chunk records, staged systems and components, verification state, and publish batches. Supabase never holds raw file blobs.

R2 objects are referenced from Supabase via `storage_key` (the full R2 object key). Signed URLs are generated server-side for private file access during verification. R2 credentials are server-side only and must never reach the browser.

See [`docs/storage-architecture.md`](./storage-architecture.md) for the full R2 key structure and access policy notes.

## Data Studio Database Layers

The Data Studio Supabase project is organised into five logical layers. Each layer feeds the next.

### 1. Source Layer

Tables: `source_documents`, `document_pages`

Stores the original uploaded manufacturer PDF metadata and rendered page images (images stored in R2, referenced by key). Every downstream record must be traceable back to a row in `source_documents`.

### 2. Extraction Layer

Tables: `extraction_runs`, `document_chunks`

Records each pipeline run (Docling extraction, chunking, classification) and the chunk-level output. Chunks are typed by content (system_description, product_table, specification_table, etc.) so the correct parsing prompt can be selected.

### 3. Staging Layer

Tables: `staged_systems`, `staged_components`, `staged_system_components`, `staged_system_colours`, `staged_system_profiles`

Holds AI/agent-generated draft records. All records start with `verification_status = 'pending_review'`. No staged record may be exported until a human sets it to `approved`.

### 4. Verification Layer

Tables: `verification_events`, `field_verifications`

Two tables work together here with distinct responsibilities:

- **`field_verifications`** — the current state of each field on a staged record. One row per `(entity_type, entity_id, field_name)`. This is what the verification UI reads and writes. It tells you right now whether a given field is pending, approved, rejected, edited, or flagged for source checking.

- **`verification_events`** — an append-only audit log of everything that happened over time. Every time a reviewer changes a field's state, a new event row is written. This is the proof chain from raw PDF to approved export and must never be updated or deleted.

The UI drives off `field_verifications`. The audit trail lives in `verification_events`.

### 5. Publishing Layer

Tables: `publish_batches`, `publish_batch_items`

Tracks controlled exports from Data Studio staging into production Supabase. A publish batch groups approved records for export. Each item tracks the production table it maps to and the production ID assigned after export.

---

## Tech Stack (planned)

| Layer | Technology |
|---|---|
| Web app | Next.js (app router) |
| API | Node.js / Hono or Next.js API routes |
| Extraction | Python + Docling |
| AI parsing | Anthropic Claude API |
| Staging DB | Supabase (separate project) |
| Source storage | Cloudflare R2 |
| Auth | Supabase Auth (manufacturer login) |
