-- BuildQuote Data Studio — Manufacturer Workspaces and Auth Model
-- Migration: 003_manufacturer_workspaces.sql
--
-- Adds the user profile table, refines manufacturer_users with additional columns,
-- and adds workspace_invitations for the invitation flow.
--
-- Does NOT implement RLS policies — those will be a separate migration once the
-- auth model is confirmed.
--
-- Do not run this against the production Supabase project.

-- ============================================================
-- 1. data_studio_user_profiles
-- One row per authenticated Data Studio user.
-- global_role determines BuildQuote-internal vs manufacturer-side access.
-- Workspace-level permissions are governed by manufacturer_users.role.
-- ============================================================

CREATE TABLE IF NOT EXISTS data_studio_user_profiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE NOT NULL,   -- Supabase Auth user id
  email        text NOT NULL,
  full_name    text,
  global_role  text NOT NULL DEFAULT 'manufacturer_user',
  -- manufacturer_user | buildquote_reviewer | buildquote_admin
  status       text NOT NULL DEFAULT 'active',
  -- active | suspended
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_user_id
  ON data_studio_user_profiles (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email
  ON data_studio_user_profiles (email);

-- ============================================================
-- 2. manufacturer_users — additional columns
-- Extends the table from migration 001 without breaking existing rows.
-- Adds profile linkage, invitation tracking, and activity timestamps.
-- ============================================================

ALTER TABLE manufacturer_users
  ADD COLUMN IF NOT EXISTS user_profile_id uuid
    REFERENCES data_studio_user_profiles(id) ON DELETE CASCADE;

ALTER TABLE manufacturer_users
  ADD COLUMN IF NOT EXISTS invited_by uuid;       -- auth_user_id of the inviting user

ALTER TABLE manufacturer_users
  ADD COLUMN IF NOT EXISTS invited_at timestamptz DEFAULT now();

ALTER TABLE manufacturer_users
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

ALTER TABLE manufacturer_users
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

-- Additional indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_manufacturer_users_manufacturer_id
  ON manufacturer_users (manufacturer_id);

CREATE INDEX IF NOT EXISTS idx_manufacturer_users_auth_user_id
  ON manufacturer_users (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_manufacturer_users_user_profile_id
  ON manufacturer_users (user_profile_id);

CREATE INDEX IF NOT EXISTS idx_manufacturer_users_email
  ON manufacturer_users (email);

-- ============================================================
-- 3. workspace_invitations
-- Tracks pending invitations before a user accepts and creates their account.
-- Expired or accepted invitations are retained for audit purposes.
-- ============================================================

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id uuid NOT NULL REFERENCES data_studio_manufacturers(id) ON DELETE CASCADE,
  email           text NOT NULL,
  role            text NOT NULL DEFAULT 'manufacturer_reviewer',
  -- manufacturer_admin | manufacturer_reviewer
  token_hash      text,              -- hashed invitation token; raw token sent only in email
  status          text NOT NULL DEFAULT 'pending',
  -- pending | accepted | expired | cancelled
  invited_by      uuid,              -- auth_user_id of the inviting user
  invited_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  accepted_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_manufacturer_id
  ON workspace_invitations (manufacturer_id);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email
  ON workspace_invitations (email);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_status
  ON workspace_invitations (status);

-- ============================================================
-- RLS INTENT (not yet implemented — see docs/auth-and-workspaces.md)
-- ============================================================
--
-- data_studio_user_profiles:
--   A user may read their own profile.
--   buildquote_admin may read all profiles.
--
-- manufacturer_users:
--   A user may read rows where auth_user_id = their own id.
--   A manufacturer_admin may read all rows for their manufacturer_id.
--   buildquote_admin/reviewer may read all rows.
--
-- workspace_invitations:
--   A manufacturer_admin may read/create invitations for their manufacturer_id.
--   buildquote_admin may read all.
--   Invitation acceptance is a server-side operation (token validation + row creation).
--
-- All manufacturer-scoped tables (source_documents, staged_systems, etc.):
--   Read/write restricted to users with an active manufacturer_users membership
--   for that manufacturer_id, or buildquote_admin/reviewer global roles.
--
-- publish_batches / publish_batch_items:
--   Status transition to migrated_to_production is server-side only (service role key).
--   No browser client may trigger a production write.
