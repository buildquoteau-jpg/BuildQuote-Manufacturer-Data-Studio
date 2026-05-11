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

## Status

Scaffold only. Not yet implemented.
