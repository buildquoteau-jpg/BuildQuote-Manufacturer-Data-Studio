-- ============================================================
-- LOCAL DEV ONLY — BuildQuote Data Studio test auth user
-- ============================================================
-- ⚠ Do NOT run this against a hosted or production Supabase project.
--   This snippet inserts rows into data_studio_user_profiles and
--   optionally manufacturer_users for local login testing only.
--
-- The auth user row itself (auth.users) must be created manually in
-- the local Supabase Studio UI — this snippet cannot do that.
-- Supabase Auth user creation requires the Supabase Studio web interface.
--
-- HOW TO USE
-- ----------
-- 1. Start local Supabase:
--      supabase start          (from repo root)
--    Studio UI is at: http://localhost:54323
--
-- 2. Create the test auth user in Supabase Studio:
--    Authentication → Users → Add user
--    Set email + password. Note the UUID Supabase assigns.
--
-- 3. Replace the two PLACEHOLDER values below with real values:
--    PLACEHOLDER_AUTH_UUID   →  the UUID from step 2
--    PLACEHOLDER_EMAIL       →  the email from step 2
--
-- 4. Run this snippet in the local SQL editor:
--    http://localhost:54323 → SQL Editor → paste and run
--
-- 5. Verify in the Table Editor:
--    data_studio_user_profiles → confirm your row
--
-- 6. Visit http://localhost:3000/login and sign in.
--
-- ============================================================


-- ============================================================
-- STEP 1 — Insert or update the Studio user profile
-- ============================================================
-- Choose global_role:
--   buildquote_admin     — full access across all manufacturers
--   buildquote_reviewer  — review access, no publish
--   manufacturer_user    — workspace-scoped (also add membership in STEP 2)
-- ============================================================

INSERT INTO data_studio_user_profiles (
  auth_user_id,
  email,
  full_name,
  global_role,
  status
)
VALUES (
  'PLACEHOLDER_AUTH_UUID',  -- ← replace with UUID from Supabase Auth UI (step 2)
  'PLACEHOLDER_EMAIL',      -- ← replace with the email you used (step 2)
  'Local Test User',        -- display name — change freely
  'buildquote_admin',       -- change to buildquote_reviewer or manufacturer_user as needed
  'active'
)
ON CONFLICT (auth_user_id) DO UPDATE SET
  email       = EXCLUDED.email,
  full_name   = EXCLUDED.full_name,
  global_role = EXCLUDED.global_role,
  status      = EXCLUDED.status,
  updated_at  = now();


-- ============================================================
-- STEP 2 — (Optional) Add a manufacturer_users membership row
-- ============================================================
-- Required only when testing manufacturer_user role.
-- Skip this block if global_role is buildquote_admin or buildquote_reviewer.
--
-- Prerequisites:
--   - STEP 1 must have run first (profile row must exist)
--   - A seeded manufacturer must exist (seed.sql seeds: newtechwood, james-hardie, modwood)
--
-- To use: uncomment the INSERT below and replace PLACEHOLDER_AUTH_UUID.
-- ============================================================

/*
-- Confirm the seeded manufacturer exists first:
SELECT id, name, slug FROM data_studio_manufacturers WHERE slug = 'newtechwood';

-- Insert manufacturer membership using a JOIN to avoid hardcoding profile/manufacturer IDs:
INSERT INTO manufacturer_users (
  manufacturer_id,
  user_profile_id,
  auth_user_id,
  email,
  role,
  status
)
SELECT
  m.id                 AS manufacturer_id,
  p.id                 AS user_profile_id,
  p.auth_user_id,
  p.email,
  'manufacturer_admin' AS role,    -- or manufacturer_reviewer / manufacturer_viewer
  'active'             AS status
FROM   data_studio_manufacturers m
JOIN   data_studio_user_profiles  p
  ON   p.auth_user_id = 'PLACEHOLDER_AUTH_UUID'  -- ← same UUID as STEP 1
WHERE  m.slug = 'newtechwood'                    -- or 'james-hardie' / 'modwood'
ON CONFLICT (user_profile_id, manufacturer_id) DO UPDATE SET
  role         = EXCLUDED.role,
  status       = EXCLUDED.status,
  last_active_at = now();
*/


-- ============================================================
-- VERIFY — quick check after running
-- ============================================================
-- Run these SELECTs to confirm the rows exist:

/*
SELECT id, auth_user_id, email, full_name, global_role, status
FROM   data_studio_user_profiles
WHERE  email = 'PLACEHOLDER_EMAIL';

SELECT mu.id, mu.manufacturer_id, m.name AS manufacturer_name, mu.role, mu.status
FROM   manufacturer_users mu
JOIN   data_studio_manufacturers m ON m.id = mu.manufacturer_id
WHERE  mu.auth_user_id = 'PLACEHOLDER_AUTH_UUID';
*/
