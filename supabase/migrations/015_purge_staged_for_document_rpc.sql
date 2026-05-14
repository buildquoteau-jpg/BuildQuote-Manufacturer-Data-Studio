-- BuildQuote Data Studio — Purge staged rows by source document
-- Migration: 015_purge_staged_for_document_rpc.sql
--
-- Creates purge_staged_for_document_v1 for the local-only replace-existing strategy.
-- Used by parser:insert-local when --replace-existing-for-document is passed.
--
-- Atomically deletes all staged rows tied to a given source_document_id +
-- manufacturer_id pair, including all dependent evidence and verification rows.
-- Scoped to both source_document_id AND manufacturer_id to prevent accidental
-- cross-document/manufacturer deletions.
--
-- Delete order (FK + cascade safe):
--   1. field_verifications — polymorphic entity_id, no FK constraints (must go first)
--   2. parser_field_evidence — polymorphic entity_id, no FK constraints (must go first)
--   3. staged_systems — CASCADE deletes: staged_system_profiles, staged_system_colours,
--                       staged_system_components (through staged_system_id FK)
--   4. staged_components — CASCADE deletes: any remaining staged_system_components
--                          (through staged_component_id FK)
--
-- Returns jsonb with ok and deleted_counts by table.
--
-- Grant note: EXECUTE granted to service_role only.
-- anon and authenticated are denied.
--
-- Do not run against the production Supabase project.

CREATE OR REPLACE FUNCTION public.purge_staged_for_document_v1(
  p_source_document_id  uuid,
  p_manufacturer_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_cnt_fv    int := 0;
  v_cnt_pfe   int := 0;
  v_cnt_sys   int := 0;
  v_cnt_comp  int := 0;
BEGIN

  -- ----------------------------------------------------------------
  -- Safety: both params required — neither can be null
  -- ----------------------------------------------------------------
  IF p_source_document_id IS NULL OR p_manufacturer_id IS NULL THEN
    RAISE EXCEPTION
      'purge_staged_for_document_v1: both source_document_id and manufacturer_id are required';
  END IF;

  -- ----------------------------------------------------------------
  -- Step 1: Delete field_verifications for all entities in this document.
  --
  -- Must run BEFORE the staged table deletes so the subqueries can
  -- still find child IDs (profiles, colours, links) via FK joins.
  -- entity_id is polymorphic (no FK) so it is not cascade-deleted
  -- when staged rows are removed.
  -- ----------------------------------------------------------------
  DELETE FROM field_verifications
  WHERE entity_id IN (
    -- Systems
    SELECT id FROM staged_systems
    WHERE source_document_id = p_source_document_id
      AND manufacturer_id    = p_manufacturer_id
    UNION ALL
    -- Profiles (children of systems)
    SELECT sp.id
    FROM staged_system_profiles sp
    JOIN staged_systems ss ON ss.id = sp.staged_system_id
    WHERE ss.source_document_id = p_source_document_id
      AND ss.manufacturer_id    = p_manufacturer_id
    UNION ALL
    -- Components
    SELECT id FROM staged_components
    WHERE source_document_id = p_source_document_id
      AND manufacturer_id    = p_manufacturer_id
    UNION ALL
    -- Colours (children of systems)
    SELECT sc.id
    FROM staged_system_colours sc
    JOIN staged_systems ss ON ss.id = sc.staged_system_id
    WHERE ss.source_document_id = p_source_document_id
      AND ss.manufacturer_id    = p_manufacturer_id
    UNION ALL
    -- System-component links (children of systems)
    SELECT sl.id
    FROM staged_system_components sl
    JOIN staged_systems ss ON ss.id = sl.staged_system_id
    WHERE ss.source_document_id = p_source_document_id
      AND ss.manufacturer_id    = p_manufacturer_id
  );
  GET DIAGNOSTICS v_cnt_fv = ROW_COUNT;

  -- ----------------------------------------------------------------
  -- Step 2: Delete parser_field_evidence for all entities (same scope).
  -- Same reasoning as Step 1 — must precede staged row deletes.
  -- ----------------------------------------------------------------
  DELETE FROM parser_field_evidence
  WHERE entity_id IN (
    SELECT id FROM staged_systems
    WHERE source_document_id = p_source_document_id
      AND manufacturer_id    = p_manufacturer_id
    UNION ALL
    SELECT sp.id
    FROM staged_system_profiles sp
    JOIN staged_systems ss ON ss.id = sp.staged_system_id
    WHERE ss.source_document_id = p_source_document_id
      AND ss.manufacturer_id    = p_manufacturer_id
    UNION ALL
    SELECT id FROM staged_components
    WHERE source_document_id = p_source_document_id
      AND manufacturer_id    = p_manufacturer_id
    UNION ALL
    SELECT sc.id
    FROM staged_system_colours sc
    JOIN staged_systems ss ON ss.id = sc.staged_system_id
    WHERE ss.source_document_id = p_source_document_id
      AND ss.manufacturer_id    = p_manufacturer_id
    UNION ALL
    SELECT sl.id
    FROM staged_system_components sl
    JOIN staged_systems ss ON ss.id = sl.staged_system_id
    WHERE ss.source_document_id = p_source_document_id
      AND ss.manufacturer_id    = p_manufacturer_id
  );
  GET DIAGNOSTICS v_cnt_pfe = ROW_COUNT;

  -- ----------------------------------------------------------------
  -- Step 3: Delete staged_systems.
  -- CASCADE handles: staged_system_profiles, staged_system_colours,
  --                  staged_system_components (via staged_system_id FK).
  -- ----------------------------------------------------------------
  DELETE FROM staged_systems
  WHERE source_document_id = p_source_document_id
    AND manufacturer_id    = p_manufacturer_id;
  GET DIAGNOSTICS v_cnt_sys = ROW_COUNT;

  -- ----------------------------------------------------------------
  -- Step 4: Delete staged_components.
  -- CASCADE handles: any remaining staged_system_components
  --                  (via staged_component_id FK).
  -- ----------------------------------------------------------------
  DELETE FROM staged_components
  WHERE source_document_id = p_source_document_id
    AND manufacturer_id    = p_manufacturer_id;
  GET DIAGNOSTICS v_cnt_comp = ROW_COUNT;

  -- ----------------------------------------------------------------
  -- Return deleted counts
  -- ----------------------------------------------------------------
  RETURN jsonb_build_object(
    'ok',   true,
    'deleted_counts', jsonb_build_object(
      'field_verifications',  v_cnt_fv,
      'parser_field_evidence', v_cnt_pfe,
      'staged_systems',       v_cnt_sys,
      'staged_components',    v_cnt_comp
    )
  );

END;
$$;

-- ----------------------------------------------------------------
-- Grant management
-- Revoke from PUBLIC and standard app roles; grant only to service_role.
-- anon and authenticated must never be able to call a purge function.
-- ----------------------------------------------------------------

REVOKE EXECUTE
  ON FUNCTION public.purge_staged_for_document_v1(uuid, uuid)
  FROM PUBLIC;

REVOKE EXECUTE
  ON FUNCTION public.purge_staged_for_document_v1(uuid, uuid)
  FROM anon;

REVOKE EXECUTE
  ON FUNCTION public.purge_staged_for_document_v1(uuid, uuid)
  FROM authenticated;

GRANT EXECUTE
  ON FUNCTION public.purge_staged_for_document_v1(uuid, uuid)
  TO service_role;
