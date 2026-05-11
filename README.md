# BuildQuote Data Studio

BuildQuote Data Studio is the manufacturer data ingestion and verification system for BuildQuote.

It is responsible for turning manufacturer product guides, PDFs, brochures, installation guides and product data into verified BuildQuote system-card data.

## Core Principle

> AI can suggest manufacturer data, but only human-verified data can be published into production.

---

## Three-Repo Architecture

BuildQuote is split across three distinct repos with clear boundaries:

| Repo | Purpose |
|---|---|
| **RFQ repo** | Builder auth, RFQ drafts, messy-list AI parser, RFQ sending |
| **Manufacturer Portal repo** | Approved product/card/widget presentation layer, supplier widgets, public manufacturer pages, add-to-RFQ flow |
| **Data Studio repo** (this repo) | Ingestion, extraction, staging, human verification, approval, and controlled publishing of manufacturer catalogue data |

These repos must not share runtime state or write directly to each other's databases. Data Studio is the only repo allowed to prepare and export manufacturer catalogue data into production.

---

## Pipeline Overview

```
Manufacturer PDF/Product Guide
→ Upload
→ Store source file (Cloudflare R2)
→ Extract text/tables/layout (Docling)
→ Chunk and classify content
→ AI/agent parser creates staged systems/components
→ Human verifies against original source
→ Approved data prepared for export
→ Controlled migration/export into production Supabase
```

---

## Docs

See [`docs/`](./docs/) for architecture, workflow, repo boundaries, and build plan.
