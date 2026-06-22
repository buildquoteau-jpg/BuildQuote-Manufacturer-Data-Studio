-- Pending primary-contact fields on data_studio_manufacturers.
--
-- Lets a BuildQuote admin pre-fill the "authorised verifier" details for a
-- manufacturer (full name, company emails, login preference) BEFORE that
-- manufacturer has a real login of their own. This is purely informational —
-- it does not create an auth.users row, does not send any email, and is
-- entirely separate from data_studio_user_profiles.
--
-- Background: the manufacturer-facing "User profile" page used to be the
-- same component whether a real manufacturer_user was signed in or an admin
-- was browsing via the workspace-gate cookie (admin "view as" mode). Because
-- data_studio_user_profiles is keyed by auth_user_id, and admin impersonation
-- shares ONE real admin login across every manufacturer workspace, saving
-- "User profile" while impersonating actually overwrote the admin's own
-- profile row — which then surfaced under every other manufacturer workspace
-- the admin viewed next (apparent data crossover). See account/page.tsx and
-- AdminPendingContactForm.tsx for the fix: admin impersonation now edits
-- these manufacturer-scoped columns instead of the admin's own profile.
--
-- When the manufacturer eventually gets a real account (invite flow, not yet
-- built — see workspace_invitations), these values can be copied into their
-- data_studio_user_profiles row as sensible defaults.

ALTER TABLE public.data_studio_manufacturers
  ADD COLUMN IF NOT EXISTS pending_contact_full_name       TEXT,
  ADD COLUMN IF NOT EXISTS pending_contact_email_primary    TEXT,
  ADD COLUMN IF NOT EXISTS pending_contact_email_secondary  TEXT,
  ADD COLUMN IF NOT EXISTS pending_contact_login_preference TEXT NOT NULL DEFAULT 'primary';

ALTER TABLE public.data_studio_manufacturers
  DROP CONSTRAINT IF EXISTS data_studio_manufacturers_pending_login_pref_check;

ALTER TABLE public.data_studio_manufacturers
  ADD CONSTRAINT data_studio_manufacturers_pending_login_pref_check
  CHECK (pending_contact_login_preference IN ('primary', 'secondary'));

-- No new RLS policy needed — migration 024 already grants buildquote_admin
-- UPDATE on every column of data_studio_manufacturers ("buildquote_admin can
-- update any manufacturer"). Real manufacturer_user logins never touch these
-- columns; they continue to read/write their own data_studio_user_profiles
-- row via migration 032's column-scoped grant.
