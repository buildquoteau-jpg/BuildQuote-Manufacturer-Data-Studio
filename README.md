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

## Storage

Source documents (PDFs, product guides) are stored in **Cloudflare R2**. Supabase stores metadata, extraction records, staged data, verification state, and publish records — never raw file blobs. See [`docs/storage-architecture.md`](./docs/storage-architecture.md) for the full storage design.

---

## Foundation Summary

For a concise project briefing — including architecture boundaries, database layers, parser rules, safety constraints, and the first implementation slice — start here:

**[`docs/foundation-summary.md`](./docs/foundation-summary.md)**

This is the recommended starting point for any new Claude Code session working in this repo.

---

## Local Development

### Install dependencies

```powershell
pnpm install
```

### Run the web app

```powershell
pnpm dev
```

Opens at [http://localhost:3000](http://localhost:3000).

### Windows PowerShell — execution policy

If PowerShell blocks pnpm with:

```
running scripts is disabled on this system
```

Run this **for the current terminal session only** — it does not permanently change your machine policy:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Then rerun `pnpm dev`.

### Python API

The API skeleton lives in [`services/api/`](./services/api/) but is not wired into the root dev command yet. See [`services/api/README.md`](./services/api/README.md) for planned routes and structure.

---

## Supabase Setup

Data Studio uses its own Supabase project, separate from the production BuildQuote Supabase. Before running any Supabase commands, read:

**[`docs/supabase-local-setup.md`](./docs/supabase-local-setup.md)**

This covers the safety boundary between Data Studio and production, required environment variables, local setup steps, and migration order.

---

## Docs

See [`docs/`](./docs/) for full architecture, workflow, repo boundaries, storage design, parser contracts, and build plan.
