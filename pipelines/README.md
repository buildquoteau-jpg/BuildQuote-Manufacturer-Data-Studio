# pipelines

Extraction and processing pipeline modules for BuildQuote Data Studio.

Each sub-folder represents a stage in the pipeline:

| Stage | Purpose |
|---|---|
| `ingest/` | Receive and validate uploaded source documents |
| `storage/` | Write source files to Cloudflare R2, write metadata to staging DB |
| `docling/` | Run Docling extraction on stored PDFs |
| `chunking/` | Chunk and classify extracted content by section type |
| `parsing/` | AI/agent parse classified chunks into staged structured records |
| `verification/` | Utilities for verification state management |
| `publishing/` | Export approved records in production schema format |

## Design Principles

Pipelines are designed as staged, independently testable units:

- Each stage has a defined input contract, a defined set of Supabase tables it reads/writes, and a defined output.
- Stages can be run individually for debugging or re-run if a previous attempt failed.
- No stage may bypass human verification. The verification stage (stage 7) and the export safety check in stage 8 are mandatory gates — not optional UI niceties.
- Pipeline logic lives in `pipelines/`. API routes in `services/api/routes/` trigger pipeline stages but do not contain pipeline logic themselves.
- AI suggestions from stages 5 and 6 are always written as `verification_status = 'pending_review'`. They cannot be published until a human approves them.

See `docs/extraction-pipeline.md` for the full stage-by-stage specification.

## Status

Placeholder modules created. Implementation pending. See each sub-folder README for stage details.
