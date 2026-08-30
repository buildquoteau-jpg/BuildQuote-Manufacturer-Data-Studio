# buildquote-data-studio

PDF catalogue ingestion pipeline and review UI for BuildQuote.

## NEXT SESSION — open-source README rewrite (do this first, read before anything else)

Melia's explicit ask (2026-08-29, end of the AI-knowledge-layer/System-Card-V2 session): rewrite the
README for **all three BuildQuote repos** as prep for open-sourcing them. Requirements, verbatim intent:
- **Point form**, not prose essays.
- **Sell the repo** — make a stranger want to use/fork it.
- Explain **concrete use cases** for three audiences: the **manufacturer**, the **supplier**, and the
  **builder** — including "I only want to use one part of one repo" scenarios, not just the full
  three-repo picture.
- Explain the **links between the repos** (how data/flow moves between them).
- Link out to the **live product surfaces**: buildquote.com.au, buildquote.com.au/library,
  search.buildquote.com.au, studio.buildquote.com.au.

**The three repos** (GitHub renamed all three mid-session on 2026-08-29 — do NOT change local git
remote URLs to the new names; GitHub's redirect keeps `git fetch`/`git push` working transparently
against the ORIGINAL remote URL, and this sandbox's auth/proxy is scoped to the original names only):

| Local repo | Original GitHub name | Current GitHub name | Visibility |
|---|---|---|---|
| `Build-Quote-v6` | `Build-Quote-v6` | `Build-Quote-Library-and-Request-for-Quotation` | **Private** |
| `buildquote-data-studio` (this repo) | `buildquote-data-studio` | `BuildQuote-Manufacturer-Data-Studio` | Public |
| *(not attached this session — `add_repo` it)* | `BuildQuote-Supplier-Trade-Desk` | *(same)* | Public — internally called "manufacturer-portal"/"Trade Desk"; serves search.buildquote.com.au (supplier directory + RFQ inbox) |

Before writing anything, **read each repo's current README (if any) and top-level structure fresh** —
don't rely solely on this summary. Suggested content per README, per Melia's requirements above:
- One-paragraph "what this is and does."
- Use cases, in point form, split by audience (manufacturer / supplier / builder), each including a
  "just this one feature" angle. For this repo specifically: manufacturers self-serve onboard a product
  (`/manufacturer/systems` → upload photos/links/documents → AI extraction → verify → publish), and the
  AI Knowledge Layer (`/api/cards/[slug]/knowledge.jsonld`, `/api/knowledge/ask`) is a standalone
  use-case on its own — any site with verified product data could adopt the same pattern.
- How the three repos relate: Data Studio ingests manufacturer catalogues → AI-parses + human-verifies
  into System Cards + a machine-readable `knowledge.jsonld` object → publishes to the shared RFQ/
  production Supabase project → v6's `/library` renders the public System Card and sends RFQs to
  suppliers found via the Trade Desk directory → Trade Desk is where suppliers manage their listing and
  incoming RFQs.
- Live links: buildquote.com.au · buildquote.com.au/library · search.buildquote.com.au ·
  studio.buildquote.com.au.
- Self-host/setup notes if genuinely going open source: required env vars (see the Supabase table
  below), which Supabase project each repo needs, and flag that **a secrets audit is required before
  flipping any repo public** (Build-Quote-v6 still is) — never commit real API keys/service-role keys
  in the README or example env files. License choice is undecided — ask Melia before picking one.
- This open-sourcing goal was previously noted as "heard, not acted on — needs its own secrets/
  licensing pass" (Addendum 3, §C1 in the design plan) — that pass is exactly this task.

**Migration status as of 2026-08-29 (confirmed applied by Melia):** 065 (ai_knowledge_layer), 066
(ai_knowledge_gaps), 067, and 068 (agent_ready_signoff) are all applied. Re-run
`node scripts/refresh_schema_reference.mjs` and diff `supabase/schema_complete.sql` at the start of the
next session to confirm live schema matches, since this session never had live credentials to verify
directly.

## Two Supabase projects

| | Project | URL | env vars |
|---|---|---|---|
| **Data Studio (this repo, LIVE)** | staging tables + app + pipeline | ovndokzwkxpfjfobewaq.supabase.co | `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` |
| **RFQ / BuildQuote production** | published cards, RFQ, buildquote.com.au | oxvhmulxuvlfjyjzleki.supabase.co | `PRODUCTION_SUPABASE_URL` / `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` |

**Never run data-studio migrations against the RFQ production project.** The
RFQ project is written to only by the hybrid-publishing flow
(`apps/web/lib/studio-admin/publish.ts`). There is no separate "Data Studio
production" project anymore — ovndok IS live Data Studio; the old local-dev
topology this doc used to describe is gone (2026-07-18 audit).

## Schema reference

**`supabase/schema_complete.sql`** — GENERATED reference for all tables in the
live Data Studio project. Read this first before any DB work, and **regenerate
it after every applied migration**:

```powershell
node scripts/refresh_schema_reference.mjs
```

It pulls the PostgREST OpenAPI spec from the live project (creds from
`.env.local`) — never hand-edit it. A surprising diff after regeneration IS the
schema-drift alarm; the hand-maintained version of this file went two months
stale and enabled the migration-026 RPC breakage.

**After any migration touching `staged_*` tables or the parser RPC**, also run
the tests in `supabase/tests/` (see its README) — `012_06` round-trips every
plan field through the RPC and catches both loud (42703) and silent
(dropped-field) drift.

## Table groups

- **Document pipeline:** `source_documents` → `document_pages` → `document_chunks` → `extraction_runs`
- **Staged (parser output):** `staged_systems`, `staged_system_colours`, `staged_system_profiles`, `staged_components`, `staged_system_components`
- **Verification:** `field_verifications`, `parser_field_evidence`, `verification_events`
- **Publishing:** `publish_batches`, `publish_batch_items`
- **Auth/users:** `data_studio_manufacturers`, `data_studio_user_profiles`, `manufacturer_users`, `workspace_invitations`

## Skills / runbooks

Step-by-step guides for common pipeline tasks live in `docs/skills/`:

| Skill | What it covers |
|---|---|
| [`manufacturer-onboarding-pipeline.md`](docs/skills/manufacturer-onboarding-pipeline.md) | Full end-to-end: create manufacturer → Docling → AI parser → dup check → web enricher → verify → backup |
| [`catalogue-parser-pipeline.md`](docs/skills/catalogue-parser-pipeline.md) | Docling extraction + AI two-pass parser in detail |
| [`web-enricher-pipeline.md`](docs/skills/web-enricher-pipeline.md) | Fills `hero_image_url`, `website_url`, `source_url` from manufacturer website |

**Start with `manufacturer-onboarding-pipeline.md`** for any new manufacturer.

---

## Key conventions

- All staged tables have `verification_status` (default `pending_review`), `parser_notes` (jsonb), `extracted_at`
- `staged_*.production_*_id` is NULL until promoted; set on publish
- Binary files (PDFs, page images) are never stored in Supabase — always Cloudflare R2; Supabase holds only the `storage_key`
- Parser inserts go through the `insert_parser_output_plan_v1` RPC (service role only) — see migrations 012/057/058
- Every pipeline script run (worker-spawned or manual terminal) reports to `pipeline_jobs` via `scripts/lib/pipeline_report.py`; the app's Pipeline page (Funnel tab) shows live progress, stalled jobs, and failures
- The parser saves its plan to `.local/parser-dry-run/plan_*.json` BEFORE inserting; a failed insert is retried with `--from-plan` (no re-extraction)

## Known Gaps / Next Work

- **The self-serve pipeline is not actually self-serve yet — the worker has no persistent home.**
  Confirmed 2026-08-30. `/manufacturer/systems/[id]/setup` → "Set up my System Card" →
  `POST /api/manufacturer/systems/[systemId]/initiate-extraction` all run fine on the deployed
  site and correctly write rows to `pipeline_jobs` (Docling, then — via the `auto_chain` flag —
  the identity parser and knowledge parser once chunks exist). **But nothing ever consumes those
  jobs unless `scripts/worker/pipeline_worker.py` is manually running.** That script is a
  standalone Python polling loop (`python scripts/worker/pipeline_worker.py`, reads real creds
  from `.env.local`) — it cannot live inside the Vercel deployment (serverless functions are
  request/response and time-limited, not long-lived pollers). No `render.yaml`/`fly.toml`/
  `Procfile`/systemd unit exists anywhere in this repo — the only way a job has ever been
  processed is Melia manually starting the worker on her own machine.
  **Practical effect:** a real manufacturer using the website today can submit a system for
  extraction, and it will sit at `pending` in `pipeline_jobs` indefinitely unless Melia's local
  worker happens to be running at that moment. Self-serve submission works; self-serve
  *completion* does not, until the worker has a persistent host.
  **The fix is infrastructure, not code:** deploy `pipeline_worker.py` to something always-on —
  a small VM, a Render/Railway/Fly.io background worker, or a systemd service — polling
  continuously with the same script, no rewrite needed. Check the Pipeline page (Funnel tab)
  for jobs stuck at "pending"/"stalled" as the symptom of this gap.
  **Also unverified, flagged not silently assumed:** the new `run_system_identity_parser.py`
  (System Card field extraction from uploaded documents) has never been run against a real
  document in this sandbox (no live credentials) — its "never inserts a new system row, only
  updates the known `staged_system_id`" safety property was verified by reading the code, not
  by watching it execute. Treat the first real test run as exactly that, and check the result
  carefully.
