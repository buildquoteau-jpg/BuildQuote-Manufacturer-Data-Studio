-- BuildQuote Data Studio — Migration 065
-- AI Knowledge Layer — schema foundations.
--
-- Design doc: "BuildQuote — AI Knowledge Layer + Data Studio Workspace
-- Redesign" (§10, extended by §5a.12). Not run against this environment by
-- this session — no live Supabase credentials are available here. Apply
-- manually in the Supabase SQL editor against the Data Studio project
-- (ovndokzwkxpfjfobewaq), per house rule (CLAUDE.md), then:
--   node scripts/refresh_schema_reference.mjs
-- and run supabase/tests/ before relying on this in the app.
--
-- Never run against the RFQ production project (oxvhmulxuvlfjyjzleki).
--
-- Additive only. Nothing here renames or removes a column. The generator
-- (lib/knowledge/buildSystemKnowledge.ts) works today without this migration
-- — it reads only pre-existing tables. This migration is what lets task #3
-- (backfill field_verifications/parser_field_evidence into knowledge_assertions)
-- and everything after it in the sequence proceed.

-- ============================================================
-- knowledge_assertions
-- The keystone: one row per reified fact. See design doc §5a.1/§5a.3 for
-- claim_type and answer_policy, which extend the original §10.1 design —
-- both resolved decisions from that review, included here directly rather
-- than as a follow-up migration.
-- ============================================================

CREATE TABLE public.knowledge_assertions (
  id                            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manufacturer_id               UUID        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
  -- NULL staged_system_id = a company-level fact, inherited by every card
  -- (design doc §9.2 "Company-level answers, inherited everywhere").
  staged_system_id              UUID        REFERENCES public.staged_systems(id) ON DELETE CASCADE,

  subject_kind                  TEXT        NOT NULL,
  -- system | profile | component | colour | installation_method | fixing |
  -- application | performance | standard | certification | limitation |
  -- environmental
  subject_ref                   UUID,       -- the staged row this is about; NULL = the system itself
  subject_local_id              TEXT,       -- stable @id fragment for synthesised nodes, e.g. "#fix-timber"

  predicate                     TEXT        NOT NULL,   -- bq: vocabulary term, see /ns/v1
  object_kind                   TEXT        NOT NULL,   -- literal | quantity | enum | entity_ref | external_ref | boolean
  object_value                  JSONB       NOT NULL,    -- {value, unit, min, max, condition, text, ref, …}

  -- claim_type: WHAT KIND of claim (orthogonal to subject_kind, which says
  -- what entity it's about). Controlled vocabulary — see vocabulary.ts
  -- ClaimType for the full vetted list.
  claim_type                    TEXT        NOT NULL DEFAULT 'unknown',

  origin                        TEXT        NOT NULL,
  -- manufacturer_supplied | document_extracted | web_extracted | derived |
  -- buildquote_editorial
  epistemic_status               TEXT        NOT NULL DEFAULT 'unverified',
  -- unverified | buildquote_checked | manufacturer_verified |
  -- manufacturer_corrected | disputed | not_applicable | unknown |
  -- superseded | stale

  -- answer_policy: what an agent may DO with this fact, independent of
  -- trust. NULL = use the generator's deterministic default
  -- (resolveAnswerPolicy in vocabulary.ts); non-NULL = an explicit reviewer
  -- override, tightening-only, enforced in verification-actions.ts (not in
  -- SQL — see the RLS note below).
  answer_policy                 TEXT,

  confidence                    NUMERIC,
  derivation                    JSONB,      -- {rule, inputs:[assertion_id]}
  supersedes_assertion_id       UUID        REFERENCES public.knowledge_assertions(id) ON DELETE SET NULL,
  inherited_from_assertion_id   UUID        REFERENCES public.knowledge_assertions(id) ON DELETE SET NULL,
  extraction_run_id             UUID        REFERENCES public.extraction_runs(id) ON DELETE SET NULL,

  verified_by                   UUID,
  verified_at                   TIMESTAMPTZ,
  evidence_refreshed_at         TIMESTAMPTZ,  -- set when a document replacement re-confirms an unchanged fact (§9.4)
  review_horizon                DATE,
  reviewer_notes                TEXT,

  sort_order                    INTEGER     NOT NULL DEFAULT 0,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_assertions_system
  ON public.knowledge_assertions (staged_system_id, subject_kind);
CREATE INDEX idx_knowledge_assertions_company_level
  ON public.knowledge_assertions (manufacturer_id) WHERE staged_system_id IS NULL;
CREATE INDEX idx_knowledge_assertions_status
  ON public.knowledge_assertions (epistemic_status);
CREATE INDEX idx_knowledge_assertions_claim_type
  ON public.knowledge_assertions (claim_type);

-- ============================================================
-- assertion_evidence
-- Evidence links. source_document_id is what makes §9.4's surgical
-- re-verification (invalidate only what one replaced document supported)
-- a single query.
-- ============================================================

CREATE TABLE public.assertion_evidence (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assertion_id          UUID        NOT NULL REFERENCES public.knowledge_assertions(id) ON DELETE CASCADE,
  source_kind           TEXT        NOT NULL DEFAULT 'document',
  -- document | web_page | manufacturer_statement | derivation
  source_document_id    UUID        REFERENCES public.source_documents(id) ON DELETE SET NULL,
  system_source_id      UUID        REFERENCES public.system_sources(id) ON DELETE SET NULL,
  document_chunk_id     UUID        REFERENCES public.document_chunks(id) ON DELETE SET NULL,
  page_start            INTEGER,
  page_end               INTEGER,
  locator                TEXT,      -- "Section 4.2", "Table 2", a clause reference
  quote                  TEXT,      -- verbatim supporting excerpt
  source_url             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assertion_evidence_assertion_id
  ON public.assertion_evidence (assertion_id);
CREATE INDEX idx_assertion_evidence_source_document_id
  ON public.assertion_evidence (source_document_id);

-- ============================================================
-- system_relationships
-- A-class (manufacturer-only-knowable) links: compatible/incompatible/
-- supersedes/substitute. Kept as its own table rather than folded into
-- knowledge_assertions — relationships need a real FK for graph traversal
-- and cascade behaviour, and are the one thing manufacturers actively
-- author (design doc §10.3).
-- ============================================================

CREATE TABLE public.system_relationships (
  id                        UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manufacturer_id           UUID        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
  staged_system_id          UUID        NOT NULL REFERENCES public.staged_systems(id) ON DELETE CASCADE,
  relation                  TEXT        NOT NULL,
  -- compatible_with | incompatible_with | supersedes | superseded_by |
  -- substitute_for | requires_system
  target_staged_system_id   UUID        REFERENCES public.staged_systems(id) ON DELETE SET NULL,
  target_external           JSONB,      -- {name, manufacturer, sku, url, kind: product|generic_class}
  note                      TEXT,
  reason                    TEXT,
  epistemic_status          TEXT        NOT NULL DEFAULT 'manufacturer_supplied',
  verified_by               UUID,
  verified_at                TIMESTAMPTZ,
  sort_order                 INTEGER     NOT NULL DEFAULT 0,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_relationships_system
  ON public.system_relationships (staged_system_id);
CREATE INDEX idx_system_relationships_target
  ON public.system_relationships (target_staged_system_id);

-- ============================================================
-- knowledge_taxonomy_terms
-- The SEAM for canonical cross-manufacturer query IDs, not a populated
-- vocabulary (design doc §5a.6 — "do NOT create thousands of arbitrary IDs
-- if a controlled vocabulary does not yet exist"). Deliberately empty at
-- launch. No manufacturer-facing UI writes to this table yet.
-- ============================================================

CREATE TABLE public.knowledge_taxonomy_terms (
  id       UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain   TEXT NOT NULL,
  -- application | substrate | building_class | bal_level |
  -- corrosivity_category | wind_region | product_category |
  -- component_role | regulatory_instrument
  slug     TEXT NOT NULL,   -- e.g. "external-wall-cladding/class-1-residential"
  label    TEXT NOT NULL,
  UNIQUE (domain, slug)
);

-- ============================================================
-- Additive columns on existing tables
-- ============================================================

ALTER TABLE public.card_versions
  ADD COLUMN knowledge_json JSONB;   -- frozen bq:knowledge object per published version (task #11)

ALTER TABLE public.staged_systems
  ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'current',  -- current | superseded | discontinued | pre_release
  ADD COLUMN search_aliases   TEXT[];  -- manufacturer product nicknames (design doc §5a.5) — rare, per-product

ALTER TABLE public.manufacturer_assets
  ADD COLUMN staged_system_id UUID REFERENCES public.staged_systems(id) ON DELETE CASCADE,
  ADD COLUMN asset_role       TEXT;  -- hero | gallery | colour_swatch | profile | detail | diagram | brand
  -- NULL staged_system_id = a brand-level asset (logo, brand hero, banner).
  -- Populating this on existing rows is task #4 (asset scoping backfill) —
  -- this column is additive-only here, the UI/backfill work is separate.

ALTER TABLE public.data_studio_manufacturers
  ADD COLUMN data_licence JSONB NOT NULL DEFAULT
    '{"status":"pending","permissions":{"publicSearch":false,"aiRetrieval":false,"aiTraining":false,"commercialRedistribution":false,"benchmarking":false}}';
  -- Declarative only (design doc §5a.9, confirmed): the knowledge endpoint
  -- stays fully open regardless of this value. Nothing in the app branches
  -- on it yet — it exists so protecting it later is a code change to one
  -- access helper, not a schema change.

-- ============================================================
-- RLS — mirrors migration 048 (manufacturer_stockists): manufacturer_user
-- manages their own workspace's rows; buildquote staff manage everything.
-- Public/anon read mirrors migration 006 (staged extraction tables) — the
-- knowledge.jsonld routes use the service client and bypass RLS entirely,
-- but a direct anon/authenticated client read should work the same way it
-- does for every other staged_* table.
--
-- answer_policy's "tightening only, BuildQuote staff or manufacturer admin"
-- rule (design doc §5a.12) is NOT enforced here — RLS can authorize an
-- UPDATE, it cannot compare old vs new policy rank. That comparison lives
-- in verification-actions.ts (isTighteningOverride, vocabulary.ts), the
-- same place every other business rule in this schema is enforced.
-- ============================================================

ALTER TABLE public.knowledge_assertions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assertion_evidence      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_relationships    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_taxonomy_terms ENABLE ROW LEVEL SECURITY;

-- ── knowledge_assertions ─────────────────────────────────────────────────

CREATE POLICY "anon can read knowledge assertions"
  ON public.knowledge_assertions FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated can read knowledge assertions"
  ON public.knowledge_assertions FOR SELECT TO authenticated USING (true);

CREATE POLICY "manufacturer_user can write own knowledge assertions"
  ON public.knowledge_assertions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = knowledge_assertions.manufacturer_id
        AND mu.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = knowledge_assertions.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "buildquote staff can write all knowledge assertions"
  ON public.knowledge_assertions
  FOR ALL
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'))
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

-- ── assertion_evidence: access follows the parent assertion ─────────────

CREATE POLICY "anon can read assertion evidence"
  ON public.assertion_evidence FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated can read assertion evidence"
  ON public.assertion_evidence FOR SELECT TO authenticated USING (true);

CREATE POLICY "manufacturer_user can write own assertion evidence"
  ON public.assertion_evidence
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.knowledge_assertions ka
      JOIN public.manufacturer_users mu ON mu.manufacturer_id = ka.manufacturer_id
      WHERE ka.id = assertion_evidence.assertion_id
        AND mu.auth_user_id = auth.uid()
        AND mu.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.knowledge_assertions ka
      JOIN public.manufacturer_users mu ON mu.manufacturer_id = ka.manufacturer_id
      WHERE ka.id = assertion_evidence.assertion_id
        AND mu.auth_user_id = auth.uid()
        AND mu.status = 'active'
    )
  );

CREATE POLICY "buildquote staff can write all assertion evidence"
  ON public.assertion_evidence
  FOR ALL
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'))
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

-- ── system_relationships ─────────────────────────────────────────────────

CREATE POLICY "anon can read system relationships"
  ON public.system_relationships FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated can read system relationships"
  ON public.system_relationships FOR SELECT TO authenticated USING (true);

CREATE POLICY "manufacturer_user can write own system relationships"
  ON public.system_relationships
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = system_relationships.manufacturer_id
        AND mu.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = system_relationships.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "buildquote staff can write all system relationships"
  ON public.system_relationships
  FOR ALL
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'))
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

-- ── knowledge_taxonomy_terms: shared reference data, staff-curated ──────

CREATE POLICY "anon can read taxonomy terms"
  ON public.knowledge_taxonomy_terms FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated can read taxonomy terms"
  ON public.knowledge_taxonomy_terms FOR SELECT TO authenticated USING (true);

CREATE POLICY "buildquote staff can write taxonomy terms"
  ON public.knowledge_taxonomy_terms
  FOR ALL
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'))
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));
