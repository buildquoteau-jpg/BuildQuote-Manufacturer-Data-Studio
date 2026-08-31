# BuildQuote Data Studio

![Next.js](https://img.shields.io/badge/Next.js-black?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare_R2-storage-F38020?logo=cloudflare&logoColor=white)
![Anthropic Claude](https://img.shields.io/badge/Anthropic_Claude-AI_parser-191919?logo=anthropic&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)

AI-assisted pipeline that turns manufacturer PDFs, brochures, and spec sheets into
**verified, structured, machine-readable product data** — published as public
"System Cards" and a `knowledge.jsonld` object any site or agent can consume.

> **Core principle:** AI can suggest manufacturer data, but only human-verified data
> gets published.

---

## Why fork this

- End-to-end ingestion pipeline you don't have to build from scratch: PDF/brochure
  upload → text/table extraction (Docling) → AI two-pass parser → staged data →
  human verification UI → controlled publish.
- Ships a **standalone AI Knowledge Layer** (`/api/cards/[slug]/knowledge.jsonld`,
  `/api/knowledge/ask`) — a pattern for making verified product data
  citable/queryable by AI agents, decoupled from the rest of the pipeline.
- Schema designed for arbitrary building-product shapes (panels, rolls, fixings,
  sealants...) via structured common fields + a flexible JSON field for
  manufacturer-specific specs — not hard-coded to one product type.
- Clear repo boundary: this is the only place manufacturer catalogue data is
  authored — nothing here writes runtime state into the other two repos' domains.

---

## About the creator

This was built solo by **Melia Knapp**, after seeing — from inside a local
hardware supply store — how scattered building-product information is for
everyone who needs it, manufacturers included. The full story of why this
exists and why it's open source is in the
[Build-Quote-Library-and-Request-for-Quotation README](https://github.com/buildquoteau-jpg/Build-Quote-Library-and-Request-for-Quotation#about-the-creator).
Questions or feedback: [meliagrace@gmail.com](mailto:meliagrace@gmail.com).

---

## Who this is for

### Manufacturers — self-serve onboarding
- Upload a product guide/PDF/brochure/photos and get an AI-drafted System Card back
  for review instead of manual data entry
  ([`/manufacturer/systems`](https://studio.buildquote.com.au/manufacturer/systems)).
- Verify AI-suggested fields against the source before anything goes live —
  nothing publishes without human sign-off.
- **Just this piece:** run the ingestion pipeline standalone to turn your own PDF
  catalogue into structured JSON, even if you never plug into the wider BuildQuote
  stack.

### Any site/agent builder — AI Knowledge Layer
- `knowledge.jsonld` per product ("System Card") — structured, sourced, versioned
  facts about a product, designed to be read by LLMs/agents, not just humans.
- `/api/knowledge/ask` — ask a natural-language question about a product and get an
  answer grounded in verified fields (not free-form model guessing).
- **Just this piece:** the pattern (verify-then-publish + a JSONLD knowledge
  endpoint) is reusable for any catalogue of verified facts, not just building
  products.

### Suppliers / builders — indirect beneficiaries
- Don't interact with this repo directly. What gets verified and published here is
  what shows up as the public System Card on
  [buildquote.com.au/library](https://buildquote.com.au/library) and what
  suppliers list against in the
  [Trade Desk](https://search.buildquote.com.au).

---

## How the three BuildQuote repos fit together

```
Manufacturer catalogue (PDF/brochure)
        │
        ▼
┌───────────────────────────┐
│   Data Studio (this repo)  │  AI-parse → human-verify → System Card + knowledge.jsonld
└──────────────┬─────────────┘
               │ publish (server-side, service-role only)
               ▼
     Shared production Supabase (RFQ project)
               │
      ┌────────┴─────────┐
      ▼                   ▼
┌─────────────┐   ┌──────────────────────┐
│ Build-Quote-  │   │ BuildQuote-Supplier- │
│ Library-and-  │   │ Trade-Desk            │
│ Request-for-  │   │ (search.buildquote.  │
│ Quotation      │   │  com.au)              │
│ (buildquote.  │   │ supplier profiles,    │
│  com.au)      │   │ widgets, RFQ inbox     │
│ renders card, │◄──┤ directory builders    │
│ sends RFQs    │   │ browse to find         │
└─────────────┘   │ suppliers              │
                    └──────────────────────┘
```

- **Data Studio → production Supabase:** the *only* repo allowed to write
  manufacturer/system/component data into the shared production project (via a
  gated publish job — never a direct migration).
- **Production Supabase → v6 (`/library`):** renders the public System Card and
  `knowledge.jsonld`, and is the entry point for builders assembling an RFQ.
- **Production Supabase → Trade Desk:** suppliers manage their own listing and
  incoming RFQ inbox; the supplier directory is how builders find who to send an
  RFQ to.

## Live product surfaces

- [buildquote.com.au](https://buildquote.com.au) — builder-facing app
- [buildquote.com.au/library](https://buildquote.com.au/library) — public product
  library / System Cards rendered from this pipeline's output
- [search.buildquote.com.au](https://search.buildquote.com.au) — supplier directory
  + supplier portal (Trade Desk)
- [studio.buildquote.com.au](https://studio.buildquote.com.au) — this app

---

## Stack

- Next.js (App Router), TypeScript, Tailwind CSS — `apps/web`
- Supabase (Postgres) — two separate projects, see below
- Cloudflare R2 — source document/PDF storage (Supabase never holds file blobs)
- Docling — PDF text/table/layout extraction
- Anthropic Claude — two-pass AI parser + `/api/knowledge/ask`

## Two Supabase projects — do not confuse them

| | Purpose | Written by |
|---|---|---|
| **Data Studio** (staging) | pipeline state, staged data, verification | this app, freely |
| **Production** (RFQ/BuildQuote) | published cards, RFQ, buildquote.com.au | **only** the gated publish job |

Never point data-studio migrations at the production project.

## Setup

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Copy [`.env.example`](.env.example) → `.env.local` and fill in values. Required
groups: Data Studio Supabase (own project), production Supabase (publish-job only,
service-role scoped), Cloudflare R2 (source docs + backups), `ANTHROPIC_API_KEY`,
Docling API. **Never commit a filled-in `.env.local` or real credentials anywhere
in this repo, including docs and READMEs.**

Full architecture, pipeline detail, and runbooks: [`docs/`](docs/) — start with
[`docs/foundation-summary.md`](docs/foundation-summary.md). Step-by-step pipeline
guides: [`docs/skills/`](docs/skills/), starting with
[`manufacturer-onboarding-pipeline.md`](docs/skills/manufacturer-onboarding-pipeline.md).

---

## Open source status

- **License:** not yet chosen — **TODO**. Until a `LICENSE` file with a real
  license is added, standard copyright applies (no reuse rights are granted). See
  [`LICENSE`](LICENSE).
- **Secrets:** `.env.example` in this repo is placeholder-only (checked before
  writing this README). A full manual secrets audit across git history is still
  recommended before treating any repo as safe for public forks to build from —
  rotate anything you're not certain about.
