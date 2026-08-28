-- Test: ai_knowledge_gaps RLS isolation (migration 066).
--
-- Confirms a manufacturer session can read its own knowledge-gap rows but
-- never another manufacturer's, and that a BuildQuote staff session reads
-- across all manufacturers. Unlike the 012_* suite (which tests the parser
-- RPC as the service role, bypassing RLS entirely), this test switches
-- Postgres role to `authenticated` and sets `request.jwt.claims` to
-- impersonate a specific auth.uid() — the standard way to exercise RLS
-- policies directly in psql/the SQL editor, since RLS is otherwise invisible
-- to a service-role or superuser connection.
--
-- Self-contained fixtures (two manufacturers, two manufacturer_users, one
-- BuildQuote admin profile, one gap row) rather than relying on seeded data,
-- so this test doesn't depend on what else has been onboarded. Self-cleaning
-- — deletes everything it creates, including RESET ROLE at the end so the
-- session doesn't stay impersonated for whatever runs after it.

DO $$
DECLARE
  v_mfr_a       uuid := gen_random_uuid();
  v_mfr_b       uuid := gen_random_uuid();
  v_user_a      uuid := gen_random_uuid();  -- manufacturer A's auth.uid()
  v_user_b      uuid := gen_random_uuid();  -- manufacturer B's auth.uid()
  v_admin_user  uuid := gen_random_uuid();  -- buildquote_admin's auth.uid()
  v_gap_id      uuid;
  v_count       bigint;
BEGIN
  -- ── Fixtures ──────────────────────────────────────────────────────────
  INSERT INTO data_studio_manufacturers (id, name, slug) VALUES
    (v_mfr_a, 'RLS Test Mfr A (066)', 'rls-test-mfr-a-066'),
    (v_mfr_b, 'RLS Test Mfr B (066)', 'rls-test-mfr-b-066');

  INSERT INTO manufacturer_users (manufacturer_id, auth_user_id, email, role, status) VALUES
    (v_mfr_a, v_user_a, 'rls-test-a-066@example.com', 'manufacturer_admin', 'active'),
    (v_mfr_b, v_user_b, 'rls-test-b-066@example.com', 'manufacturer_admin', 'active');

  INSERT INTO data_studio_user_profiles (auth_user_id, email, global_role) VALUES
    (v_admin_user, 'rls-test-admin-066@example.com', 'buildquote_admin');

  INSERT INTO ai_knowledge_gaps (manufacturer_id, user_question, ai_response_status)
  VALUES (v_mfr_a, 'RLS test question — 066', 'NO_VERIFIED_ANSWER')
  RETURNING id INTO v_gap_id;

  RAISE NOTICE 'Fixtures created — mfr_a=% mfr_b=% gap=%', v_mfr_a, v_mfr_b, v_gap_id;

  -- ── Manufacturer A can read its own gap ──────────────────────────────
  SET LOCAL request.jwt.claims = '{"sub": "' || v_user_a::text || '"}';
  SET LOCAL ROLE authenticated;

  SELECT COUNT(*) INTO v_count FROM ai_knowledge_gaps WHERE id = v_gap_id;
  RESET ROLE;
  IF v_count = 1 THEN
    RAISE NOTICE 'PASS: manufacturer A can read its own gap';
  ELSE
    RAISE EXCEPTION 'manufacturer A could not read its own gap (count=%)', v_count;
  END IF;

  -- ── Manufacturer B cannot read manufacturer A's gap ──────────────────
  SET LOCAL request.jwt.claims = '{"sub": "' || v_user_b::text || '"}';
  SET LOCAL ROLE authenticated;

  SELECT COUNT(*) INTO v_count FROM ai_knowledge_gaps WHERE id = v_gap_id;
  RESET ROLE;
  IF v_count = 0 THEN
    RAISE NOTICE 'PASS: manufacturer B cannot read manufacturer A''s gap';
  ELSE
    RAISE EXCEPTION 'RLS ISOLATION FAILURE: manufacturer B read manufacturer A''s gap (count=%)', v_count;
  END IF;

  -- ── BuildQuote admin can read across manufacturers ───────────────────
  SET LOCAL request.jwt.claims = '{"sub": "' || v_admin_user::text || '"}';
  SET LOCAL ROLE authenticated;

  SELECT COUNT(*) INTO v_count FROM ai_knowledge_gaps WHERE id = v_gap_id;
  RESET ROLE;
  IF v_count = 1 THEN
    RAISE NOTICE 'PASS: buildquote_admin can read any manufacturer''s gap';
  ELSE
    RAISE EXCEPTION 'buildquote_admin could not read the gap (count=%) — staff bypass policy broken', v_count;
  END IF;

  -- ── Manufacturer B cannot INSERT a gap (service-role-only write path) ─
  SET LOCAL request.jwt.claims = '{"sub": "' || v_user_b::text || '"}';
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO ai_knowledge_gaps (manufacturer_id, user_question, ai_response_status)
    VALUES (v_mfr_b, 'Should be rejected — no manufacturer INSERT policy', 'NO_VERIFIED_ANSWER');
    RESET ROLE;
    RAISE EXCEPTION 'RLS FAILURE: manufacturer B was able to INSERT a gap directly (should be service-role only)';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS: manufacturer cannot INSERT a gap directly (service-role only, as designed)';
  END;

  -- ── Cleanup ───────────────────────────────────────────────────────────
  DELETE FROM ai_knowledge_gaps WHERE manufacturer_id IN (v_mfr_a, v_mfr_b);
  DELETE FROM manufacturer_users WHERE manufacturer_id IN (v_mfr_a, v_mfr_b);
  DELETE FROM data_studio_user_profiles WHERE auth_user_id = v_admin_user;
  DELETE FROM data_studio_manufacturers WHERE id IN (v_mfr_a, v_mfr_b);
  RAISE NOTICE 'Cleanup complete — test rows removed';
END;
$$;
