-- BuildQuote Data Studio — Fix stale install_guide_url column in parser RPC
-- Migration: 057_fix_parser_rpc_install_guide_urls.sql
--
-- insert_parser_output_plan_v1 (migration 012) was written before migration 026
-- renamed staged_systems.install_guide_url -> install_guide_urls (jsonb array of
-- {label, url}, see migration 055's comment). Nobody updated the RPC's INSERT
-- column list at the time, so any live (non-dry-run) parser insert has been
-- failing with `column "install_guide_url" of relation "staged_systems" does
-- not exist` since migration 026 — first discovered 2026-07-18 while onboarding
-- NewTechWood via scripts/parser/run_parser.py.
--
-- Fix: rename the column reference to install_guide_urls and read it via the
-- jsonb `->` operator (not `->>` text extraction) to match its jsonb type —
-- same pattern already used for parser_notes a few lines below. The parser
-- script itself never actually populates this field with real data (it's
-- always null in the JSON shape), so this is a type-safety correction, not a
-- behaviour change.
--
-- CREATE OR REPLACE preserves the existing ACL (locked down to postgres/owner
-- by migrations 010 + 011, granted to service_role by migration 014) — no new
-- grants needed here.
--
-- SECURITY INVOKER: runs as caller (postgres when called via supabase db query).
-- Do not run against the production Supabase project.

CREATE OR REPLACE FUNCTION public.insert_parser_output_plan_v1(
  plan jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  -- Current element when iterating over a jsonb array
  v_rec               jsonb;

  -- UUID maps: temp_key (text) → inserted UUID (stored as a JSON string inside jsonb)
  -- Usage: (v_sys_uuid_map ->> some_temp_key)::uuid
  v_sys_uuid_map      jsonb := '{}';
  v_prof_uuid_map     jsonb := '{}';
  v_comp_uuid_map     jsonb := '{}';
  v_col_uuid_map      jsonb := '{}';
  v_link_uuid_map     jsonb := '{}';

  -- Scalar temporaries
  v_new_id            uuid;
  v_sys_id            uuid;
  v_comp_id           uuid;
  v_entity_id         uuid;
  v_temp_key          text;
  v_sys_temp_key      text;
  v_comp_temp_key     text;
  v_entity_type       text;
  v_entity_temp_key   text;
  v_missing_keys      text[] := '{}';

  -- Running insert counts (returned in the response)
  v_cnt_systems       int := 0;
  v_cnt_profiles      int := 0;
  v_cnt_components    int := 0;
  v_cnt_colours       int := 0;
  v_cnt_links         int := 0;
  v_cnt_fv            int := 0;
  v_cnt_pfe           int := 0;

BEGIN

  -- ----------------------------------------------------------------
  -- 1. Null guard
  -- ----------------------------------------------------------------
  IF plan IS NULL THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'mode',    'inserted',
      'message', 'plan argument is null'
    );
  END IF;

  -- ----------------------------------------------------------------
  -- 2. Top-level key presence check
  --    Mirrors the shell validation in migration 010.
  -- ----------------------------------------------------------------
  IF NOT (plan ? 'stagedSystems')           THEN v_missing_keys := array_append(v_missing_keys, 'stagedSystems');           END IF;
  IF NOT (plan ? 'stagedSystemProfiles')    THEN v_missing_keys := array_append(v_missing_keys, 'stagedSystemProfiles');    END IF;
  IF NOT (plan ? 'stagedComponents')        THEN v_missing_keys := array_append(v_missing_keys, 'stagedComponents');        END IF;
  IF NOT (plan ? 'stagedSystemColours')     THEN v_missing_keys := array_append(v_missing_keys, 'stagedSystemColours');     END IF;
  IF NOT (plan ? 'stagedSystemComponents')  THEN v_missing_keys := array_append(v_missing_keys, 'stagedSystemComponents');  END IF;
  IF NOT (plan ? 'fieldVerifications')      THEN v_missing_keys := array_append(v_missing_keys, 'fieldVerifications');      END IF;
  IF NOT (plan ? 'parserFieldEvidence')     THEN v_missing_keys := array_append(v_missing_keys, 'parserFieldEvidence');     END IF;

  IF array_length(v_missing_keys, 1) IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',           false,
      'mode',         'inserted',
      'message',      'plan is missing required top-level keys',
      'missing_keys', to_jsonb(v_missing_keys)
    );
  END IF;

  -- ================================================================
  -- 3. Insert staged_systems
  --    Builds v_sys_uuid_map: _temp_key → real UUID
  -- ================================================================
  FOR v_rec IN SELECT value FROM jsonb_array_elements(plan -> 'stagedSystems') LOOP

    v_temp_key := v_rec ->> '_temp_key';
    IF v_temp_key IS NULL OR v_temp_key = '' THEN
      RAISE EXCEPTION 'stagedSystems row is missing _temp_key';
    END IF;

    INSERT INTO staged_systems (
      manufacturer_id,
      source_document_id,
      source_chunk_id,
      name,
      product_code,
      slug,
      category,
      subcategory,
      description,
      bal_rating,
      acoustic_rating,
      moisture_resistant,
      structural_grade,
      double_sided,
      sheet_format,
      install_guide_urls,
      tech_data_url,
      notes,
      sort_order,
      extraction_confidence,
      verification_status,
      parser_notes
    )
    VALUES (
      (v_rec ->> 'manufacturer_id')::uuid,
      (v_rec ->> 'source_document_id')::uuid,
      (v_rec ->> 'source_chunk_id')::uuid,
      v_rec ->> 'name',
      v_rec ->> 'product_code',
      v_rec ->> 'slug',
      v_rec ->> 'category',
      v_rec ->> 'subcategory',
      v_rec ->> 'description',
      v_rec ->> 'bal_rating',
      v_rec ->> 'acoustic_rating',
      COALESCE((v_rec ->> 'moisture_resistant')::boolean, false),
      v_rec ->> 'structural_grade',
      COALESCE((v_rec ->> 'double_sided')::boolean, false),
      v_rec ->> 'sheet_format',
      v_rec -> 'install_guide_urls',
      v_rec ->> 'tech_data_url',
      v_rec ->> 'notes',
      COALESCE((v_rec ->> 'sort_order')::int, 0),
      (v_rec ->> 'extraction_confidence')::numeric,
      'pending_review',
      v_rec -> 'parser_notes'
    )
    RETURNING id INTO v_new_id;

    v_sys_uuid_map := jsonb_set(v_sys_uuid_map, ARRAY[v_temp_key], to_jsonb(v_new_id::text));
    v_cnt_systems := v_cnt_systems + 1;

  END LOOP;

  -- ================================================================
  -- 4. Insert staged_system_profiles
  --    Resolves _staged_system_temp_key → staged_system_id
  --    Builds v_prof_uuid_map: _temp_key → real UUID
  --    Schema note: staged_system_profiles has no extraction_confidence column.
  -- ================================================================
  FOR v_rec IN SELECT value FROM jsonb_array_elements(plan -> 'stagedSystemProfiles') LOOP

    v_temp_key     := v_rec ->> '_temp_key';
    v_sys_temp_key := v_rec ->> '_staged_system_temp_key';

    IF v_sys_temp_key IS NULL THEN
      RAISE EXCEPTION
        'stagedSystemProfiles row "%" has null _staged_system_temp_key — unresolvable FK link',
        v_temp_key;
    END IF;
    IF NOT (v_sys_uuid_map ? v_sys_temp_key) THEN
      RAISE EXCEPTION
        'stagedSystemProfiles row "%" references unknown system temp key "%"',
        v_temp_key, v_sys_temp_key;
    END IF;
    v_sys_id := (v_sys_uuid_map ->> v_sys_temp_key)::uuid;

    INSERT INTO staged_system_profiles (
      staged_system_id,
      name,
      profile_name,
      product_code,
      dimensions,
      length_m,
      length_mm,
      width_mm,
      height_mm,
      thickness_mm,
      depth_mm,
      gauge_mm,
      diameter_mm,
      roll_m,
      weight_kg,
      weight_g,
      volume_ml,
      pieces,
      pack_format,
      supplier_pack_qty,
      supplier_pack_uom,
      supplier_pack_note,
      bal_rating,
      uom,
      sort_order,
      verification_status,
      parser_notes
    )
    VALUES (
      v_sys_id,
      v_rec ->> 'name',
      v_rec ->> 'profile_name',
      v_rec ->> 'product_code',
      v_rec ->> 'dimensions',
      (v_rec ->> 'length_m')::numeric,
      (v_rec ->> 'length_mm')::numeric,
      (v_rec ->> 'width_mm')::numeric,
      (v_rec ->> 'height_mm')::numeric,
      (v_rec ->> 'thickness_mm')::numeric,
      (v_rec ->> 'depth_mm')::numeric,
      (v_rec ->> 'gauge_mm')::numeric,
      (v_rec ->> 'diameter_mm')::numeric,
      (v_rec ->> 'roll_m')::numeric,
      (v_rec ->> 'weight_kg')::numeric,
      (v_rec ->> 'weight_g')::numeric,
      (v_rec ->> 'volume_ml')::numeric,
      (v_rec ->> 'pieces')::numeric,
      v_rec ->> 'pack_format',
      (v_rec ->> 'supplier_pack_qty')::numeric,
      v_rec ->> 'supplier_pack_uom',
      v_rec ->> 'supplier_pack_note',
      v_rec ->> 'bal_rating',
      v_rec ->> 'uom',
      COALESCE((v_rec ->> 'sort_order')::int, 0),
      'pending_review',
      v_rec -> 'parser_notes'
    )
    RETURNING id INTO v_new_id;

    v_prof_uuid_map := jsonb_set(v_prof_uuid_map, ARRAY[v_temp_key], to_jsonb(v_new_id::text));
    v_cnt_profiles := v_cnt_profiles + 1;

  END LOOP;

  -- ================================================================
  -- 5. Insert staged_components
  --    Builds v_comp_uuid_map: _temp_key → real UUID
  -- ================================================================
  FOR v_rec IN SELECT value FROM jsonb_array_elements(plan -> 'stagedComponents') LOOP

    v_temp_key := v_rec ->> '_temp_key';
    IF v_temp_key IS NULL OR v_temp_key = '' THEN
      RAISE EXCEPTION 'stagedComponents row is missing _temp_key';
    END IF;

    INSERT INTO staged_components (
      manufacturer_id,
      source_document_id,
      source_chunk_id,
      sku,
      name,
      description,
      category,
      uom,
      length_mm,
      width_mm,
      height_mm,
      thickness_mm,
      depth_mm,
      gauge_mm,
      diameter_mm,
      roll_m,
      weight_kg,
      weight_g,
      volume_ml,
      pieces,
      pack_format,
      supplier_pack_qty,
      supplier_pack_uom,
      supplier_pack_note,
      material,
      finish,
      colour,
      profile,
      texture,
      coverage_m2,
      sort_order,
      extraction_confidence,
      verification_status,
      parser_notes
    )
    VALUES (
      (v_rec ->> 'manufacturer_id')::uuid,
      (v_rec ->> 'source_document_id')::uuid,
      (v_rec ->> 'source_chunk_id')::uuid,
      v_rec ->> 'sku',
      v_rec ->> 'name',
      v_rec ->> 'description',
      v_rec ->> 'category',
      v_rec ->> 'uom',
      (v_rec ->> 'length_mm')::numeric,
      (v_rec ->> 'width_mm')::numeric,
      (v_rec ->> 'height_mm')::numeric,
      (v_rec ->> 'thickness_mm')::numeric,
      (v_rec ->> 'depth_mm')::numeric,
      (v_rec ->> 'gauge_mm')::numeric,
      (v_rec ->> 'diameter_mm')::numeric,
      (v_rec ->> 'roll_m')::numeric,
      (v_rec ->> 'weight_kg')::numeric,
      (v_rec ->> 'weight_g')::numeric,
      (v_rec ->> 'volume_ml')::numeric,
      (v_rec ->> 'pieces')::int,
      v_rec ->> 'pack_format',
      (v_rec ->> 'supplier_pack_qty')::numeric,
      v_rec ->> 'supplier_pack_uom',
      v_rec ->> 'supplier_pack_note',
      v_rec ->> 'material',
      v_rec ->> 'finish',
      v_rec ->> 'colour',
      v_rec ->> 'profile',
      v_rec ->> 'texture',
      (v_rec ->> 'coverage_m2')::numeric,
      COALESCE((v_rec ->> 'sort_order')::int, 0),
      (v_rec ->> 'extraction_confidence')::numeric,
      'pending_review',
      v_rec -> 'parser_notes'
    )
    RETURNING id INTO v_new_id;

    v_comp_uuid_map := jsonb_set(v_comp_uuid_map, ARRAY[v_temp_key], to_jsonb(v_new_id::text));
    v_cnt_components := v_cnt_components + 1;

  END LOOP;

  -- ================================================================
  -- 6. Insert staged_system_colours
  --    Resolves _staged_system_temp_key → staged_system_id
  --    Builds v_col_uuid_map: _temp_key → real UUID
  --    Schema note: staged_system_colours has no extraction_confidence column.
  -- ================================================================
  FOR v_rec IN SELECT value FROM jsonb_array_elements(plan -> 'stagedSystemColours') LOOP

    v_temp_key     := v_rec ->> '_temp_key';
    v_sys_temp_key := v_rec ->> '_staged_system_temp_key';

    IF v_sys_temp_key IS NULL THEN
      RAISE EXCEPTION
        'stagedSystemColours row "%" has null _staged_system_temp_key — unresolvable FK link',
        v_temp_key;
    END IF;
    IF NOT (v_sys_uuid_map ? v_sys_temp_key) THEN
      RAISE EXCEPTION
        'stagedSystemColours row "%" references unknown system temp key "%"',
        v_temp_key, v_sys_temp_key;
    END IF;
    v_sys_id := (v_sys_uuid_map ->> v_sys_temp_key)::uuid;

    INSERT INTO staged_system_colours (
      staged_system_id,
      colour_name,
      sku,
      sku_suffix,
      image_url,
      is_stocked,
      sort_order,
      verification_status
    )
    VALUES (
      v_sys_id,
      v_rec ->> 'colour_name',
      v_rec ->> 'sku',
      v_rec ->> 'sku_suffix',
      v_rec ->> 'image_url',
      COALESCE((v_rec ->> 'is_stocked')::boolean, true),
      COALESCE((v_rec ->> 'sort_order')::int, 0),
      'pending_review'
    )
    RETURNING id INTO v_new_id;

    v_col_uuid_map := jsonb_set(v_col_uuid_map, ARRAY[v_temp_key], to_jsonb(v_new_id::text));
    v_cnt_colours := v_cnt_colours + 1;

  END LOOP;

  -- ================================================================
  -- 7. Insert staged_system_components
  --    Resolves _staged_system_temp_key + _staged_component_temp_key
  --    Builds v_link_uuid_map: _temp_key → real UUID
  -- ================================================================
  FOR v_rec IN SELECT value FROM jsonb_array_elements(plan -> 'stagedSystemComponents') LOOP

    v_temp_key      := v_rec ->> '_temp_key';
    v_sys_temp_key  := v_rec ->> '_staged_system_temp_key';
    v_comp_temp_key := v_rec ->> '_staged_component_temp_key';

    IF v_sys_temp_key IS NULL THEN
      RAISE EXCEPTION
        'stagedSystemComponents row "%" has null _staged_system_temp_key — unresolvable FK link',
        v_temp_key;
    END IF;
    IF NOT (v_sys_uuid_map ? v_sys_temp_key) THEN
      RAISE EXCEPTION
        'stagedSystemComponents row "%" references unknown system temp key "%"',
        v_temp_key, v_sys_temp_key;
    END IF;
    IF v_comp_temp_key IS NULL THEN
      RAISE EXCEPTION
        'stagedSystemComponents row "%" has null _staged_component_temp_key — unresolvable FK link',
        v_temp_key;
    END IF;
    IF NOT (v_comp_uuid_map ? v_comp_temp_key) THEN
      RAISE EXCEPTION
        'stagedSystemComponents row "%" references unknown component temp key "%"',
        v_temp_key, v_comp_temp_key;
    END IF;

    v_sys_id  := (v_sys_uuid_map  ->> v_sys_temp_key)::uuid;
    v_comp_id := (v_comp_uuid_map ->> v_comp_temp_key)::uuid;

    INSERT INTO staged_system_components (
      staged_system_id,
      staged_component_id,
      role,
      notes,
      sort_order,
      extraction_confidence,
      verification_status
    )
    VALUES (
      v_sys_id,
      v_comp_id,
      COALESCE(v_rec ->> 'role', 'required'),
      v_rec ->> 'notes',
      COALESCE((v_rec ->> 'sort_order')::int, 0),
      (v_rec ->> 'extraction_confidence')::numeric,
      'pending_review'
    )
    RETURNING id INTO v_new_id;

    v_link_uuid_map := jsonb_set(v_link_uuid_map, ARRAY[v_temp_key], to_jsonb(v_new_id::text));
    v_cnt_links := v_cnt_links + 1;

  END LOOP;

  -- ================================================================
  -- 8. Insert field_verifications
  --    entity_id resolved from UUID maps by entity_type dispatch.
  --    source_page_id left null in V1 (design doc §10.7).
  --    status hardcoded 'pending' — distinct from staged 'pending_review'.
  -- ================================================================
  FOR v_rec IN SELECT value FROM jsonb_array_elements(plan -> 'fieldVerifications') LOOP

    v_entity_type     := v_rec ->> 'entity_type';
    v_entity_temp_key := v_rec ->> 'entity_temp_key';

    v_entity_id := CASE v_entity_type
      WHEN 'staged_system'           THEN (v_sys_uuid_map  ->> v_entity_temp_key)::uuid
      WHEN 'staged_system_profile'   THEN (v_prof_uuid_map ->> v_entity_temp_key)::uuid
      WHEN 'staged_component'        THEN (v_comp_uuid_map ->> v_entity_temp_key)::uuid
      WHEN 'staged_system_colour'    THEN (v_col_uuid_map  ->> v_entity_temp_key)::uuid
      WHEN 'staged_system_component' THEN (v_link_uuid_map ->> v_entity_temp_key)::uuid
      ELSE NULL
    END;

    IF v_entity_id IS NULL THEN
      RAISE EXCEPTION
        'field_verifications: cannot resolve entity_temp_key "%" for entity_type "%" — aborting transaction',
        v_entity_temp_key, v_entity_type;
    END IF;

    INSERT INTO field_verifications (
      entity_type,
      entity_id,
      field_name,
      extracted_value,
      verified_value,
      source_document_id,
      source_page_id,
      source_chunk_id,
      source_page_number,
      status,
      confidence
    )
    VALUES (
      v_entity_type,
      v_entity_id,
      v_rec ->> 'field_name',
      v_rec ->> 'extracted_value',
      NULL,
      (v_rec ->> 'source_document_id')::uuid,
      NULL,
      (v_rec ->> 'source_chunk_id')::uuid,
      (v_rec ->> 'source_page_number')::int,
      'pending',
      (v_rec ->> 'confidence')::numeric
    );

    v_cnt_fv := v_cnt_fv + 1;

  END LOOP;

  -- ================================================================
  -- 9. Insert parser_field_evidence (append-only)
  --    entity_id resolved from UUID maps by entity_type dispatch.
  --    extraction_run_id is NOT NULL with FK → extraction_runs.id.
  -- ================================================================
  FOR v_rec IN SELECT value FROM jsonb_array_elements(plan -> 'parserFieldEvidence') LOOP

    v_entity_type     := v_rec ->> 'entity_type';
    v_entity_temp_key := v_rec ->> 'entity_temp_key';

    v_entity_id := CASE v_entity_type
      WHEN 'staged_system'           THEN (v_sys_uuid_map  ->> v_entity_temp_key)::uuid
      WHEN 'staged_system_profile'   THEN (v_prof_uuid_map ->> v_entity_temp_key)::uuid
      WHEN 'staged_component'        THEN (v_comp_uuid_map ->> v_entity_temp_key)::uuid
      WHEN 'staged_system_colour'    THEN (v_col_uuid_map  ->> v_entity_temp_key)::uuid
      WHEN 'staged_system_component' THEN (v_link_uuid_map ->> v_entity_temp_key)::uuid
      ELSE NULL
    END;

    IF v_entity_id IS NULL THEN
      RAISE EXCEPTION
        'parser_field_evidence: cannot resolve entity_temp_key "%" for entity_type "%" — aborting transaction',
        v_entity_temp_key, v_entity_type;
    END IF;

    INSERT INTO parser_field_evidence (
      extraction_run_id,
      entity_type,
      entity_id,
      field_name,
      extracted_value,
      source_document_id,
      source_chunk_id,
      source_page_number,
      confidence,
      is_uncertain,
      parser_note
    )
    VALUES (
      (v_rec ->> 'extraction_run_id')::uuid,
      v_entity_type,
      v_entity_id,
      v_rec ->> 'field_name',
      v_rec ->> 'extracted_value',
      (v_rec ->> 'source_document_id')::uuid,
      (v_rec ->> 'source_chunk_id')::uuid,
      (v_rec ->> 'source_page_number')::int,
      (v_rec ->> 'confidence')::numeric,
      COALESCE((v_rec ->> 'is_uncertain')::boolean, false),
      v_rec ->> 'parser_note'
    );

    v_cnt_pfe := v_cnt_pfe + 1;

  END LOOP;

  -- ================================================================
  -- 10. Return success
  -- ================================================================
  RETURN jsonb_build_object(
    'ok',   true,
    'mode', 'inserted',
    'inserted_counts', jsonb_build_object(
      'stagedSystems',          v_cnt_systems,
      'stagedSystemProfiles',   v_cnt_profiles,
      'stagedComponents',       v_cnt_components,
      'stagedSystemColours',    v_cnt_colours,
      'stagedSystemComponents', v_cnt_links,
      'fieldVerifications',     v_cnt_fv,
      'parserFieldEvidence',    v_cnt_pfe
    ),
    'id_maps', jsonb_build_object(
      'systems',    v_sys_uuid_map,
      'profiles',   v_prof_uuid_map,
      'components', v_comp_uuid_map,
      'colours',    v_col_uuid_map,
      'links',      v_link_uuid_map
    )
  );

END;
$$;
