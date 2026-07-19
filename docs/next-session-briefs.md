# Next-session briefs — pipeline improvements (written 2026-07-19)

Deferred items from the 2026-07-18 pipeline audit + fix session. Each brief is
self-contained: start a fresh Claude session, paste ONE brief, and it has
everything it needs. Do them in any order, but A is the highest-value.

**Shared context for every brief (paste along with the brief):**

- Repo: `C:\Users\Melia Borg\Desktop\Repositries\buildquote-data-studio\buildquote-data-studio`
  (note: the git repo is nested one level below the similarly named parent folder).
- Read `CLAUDE.md` first — projects table, conventions, schema reference rules.
- `supabase/schema_complete.sql` is GENERATED from the live DB
  (`node scripts/refresh_schema_reference.mjs`) — trust it over migration files,
  regenerate after applying any migration.
- There is no system Python in the sandbox, but `./.venv-docling/Scripts/python.exe`
  works for `py_compile` syntax checks (not for running pipeline scripts — those
  need packages like anthropic/httpx that only exist in Melia's own venvs).
  Node is available and `.env.local` is populated (Data Studio =
  ovndokzwkxpfjfobewaq via NEXT_PUBLIC_*; RFQ prod = oxvhmulxuvlfjyjzleki via
  PRODUCTION_* — READ-ONLY, never write to it).
- Typecheck web changes with `corepack pnpm typecheck` in `apps/web`.
- The parser RPC lineage is migrations 012 → 057 → 058. After ANY change to
  staged_* tables or the RPC, run `supabase/tests/` (see its README) — `012_06`
  round-trips every plan field and catches silent drift.
- Every pipeline script reports to `pipeline_jobs` via
  `scripts/lib/pipeline_report.py`; the app's Pipeline page (Funnel tab) shows
  live activity. Don't break that wiring when refactoring.
- Commit and push to `main` in logical batches (Melia tests the live deploy of main).

---

## Brief A — Parser modernisation: Message Batches + structured outputs + prompt caching

**Goal:** cut parser wall-clock from ~45+ min (65s sleeps between calls) to a
single batch turnaround, cut token cost ~50%, and eliminate the invalid-JSON
failure mode — without changing the staging-table output contract.

**File:** `scripts/parser/run_parser.py` (two-pass design: Stage 1
systems/profiles/colours per chunk, Stage 2 components/links per chunk, then
one `insert_parser_output_plan_v1` RPC call).

**Changes:**
1. Replace the per-chunk interactive Anthropic calls + `inter_call_delay = 65`
   pacing with the **Message Batches API**: submit all Stage 1 chunk requests
   as one batch, poll until `ended`, collect results by `custom_id`
   (`chunk_<n>`), then submit Stage 2 as a second batch (it needs Stage 1's
   system list as context). Batches are 50% of standard token price and don't
   consume interactive rate limits — the 65s pacing problem disappears.
   Keep a `--interactive` fallback flag that preserves the current loop.
2. **Structured outputs**: replace "Return JSON only" prompting + markdown-fence
   stripping + `json.loads` with `output_config: {format: {type: "json_schema",
   schema: ...}}` on each request (schemas derived from the existing Stage 1/2
   response shapes). This removes the invalid-JSON retry path entirely. Note:
   requires a model that supports structured outputs — use `claude-sonnet-5`
   (the current default `claude-sonnet-4-6` does NOT support it). Load the
   claude-api skill in-session for exact request shapes; don't write API code
   from memory.
3. **Prompt caching** for any remaining interactive path: system prompt + hints
   as cached prefix blocks (`cache_control: {type: "ephemeral"}`), chunk text
   last. Verify with `usage.cache_read_input_tokens`.
4. Keep intact: the plan-save-before-insert, `--from-plan`, the chunk manifest +
   `--allow-partial` gate, and the `PipelineReporter` progress calls (report
   batch submit / poll progress instead of per-chunk).

**Also fix while in there (small, audit finding):** `resolve_system_key`'s
fuzzy fallback (`name in k or k in name`) mis-attaches profiles when one system
name contains another ("Stria Cladding" vs "Stria Cladding Fine Texture") —
require exact normalized match and route ambiguous matches to a
`parser_notes.qa_flag` instead of guessing. Unify the two different name
normalizers (`deduplicate_systems` uses NFKC+™-collapse; `assign_temp_keys`
uses bare `lower().strip()`).

**Verify:** py_compile; a `--dry-run` against an existing docling output
(`.local/docling-output/...`) if Melia runs it; plan JSON shape must be
unchanged (diff against a pre-refactor plan file).

---

## Brief B — Semantic re-chunking + split-table stitching

**Goal:** stop losing/duplicating spec-table rows when a table spans a 7-page
Docling chunk boundary (happened on NewTechWood).

**Context:** `scripts/docling/extract_docling_chunked.py` splits PDFs into
7-page chunks (a Docling memory constraint — keep it). The parser
(`run_parser.py: split_into_chunks`) currently reuses those same
`<!-- chunk N: pages X-Y -->` boundaries as LLM context windows — the memory
constraint and the semantic boundary are coupled, and a markdown table cut at
the boundary gets half-extracted twice.

**Change (in the parser, not Docling):** after `split_into_chunks`, detect a
markdown table that ends at the very end of chunk N and continues at the start
of chunk N+1 (same column count; continuation rows with no new header) and
merge/stitch: move the continuation rows into chunk N (or merge both chunks if
small). Optionally then re-pack chunks to a token budget on heading boundaries.
Keep original page ranges in the chunk metadata for provenance.

**Verify:** unit-test the stitcher on a fixture built from
`.local/docling-output/newtechwood_merged.md` (the US49C/US54C/US92 spec tables
were the real-world split cases); parser `--dry-run` row counts should not drop.

---

## Brief C — Golden-set extraction eval

**Goal:** a regression number for extraction accuracy, so prompt/model/chunking
changes (Briefs A/B) can be tested instead of eyeballed.

**Build:** `scripts/eval/run_extraction_eval.py` + `scripts/eval/golden/`.
For 2–3 onboarded manufacturers (NewTechWood is freshest; James Hardie data is
in `apps/web/data/extractions/james-hardie/*.csv`), store a hand-verified
expected JSON (systems → profiles with product_code + key dimensions). The
script runs the parser `--dry-run` against the stored docling output, diffs the
plan against golden, and reports precision/recall per entity type + a list of
missing/extra/mismatched rows. Exit non-zero below a threshold.

**Also add (cheap, from the audit):** deterministic grounding checks in
`run_qa_checks` — every extracted `product_code` must literally occur in the
source chunk text (catches the US71/US92 hallucination class directly), parsed
dimension numbers must appear in the `dimensions` string, uom vocabulary
allowlist, numeric plausibility ranges. Flag via the existing
`parser_notes.qa_flag` mechanism, don't block.

---

## Brief D — publish.ts orphan report (production hygiene)

**Goal:** surface production rows that no longer have a staging counterpart
(deleted/renamed in staging → orphaned in RFQ production forever).

**File:** `apps/web/lib/studio-admin/publish.ts` (the staging → RFQ-production
publish path; upsert-by-natural-key, never deletes). **Report-only first — do
NOT auto-delete production rows.** Add a `reportOrphans(manufacturerId)`
function + admin API route + a small panel/dry-run listing: production
`systems`/`system_profiles`/`system_colours`/`components` rows whose id is not
referenced by any `staged_*.production_*_id` for that manufacturer. Human
decides what to do with them.

---

## Brief E — Small chores (batchable into one session)

1. **Migration 054** (`hero_image_zoom`) — if still unapplied (check live via
   the schema reference), remind Melia; zoom writes silently no-op until then.
2. **`rls_auto_enable`** — a live RPC exists in the Data Studio project with NO
   migration file (reverse drift, found 2026-07-18 via PostgREST OpenAPI).
   Melia must copy its definition from the Supabase dashboard (Database →
   Functions) into a numbered migration so the repo is the source of truth.
3. **RFQ production `systems` has BOTH `install_guide_url` (legacy) and
   `install_guide_urls`** — docs claim the singular was dropped 2026-06-16; it
   wasn't. Verify the v6 repo (`Build-Quote-v6`, shares the RFQ DB) reads only
   the plural, then write a production snippet to drop the singular.
4. **Jobs panel → Supabase Realtime** (optional): `LiveJobsPanel.tsx` polls
   every 5s; switching to a Realtime subscription on `pipeline_jobs` needs the
   table added to the `supabase_realtime` publication + RLS review. Polling is
   fine — only do this if the 5s lag ever annoys.
5. **Notification env**: add `RESEND_API_KEY` + `PIPELINE_NOTIFY_EMAIL` to
   `.env.local` so the worker emails on job failure (Windows toast already
   works with zero config).
