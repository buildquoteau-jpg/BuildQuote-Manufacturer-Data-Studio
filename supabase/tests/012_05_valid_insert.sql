-- Test 4: minimal valid plan — full 7-table insert.
-- Covers all 5 entity types in field_verifications and parser_field_evidence.
--
-- Plan: 1 system, 1 profile, 1 component, 1 colour, 1 link,
--       5 field_verifications (one per entity type), 3 parser_field_evidence rows.
--
-- UUIDs looked up dynamically so the test survives db reset (seed uses gen_random_uuid()).
-- extraction_run_id is stable across resets (hardcoded in seed.sql as a0000000-...-0001).

DO $$
DECLARE
  v_mfr_id  text;
  v_doc_id  text;
  v_run_id  text;
  v_plan    jsonb;
  v_result  jsonb;

  v_sys_before   bigint; v_sys_after   bigint;
  v_prof_before  bigint; v_prof_after  bigint;
  v_comp_before  bigint; v_comp_after  bigint;
  v_col_before   bigint; v_col_after   bigint;
  v_link_before  bigint; v_link_after  bigint;
  v_fv_before    bigint; v_fv_after    bigint;
  v_pfe_before   bigint; v_pfe_after   bigint;
BEGIN
  -- Fetch real seeded UUIDs
  SELECT m.id::text, sd.id::text, er.id::text
  INTO v_mfr_id, v_doc_id, v_run_id
  FROM data_studio_manufacturers m
  JOIN source_documents sd ON sd.manufacturer_id = m.id
  JOIN extraction_runs er ON er.source_document_id = sd.id
  WHERE m.name = 'NewTechWood'
  LIMIT 1;

  RAISE NOTICE 'Using manufacturer_id=% source_document_id=% extraction_run_id=%',
    v_mfr_id, v_doc_id, v_run_id;

  -- Row counts before
  SELECT COUNT(*) INTO v_sys_before   FROM staged_systems;
  SELECT COUNT(*) INTO v_prof_before  FROM staged_system_profiles;
  SELECT COUNT(*) INTO v_comp_before  FROM staged_components;
  SELECT COUNT(*) INTO v_col_before   FROM staged_system_colours;
  SELECT COUNT(*) INTO v_link_before  FROM staged_system_components;
  SELECT COUNT(*) INTO v_fv_before    FROM field_verifications;
  SELECT COUNT(*) INTO v_pfe_before   FROM parser_field_evidence;

  RAISE NOTICE 'BEFORE — systems:% profiles:% components:% colours:% links:% fv:% pfe:%',
    v_sys_before, v_prof_before, v_comp_before, v_col_before,
    v_link_before, v_fv_before, v_pfe_before;

  -- Build plan dynamically with real UUIDs
  v_plan := jsonb_build_object(
    'stagedSystems', jsonb_build_array(
      jsonb_build_object(
        '_temp_key',             'system_0',
        'manufacturer_id',       v_mfr_id,
        'source_document_id',    v_doc_id,
        'source_chunk_id',       NULL::text,
        'name',                  'Avenue Decking (Migration 012 Test)',
        'product_code',          'MIG-TST-001',
        'slug',                  NULL::text,
        'category',              'Decking',
        'subcategory',           NULL::text,
        'description',           'Test system for migration 012 insert logic.',
        'bal_rating',            NULL::text,
        'acoustic_rating',       NULL::text,
        'moisture_resistant',    false,
        'structural_grade',      NULL::text,
        'double_sided',          false,
        'sheet_format',          NULL::text,
        'install_guide_url',     NULL::text,
        'tech_data_url',         NULL::text,
        'notes',                 NULL::text,
        'sort_order',            0,
        'extraction_confidence', 0.9,
        'parser_notes',          NULL::text
      )
    ),
    'stagedSystemProfiles', jsonb_build_array(
      jsonb_build_object(
        '_temp_key',               'profile_0',
        '_staged_system_temp_key', 'system_0',
        'name',                    'Avenue 3000mm',
        'profile_name',            '3000mm Board',
        'product_code',            'MIG-TST-001-3000',
        'dimensions',              '3000 x 140 x 25mm',
        'length_m',                3.0,
        'length_mm',               3000,
        'width_mm',                140,
        'height_mm',               NULL::text,
        'thickness_mm',            25,
        'depth_mm',                NULL::text,
        'gauge_mm',                NULL::text,
        'diameter_mm',             NULL::text,
        'roll_m',                  NULL::text,
        'weight_kg',               NULL::text,
        'weight_g',                NULL::text,
        'volume_ml',               NULL::text,
        'pieces',                  NULL::text,
        'pack_format',             NULL::text,
        'supplier_pack_qty',       NULL::text,
        'supplier_pack_uom',       NULL::text,
        'supplier_pack_note',      NULL::text,
        'bal_rating',              NULL::text,
        'uom',                     'lm',
        'sort_order',              0,
        'extraction_confidence',   0.9,
        'parser_notes',            NULL::text
      )
    ),
    'stagedComponents', jsonb_build_array(
      jsonb_build_object(
        '_temp_key',             'component_0',
        'manufacturer_id',       v_mfr_id,
        'source_document_id',    v_doc_id,
        'source_chunk_id',       NULL::text,
        'sku',                   'MIG-TST-CLIP',
        'name',                  'Test Fixing Clip',
        'description',           'Stainless steel hidden fixing clip.',
        'category',              'Fixings',
        'uom',                   'ea',
        'length_mm',             NULL::text,
        'width_mm',              NULL::text,
        'height_mm',             NULL::text,
        'thickness_mm',          NULL::text,
        'depth_mm',              NULL::text,
        'gauge_mm',              NULL::text,
        'diameter_mm',           NULL::text,
        'roll_m',                NULL::text,
        'weight_kg',             NULL::text,
        'weight_g',              NULL::text,
        'volume_ml',             NULL::text,
        'pieces',                NULL::text,
        'pack_format',           NULL::text,
        'supplier_pack_qty',     NULL::text,
        'supplier_pack_uom',     NULL::text,
        'supplier_pack_note',    NULL::text,
        'material',              'stainless steel',
        'finish',                NULL::text,
        'colour',                NULL::text,
        'profile',               NULL::text,
        'texture',               NULL::text,
        'coverage_m2',           NULL::text,
        'sort_order',            0,
        'extraction_confidence', 0.85,
        'parser_notes',          NULL::text
      )
    ),
    'stagedSystemColours', jsonb_build_array(
      jsonb_build_object(
        '_temp_key',               'colour_0',
        '_staged_system_temp_key', 'system_0',
        'colour_name',             'Teak',
        'sku',                     'MIG-TST-001-TK',
        'sku_suffix',              'TK',
        'image_url',               NULL::text,
        'is_stocked',              true,
        'sort_order',              0,
        'extraction_confidence',   0.8
      )
    ),
    'stagedSystemComponents', jsonb_build_array(
      jsonb_build_object(
        '_temp_key',                   'link_0',
        '_staged_system_temp_key',     'system_0',
        '_staged_component_temp_key',  'component_0',
        'role',                        'required',
        'notes',                       NULL::text,
        'sort_order',                  0,
        'extraction_confidence',       0.85
      )
    ),
    'fieldVerifications', jsonb_build_array(
      jsonb_build_object(
        'entity_type',        'staged_system',
        'entity_temp_key',    'system_0',
        'field_name',         'name',
        'extracted_value',    'Avenue Decking (Migration 012 Test)',
        'verified_value',     NULL::text,
        'source_document_id', v_doc_id,
        'source_chunk_id',    NULL::text,
        'source_page_number', 1,
        'confidence',         0.9,
        'status',             'pending'
      ),
      jsonb_build_object(
        'entity_type',        'staged_system_profile',
        'entity_temp_key',    'profile_0',
        'field_name',         'length_mm',
        'extracted_value',    '3000',
        'verified_value',     NULL::text,
        'source_document_id', v_doc_id,
        'source_chunk_id',    NULL::text,
        'source_page_number', 2,
        'confidence',         0.9,
        'status',             'pending'
      ),
      jsonb_build_object(
        'entity_type',        'staged_component',
        'entity_temp_key',    'component_0',
        'field_name',         'name',
        'extracted_value',    'Test Fixing Clip',
        'verified_value',     NULL::text,
        'source_document_id', v_doc_id,
        'source_chunk_id',    NULL::text,
        'source_page_number', 3,
        'confidence',         0.85,
        'status',             'pending'
      ),
      jsonb_build_object(
        'entity_type',        'staged_system_colour',
        'entity_temp_key',    'colour_0',
        'field_name',         'colour_name',
        'extracted_value',    'Teak',
        'verified_value',     NULL::text,
        'source_document_id', v_doc_id,
        'source_chunk_id',    NULL::text,
        'source_page_number', 4,
        'confidence',         0.8,
        'status',             'pending'
      ),
      jsonb_build_object(
        'entity_type',        'staged_system_component',
        'entity_temp_key',    'link_0',
        'field_name',         'role',
        'extracted_value',    'required',
        'verified_value',     NULL::text,
        'source_document_id', v_doc_id,
        'source_chunk_id',    NULL::text,
        'source_page_number', 1,
        'confidence',         0.85,
        'status',             'pending'
      )
    ),
    'parserFieldEvidence', jsonb_build_array(
      jsonb_build_object(
        'extraction_run_id',  v_run_id,
        'entity_type',        'staged_system',
        'entity_temp_key',    'system_0',
        'field_name',         'name',
        'extracted_value',    'Avenue Decking (Migration 012 Test)',
        'source_document_id', v_doc_id,
        'source_chunk_id',    NULL::text,
        'source_page_number', 1,
        'confidence',         0.9,
        'is_uncertain',       false,
        'parser_note',        NULL::text
      ),
      jsonb_build_object(
        'extraction_run_id',  v_run_id,
        'entity_type',        'staged_system_profile',
        'entity_temp_key',    'profile_0',
        'field_name',         'length_mm',
        'extracted_value',    '3000',
        'source_document_id', v_doc_id,
        'source_chunk_id',    NULL::text,
        'source_page_number', 2,
        'confidence',         0.9,
        'is_uncertain',       false,
        'parser_note',        NULL::text
      ),
      jsonb_build_object(
        'extraction_run_id',  v_run_id,
        'entity_type',        'staged_component',
        'entity_temp_key',    'component_0',
        'field_name',         'name',
        'extracted_value',    'Test Fixing Clip',
        'source_document_id', v_doc_id,
        'source_chunk_id',    NULL::text,
        'source_page_number', 3,
        'confidence',         0.85,
        'is_uncertain',       false,
        'parser_note',        NULL::text
      )
    )
  );

  -- Call the RPC
  SELECT insert_parser_output_plan_v1(v_plan) INTO v_result;

  RAISE NOTICE 'RPC result: %', v_result;

  -- Row counts after
  SELECT COUNT(*) INTO v_sys_after   FROM staged_systems;
  SELECT COUNT(*) INTO v_prof_after  FROM staged_system_profiles;
  SELECT COUNT(*) INTO v_comp_after  FROM staged_components;
  SELECT COUNT(*) INTO v_col_after   FROM staged_system_colours;
  SELECT COUNT(*) INTO v_link_after  FROM staged_system_components;
  SELECT COUNT(*) INTO v_fv_after    FROM field_verifications;
  SELECT COUNT(*) INTO v_pfe_after   FROM parser_field_evidence;

  RAISE NOTICE 'AFTER  — systems:% profiles:% components:% colours:% links:% fv:% pfe:%',
    v_sys_after, v_prof_after, v_comp_after, v_col_after,
    v_link_after, v_fv_after, v_pfe_after;

  RAISE NOTICE 'DELTA  — systems:% profiles:% components:% colours:% links:% fv:% pfe:%',
    v_sys_after - v_sys_before,
    v_prof_after - v_prof_before,
    v_comp_after - v_comp_before,
    v_col_after - v_col_before,
    v_link_after - v_link_before,
    v_fv_after - v_fv_before,
    v_pfe_after - v_pfe_before;

  -- Assertions
  IF (v_sys_after - v_sys_before) = 1     THEN RAISE NOTICE 'PASS: staged_systems +1';     ELSE RAISE NOTICE 'FAIL: staged_systems delta=%', v_sys_after - v_sys_before;   END IF;
  IF (v_prof_after - v_prof_before) = 1   THEN RAISE NOTICE 'PASS: staged_system_profiles +1';  ELSE RAISE NOTICE 'FAIL: profiles delta=%', v_prof_after - v_prof_before;   END IF;
  IF (v_comp_after - v_comp_before) = 1   THEN RAISE NOTICE 'PASS: staged_components +1';  ELSE RAISE NOTICE 'FAIL: components delta=%', v_comp_after - v_comp_before;  END IF;
  IF (v_col_after - v_col_before) = 1     THEN RAISE NOTICE 'PASS: staged_system_colours +1';   ELSE RAISE NOTICE 'FAIL: colours delta=%', v_col_after - v_col_before;    END IF;
  IF (v_link_after - v_link_before) = 1   THEN RAISE NOTICE 'PASS: staged_system_components +1'; ELSE RAISE NOTICE 'FAIL: links delta=%', v_link_after - v_link_before;   END IF;
  IF (v_fv_after - v_fv_before) = 5       THEN RAISE NOTICE 'PASS: field_verifications +5';  ELSE RAISE NOTICE 'FAIL: fv delta=%', v_fv_after - v_fv_before;             END IF;
  IF (v_pfe_after - v_pfe_before) = 3     THEN RAISE NOTICE 'PASS: parser_field_evidence +3'; ELSE RAISE NOTICE 'FAIL: pfe delta=%', v_pfe_after - v_pfe_before;          END IF;

  -- Verify inserted rows reference the correct system UUID
  RAISE NOTICE 'Profile FK check: %',
    (SELECT CASE WHEN sp.staged_system_id = ss.id THEN 'PASS: profile.staged_system_id = system.id'
                 ELSE 'FAIL: profile FK mismatch' END
     FROM staged_systems ss
     JOIN staged_system_profiles sp ON sp.staged_system_id = ss.id
     WHERE ss.name = 'Avenue Decking (Migration 012 Test)'
     LIMIT 1);

  RAISE NOTICE 'Colour FK check: %',
    (SELECT CASE WHEN sc.staged_system_id = ss.id THEN 'PASS: colour.staged_system_id = system.id'
                 ELSE 'FAIL: colour FK mismatch' END
     FROM staged_systems ss
     JOIN staged_system_colours sc ON sc.staged_system_id = ss.id
     WHERE ss.name = 'Avenue Decking (Migration 012 Test)'
     LIMIT 1);

  RAISE NOTICE 'Link FK check: %',
    (SELECT CASE WHEN sl.staged_system_id = ss.id AND sl.staged_component_id = c.id
                 THEN 'PASS: link FKs resolve to correct system + component'
                 ELSE 'FAIL: link FK mismatch' END
     FROM staged_systems ss
     JOIN staged_system_components sl ON sl.staged_system_id = ss.id
     JOIN staged_components c ON c.id = sl.staged_component_id
     WHERE ss.name = 'Avenue Decking (Migration 012 Test)'
     LIMIT 1);

  RAISE NOTICE 'field_verifications status check: %',
    (SELECT CASE WHEN bool_and(fv.status = 'pending') THEN 'PASS: all fv.status = pending'
                 ELSE 'FAIL: unexpected fv status value' END
     FROM field_verifications fv
     JOIN staged_systems ss ON ss.id::text = fv.entity_id::text
     WHERE ss.name = 'Avenue Decking (Migration 012 Test)');

  RAISE NOTICE 'staged_systems verification_status check: %',
    (SELECT CASE WHEN verification_status = 'pending_review'
                 THEN 'PASS: staged_systems.verification_status = pending_review'
                 ELSE 'FAIL: unexpected value: ' || verification_status END
     FROM staged_systems WHERE name = 'Avenue Decking (Migration 012 Test)' LIMIT 1);
END;
$$;
