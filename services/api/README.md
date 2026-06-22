# services/api

Backend API service for BuildQuote Data Studio.

Handles:
- File upload endpoints (receives files, writes to R2)
- Extraction job triggering (calls Docling pipeline)
- Staged data CRUD (systems, components, colours)
- Verification state updates
- Export/publish endpoints (gated, human-confirmed only)

## Structure

```
app/        Application entry point
routes/     Route handlers
services/   Business logic (storage, extraction, parsing, publishing)
db/         Database client and query helpers
```

## Pipeline Triggering

API routes trigger pipeline stages but must not contain pipeline logic themselves.

Pipeline logic lives in `pipelines/`. Route handlers in `routes/` should:
1. Validate the request and authenticate the caller.
2. Call the appropriate pipeline function from `pipelines/`.
3. Return the result.

Do not implement extraction, storage, parsing, or publishing logic inside route handlers. Keeping pipeline logic in `pipelines/` makes it independently testable and reusable outside the API (e.g. from a script or job queue).

Planned routes:
- `POST /api/documents/upload` → triggers ingest (stage 1) + storage (stage 2)
- `POST /api/documents/:id/extract` → triggers Docling (stage 3) + chunking (stage 4)
- `POST /api/documents/:id/parse` → triggers AI parsing (stages 5–6) + verification prep (stage 7)
- `POST /api/batches/:id/export` → triggers publish/export (stage 8) — BuildQuote admin only

## Status

Placeholder modules created. Implementation pending.
