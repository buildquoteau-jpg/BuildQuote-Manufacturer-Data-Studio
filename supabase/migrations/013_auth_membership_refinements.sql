-- BuildQuote Data Studio — Auth Membership Refinements
-- Migration: 013_auth_membership_refinements.sql
--
-- Additive refinements only. No columns dropped or renamed.
-- No RLS policies. No auth trigger. No seed data.
--
-- Hardens the three auth/membership tables with:
--   - UNIQUE constraints where the plan requires them
--   - CHECK constraints enforcing role and status enumerations
--   - Foreign keys for invited_by columns (previously bare uuids)
--   - updated_at on manufacturer_users (was missing)
--   - Partial unique index on manufacturer_users(user_profile_id, manufacturer_id)
--     to prevent duplicate memberships without blocking pending/invited rows
--
-- Do not run this against the production Supabase project.

-- ============================================================
-- 1. data_studio_user_profiles
-- ============================================================

-- Unique email — one account per email address
ALTER TABLE data_studio_user_profiles
  ADD CONSTRAINT uq_user_profiles_email UNIQUE (email);

-- Enforce global_role enumeration
-- buildquote_reviewer: internal reviewer — can review/correct but cannot publish or manage users
-- buildquote_admin: full access, controls production publish
-- manufacturer_user: manufacturer-side; workspace permissions governed by manufacturer_users.role
ALTER TABLE data_studio_user_profiles
  ADD CONSTRAINT chk_user_profiles_global_role
    CHECK (global_role IN ('buildquote_admin', 'buildquote_reviewer', 'manufacturer_user'));

-- Enforce status enumeration
ALTER TABLE data_studio_user_profiles
  ADD CONSTRAINT chk_user_profiles_status
    CHECK (status IN ('active', 'suspended'));

-- ============================================================
-- 2. manufacturer_users
-- ============================================================

-- Add updated_at — missing from original schema
ALTER TABLE manufacturer_users
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Enforce role enumeration — includes manufacturer_viewer added in Studio plan
ALTER TABLE manufacturer_users
  ADD CONSTRAINT chk_manufacturer_users_role
    CHECK (role IN ('manufacturer_admin', 'manufacturer_reviewer', 'manufacturer_viewer'));

-- Enforce status enumeration
ALTER TABLE manufacturer_users
  ADD CONSTRAINT chk_manufacturer_users_status
    CHECK (status IN ('invited', 'active', 'suspended'));

-- FK: invited_by → data_studio_user_profiles(id)
-- Nullable — rows created before auth existed have no inviter
ALTER TABLE manufacturer_users
  ADD CONSTRAINT fk_manufacturer_users_invited_by
    FOREIGN KEY (invited_by) REFERENCES data_studio_user_profiles(id)
    ON DELETE SET NULL;

-- Partial unique index: one active membership per user per workspace.
-- WHERE user_profile_id IS NOT NULL so pending/invited rows (no profile yet) are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS uix_manufacturer_users_profile_manufacturer
  ON manufacturer_users (user_profile_id, manufacturer_id)
  WHERE user_profile_id IS NOT NULL;

-- ============================================================
-- 3. workspace_invitations
-- ============================================================

-- FK: invited_by → data_studio_user_profiles(id)
-- Nullable — same reason as above
ALTER TABLE workspace_invitations
  ADD CONSTRAINT fk_workspace_invitations_invited_by
    FOREIGN KEY (invited_by) REFERENCES data_studio_user_profiles(id)
    ON DELETE SET NULL;

-- Enforce role enumeration — includes manufacturer_viewer
ALTER TABLE workspace_invitations
  ADD CONSTRAINT chk_workspace_invitations_role
    CHECK (role IN ('manufacturer_admin', 'manufacturer_reviewer', 'manufacturer_viewer'));

-- Enforce status enumeration — standardised to 'revoked' (not 'cancelled')
ALTER TABLE workspace_invitations
  ADD CONSTRAINT chk_workspace_invitations_status
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'));
