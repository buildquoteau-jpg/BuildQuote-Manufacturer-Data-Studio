-- BuildQuote Data Studio — Migration 066
-- AI Knowledge Gap & Feedback Loop — schema foundations.
--
-- Design doc: "BuildQuote — AI Knowledge Layer + Data Studio Workspace
-- Redesign", ADDENDUM ("AI Knowledge Gap & Feedback Loop"), §A4. Not run
-- against this environment by this session — no live Supabase credentials
-- are available here. Apply manually in the Supabase SQL editor against the
-- Data Studio project (ovndokzwkxpfjfobewaq), same as migration 065, then:
--   node scripts/refresh_schema_reference.mjs
--
-- Never run against the RFQ production project (oxvhmulxuvlfjyjzleki).
--
-- Additive only. This is the closed loop's spine: a builder question that
-- couldn't be answered from verified evidence becomes one row here, a
-- manufacturer resolves it, and the resolution becomes real
-- knowledge_assertions rows through the existing write path in
-- assertion-actions.ts — this table is never a second, parallel answer
-- store.

-- ============================================================
-- ai_knowledge_gaps
-- One row per question the AI could not answer from verified evidence.
-- Failure taxonomy and lifecycle are stored as TEXT + CHECK, matching this
-- schema's existing convention (knowledge_assertions.origin/epistemic_status
-- are TEXT with no CHECK at all) rather than a native Postgres ENUM, so
-- adding a value later is a constraint edit, not a type migration.
-- ============================================================

CREATE TABLE public.ai_knowledge_gaps (
  id                        UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  status                    TEXT        NOT NULL DEFAULT 'NEW',
  failure_type              TEXT,       -- NULL until classified by the ask route
  priority                  TEXT        NOT NULL DEFAULT 'normal',  -- low | normal | high | safety_critical

  -- The question, exactly as asked (§12 — "the original wording is valuable
  -- data"), plus a structured interpretation the ask route derives from it.
  user_question             TEXT        NOT NULL,
  normalised_question       JSONB,      -- {application, location, component, finish, question_type, ...}

  -- What was asked about. Nullable: a question can arrive before the system
  -- is confidently identified.
  staged_system_id          UUID        REFERENCES public.staged_systems(id) ON DELETE SET NULL,
  manufacturer_id           UUID        REFERENCES public.data_studio_manufacturers(id) ON DELETE SET NULL,

  -- Attribution without requiring login (v6 has no builder auth on /library).
  -- anon_session_id is a cookie-issued opaque UUID from v6's `bq_anon`
  -- cookie, never a real identity. builder_user_id is v6's own auth id
  -- (a different Supabase project's auth.users) — stored only as an opaque
  -- value for audit, never joined against here, never shown to a
  -- manufacturer.
  anon_session_id           TEXT,
  builder_user_id           UUID,

  -- What the AI actually did.
  ai_response_status        TEXT        NOT NULL,   -- NO_VERIFIED_ANSWER | ANSWERED_WITH_CAVEAT
  retrieval_summary         JSONB,      -- which retrieval stages ran and what each returned
  -- TEXT, not UUID: the live knowledge generator (buildFactsForCanonicalSystem)
  -- assigns each fact a synthetic id like "fact:shieldclad-180-001" whether or
  -- not a real knowledge_assertions row backs it yet (the backfill, task #3,
  -- hasn't run against any live project). These are candidate fact ids the
  -- ask route's retrieval considered, for audit — not a guaranteed FK.
  matched_assertion_ids     TEXT[],
  missing_information       TEXT,       -- human-readable: what was needed but absent

  repeat_count              INTEGER     NOT NULL DEFAULT 1,
  cluster_id                UUID,       -- unused placeholder; Phase 2 (semantic clustering)

  -- Resolution.
  manufacturer_response     JSONB,      -- {answer, appliesTo, doesNotApplyTo}
  resolution_type           TEXT,       -- confirmed_yes | confirmed_no | conditional | info_not_available | needs_review
  resulting_assertion_ids   UUID[],     -- knowledge_assertions rows this resolution created/updated
  resolution_notes          TEXT,

  assigned_to               UUID,
  resolved_by               UUID,
  resolved_at               TIMESTAMPTZ,
  manufacturer_verification_required BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT ai_knowledge_gaps_status_check CHECK (status IN (
    'NEW', 'TRIAGED', 'AWAITING_MANUFACTURER', 'MANUFACTURER_RESPONDED',
    'AWAITING_VERIFICATION', 'RESOLVED', 'PUBLISHED', 'DUPLICATE', 'OUT_OF_SCOPE',
    'NO_ACTION_REQUIRED', 'ESCALATED')),
  CONSTRAINT ai_knowledge_gaps_failure_type_check CHECK (failure_type IS NULL OR failure_type IN (
    'KNOWLEDGE_GAP', 'RETRIEVAL_GAP', 'TERMINOLOGY_GAP', 'RELATIONSHIP_GAP',
    'VERIFICATION_GAP', 'AMBIGUOUS_QUERY', 'OUT_OF_SCOPE', 'SCHEMA_GAP')),
  CONSTRAINT ai_knowledge_gaps_priority_check CHECK (priority IN ('low', 'normal', 'high', 'safety_critical')),
  CONSTRAINT ai_knowledge_gaps_response_status_check CHECK (ai_response_status IN ('NO_VERIFIED_ANSWER', 'ANSWERED_WITH_CAVEAT')),
  CONSTRAINT ai_knowledge_gaps_resolution_type_check CHECK (resolution_type IS NULL OR resolution_type IN (
    'confirmed_yes', 'confirmed_no', 'conditional', 'info_not_available', 'needs_review'))
);

CREATE INDEX idx_ai_knowledge_gaps_manufacturer_status ON public.ai_knowledge_gaps (manufacturer_id, status);
CREATE INDEX idx_ai_knowledge_gaps_system ON public.ai_knowledge_gaps (staged_system_id);
CREATE INDEX idx_ai_knowledge_gaps_created_at ON public.ai_knowledge_gaps (created_at);

-- ============================================================
-- manufacturer_messages: widen message_type to carry AI-question
-- notifications through the existing Inbox unread badge (migration 036).
-- No new notification table — this is the only schema touch outside the
-- new table.
-- ============================================================

ALTER TABLE public.manufacturer_messages DROP CONSTRAINT IF EXISTS manufacturer_messages_message_type_check;
ALTER TABLE public.manufacturer_messages ADD CONSTRAINT manufacturer_messages_message_type_check
  CHECK (message_type IN ('general', 'help', 'submission', 'ai_question'));

-- ============================================================
-- RLS
-- Unlike knowledge_assertions, gap rows are never public: they carry a
-- builder's raw question and internal retrieval diagnostics, not published
-- product facts. No anon policy at all. The ask route inserts using the
-- service-role client (bypasses RLS, same pattern as every other
-- knowledge-layer write path this session built) — manufacturers can read
-- and update their own gaps (resolving one) but never insert one directly.
-- ============================================================

ALTER TABLE public.ai_knowledge_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manufacturer_user can read own knowledge gaps"
  ON public.ai_knowledge_gaps
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = ai_knowledge_gaps.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "manufacturer_user can resolve own knowledge gaps"
  ON public.ai_knowledge_gaps
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = ai_knowledge_gaps.manufacturer_id
        AND mu.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = ai_knowledge_gaps.manufacturer_id
        AND mu.status = 'active'
    )
  );

CREATE POLICY "buildquote staff can manage all knowledge gaps"
  ON public.ai_knowledge_gaps
  FOR ALL
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'))
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

-- No anon policy, no manufacturer_user INSERT policy: rows are created only
-- by the service-role ask route.
