# Sourced System Card Architecture

**Status:** Design + implementation plan. Approved to build (no deferred "down the track" — the only phasing below is dependency order).

**Goal:** Make every system card a **static, versioned, self-contained container** that AI can search *within* and cite *as a source*. To do that, the card's structured data **and the content of its specific links** (install guide, design guide, website, tech data, source catalogue) must be treated as one searchable, provenance-bearing unit — resolvable entirely from `card_id + version`.

This doc unifies two previously separate threads:
1. **URL ingestion** — add a link/URL as a parse source instead of downloading + re-uploading a PDF.
2. **Sourced container** — cards as citable RAG sources.

They are the same system. URL ingestion is stage one of the container.

---

## 1. Guiding principle

> Everything the AI needs must be resolvable from `card_id + version` **as text**, including the text of every linked document, **frozen at validation time**, with per-chunk provenance so answers can cite back to (card URL, version, source role, page).

Three load-bearing decisions follow from this, and they are the cheap-now / impossible-to-retrofit ones:

- **A link is a typed, content-bearing *source association*, not a display string.**
- **Provenance travels on every chunk** (source_document_id, role, page range) from docling all the way into the container.
- **The published version is the container of record** — immutable, hashed, self-contained.

---

## 2. Current state (what already exists)

| Piece | Where | Notes |
|---|---|---|
| Upload → R2 → register | `api/manufacturer/{presign-upload,register-document}` | Browser PUTs to R2, inserts `source_documents` (has `storage_key`, `public_url`). |
| Docling | `api/pipeline/run-docling` → `scripts/worker/pipeline_worker.py` | Enqueues a `pipeline_jobs` row; worker downloads the PDF from R2 by `storage_key`, chunks it, writes `output.md`. |
| Parser | worker `handle_parser` → `scripts/parser/run_parser.py` | Reads `output.md`, populates `staged_systems` + related. |
| Card links | `staged_systems`: `install_guide_urls` (jsonb `{label,url}[]`), `design_guide_url`, `website_url`, `tech_data_url`, `source_url`, `source_document_id` | Scattered scalar/jsonb fields — **display only, content not captured.** |
| Container (nascent) | `card_versions` (migration 049) → `getHostedCard` → `api/cards/[slug]/card.json` | Immutable per-version snapshot: `card_id, version, slug, name, card_json, stockists_json, validated_at`. **This is the container — it just lacks linked-doc text and an index.** |
| Static bundle | `scripts/build-static-card-bundle.mjs`, `lib/packages/*` | Renders cards as a website-ready static package. |

### Gaps this architecture closes

- **G1 — Docling output is not durably stored.** The worker writes `output.md` to `.local/` on its own disk + `.local/docling-index.json`. The `document_chunks` table **already exists and is rich** (`source_document_id, document_page_id, page_number, chunk_index, heading, chunk_type, raw_text, table_json, docling_json, confidence` — confirmed in the 2026-07-07 dump) but the current worker **does not populate it**. So G1 is narrow: the schema is there; the worker just needs to write the rows. Chunk text + page provenance must live in the DB, not ephemeral worker disk.
- **G2 — Links carry no content.** Only URLs are stored; the PDFs behind them are never ingested.
- **G3 — No content snapshot in the container.** `card_json` has fields but not the linked-doc text; if a manufacturer URL dies, the source is lost.
- **G4 — No retrieval index.** No embeddings/full-text over the container.

---

## 3. Target architecture

```
 Add link/URL (role) ──► system_sources row (url = LIVE LINK, instant)
        │                         │
        │                    enqueue fetch_url job
        ▼                         ▼
   card live link          worker: fetch ──► R2 ──► docling ──► document_chunks
   renders immediately              (durable copy)     (text + page provenance)
                                          │
                                          ▼
                        source_document_id back-filled on system_sources
                                          │
                              ┌───────────┴───────────┐
                        (on publish)            (on demand)
                              ▼                        ▼
                     card_versions snapshot     card_embeddings (pgvector)
                     + content_md + content_hash   keyed by card_id+version+chunk
                              ▼
                     static container to R2: card.json + content.md + manifest
```

### 3.1 Typed source associations — `system_sources`

The keystone. One row per (system, link):

```
system_sources(
  id                uuid pk,
  manufacturer_id   uuid not null,           -- tenant scope for RLS
  staged_system_id  uuid not null,           -- FK staged_systems
  role              text not null,           -- install_guide | design_guide | website | tech_data | source_catalogue
  label             text,                    -- display label (from install_guide_urls[].label)
  url               text not null,           -- the LIVE LINK, rendered on the card immediately
  source_document_id uuid,                   -- FK source_documents; NULL until ingested
  ingest_status     text not null default 'linked',  -- linked | queued | fetching | extracted | failed | skipped
  include_in_container boolean not null default true, -- website links may be link-only
  sort_order        int default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
)
```

- `url` does double duty: **live link** (independent of ingestion) + **fetch target**.
- `source_document_id` fills in after the worker ingests; the live link never waits on it.
- `include_in_container = false` lets a `website` link be shown but not chunked into the container.

The existing scalar/jsonb link fields on `staged_systems` remain the **render source of truth for now**; `system_sources` is generated from them and kept in sync (see plan step 2). Eventually the card renderer can read from `system_sources`, but we do not need to rip out the old fields to ship this.

### 3.2 Durable chunks with provenance — `document_chunks` (already exists)

The table is live (migration 001 lineage) with the right shape — **reuse it, do not recreate.** Real columns (2026-07-07 dump):

```
document_chunks(
  id, source_document_id, document_page_id, extraction_run_id,
  page_number, chunk_index, heading, chunk_type,
  raw_text, table_json, docling_json, confidence, created_at
)
```

The worker writes these rows at the end of `handle_docling` (currently it only writes `.local/output.md`). Mapping from the current docling output:
- `chunk_index` ← chunk number; `raw_text` ← chunk markdown body; `source_document_id` ← the doc.
- Docling chunks are **page ranges** (default 7 pages) but `page_number` is a single int → store the chunk's **start page** in `page_number` and keep the full `{startPage,endPage}` in `docling_json`. (If range querying becomes hot later, add `end_page` — additive.)

Provenance for citation = `(source_document_id, page_number[, docling_json.endPage])` → joined via `system_sources.role` gives the citable tuple. RLS: reads open to anon/authenticated; **writes are service-role only** (worker uses service role ✓).

### 3.3 `source_documents` additions

```
alter table source_documents
  add column source_url  text,          -- where it was fetched from (URL ingestion)
  add column ingest_kind text default 'upload';  -- upload | url_fetch
```

### 3.4 Container snapshot — `card_versions` additions

At publish, alongside `card_json`, assemble and store:

```
alter table card_versions
  add column content_md   text,   -- serialized fields + linked-source text, frozen
  add column content_hash text,   -- sha256(content_md); change detection for re-embed
  add column sources_json jsonb;  -- [{role,label,url,source_document_id,pages}] provenance manifest
```

`content_md` = deterministic serialization of the structured card **plus** the `document_chunks` text of every `system_sources` row with `include_in_container = true`, at publish time. This makes the container self-contained and immune to G3.

### 3.5 Retrieval index — `card_embeddings` (pgvector)

```
create extension if not exists vector;   -- Supabase supports pgvector

card_embeddings(
  id            uuid pk,
  card_id       uuid not null,
  version       int not null,
  chunk_id      uuid,               -- provenance: which document_chunk (nullable for field-derived text)
  source_role   text,               -- install_guide | design_guide | fields | ...
  page_start    int,
  page_end      int,
  content       text not null,      -- the embedded text span
  embedding     vector(1536),       -- model-dependent dimension; confirm at build
  content_hash  text not null,      -- = card_versions.content_hash it was built from
  created_at    timestamptz default now()
)
```

Because the container is versioned + hashed, embedding is a **pure function** of it — (re)embed only when `content_hash` changes. Retrieval returns spans with full provenance, so the AI cites "‹card canonical_url› v‹n› — install guide, pp.4–5."

### 3.6 Static container artifact (R2)

Extend the static-bundle build to emit, per published version:
- `card.json` — structured (already have via `card.json` route shape).
- `content.md` — the full searchable text (= `content_md`).
- `manifest.json` — `{card_id, version, content_hash, sources:[…], canonical_url}`.

That is the literal "static container object," consumable by external AI or our own retrieval, decoupled from the DB.

---

## 4. Ingestion flow (worker-based, `fetch_url` stage)

Decision: **fetch in the worker, not Vercel.** Rationale (durability, provenance on one chain, retryable/observable jobs, no 50 MB serverless ceiling, re-ingestion is inherently a job) is recorded in this doc's companion discussion; summary:

- **Vercel stays thin:** validate URL → insert `source_documents` (`ingest_kind='url_fetch'`, `source_url`) + `system_sources` row (`ingest_status='queued'`) → enqueue `fetch_url` job. Returns immediately; **live link is already live.**
- **Worker `fetch_url`:** `requests.get` with redirects + UA → validate `Content-Type: application/pdf` (reject/flag HTML) → stream to R2 under `manufacturer-uploads/{mfr}/{uuid}.pdf` → patch `source_documents.storage_key` + `system_sources.source_document_id` → optionally chain into `docling` (for roles where `include_in_container`).
- `fetch_url` is its **own** stage (not folded into docling) so `website` links can be stored/rendered without being chunked, and so "in R2" is separate from "parsed."

New `pipeline_jobs.job_type = 'fetch_url'`; payload `{manufacturer_id, source_document_id, system_source_id, source_url, then_docling: bool, chunk_size}`.

---

## 5. Implementation plan (dependency-ordered — all in scope)

Migrations are applied **manually** in the Supabase SQL editor (house rule); code must degrade gracefully (42P01/42703 fallbacks) so a half-applied state never crashes pages.

### Step 1 — Schema foundations (migrations) — ✅ written: `051_system_sources_and_url_ingest.sql`
- `system_sources` table + RLS (manufacturer self read/write/delete own; buildquote staff all), mirroring migration 048's stockist pattern. Idempotent.
- `source_documents.source_url` + `ingest_kind` (CHECK: upload | url_fetch).
- `card_versions.content_md` + `content_hash` + `sources_json`.
- `document_chunks` needs **no migration** — it already exists with the right shape (see §3.2); step 4 just writes to it.
- **Awaiting:** manual apply in Supabase, then confirm no errors.

### Step 2 — Sync links → `system_sources`
- **Backfill ✅ written:** `supabase/snippets/backfill_system_sources_from_staged_systems.sql` — idempotent (ON CONFLICT DO NOTHING), maps `website_url`→website, `design_guide_url`→design_guide, `tech_data_url`→tech_data, `source_url`(+`source_label`)→source_catalogue, `install_guide_urls[]`→install_guide. `ingest_status='linked'` (does not auto-fetch). **Awaiting:** run once in Supabase.
- **Still TODO:** on verification edits that change a link, upsert the matching `system_sources` row (live sync in `verification-actions.ts`). Keep old fields authoritative for render until step 7.

### Step 3 — URL ingestion: thin Vercel enqueue — ✅ route written: `api/manufacturer/add-source-url/route.ts`
- Auth + membership gate (mirrors `register-document`), validates URL (http/https), inserts `source_documents` (`ingest_kind='url_fetch'`, `status='pending_fetch'`), optionally upserts a `system_sources` row when `stagedSystemId` + `role` are given (verifies the system belongs to the workspace), enqueues a `fetch_url` job. `then_docling` = true for PDF roles / plain library adds, false for `website`.
- **UI (Documents) ✅:** `AddUrlWidget.tsx` + a upload/URL toggle in `DocumentsClient.tsx` — paste a PDF link, posts to the route, background fetch+parse. (tsc + build green.)
- **Still TODO:** an "Add link" affordance on the verification/link editor (system-level reuse — creates a `system_sources` row with a role, doubling as the card's live link). Needs the verification link-editor UI.

### Step 4 — Worker: `fetch_url` stage + durable chunks — ✅ written in `pipeline_worker.py`
- `handle_fetch_url`: fetch (UA + redirects, streamed) → validate it's a PDF (content-type or `%PDF-` magic) → upload to R2 under `manufacturer-uploads/{mfr}/{uuid}.pdf` → patch `source_documents` (storage_key/size/public_url/status) → chain into `handle_docling` on the same job (or complete as link-only). Marks `system_sources.ingest_status` through `fetching → extracted` / `failed`.
- `handle_docling` now **persists `document_chunks`** rows (`raw_text`, `page_number`=start page, `chunk_index`, `docling_json`={startPage,endPage,charCount,status}) via `persist_document_chunks` — closes G1. `.local/output.md` still written for the parser.
- **Not verified here** (no Python runtime in the build env): needs a worker run to confirm end-to-end. New helpers `sb_post`/`sb_delete`/`upload_document`/`fetch_url_to_path`/`looks_like_pdf` added.

### Step 5 — Container assembly at publish — ✅ written: `lib/packages/card-container.ts`
- `buildCardContainers()` — batched (2 queries): serializes structured fields (deterministic → stable hash) + appends each `system_sources` (include_in_container) linked doc's `document_chunks` text, with a provenance manifest (`sources_json`) + `sha256` `content_hash`. Fails soft to fields-only.
- Hooked into `package-actions.ts` publish path (`card_versions` insert) with a **pre-051 fallback** (retries without the container columns via `isMissingSchemaError`). tsc + build green.
- **Note:** content is only as rich as ingested sources — needs Step 2 backfill + a worker run to have linked-doc text; without them the container is fields-only (still valid + hashed).

### Step 6 — Static container emission — ✅ written: `generator.ts` + `package-actions.ts`
- Generator writes `cards/<slug>/content.md` (the container text) into the package ZIP and adds a `content` path to `feed.json`; `manifest.json` auto-lists it. `PackageCardInput.containerMd` carries it in.
- `package-actions.ts` now builds containers **before** the ZIP (so `content.md` ships) and reuses the same map for the `card_versions` snapshot. Fails soft. tsc + build + 17 fixture tests green.

### Step 7 — Embeddings + retrieval — ✅ written (provider: Voyage AI, voyage-3.5 / 1024-dim)
- `052_card_embeddings.sql` — pgvector `card_embeddings` (vector(1024)) + HNSW cosine index + RLS + `match_card_sources(query_embedding, match_count, filter_manufacturer)` RPC.
- Worker `handle_embed`: reads `card_versions.content_md`, idempotent by `content_hash`, windows the text, embeds via Voyage, upserts `card_embeddings`. **No-ops when `VOYAGE_API_KEY` is unset.**
- `package-actions.ts` enqueues `embed` jobs after the version snapshot (best-effort).
- `api/admin/card-search` — embeds the query (`input_type='query'`) and calls the RPC; admin/reviewer only; 503 without a key.
- **Needs to run:** apply migration 052, set `VOYAGE_API_KEY` (+ optional `VOYAGE_MODEL`/`VOYAGE_DIM`) for the worker and web, then a publish + worker run to populate/verify. tsc + build green; not runtime-tested (no key/Python here).
- Optional later: swap the card renderer / `card.json` sources to read from `system_sources` (retire scattered fields); finer per-source provenance on embeddings (currently window-level).

### Step 8 — Verification & backfill
- Re-ingest existing manufacturers' links; publish to regenerate containers; build embeddings; spot-check citations resolve to correct pages.

---

## 6. Live-link reuse (confirmed decision)

Adding a URL does two things atomically via one `system_sources` row: (a) sets/updates the card's live link for that `role` (rendered immediately, no wait), and (b) queues ingestion of its content. The two are decoupled — the live link never depends on parser output, and parser output never blocks the link.

---

## 7. Open questions / verify against live schema

Resolved by the 2026-07-07 dump (`supabase/snippets/schema_dump_2026-07-07_mig050.md`):
- ✅ `document_chunks` exists and is rich (see §3.2) — worker populates it in step 4, no table creation.
- ✅ `source_documents` has no `source_url` yet — migration adds it (step 1).
- ✅ `pipeline_jobs.job_type` is free text — `fetch_url` is code-only.
- ✅ `card_versions` matches migration 049 — additions land on top (step 5).

Still open:
- Exact publish code path that inserts `card_versions` (package-actions vs packages lib) — confirm before step 5.
- **pgvector availability** — run the `pg_extension` / `pg_available_extensions` check before step 7 (dump didn't cover extensions).
- Embedding model + dimension (`vector(N)`) — pick at step 7; keep dimension in one constant.
- Whether `website`/HTML roles should be docling-converted or link-only by default (`include_in_container`).
- pgvector index type + list/ef params at expected corpus size.

---

## 8. Risks & mitigations

- **Manufacturer URLs are messy** (403/redir/ HTML / large) → worker fetch with UA + redirects + content-type validation + job-level error surfacing; `ingest_status='failed'` shown in UI.
- **Manual migration drift** → graceful 42P01/42703 fallbacks; container/embedding features no-op cleanly if their tables aren't applied yet.
- **Stale sources** → `content_hash` + re-ingest job; container is frozen per version, live link always current.
- **Two ingestion paths diverging** → there is only one (worker); Vercel only enqueues.
