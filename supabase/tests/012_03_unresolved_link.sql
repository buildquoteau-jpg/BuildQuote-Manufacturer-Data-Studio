-- Test 3: profile with a bad _staged_system_temp_key should raise EXCEPTION and rollback.
-- The staged_systems row that is inserted first must NOT persist after the rollback.
-- Row counts must be identical before and after this call.
--
-- Uses a DO block so we can catch the exception and report PASS/FAIL.
-- The exception aborts the function's internal transaction — no rows committed.

DO $$
DECLARE
  v_mfr_id  text;
  v_systems_before bigint;
  v_systems_after  bigint;
BEGIN
  SELECT id::text INTO v_mfr_id
  FROM data_studio_manufacturers WHERE name = 'NewTechWood' LIMIT 1;

  SELECT COUNT(*) INTO v_systems_before FROM staged_systems;

  BEGIN
    PERFORM insert_parser_output_plan_v1(
      jsonb_build_object(
        'stagedSystems', jsonb_build_array(
          jsonb_build_object(
            '_temp_key',             'system_0',
            'manufacturer_id',       v_mfr_id,
            'source_document_id',    NULL::text,
            'source_chunk_id',       NULL::text,
            'name',                  'Rollback Test System',
            'moisture_resistant',    false,
            'double_sided',          false,
            'sort_order',            0,
            'extraction_confidence', 0.9,
            'parser_notes',          NULL::text
          )
        ),
        'stagedSystemProfiles', jsonb_build_array(
          jsonb_build_object(
            '_temp_key',               'profile_0',
            '_staged_system_temp_key', 'NONEXISTENT_KEY',
            'sort_order',              0,
            'extraction_confidence',   0.9
          )
        ),
        'stagedComponents',       '[]'::jsonb,
        'stagedSystemColours',    '[]'::jsonb,
        'stagedSystemComponents', '[]'::jsonb,
        'fieldVerifications',     '[]'::jsonb,
        'parserFieldEvidence',    '[]'::jsonb
      )
    );
    RAISE NOTICE 'FAIL: no exception raised — unresolved link should have aborted';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'PASS: exception raised as expected — SQLERRM: %', SQLERRM;
  END;

  SELECT COUNT(*) INTO v_systems_after FROM staged_systems;

  IF v_systems_before = v_systems_after THEN
    RAISE NOTICE 'PASS: staged_systems count unchanged (%) — rollback confirmed', v_systems_before;
  ELSE
    RAISE NOTICE 'FAIL: staged_systems changed from % to % — rollback did NOT occur!',
      v_systems_before, v_systems_after;
  END IF;
END;
$$;
