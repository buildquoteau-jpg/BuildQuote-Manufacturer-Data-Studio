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

## Status

Scaffold only. Not yet implemented.
