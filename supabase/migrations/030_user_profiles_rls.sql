-- Secure data_studio_user_profiles with RLS.
-- Until now the table had no RLS, allowing any authenticated user to read all
-- profile rows (names, emails, global roles of every Studio user).
--
-- Two SELECT policies:
--   1. A user may always read their own profile row.
--   2. buildquote_admin and buildquote_reviewer may read all profiles
--      (needed for uploader-name resolution and future user management).
--
-- The staff policy uses a SECURITY DEFINER helper to avoid the self-referencing
-- recursion that occurs when an RLS policy subqueries the same protected table.
-- SECURITY DEFINER bypasses RLS for the inner SELECT only.
--
-- No INSERT / UPDATE / DELETE policies are added here — profile creation is
-- currently a manual / server-side operation. Add those when the user-management
-- UI is built.

-- ── Helper function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_global_role()
  RETURNS TEXT
  LANGUAGE SQL
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT global_role
  FROM public.data_studio_user_profiles
  WHERE auth_user_id = auth.uid()
$$;

-- ── Enable RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.data_studio_user_profiles ENABLE ROW LEVEL SECURITY;

-- ── SELECT policies ──────────────────────────────────────────────────────────

CREATE POLICY "user can read own profile"
  ON public.data_studio_user_profiles
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "buildquote staff can read all profiles"
  ON public.data_studio_user_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer')
  );
