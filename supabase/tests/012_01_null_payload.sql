-- Test 1: null payload should return ok=false (not raise)
SELECT insert_parser_output_plan_v1(NULL);
