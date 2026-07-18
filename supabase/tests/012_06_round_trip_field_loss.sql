-- Test 6: round-trip field-loss guard for insert_parser_output_plan_v1.
--
-- WHY THIS TEST EXISTS (2026-07-18 audit): the RPC has failed in two ways that
-- the other tests could not see.
--   * Loud drift  — migration 026 renamed install_guide_url and the RPC kept
--     referencing the old column: every live insert 42703'd for weeks (fixed
--     in 057). Any real insert catches this class — IF THE TESTS ARE RUN.
--   * Silent drift — the plan payload carried australian_made and profile
--     sheet_format, the live columns existed, but the RPC never listed them in
--     its INSERTs: values were quietly discarded (fixed in 058). No insert
--     error can catch this class; only a round-trip comparison can.
--
-- This test inserts a plan where EVERY plan-contract field is non-null, reads
-- the rows back, and asserts each value survived via jsonb containment
-- (to_jsonb(row) @> expected). A field the RPC drops, a renamed column, or a
-- payload key the RPC ignores all fail loudly here.
--
-- Failures RAISE EXCEPTION (non-zero exit under ON_ERROR_STOP) — never a
-- printed 'FAIL' notice that scrolls away. Self-cleaning: all inserted rows
-- are deleted at the end, so it is safe against a shared staging database.
--
-- RUN THIS AFTER EVERY MIGRATION THAT TOUCHES staged_* TABLES OR THE RPC.
-- Requires migration 058 (australian_made / sheet_format / role fallback).

DO $$
DECLARE
  v_mfr_id  uuid;
  v_doc_id  uuid;
  v_run_id  uuid;
  v_plan    jsonb;
  v_result  jsonb;
  v_sys_id  uuid;
  v_prof_id uuid;
  v_comp_id uuid;
  v_col_id  uuid;
  v_link_id uuid;
  v_row      jsonb;
  v_expected jsonb;
BEGIN
  -- Any manufacturer that has a source document with an extraction run works;
  -- everything inserted here is deleted before the block ends.
  SELECT m.id, sd.id, er.id
  INTO v_mfr_id, v_doc_id, v_run_id
  FROM data_studio_manufacturers m
  JOIN source_documents sd ON sd.manufacturer_id = m.id
  JOIN extraction_runs er ON er.source_document_id = sd.id
  LIMIT 1;

  IF v_mfr_id IS NULL THEN
    RAISE EXCEPTION 'seed missing: need one manufacturer with a source_document and an extraction_run';
  END IF;

  v_plan := jsonb_build_object(
    'stagedSystems', jsonb_build_array(jsonb_build_object(
      '_temp_key',             'rt_sys',
      'manufacturer_id',       v_mfr_id::text,
      'source_document_id',    v_doc_id::text,
      'source_chunk_id',       NULL,
      'name',                  'RT Field-Loss Guard System',
      'product_code',          'RT-SYS-001',
      'slug',                  'rt-field-loss-guard',
      'category',              'Decking',
      'subcategory',           'Composite',
      'description',           'Round-trip guard test system',
      'bal_rating',            'BAL-29',
      'acoustic_rating',       'Rw45',
      'moisture_resistant',    true,
      'structural_grade',      'SG-1',
      'double_sided',          true,
      'sheet_format',          'plank',
      'install_guide_urls',    jsonb_build_array(jsonb_build_object('label', 'Install Guide', 'url', 'https://example.com/install.pdf')),
      'tech_data_url',         'https://example.com/tech.pdf',
      'australian_made',       true,
      'notes',                 'rt system notes',
      'sort_order',            7,
      'extraction_confidence', 0.91,
      'parser_notes',          jsonb_build_array('rt-note')
    )),
    'stagedSystemProfiles', jsonb_build_array(jsonb_build_object(
      '_temp_key',               'rt_prof',
      '_staged_system_temp_key', 'rt_sys',
      'name',                    'RT Board 5400mm',
      'profile_name',            '5400mm Board',
      'product_code',            'RT-PROF-5400',
      'dimensions',              '5400 x 140 x 23mm',
      'length_m',                5.4,
      'length_mm',               5400,
      'width_mm',                140,
      'height_mm',               60,
      'thickness_mm',            23,
      'depth_mm',                12,
      'gauge_mm',                0.55,
      'diameter_mm',             8,
      'roll_m',                  30,
      'weight_kg',               14.5,
      'weight_g',                120,
      'volume_ml',               600,
      'pieces',                  4,
      'pack_format',             'bundle of 4',
      'supplier_pack_qty',       4,
      'supplier_pack_uom',       'lengths',
      'supplier_pack_note',      'rt pack note',
      'bal_rating',              'BAL-19',
      'uom',                     'lm',
      'sheet_format',            'groove',
      'sort_order',              3,
      'parser_notes',            jsonb_build_array('rt-prof-note')
    )),
    'stagedComponents', jsonb_build_array(jsonb_build_object(
      '_temp_key',             'rt_comp',
      'manufacturer_id',       v_mfr_id::text,
      'source_document_id',    v_doc_id::text,
      'source_chunk_id',       NULL,
      'sku',                   'RT-CLIP-01',
      'name',                  'RT Fixing Clip',
      'description',           'Round-trip test clip',
      'category',              'Fixings',
      'uom',                   'pack',
      'length_mm',             45,
      'width_mm',              20,
      'height_mm',             10,
      'thickness_mm',          2,
      'depth_mm',              5,
      'gauge_mm',              1.2,
      'diameter_mm',           4,
      'roll_m',                10,
      'weight_kg',             0.4,
      'weight_g',              400,
      'volume_ml',             50,
      'pieces',                100,
      'pack_format',           'box of 100',
      'supplier_pack_qty',     100,
      'supplier_pack_uom',     'each',
      'supplier_pack_note',    'rt comp pack note',
      'material',              'stainless steel',
      'finish',                'brushed',
      'colour',                'silver',
      'profile',               'T-clip',
      'texture',               'smooth',
      'coverage_m2',           2.5,
      'sort_order',            2,
      'extraction_confidence', 0.88,
      'parser_notes',          jsonb_build_array('rt-comp-note')
    )),
    'stagedSystemColours', jsonb_build_array(jsonb_build_object(
      '_temp_key',               'rt_col',
      '_staged_system_temp_key', 'rt_sys',
      'colour_name',             'RT Teak',
      'sku',                     'RT-SYS-001-TK',
      'sku_suffix',              '-TK',
      'image_url',               'https://example.com/teak.jpg',
      'is_stocked',              true,
      'sort_order',              1
    )),
    'stagedSystemComponents', jsonb_build_array(jsonb_build_object(
      '_temp_key',                  'rt_link',
      '_staged_system_temp_key',    'rt_sys',
      '_staged_component_temp_key', 'rt_comp',
      'role',                       'starter clip',
      'notes',                      'rt link notes',
      'sort_order',                 5,
      'extraction_confidence',      0.86
    )),
    'fieldVerifications', jsonb_build_array(jsonb_build_object(
      'entity_type',        'staged_system',
      'entity_temp_key',    'rt_sys',
      'field_name',         'name',
      'extracted_value',    'RT Field-Loss Guard System',
      'source_document_id', v_doc_id::text,
      'source_chunk_id',    NULL,
      'source_page_number', 3,
      'confidence',         0.9
    )),
    'parserFieldEvidence', jsonb_build_array(jsonb_build_object(
      'extraction_run_id',  v_run_id::text,
      'entity_type',        'staged_system_profile',
      'entity_temp_key',    'rt_prof',
      'field_name',         'length_mm',
      'extracted_value',    '5400',
      'source_document_id', v_doc_id::text,
      'source_chunk_id',    NULL,
      'source_page_number', 4,
      'confidence',         0.93,
      'is_uncertain',       true,
      'parser_note',        'rt evidence note'
    ))
  );

  SELECT insert_parser_output_plan_v1(v_plan) INTO v_result;
  IF NOT COALESCE((v_result ->> 'ok')::boolean, false) THEN
    RAISE EXCEPTION 'RPC rejected the round-trip plan: %', v_result;
  END IF;

  v_sys_id  := ((v_result -> 'id_maps' -> 'systems')    ->> 'rt_sys')::uuid;
  v_prof_id := ((v_result -> 'id_maps' -> 'profiles')   ->> 'rt_prof')::uuid;
  v_comp_id := ((v_result -> 'id_maps' -> 'components') ->> 'rt_comp')::uuid;
  v_col_id  := ((v_result -> 'id_maps' -> 'colours')    ->> 'rt_col')::uuid;
  v_link_id := ((v_result -> 'id_maps' -> 'links')      ->> 'rt_link')::uuid;

  IF v_sys_id IS NULL OR v_prof_id IS NULL OR v_comp_id IS NULL
     OR v_col_id IS NULL OR v_link_id IS NULL THEN
    RAISE EXCEPTION 'id_maps incomplete: %', v_result -> 'id_maps';
  END IF;

  -- ── staged_systems: every plan field must have survived ──────────────────
  SELECT to_jsonb(s) INTO v_row FROM staged_systems s WHERE s.id = v_sys_id;
  v_expected := jsonb_build_object(
    'manufacturer_id',       v_mfr_id::text,
    'source_document_id',    v_doc_id::text,
    'name',                  'RT Field-Loss Guard System',
    'product_code',          'RT-SYS-001',
    'slug',                  'rt-field-loss-guard',
    'category',              'Decking',
    'subcategory',           'Composite',
    'description',           'Round-trip guard test system',
    'bal_rating',            'BAL-29',
    'acoustic_rating',       'Rw45',
    'moisture_resistant',    true,
    'structural_grade',      'SG-1',
    'double_sided',          true,
    'sheet_format',          'plank',
    'install_guide_urls',    jsonb_build_array(jsonb_build_object('label', 'Install Guide', 'url', 'https://example.com/install.pdf')),
    'tech_data_url',         'https://example.com/tech.pdf',
    'australian_made',       true,
    'notes',                 'rt system notes',
    'sort_order',            7,
    'extraction_confidence', 0.91,
    'verification_status',   'pending_review',
    'parser_notes',          jsonb_build_array('rt-note')
  );
  IF NOT (v_row @> v_expected) THEN
    RAISE EXCEPTION E'staged_systems round-trip mismatch (a field was dropped or mangled by the RPC).\nexpected subset: %\ngot row: %', v_expected, v_row;
  END IF;

  -- ── staged_system_profiles ────────────────────────────────────────────────
  SELECT to_jsonb(p) INTO v_row FROM staged_system_profiles p WHERE p.id = v_prof_id;
  v_expected := jsonb_build_object(
    'staged_system_id',    v_sys_id::text,
    'name',                'RT Board 5400mm',
    'profile_name',        '5400mm Board',
    'product_code',        'RT-PROF-5400',
    'dimensions',          '5400 x 140 x 23mm',
    'length_m',            5.4,
    'length_mm',           5400,
    'width_mm',            140,
    'height_mm',           60,
    'thickness_mm',        23,
    'depth_mm',            12,
    'gauge_mm',            0.55,
    'diameter_mm',         8,
    'roll_m',              30,
    'weight_kg',           14.5,
    'weight_g',            120,
    'volume_ml',           600,
    'pieces',              4,
    'pack_format',         'bundle of 4',
    'supplier_pack_qty',   4,
    'supplier_pack_uom',   'lengths',
    'supplier_pack_note',  'rt pack note',
    'bal_rating',          'BAL-19',
    'uom',                 'lm',
    'sheet_format',        'groove',
    'sort_order',          3,
    'verification_status', 'pending_review',
    'parser_notes',        jsonb_build_array('rt-prof-note')
  );
  IF NOT (v_row @> v_expected) THEN
    RAISE EXCEPTION E'staged_system_profiles round-trip mismatch.\nexpected subset: %\ngot row: %', v_expected, v_row;
  END IF;

  -- ── staged_components ─────────────────────────────────────────────────────
  SELECT to_jsonb(c) INTO v_row FROM staged_components c WHERE c.id = v_comp_id;
  v_expected := jsonb_build_object(
    'manufacturer_id',       v_mfr_id::text,
    'source_document_id',    v_doc_id::text,
    'sku',                   'RT-CLIP-01',
    'name',                  'RT Fixing Clip',
    'description',           'Round-trip test clip',
    'category',              'Fixings',
    'uom',                   'pack',
    'length_mm',             45,
    'width_mm',              20,
    'height_mm',             10,
    'thickness_mm',          2,
    'depth_mm',              5,
    'gauge_mm',              1.2,
    'diameter_mm',           4,
    'roll_m',                10,
    'weight_kg',             0.4,
    'weight_g',              400,
    'volume_ml',             50,
    'pieces',                100,
    'pack_format',           'box of 100',
    'supplier_pack_qty',     100,
    'supplier_pack_uom',     'each',
    'supplier_pack_note',    'rt comp pack note',
    'material',              'stainless steel',
    'finish',                'brushed',
    'colour',                'silver',
    'profile',               'T-clip',
    'texture',               'smooth',
    'coverage_m2',           2.5,
    'sort_order',            2,
    'extraction_confidence', 0.88,
    'verification_status',   'pending_review',
    'parser_notes',          jsonb_build_array('rt-comp-note')
  );
  IF NOT (v_row @> v_expected) THEN
    RAISE EXCEPTION E'staged_components round-trip mismatch.\nexpected subset: %\ngot row: %', v_expected, v_row;
  END IF;

  -- ── staged_system_colours ─────────────────────────────────────────────────
  SELECT to_jsonb(sc) INTO v_row FROM staged_system_colours sc WHERE sc.id = v_col_id;
  v_expected := jsonb_build_object(
    'staged_system_id',    v_sys_id::text,
    'colour_name',         'RT Teak',
    'sku',                 'RT-SYS-001-TK',
    'sku_suffix',          '-TK',
    'image_url',           'https://example.com/teak.jpg',
    'is_stocked',          true,
    'sort_order',          1,
    'verification_status', 'pending_review'
  );
  IF NOT (v_row @> v_expected) THEN
    RAISE EXCEPTION E'staged_system_colours round-trip mismatch.\nexpected subset: %\ngot row: %', v_expected, v_row;
  END IF;

  -- ── staged_system_components ──────────────────────────────────────────────
  SELECT to_jsonb(l) INTO v_row FROM staged_system_components l WHERE l.id = v_link_id;
  v_expected := jsonb_build_object(
    'staged_system_id',      v_sys_id::text,
    'staged_component_id',   v_comp_id::text,
    'role',                  'starter clip',
    'notes',                 'rt link notes',
    'sort_order',            5,
    'extraction_confidence', 0.86,
    'verification_status',   'pending_review'
  );
  IF NOT (v_row @> v_expected) THEN
    RAISE EXCEPTION E'staged_system_components round-trip mismatch.\nexpected subset: %\ngot row: %', v_expected, v_row;
  END IF;

  -- ── field_verifications + parser_field_evidence ───────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM field_verifications
    WHERE entity_id = v_sys_id AND entity_type = 'staged_system'
      AND field_name = 'name'
      AND extracted_value = 'RT Field-Loss Guard System'
      AND source_page_number = 3 AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'field_verifications round-trip row missing or mangled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM parser_field_evidence
    WHERE entity_id = v_prof_id AND entity_type = 'staged_system_profile'
      AND extraction_run_id = v_run_id
      AND field_name = 'length_mm' AND extracted_value = '5400'
      AND source_page_number = 4 AND is_uncertain = true
      AND parser_note = 'rt evidence note'
  ) THEN
    RAISE EXCEPTION 'parser_field_evidence round-trip row missing or mangled';
  END IF;

  -- ── cleanup: leave no trace in the shared staging DB ──────────────────────
  DELETE FROM field_verifications
  WHERE entity_id IN (v_sys_id, v_prof_id, v_comp_id, v_col_id, v_link_id);
  DELETE FROM parser_field_evidence
  WHERE entity_id IN (v_sys_id, v_prof_id, v_comp_id, v_col_id, v_link_id);
  DELETE FROM staged_systems WHERE id = v_sys_id;      -- cascades profile/colour/link
  DELETE FROM staged_components WHERE id = v_comp_id;  -- cascades any remaining link

  RAISE NOTICE 'PASS: every plan field round-tripped through the RPC; test rows cleaned up';
END;
$$;
