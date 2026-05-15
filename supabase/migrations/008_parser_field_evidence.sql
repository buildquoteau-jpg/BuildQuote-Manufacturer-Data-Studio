-- BuildQuote Data Studio — Parser Field Evidence and Schema Gaps
-- Migration: 008_parser_field_evidence.sql
--
-- Additive only. No columns removed, renamed, or modified.
-- Do not run against the production Supabase project.
--
-- Resolves:
--   1. Create parser_field_evidence — append-only per-field per-run extraction history.
--      Keeps field_verifications clean as the reviewer-facing current-state table.
--   2. Add parser_notes jsonb to all five staged tables — stores entity-level parser
--      note snapshot (warnings, ignored content, uncertainty reasons) for reviewer UI.
--   3. Add bal_rating to staged_systems — fire_rating is deprecated per parser contract;
--      parser output uses bal_rating and had no landing column on staged_systems.
--      fire_rating is left untouched.
--   4. Add sku_suffix to staged_system_colours — parser contract outputs sku_suffix for
--      colour SKU suffix variants (e.g. "-ANT") and had no landing column.

-- ============================================================
-- 1. parser_field_evidence
--
-- Append-only table. One row per extracted field per entity per extraction run.
-- No UNIQUE constraint — competing values across re-runs are all preserved.
--
-- field_verifications = current reviewer-facing field state (one row per field per entity)
-- parser_field_evidence = full extraction history (one row per field per entity per run)
--
-- The insertion layer seeds field_verifications from the latest parser_field_evidence row
-- for each field, but only if the field_verifications row is still status='pending'.
-- If a reviewer has already approved/edited/rejected a field, the existing
-- field_verifications row is left alone; the new evidence is stored here only.
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."parser_field_evidence" (
  "id"                  uuid          NOT NULL DEFAULT gen_random_uuid(),
  "extraction_run_id"   uuid          NOT NULL REFERENCES "public"."extraction_runs"("id") ON DELETE CASCADE,
  "entity_type"         text          NOT NULL,
  -- staged_system | staged_system_profile | staged_component
  -- staged_system_colour | staged_system_component
  "entity_id"           uuid          NOT NULL,
  "field_name"          text          NOT NULL,
  "extracted_value"     text,
  "source_document_id"  uuid          REFERENCES "public"."source_documents"("id") ON DELETE SET NULL,
  "source_page_number"  integer,
  "source_chunk_id"     uuid          REFERENCES "public"."document_chunks"("id") ON DELETE SET NULL,
  "confidence"          numeric,
  "is_uncertain"        boolean       NOT NULL DEFAULT false,
  "parser_note"         text,
  "created_at"          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT "parser_field_evidence_pkey" PRIMARY KEY ("id")
);

-- Lookup by extraction run (all fields produced by one run)
CREATE INDEX IF NOT EXISTS "idx_parser_field_evidence_extraction_run_id"
  ON "public"."parser_field_evidence" ("extraction_run_id");

-- Lookup by source document (all evidence for a given document across all runs)
CREATE INDEX IF NOT EXISTS "idx_parser_field_evidence_source_document_id"
  ON "public"."parser_field_evidence" ("source_document_id");

-- Lookup by source chunk (trace evidence back to a specific chunk)
CREATE INDEX IF NOT EXISTS "idx_parser_field_evidence_source_chunk_id"
  ON "public"."parser_field_evidence" ("source_chunk_id");

-- Primary reviewer query: all evidence rows for a given entity field, newest first
CREATE INDEX IF NOT EXISTS "idx_parser_field_evidence_entity_field_created"
  ON "public"."parser_field_evidence" ("entity_type", "entity_id", "field_name", "created_at" DESC);

-- ============================================================
-- 2. parser_notes jsonb on staged tables
--
-- Stores the entity-level parser note array from the most recent extraction run:
-- parser_notes, warnings, ignored_content_notes, uncertain_fields list.
-- Overwritten on each new run (not append-only — this is a reviewer convenience
-- snapshot, not a history log; history is in parser_field_evidence).
-- ============================================================

ALTER TABLE "public"."staged_systems"
  ADD COLUMN IF NOT EXISTS "parser_notes" jsonb;

ALTER TABLE "public"."staged_system_profiles"
  ADD COLUMN IF NOT EXISTS "parser_notes" jsonb;

ALTER TABLE "public"."staged_components"
  ADD COLUMN IF NOT EXISTS "parser_notes" jsonb;

ALTER TABLE "public"."staged_system_colours"
  ADD COLUMN IF NOT EXISTS "parser_notes" jsonb;

ALTER TABLE "public"."staged_system_components"
  ADD COLUMN IF NOT EXISTS "parser_notes" jsonb;

-- ============================================================
-- 3. bal_rating on staged_systems
--
-- The parser contract uses bal_rating for system-wide BAL (Bushfire Attack Level).
-- fire_rating (the original column) is deprecated per parser contract and is left
-- in place — this migration does not drop or rename it.
-- Profile-specific BAL already lands on staged_system_profiles.bal_rating (from 007).
-- ============================================================

ALTER TABLE "public"."staged_systems"
  ADD COLUMN IF NOT EXISTS "bal_rating" text;

-- ============================================================
-- 4. sku_suffix on staged_system_colours
--
-- The parser contract outputs sku_suffix for colour variants that modify the base SKU
-- (e.g. colour "Antique" adds suffix "-ANT" to produce "NTW-AVE-ANT").
-- Distinct from sku, which holds a fully overriding SKU for colours that have one.
-- ============================================================

ALTER TABLE "public"."staged_system_colours"
  ADD COLUMN IF NOT EXISTS "sku_suffix" text;
