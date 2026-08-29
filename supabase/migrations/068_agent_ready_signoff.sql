-- BuildQuote Data Studio — Migration 068
-- Agent Ready sign-off — a distinct verification from "Verify systems"
-- (which confirms the human-facing System Card fields). This one confirms
-- the machine-readable knowledge object itself: the manufacturer has looked
-- at the actual JSON-LD blob and its markdown rendering and signed off that
-- it's accurate for AI agents to read and cite.
--
-- Not run against this environment by this session — no live Supabase
-- credentials are available here. Apply manually in the Supabase SQL editor
-- against the Data Studio project (ovndokzwkxpfjfobewaq), same as
-- migrations 065-067, then:
--   node scripts/refresh_schema_reference.mjs
--
-- Never run against the RFQ production project (oxvhmulxuvlfjyjzleki).
--
-- Additive only.

ALTER TABLE public.staged_systems
  ADD COLUMN IF NOT EXISTS agent_ready_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_ready_verified_by UUID,
  ADD COLUMN IF NOT EXISTS agent_ready_notes TEXT;

COMMENT ON COLUMN public.staged_systems.agent_ready_verified_at IS
  'When a manufacturer signed off on this system''s Agent Ready knowledge object (the JSON-LD blob + markdown rendering) as accurate. Distinct from verified_at, which covers the human-facing System Card fields.';
COMMENT ON COLUMN public.staged_systems.agent_ready_verified_by IS
  'auth.users id of who signed off Agent Ready — mirrors verified_by''s semantics.';
COMMENT ON COLUMN public.staged_systems.agent_ready_notes IS
  'Optional free-text note captured at Agent Ready sign-off (e.g. what was changed before signing off).';
