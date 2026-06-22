-- BuildQuote Data Studio — Field-Level Verification State
-- Migration: 002_field_verification_state.sql
--
-- This table stores the CURRENT verification state of individual fields on staged records.
-- It is the live state used by the verification UI.
--
-- It is separate from verification_events, which is an append-only audit log.
-- field_verifications = what is each field's state right now
-- verification_events = what happened to each field over time
--
-- This table does NOT map to production. It is a Data Studio trust layer table
-- used to prove that staged values were human-checked before publishing.
--
-- Do not run this against the production Supabase project.

-- ============================================================
-- field_verifications
-- Current state of each field on a staged record.
-- One row per (entity_type, entity_id, field_name).
-- ============================================================

CREATE TABLE IF NOT EXISTS field_verifications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- which staged record this field belongs to
  entity_type          text NOT NULL,
  -- staged_system | staged_component | staged_system_component
  -- staged_system_colour | staged_system_profile
  entity_id            uuid NOT NULL,

  -- which field on that record
  field_name           text NOT NULL,

  -- the value extracted by AI
  extracted_value      text,

  -- the value after human review (may differ from extracted_value if reviewer edited it)
  verified_value       text,

  -- source traceability — where in the original document this value came from
  source_document_id   uuid REFERENCES source_documents(id) ON DELETE SET NULL,
  source_page_id       uuid REFERENCES document_pages(id) ON DELETE SET NULL,
  source_chunk_id      uuid REFERENCES document_chunks(id) ON DELETE SET NULL,
  source_page_number   integer,

  -- current verification state
  status               text NOT NULL DEFAULT 'pending',
  -- pending | approved | rejected | edited | needs_source_check

  -- AI extraction confidence for this specific field (0.0 – 1.0)
  confidence           numeric,

  -- who reviewed this field and when
  reviewer_id          uuid,
  reviewed_at          timestamptz,

  notes                text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- one row per field per staged record
  UNIQUE (entity_type, entity_id, field_name)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- primary lookup: all fields for a given staged record
CREATE INDEX IF NOT EXISTS idx_field_verifications_entity
  ON field_verifications (entity_type, entity_id);

-- filter by verification state (e.g. show all pending fields across a document)
CREATE INDEX IF NOT EXISTS idx_field_verifications_status
  ON field_verifications (status);

-- source traceability lookups
CREATE INDEX IF NOT EXISTS idx_field_verifications_source_document_id
  ON field_verifications (source_document_id);

CREATE INDEX IF NOT EXISTS idx_field_verifications_source_page_id
  ON field_verifications (source_page_id);

CREATE INDEX IF NOT EXISTS idx_field_verifications_source_chunk_id
  ON field_verifications (source_chunk_id);
