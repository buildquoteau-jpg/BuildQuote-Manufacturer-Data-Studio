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
