-- Test 2: plan missing required top-level keys should return ok=false with missing_keys
SELECT insert_parser_output_plan_v1('{"stagedSystems": []}'::jsonb);
