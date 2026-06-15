-- User account profile fields + self-service update access.
--
-- Adds the "authorised verifier" account fields surfaced in the manufacturer
-- portal's new User profile page:
--   * company_email_primary    — main company email
--   * company_email_secondary  — second company email
--   * login_email_preference   — which of the two the user prefers for login
--                                (preference only; the actual auth credential
--                                 stays in auth.users and is unchanged here)
--
-- full_name already exists on the table and holds the name of the person
-- authorised to verify system cards.
--
-- Migration 030 added SELECT RLS but deliberately no UPDATE policy. The portal
-- now lets a user edit their own account, so we add a scoped UPDATE policy.
-- To prevent privilege escalation (a user editing their own global_role or
-- status via a direct API call), UPDATE is granted at the COLUMN level to the
-- authenticated role — only the safe account columns are writable.

-- ── Columns ────────────────────────────────────────────────────────────────
ALTER TABLE public.data_studio_user_profiles
  ADD COLUMN IF NOT EXISTS company_email_primary   TEXT,
  ADD COLUMN IF NOT EXISTS company_email_secondary TEXT,
  ADD COLUMN IF NOT EXISTS login_email_preference  TEXT NOT NULL DEFAULT 'primary';

ALTER TABLE public.data_studio_user_profiles
  ADD CONSTRAINT data_studio_user_profiles_login_email_preference_check
  CHECK (login_email_preference IN ('primary', 'secondary'));

-- ── Self-service UPDATE policy (own row only) ────────────────────────────────
CREATE POLICY "user can update own profile"
  ON public.data_studio_user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ── Column-level write privileges ────────────────────────────────────────────
-- Restrict what the authenticated role can write so role/status/email cannot be
-- self-escalated even with a hand-crafted request. Service role is unaffected.
REVOKE UPDATE ON public.data_studio_user_profiles FROM authenticated;
GRANT UPDATE (
  full_name,
  company_email_primary,
  company_email_secondary,
  login_email_preference,
  updated_at
) ON public.data_studio_user_profiles TO authenticated;
