-- ============================================================
-- LOCAL DEV ONLY — BuildQuote Data Studio manufacturer user test
-- ============================================================
-- ⚠  Do NOT run against a hosted or production Supabase project.
--    This snippet is for local login testing only.
--
-- PURPOSE
-- -------
-- Given an auth user that already exists in auth.users (created via
-- the Supabase Studio UI), create or update:
--   1. data_studio_user_profiles  — global_role = manufacturer_user
--   2. manufacturer_users         — role = manufacturer_admin, status = active
--
-- REQUIREMENTS
-- ------------
-- • The auth user must be created manually first:
--     Supabase Studio → Authentication → Users → Add user
--     Email: manufacturer@test.local   Auto confirm: ✅   (set a password)
-- • Local seed must have run (supabase db reset applies migrations + seed.sql)
--   Seeded manufacturers: newtechwood, james-hardie, modwood
-- • No UUIDs to copy — the snippet looks them up by email and slug.
--
-- HOW TO USE
-- ----------
-- 1. Create the auth user in Supabase Studio (see above).
-- 2. Edit the two variables below if you chose a different email or slug.
-- 3. Run the entire block in the local SQL Editor (http://localhost:54323).
-- 4. Check the NOTICE output — it will print the profile and manufacturer IDs.
-- 5. Run the VERIFY block at the bottom to confirm rows.
-- ============================================================

DO $$
DECLARE
  -- ── Configure these two values ────────────────────────────
  v_email TEXT := 'manufacturer@test.local';  -- ← email used when creating the auth user
  v_slug  TEXT := 'newtechwood';              -- ← seeded manufacturer slug
  -- ──────────────────────────────────────────────────────────

  v_auth_id         UUID;
  v_profile_id      UUID;
  v_manufacturer_id UUID;
BEGIN

  -- ── 1. Look up auth user by email ────────────────────────
  SELECT id INTO v_auth_id
  FROM auth.users
  WHERE email = v_email;

  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION
      'Auth user "%" not found in auth.users. '
      'Create the user in Supabase Studio (Authentication → Users → Add user) first.',
      v_email;
  END IF;

  -- ── 2. Upsert Studio user profile ────────────────────────
  INSERT INTO data_studio_user_profiles (
    auth_user_id,
    email,
    full_name,
    global_role,
    status
  )
  VALUES (
    v_auth_id,
    v_email,
    'Manufacturer Test User',
    'manufacturer_user',
    'active'
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    email       = EXCLUDED.email,
    global_role = 'manufacturer_user',
    status      = 'active',
    updated_at  = now()
  RETURNING id INTO v_profile_id;

  -- RETURNING works on both INSERT and ON CONFLICT DO UPDATE paths
  -- but guard just in case the implementation differs:
  IF v_profile_id IS NULL THEN
    SELECT id INTO v_profile_id
    FROM data_studio_user_profiles
    WHERE auth_user_id = v_auth_id;
  END IF;

  -- ── 3. Look up manufacturer by slug ──────────────────────
  SELECT id INTO v_manufacturer_id
  FROM data_studio_manufacturers
  WHERE slug = v_slug;

  IF v_manufacturer_id IS NULL THEN
    RAISE EXCEPTION
      'Manufacturer slug "%" not found in data_studio_manufacturers. '
      'Confirm local seed has run (supabase db reset).',
      v_slug;
  END IF;

  -- ── 4. Upsert manufacturer membership ────────────────────
  INSERT INTO manufacturer_users (
    manufacturer_id,
    user_profile_id,
    auth_user_id,
    email,
    role,
    status
  )
  VALUES (
    v_manufacturer_id,
    v_profile_id,
    v_auth_id,
    v_email,
    'manufacturer_admin',
    'active'
  )
  ON CONFLICT (user_profile_id, manufacturer_id) DO UPDATE SET
    role           = 'manufacturer_admin',
    status         = 'active',
    last_active_at = now();

  -- ── 5. Confirm ───────────────────────────────────────────
  RAISE NOTICE 'Done. profile_id=%, manufacturer_id=%', v_profile_id, v_manufacturer_id;

END $$;


-- ============================================================
-- VERIFY — run these after the block above to confirm rows
-- ============================================================

SELECT
  p.id            AS profile_id,
  p.auth_user_id,
  p.email,
  p.global_role,
  p.status        AS profile_status
FROM data_studio_user_profiles p
WHERE p.email = 'manufacturer@test.local';  -- ← match your email if changed

SELECT
  mu.id              AS membership_id,
  m.name             AS manufacturer_name,
  m.slug,
  mu.role,
  mu.status          AS membership_status
FROM manufacturer_users mu
JOIN data_studio_manufacturers m ON m.id = mu.manufacturer_id
JOIN data_studio_user_profiles p ON p.id = mu.user_profile_id
WHERE p.email = 'manufacturer@test.local';  -- ← match your email if changed
